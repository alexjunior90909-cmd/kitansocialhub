/**
 * flw-verify Edge Function
 *
 * Called after Flutterwave redirects back via /payment/return.
 * Verifies the transaction server-side via FLW API, then:
 *   - Updates payments record (status, flw_transaction_id)
 *   - For wallet_topup: credits user wallet balance + records wallet transaction
 *   - For digital products: creates purchases record
 *   - Returns redirect path based on product type
 *
 * SECURITY: Access is ONLY granted after ALL validations pass.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { txRef, transactionId } = await req.json() as {
      txRef: string;
      transactionId: string;
    };

    if (!txRef || !transactionId) {
      return new Response(
        JSON.stringify({ error: 'txRef and transactionId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );
    const flwKey = (Deno.env.get('FLW_SECRET_KEY') ?? '').trim();
    console.log('[flw-verify key-audit] loaded:', flwKey.length > 0, '| prefix:', flwKey.slice(0, 12));

    // ---- 1. Fetch payment record ----
    const { data: paymentRow, error: payErr } = await supabase
      .from('payments')
      .select('*')
      .eq('tx_ref', txRef)
      .single();

    if (payErr || !paymentRow) {
      return new Response(
        JSON.stringify({ error: 'Payment record not found', success: false }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- 2. Prevent duplicate processing ----
    if (paymentRow.payment_status === 'successful' && paymentRow.verification_status === 'verified') {
      console.log('Payment already verified:', txRef);
      const redirectPath = buildRedirectPath(paymentRow.product_type, paymentRow.product_id, paymentRow.app_user_id);
      return new Response(
        JSON.stringify({
          success: true,
          productId: paymentRow.product_id,
          productType: paymentRow.product_type,
          redirectPath,
          message: 'Payment already verified',
          alreadyProcessed: true,
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- 3. Verify with Flutterwave API ----
    const verifyRes = await fetch(`https://api.flutterwave.com/v3/transactions/${transactionId}/verify`, {
      headers: { 'Authorization': `Bearer ${flwKey}` },
    });
    const verifyData = await verifyRes.json() as {
      status: string;
      message: string;
      data?: {
        id: number;
        tx_ref: string;
        amount: number;
        currency: string;
        status: string;
        customer: { email: string };
      };
    };

    console.log('FLW verify response:', verifyData.status, verifyData.data?.status, 'amount:', verifyData.data?.amount);

    if (verifyData.status !== 'success' || !verifyData.data) {
      await supabase.from('payments').update({
        payment_status: 'failed',
        verification_status: 'unverified',
        updated_at: new Date().toISOString(),
      }).eq('tx_ref', txRef);

      return new Response(
        JSON.stringify({ success: false, message: `Verification failed: ${verifyData.message}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const flwTx = verifyData.data;

    // ---- 4. Strict validation ----
    const txRefMatch = flwTx.tx_ref === txRef;
    const statusOk = flwTx.status === 'successful';
    const amountOk = Math.abs(flwTx.amount - paymentRow.amount_ngn) <= 1;
    const currencyOk = flwTx.currency === 'NGN';

    if (!txRefMatch || !statusOk || !amountOk || !currencyOk) {
      console.error('Payment mismatch — access denied:', { txRefMatch, statusOk, amountOk, currencyOk });

      await supabase.from('payments').update({
        flw_transaction_id: String(flwTx.id),
        payment_status: statusOk ? 'successful' : 'failed',
        verification_status: 'mismatch',
        updated_at: new Date().toISOString(),
      }).eq('tx_ref', txRef);

      const reason = !statusOk ? flwTx.status : 'mismatch';
      return new Response(
        JSON.stringify({
          success: false,
          message: !statusOk
            ? `Payment was ${flwTx.status}. No access granted.`
            : !amountOk ? 'Amount mismatch. Please contact support.'
            : 'Currency mismatch. Please contact support.',
          reason,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- 5. Mark payment as verified ----
    await supabase.from('payments').update({
      flw_transaction_id: String(flwTx.id),
      payment_status: 'successful',
      verification_status: 'verified',
      updated_at: new Date().toISOString(),
    }).eq('tx_ref', txRef);

    const { product_id, product_type, app_user_id } = paymentRow;

    // ---- 6a. Wallet top-up: credit balance ----
    if (product_type === 'wallet_topup') {
      console.log(`[flw-verify] Crediting wallet for user ${app_user_id}: +${paymentRow.amount_ngn} NGN`);

      // Get or create wallet
      const { data: existingWallet } = await supabase
        .from('wallets')
        .select('balance')
        .eq('app_user_id', app_user_id)
        .single();

      const currentBalance = Number(existingWallet?.balance ?? 0);
      const newBalance = currentBalance + Number(paymentRow.amount_ngn);

      if (existingWallet) {
        await supabase.from('wallets')
          .update({ balance: newBalance, updated_at: new Date().toISOString() })
          .eq('app_user_id', app_user_id);
      } else {
        const walletId = `wal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        await supabase.from('wallets').insert({
          id: walletId,
          app_user_id,
          balance: newBalance,
        });
      }

      // Record wallet transaction
      const wtId = `wt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await supabase.from('wallet_transactions').insert({
        id: wtId,
        app_user_id,
        type: 'topup',
        amount: paymentRow.amount_ngn,
        balance_after: newBalance,
        description: `Wallet top-up via Flutterwave`,
        reference: txRef,
        status: 'completed',
      });

      console.log(`[flw-verify] Wallet credited. New balance: ${newBalance} NGN`);

      return new Response(
        JSON.stringify({
          success: true,
          productId: product_id,
          productType: product_type,
          appUserId: app_user_id,
          redirectPath: '/wallet?topup=success',
          amountNGN: paymentRow.amount_ngn,
          newBalance,
          message: 'Wallet credited successfully',
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ---- 6b. Digital product access ----
    if (product_type === 'working_picture' || product_type === 'format' || product_type === 'document') {
      const { data: existingPurchase } = await supabase
        .from('purchases')
        .select('id')
        .eq('app_user_id', app_user_id)
        .eq('product_id', product_id)
        .eq('product_type', product_type)
        .limit(1);

      if (!existingPurchase || existingPurchase.length === 0) {
        const purchaseId = `pur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const { error: purchaseError } = await supabase.from('purchases').insert({
          id: purchaseId,
          product_id,
          product_type,
          app_user_id,
          amount: paymentRow.amount_ngn,
          reference: txRef,
        });
        if (purchaseError) console.error('Purchase insert error (non-fatal):', purchaseError.message);
        else console.log('Purchase record created:', purchaseId);
      }
    }

    const redirectPath = buildRedirectPath(product_type, product_id, app_user_id);
    console.log('Payment verified. productType:', product_type, '→ redirect:', redirectPath);

    return new Response(
      JSON.stringify({
        success: true,
        productId: product_id,
        productType: product_type,
        appUserId: app_user_id,
        redirectPath,
        amountNGN: paymentRow.amount_ngn,
        message: 'Payment verified successfully',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('flw-verify error:', err);
    return new Response(
      JSON.stringify({ error: String(err), success: false }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function buildRedirectPath(productType: string, productId: string, _appUserId: string): string {
  switch (productType) {
    case 'wallet_topup':
      return '/wallet?topup=success';
    case 'working_picture':
      return `/order-content/working_picture/${productId}`;
    case 'format':
      return `/order-content/format/${productId}`;
    case 'document':
      return `/documents/${productId}`;
    case 'gift':
      return `/orders?confirmed=1`;
    default:
      return '/orders';
  }
}
