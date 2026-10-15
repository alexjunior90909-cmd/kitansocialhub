import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { corsHeaders } from '../_shared/cors.ts';

// ── API key ───────────────────────────────────────────────────────────────────
const SMS_POOL_API_KEY: string =
  Deno.env.get('SMS_POOL_API_KEY') || 'PASTE_YOUR_SMSPOOL_API_KEY_HERE';

console.log(`[sms-pool] Loaded. Key prefix: ${SMS_POOL_API_KEY.slice(0, 4)}… length: ${SMS_POOL_API_KEY.length}`);

// ── SMSPool API base URL ──────────────────────────────────────────────────────
const POOL_API = 'https://api.smspool.net';

// ── Fallback conversion config ────────────────────────────────────────────────
const DEFAULT_USD_TO_NGN     = 1600;
const DEFAULT_GLOBAL_MULT    = 1;

// ── SMSPool status codes ──────────────────────────────────────────────────────
// 1=Pending | 2=Active | 3=SMS Received | 4=Cancelled | 5=Expired | 6=Refunded

// ─────────────────────────────────────────────────────────────────────────────
// HTTP helpers
// ─────────────────────────────────────────────────────────────────────────────
async function poolPost(endpoint: string, params: Record<string, string>): Promise<unknown> {
  const body = new URLSearchParams({ key: SMS_POOL_API_KEY, ...params });
  const { ...safeParams } = params;
  console.log(`[sms-pool] POST ${endpoint} params (key hidden):`, JSON.stringify(safeParams));

  const res  = await fetch(`${POOL_API}${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  const text = await res.text();
  console.log(`[sms-pool] POST ${endpoint} → status=${res.status} body=${text.slice(0, 400)}`);

  if (!res.ok) throw new Error(`SMSPool ${res.status} at ${endpoint}: ${text.slice(0, 400)}`);
  try { return JSON.parse(text); }
  catch { throw new Error(`SMSPool non-JSON at ${endpoint}: ${text.slice(0, 400)}`); }
}

async function poolGet(endpoint: string): Promise<unknown> {
  console.log(`[sms-pool] GET ${endpoint}`);
  const res  = await fetch(`${POOL_API}${endpoint}`);
  const text = await res.text();
  console.log(`[sms-pool] GET ${endpoint} → status=${res.status} body=${text.slice(0, 200)}`);
  if (!res.ok) throw new Error(`SMSPool GET ${res.status} at ${endpoint}: ${text.slice(0, 300)}`);
  try { return JSON.parse(text); }
  catch { throw new Error(`SMSPool GET non-JSON at ${endpoint}: ${text.slice(0, 300)}`); }
}

/** Map SMSPool numeric status code → our internal status string. */
function mapStatus(code: number): 'waiting' | 'received' | 'cancelled' | 'expired' {
  if (code === 3)           return 'received';
  if (code === 4 || code === 6) return 'cancelled';
  if (code === 5)           return 'expired';
  return 'waiting';
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing Engine (Phase 3)
// Resolves the correct NGN price for a given (countryId, serviceName) pair.
//
// Priority:
//   1. Exact override in smspool_price_overrides → use custom_naira_price
//   2. No override → base_usd * usd_to_ngn * global_multiplier (rounded ₦10)
// ─────────────────────────────────────────────────────────────────────────────
interface PricingConfig {
  usdToNgn:        number;
  globalMultiplier: number;
  overrides:       Array<{ country_id: string; service_name: string; custom_naira_price: number }>;
}

async function loadPricingConfig(
  supabase: ReturnType<typeof createClient>,
): Promise<PricingConfig> {
  const [settingsRes, overridesRes, rateRes] = await Promise.all([
    supabase.from('smspool_global_settings').select('global_multiplier').eq('id', 1).single(),
    supabase.from('smspool_price_overrides').select('country_id, service_name, custom_naira_price'),
    supabase.from('exchange_rate').select('rate').eq('id', 1).single(),
  ]);

  const globalMultiplier = settingsRes.data
    ? Number(settingsRes.data.global_multiplier)
    : DEFAULT_GLOBAL_MULT;

  const usdToNgn = rateRes.data ? Number(rateRes.data.rate) : DEFAULT_USD_TO_NGN;

  const overrides = (overridesRes.data || []) as Array<{
    country_id: string;
    service_name: string;
    custom_naira_price: number;
  }>;

  return { usdToNgn, globalMultiplier, overrides };
}

function resolveNGNPrice(
  costUSD:      number,
  countryId:    string,
  serviceName:  string,
  config:       PricingConfig,
): number {
  // 1. Check for exact override (country + service combination)
  const norm    = String(serviceName).toLowerCase().trim();
  const cId     = String(countryId).trim();
  const override = config.overrides.find(
    o => o.country_id === cId && o.service_name === norm,
  );

  if (override) {
    console.log(`[pricing] Override hit: country=${cId} service=${norm} → ₦${override.custom_naira_price}`);
    return Number(override.custom_naira_price);
  }

  // 2. Multiplier-based price
  const base        = costUSD * config.usdToNgn;
  const withMult    = base * config.globalMultiplier;
  const rounded     = Math.ceil(withMult / 10) * 10;
  console.log(`[pricing] Multiplier: $${costUSD} × ₦${config.usdToNgn}/$ × ${config.globalMultiplier}× = ₦${rounded}`);
  return rounded || 10; // floor at ₦10 so it's never ₦0
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  /** Credit wallet and log the refund transaction. */
  async function refundWallet(
    appUserId:   string,
    amount:      number,
    description: string,
    reference:   string,
  ): Promise<void> {
    const { data: walletRow } = await supabase
      .from('wallets')
      .select('balance')
      .eq('app_user_id', appUserId)
      .single();

    const currentBalance = walletRow ? Number(walletRow.balance) : 0;
    const newBalance     = currentBalance + amount;

    await supabase
      .from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('app_user_id', appUserId);

    const txId = `wt_ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from('wallet_transactions').insert({
      id:           txId,
      app_user_id:  appUserId,
      type:         'refund',
      amount,
      balance_after: newBalance,
      description,
      reference,
      status:       'completed',
    });

    console.log(`[sms-pool] Refunded ₦${amount} to user ${appUserId}. New balance: ₦${newBalance}`);
  }

  try {
    const body = await req.json() as {
      action:      string;
      service?:    string;
      country?:    string;
      orderId?:    string;
      appUserId?:  string;
      // Phase 3 admin actions
      multiplier?: number;
      countryId?:  string;
      serviceName?: string;
      customPrice?: number;
      overrideId?:  string;
    };

    // ─────────────────────────────────────────────────────────────────────
    // ACTION 1 — GET COUNTRIES + SERVICES CATALOG
    // ─────────────────────────────────────────────────────────────────────
    if (body.action === 'getPrices') {
      const [countriesRaw, servicesRaw] = await Promise.all([
        poolGet('/country/retrieve_all'),
        poolGet('/service/retrieve_all'),
      ]);

      const config = await loadPricingConfig(supabase);

      const countriesArr = Array.isArray(countriesRaw)
        ? countriesRaw
        : Object.values(countriesRaw as Record<string, unknown>);

      const servicesArr = Array.isArray(servicesRaw)
        ? servicesRaw
        : Object.values(servicesRaw as Record<string, unknown>);

      const countries = countriesArr
        .map((c: unknown) => {
          const row = c as Record<string, unknown>;
          return {
            id:        String(row.ID ?? row.id ?? row.country_id ?? '').trim(),
            name:      String(row.name ?? row.country_name ?? row.long_name ?? '').trim(),
            shortName: String(row.short_name ?? row.short ?? '').trim(),
          };
        })
        .filter(c => c.id && c.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      const services = servicesArr
        .map((s: unknown) => {
          const row = s as Record<string, unknown>;
          return {
            id:   String(row.ID ?? row.id ?? row.service_id ?? '').trim(),
            name: String(row.name ?? row.service_name ?? '').trim(),
          };
        })
        .filter(s => s.id && s.name)
        .sort((a, b) => a.name.localeCompare(b.name));

      console.log(`[sms-pool] Catalog: ${countries.length} countries, ${services.length} services`);

      return new Response(JSON.stringify({
        countries,
        services,
        usdToNgn:        config.usdToNgn,
        globalMultiplier: config.globalMultiplier,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ACTION 2 — GET PRICE FOR A SPECIFIC SERVICE + COUNTRY
    // ─────────────────────────────────────────────────────────────────────
    if (body.action === 'getPrice') {
      if (!body.service || !body.country) {
        return new Response(JSON.stringify({ error: 'service and country are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const config = await loadPricingConfig(supabase);

      const priceData = await poolPost('/request/price', {
        country: String(body.country).trim(),
        service: String(body.service).trim(),
      }) as Record<string, unknown>;

      const costUSD = Number(priceData.price ?? priceData.cost ?? 0);
      const costNGN = resolveNGNPrice(costUSD, body.country, body.service, config);

      console.log(`[sms-pool] Price: country=${body.country} service=${body.service} → $${costUSD} → ₦${costNGN}`);

      return new Response(JSON.stringify({
        costUSD,
        costNGN,
        usdToNgn:        config.usdToNgn,
        globalMultiplier: config.globalMultiplier,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ACTION 3 — PURCHASE A NUMBER
    // Uses the Phase 3 pricing engine to determine exact wallet deduction.
    // ─────────────────────────────────────────────────────────────────────
    if (body.action === 'getNumber') {
      if (!body.service || !body.country || !body.appUserId) {
        return new Response(JSON.stringify({ error: 'service, country, and appUserId are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const config = await loadPricingConfig(supabase);

      // 1. Fetch current wholesale price from SMSPool
      let costUSD = 0;
      try {
        const priceData = await poolPost('/request/price', {
          country: String(body.country).trim(),
          service: String(body.service).trim(),
        }) as Record<string, unknown>;
        costUSD = Number(priceData.price ?? priceData.cost ?? 0);
        console.log(`[sms-pool] Pre-purchase wholesale: country=${body.country} service=${body.service} → $${costUSD}`);
      } catch (priceErr) {
        console.error('[sms-pool] Price fetch failed before purchase (continuing):', priceErr);
      }

      // 2. Apply Phase 3 pricing engine to get final NGN charge
      const costNGN = resolveNGNPrice(costUSD, body.country, body.service, config);

      // 3. Check wallet balance
      const { data: walletRow } = await supabase
        .from('wallets')
        .select('balance')
        .eq('app_user_id', body.appUserId)
        .single();

      const currentBalance = walletRow ? Number(walletRow.balance) : 0;
      if (currentBalance < costNGN) {
        return new Response(JSON.stringify({
          error:    'INSUFFICIENT_BALANCE',
          required: costNGN,
          balance:  currentBalance,
        }), {
          status: 402,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // 4. Purchase number from SMSPool
      console.log(`[sms-pool] Purchasing: country=${body.country} service=${String(body.service).toLowerCase().trim()} costNGN=₦${costNGN}`);
      const purchase = await poolPost('/purchase/sms', {
        country:        String(body.country).trim(),
        service:        String(body.service).toLowerCase().trim(),
        pricing_option: '1',
      }) as Record<string, unknown>;

      console.log('[sms-pool] Purchase response:', JSON.stringify(purchase));

      if (!purchase.order_id && !purchase.success) {
        throw new Error(
          `SMSPool purchase failed: ${purchase.message ?? purchase.error ?? JSON.stringify(purchase)}`
        );
      }

      const orderId_pool = String(purchase.order_id ?? purchase.id ?? '');
      const phoneNumber  = String(purchase.number ?? purchase.phonenumber ?? '').replace(/^\+/, '');

      if (!orderId_pool || !phoneNumber) {
        throw new Error(`SMSPool: missing order_id or number. Response: ${JSON.stringify(purchase)}`);
      }

      // 5. Deduct wallet (admin-configured amount via pricing engine)
      const newBalance = currentBalance - costNGN;
      await supabase
        .from('wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('app_user_id', body.appUserId);

      const txId = `wt_vsms_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await supabase.from('wallet_transactions').insert({
        id:           txId,
        app_user_id:  body.appUserId,
        type:         'deduction',
        amount:       costNGN,
        balance_after: newBalance,
        description:  `Virtual number — ${body.service} / country ${body.country}`,
        reference:    `smspool_${orderId_pool}`,
        product_id:   orderId_pool,
        product_type: 'virtual_number',
        status:       'completed',
      });

      // 6. Save order to DB with 'pending' status
      const dbOrderId = `vno_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await supabase.from('virtual_number_orders').insert({
        id:           dbOrderId,
        app_user_id:  body.appUserId,
        service:      String(body.service).toLowerCase().trim(),
        country:      body.country,
        hero_sms_id:  orderId_pool,
        phone_number: phoneNumber,
        status:       'pending',
        cost_ngn:     costNGN,
        cost_rub:     costUSD, // we store USD wholesale here
      });

      return new Response(JSON.stringify({
        orderId:     dbOrderId,
        poolOrderId: orderId_pool,
        phone:       phoneNumber,
        service:     body.service,
        country:     body.country,
        costNGN,
        costUSD,
        status: 'waiting',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ACTION 4 — CHECK SMS STATUS
    // ─────────────────────────────────────────────────────────────────────
    if (body.action === 'getStatus') {
      const dbOrderId = body.orderId;

      let poolOrderId: string | undefined;
      if (dbOrderId) {
        const { data: order } = await supabase
          .from('virtual_number_orders')
          .select('hero_sms_id')
          .eq('id', dbOrderId)
          .single();
        poolOrderId = order?.hero_sms_id;
      }

      if (!poolOrderId) {
        return new Response(JSON.stringify({ error: 'orderId is required and must map to a valid pool order' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const statusData = await poolPost('/sms/check', { orderid: poolOrderId }) as Record<string, unknown>;
      console.log('[sms-pool] Status response:', JSON.stringify(statusData));

      const statusCode = Number(statusData.status ?? 1);
      const smsText    = String(statusData.sms ?? statusData.code ?? '');
      const state      = mapStatus(statusCode);

      let extractedCode: string | undefined;
      if (state === 'received' && smsText) {
        if (/^\d{4,8}$/.test(smsText.trim())) {
          extractedCode = smsText.trim();
        } else {
          const match = smsText.match(/\b(\d{4,8})\b/);
          extractedCode = match ? match[1] : smsText;
        }
      }

      if (dbOrderId && (state === 'received' || state === 'cancelled' || state === 'expired')) {
        const dbStatus = state === 'received' ? 'completed' : state;
        await supabase
          .from('virtual_number_orders')
          .update({
            status:     dbStatus,
            sms_code:   extractedCode ?? smsText ?? null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', dbOrderId);
      }

      return new Response(JSON.stringify({
        state,
        code:       extractedCode ?? (smsText || null),
        smsText:    smsText || null,
        statusCode,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ACTION 5 — CANCEL NUMBER & REFUND WALLET
    // ─────────────────────────────────────────────────────────────────────
    if (body.action === 'cancelNumber') {
      if (!body.orderId) {
        return new Response(JSON.stringify({ error: 'orderId is required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: order } = await supabase
        .from('virtual_number_orders')
        .select('hero_sms_id, cost_ngn, app_user_id, status')
        .eq('id', body.orderId)
        .single();

      if (!order) {
        return new Response(JSON.stringify({ error: 'Order not found' }), {
          status: 404,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (order.status === 'cancelled' || order.status === 'received') {
        return new Response(JSON.stringify({ success: false, error: `Order is already ${order.status}` }), {
          status: 409,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const poolOrderId  = order.hero_sms_id;
      const refundAmount = Number(order.cost_ngn);
      const appUserId    = order.app_user_id;

      let cancelResponse = {};
      try {
        cancelResponse = await poolPost('/sms/cancel', { orderid: poolOrderId }) as Record<string, unknown>;
        console.log(`[sms-pool] Cancel response for ${poolOrderId}:`, JSON.stringify(cancelResponse));
      } catch (err) {
        console.error('[sms-pool] Cancel API call failed (continuing with refund):', err);
      }

      await supabase
        .from('virtual_number_orders')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', body.orderId);

      if (appUserId && refundAmount > 0) {
        await refundWallet(
          appUserId,
          refundAmount,
          `Refund — cancelled virtual number (${body.orderId.slice(0, 12)})`,
          `refund_smspool_${poolOrderId ?? body.orderId}`,
        );
      }

      return new Response(JSON.stringify({ success: true, refunded: refundAmount, cancelResponse }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // PHASE 3 ADMIN ACTIONS
    // ─────────────────────────────────────────────────────────────────────

    // ACTION 6 — GET PRICING CONFIG (for admin panel)
    if (body.action === 'getPricingConfig') {
      const config    = await loadPricingConfig(supabase);
      const overrides = await supabase
        .from('smspool_price_overrides')
        .select('*')
        .order('updated_at', { ascending: false });

      return new Response(JSON.stringify({
        usdToNgn:        config.usdToNgn,
        globalMultiplier: config.globalMultiplier,
        overrides:       overrides.data || [],
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION 7 — SET GLOBAL MULTIPLIER
    if (body.action === 'setGlobalMultiplier') {
      if (body.multiplier === undefined) {
        return new Response(JSON.stringify({ error: 'multiplier is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await supabase
        .from('smspool_global_settings')
        .upsert({ id: 1, global_multiplier: body.multiplier, updated_at: new Date().toISOString() });

      console.log(`[admin] Global multiplier updated to ${body.multiplier}×`);
      return new Response(JSON.stringify({ success: true, globalMultiplier: body.multiplier }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION 8 — UPSERT PRICE OVERRIDE
    if (body.action === 'upsertPriceOverride') {
      if (!body.countryId || !body.serviceName || body.customPrice === undefined) {
        return new Response(JSON.stringify({ error: 'countryId, serviceName and customPrice are required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const norm = String(body.serviceName).toLowerCase().trim();
      const id   = `ovr_${body.countryId}_${norm}`.replace(/\s+/g, '_').slice(0, 80);

      const { data, error } = await supabase
        .from('smspool_price_overrides')
        .upsert({
          id,
          country_id:          String(body.countryId),
          service_name:        norm,
          custom_naira_price:  body.customPrice,
          updated_at:          new Date().toISOString(),
        }, { onConflict: 'country_id,service_name' })
        .select()
        .single();

      if (error) {
        console.error('[admin] upsert override error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
          status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      console.log(`[admin] Override saved: ${norm} / country ${body.countryId} → ₦${body.customPrice}`);
      return new Response(JSON.stringify({ success: true, override: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ACTION 9 — DELETE PRICE OVERRIDE
    if (body.action === 'deletePriceOverride') {
      if (!body.overrideId) {
        return new Response(JSON.stringify({ error: 'overrideId is required' }), {
          status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      await supabase.from('smspool_price_overrides').delete().eq('id', body.overrideId);
      console.log(`[admin] Deleted override ${body.overrideId}`);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ─────────────────────────────────────────────────────────────────────
    // ACTION 10 — UPDATE CONVERSION CONFIG (legacy — kept for compatibility)
    // ─────────────────────────────────────────────────────────────────────
    if (body.action === 'updateConversionConfig') {
      return new Response(JSON.stringify({ success: true, note: 'Use exchange_rate table for USD→NGN and setGlobalMultiplier for multiplier' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[sms-pool] Unhandled error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
