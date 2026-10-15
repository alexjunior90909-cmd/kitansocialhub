/**
 * flw-initiate Edge Function
 *
 * Creates a pending payment record in DB, then calls Flutterwave's
 * standard payment API to get a hosted checkout redirect link.
 *
 * Request body:
 *   {
 *     productId: string,
 *     productType: 'working_picture' | 'format' | 'document' | 'gift' | 'wallet_topup',
 *     appUserId: string,
 *     amountNGN: number,
 *     customerEmail: string,
 *     customerName: string,
 *     redirectUrl: string,
 *     metadata?: Record<string, unknown>
 *   }
 *
 * Response:
 *   { paymentUrl: string, txRef: string, amountNGN: number }
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      productId,
      productType,
      appUserId,
      amountNGN: rawAmountNGN,
      amountUSD,
      customerEmail,
      customerName,
      redirectUrl,
      metadata = {},
    } = await req.json() as {
      productId: string;
      productType: string;
      appUserId: string;
      amountNGN?: number;
      amountUSD?: number;
      customerEmail: string;
      customerName: string;
      redirectUrl: string;
      metadata?: Record<string, unknown>;
    };

    let amountNGN = rawAmountNGN;

    if (!amountNGN && amountUSD) {
      const supabaseTemp = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      );
      const { data: rateRow } = await supabaseTemp
        .from('exchange_rate')
        .select('rate')
        .eq('id', 1)
        .single();
      const rate = Number(rateRow?.rate ?? 1350);
      amountNGN = Math.round(amountUSD * rate * 100) / 100;
    }

    if (!productId || !productType || !appUserId || !amountNGN || !customerEmail || !redirectUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const txRef = `KIT-${productType.toUpperCase().slice(0, 3)}-${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

    const paymentId = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { error: insertError } = await supabase.from('payments').insert({
      id: paymentId,
      tx_ref: txRef,
      product_id: productId,
      product_type: productType,
      app_user_id: appUserId,
      amount_ngn: amountNGN,
      amount_usd: 0,
      currency: 'NGN',
      customer_email: customerEmail,
      customer_name: customerName,
      payment_status: 'pending',
      verification_status: 'unverified',
      metadata: { ...metadata, productType, productId },
    });

    if (insertError) {
      console.error('Payment insert error:', insertError.message);
      return new Response(
        JSON.stringify({ error: 'Failed to create payment record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const flwKey = (Deno.env.get('FLW_SECRET_KEY') ?? '').trim();
    const keyLoaded = flwKey.length > 0;
    console.log('[flw-key-audit] loaded:', keyLoaded, '| length:', flwKey.length, '| prefix:', flwKey.slice(0, 12));

    if (!keyLoaded) {
      await supabase.from('payments')
        .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
        .eq('tx_ref', txRef);
      return new Response(
        JSON.stringify({ error: 'FLW_SECRET_KEY is not configured.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const productLabel = productType === 'wallet_topup'
      ? 'Wallet Top-Up'
      : `${productType.replace(/_/g, ' ')} — ${productId}`;

    const payload = {
      tx_ref: txRef,
      amount: amountNGN,
      currency: 'NGN',
      redirect_url: redirectUrl,
      customer: {
        email: customerEmail,
        name: customerName,
      },
      customizations: {
        title: 'KITAN Social Hub',
        description: `Payment for ${productLabel}`,
        logo: `${Deno.env.get('SUPABASE_URL') ?? ''}/storage/v1/object/public/order-content/logo.png`,
      },
      meta: {
        product_id: productId,
        product_type: productType,
        app_user_id: appUserId,
        ...metadata,
      },
    };

    console.log('Initiating FLW payment:', { txRef, amountNGN, customerEmail, productType });

    const flwRes = await fetch('https://api.flutterwave.com/v3/payments', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${flwKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const flwData = await flwRes.json() as {
      status: string;
      message: string;
      data?: { link: string };
    };

    console.log('FLW initiate response:', flwData.status, flwData.message);

    if (flwData.status !== 'success' || !flwData.data?.link) {
      await supabase.from('payments')
        .update({ payment_status: 'failed', updated_at: new Date().toISOString() })
        .eq('tx_ref', txRef);

      return new Response(
        JSON.stringify({ error: `Flutterwave: ${flwData.message || 'Failed to create payment link'}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ paymentUrl: flwData.data.link, txRef, amountNGN }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('flw-initiate error:', err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
