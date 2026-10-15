/**
 * flw-webhook Edge Function
 *
 * Receives Flutterwave webhook events.
 * Verifies the signature hash, prevents duplicate processing,
 * updates payment status, and grants purchase access for digital products.
 *
 * Webhook events handled:
 *   charge.completed → successful payment
 *   transfer.completed → payout events (ignored)
 *
 * Security:
 *   - Validates X-Flutterwave-Signature header against FLW_WEBHOOK_SECRET
 *   - Checks db for existing verified status before processing
 *
 * Endpoint URL to configure in Flutterwave dashboard:
 *   https://<YOUR-NEW-SUPABASE-PROJECT>.supabase.co/functions/v1/flw-webhook
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // ---- 1. Verify webhook signature ----
    const secretHash = (Deno.env.get('FLW_WEBHOOK_SECRET') ?? '').trim();
    const signature = req.headers.get('verif-hash') ?? req.headers.get('X-Flutterwave-Signature') ?? '';

    if (!secretHash || signature !== secretHash) {
      console.error('Webhook signature mismatch. Received:', signature);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: invalid signature' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json() as {
      event: string;
      data: {
        id: number;
        tx_ref: string;
        amount: number;
        currency: string;
        status: string;
        customer: { email: string; name: string };
        meta?: Record<string, unknown>;
      };
    };

    console.log('Webhook received:', body.event, 'tx_ref:', body.data?.tx_ref, 'status:', body.data?.status);

    // ---- 2. Only handle charge.completed ----
    if (body.event !== 'charge.completed') {
      return new Response(
        JSON.stringify({ message: `Event ${body.event} acknowledged, not processed` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const txData = body.data;
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // ---- 3. Fetch payment record ----
    const { data: paymentRow, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('tx_ref', txData.tx_ref)
      .single();

    if (payErr || !paymentRow) {
      console.error('Payment not found for tx_ref:', txData.tx_ref);
      // Return 200 so FLW doesn't retry — it's not our transaction
      return new Response(
        JSON.stringify({ message: 'Payment record not found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- 4. Skip if already processed ----
    if (paymentRow.payment_status === 'successful' && paymentRow.verification_status === 'verified') {
      console.log('Already processed, skipping duplicate webhook:', txData.tx_ref);
      return new Response(
        JSON.stringify({ message: 'Already processed' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- 5. Validate amount + currency ----
    const statusOk = txData.status === 'successful';
    const amountOk = Math.abs(txData.amount - paymentRow.amount_ngn) <= 1;
    const currencyOk = txData.currency === 'NGN';

    if (!statusOk || !amountOk || !currencyOk) {
      console.error('Webhook validation failed:', {
        statusOk, amountOk, currencyOk,
        expected: paymentRow.amount_ngn, received: txData.amount,
      });
      await supabase.from('payments').update({
        flw_transaction_id: String(txData.id),
        payment_status: statusOk ? 'successful' : 'failed',
        verification_status: 'mismatch',
        updated_at: new Date().toISOString(),
      }).eq('tx_ref', txData.tx_ref);

      return new Response(
        JSON.stringify({ message: 'Payment mismatch logged' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- 6. Mark as verified ----
    await supabase.from('payments').update({
      flw_transaction_id: String(txData.id),
      payment_status: 'successful',
      verification_status: 'verified',
      updated_at: new Date().toISOString(),
    }).eq('tx_ref', txData.tx_ref);

    // ---- 7. Create purchase record for digital products ----
    const { product_id, product_type, app_user_id, amount_usd } = paymentRow;
    if (product_type === 'working_picture' || product_type === 'format') {
      const { data: existing } = await supabase
        .from('purchases')
        .select('id')
        .eq('app_user_id', app_user_id)
        .eq('product_id', product_id)
        .eq('product_type', product_type)
        .limit(1);

      if (!existing || existing.length === 0) {
        const purchaseId = `pur_wh_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await supabase.from('purchases').insert({
          id: purchaseId,
          product_id,
          product_type,
          app_user_id,
          amount: amount_usd,
          reference: txData.tx_ref,
        });
        console.log('Purchase created via webhook:', purchaseId);
      }
    }

    console.log('Webhook processed successfully:', txData.tx_ref);
    return new Response(
      JSON.stringify({ message: 'Webhook processed successfully' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('flw-webhook error:', err);
    // Always return 200 to FLW to prevent infinite retries
    return new Response(
      JSON.stringify({ message: 'Internal error logged' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
