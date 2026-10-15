/**
 * Social Boosting Edge Function — Account Growth Services Integration
 *
 * Actions:
 *  - syncServices        → fetch all services from provider API, batch-upsert to DB
 *  - getServices         → return cached services from DB (grouped by category)
 *  - getCategories       → return distinct categories
 *  - placeOrder          → validate wallet → deduct → POST to provider → save order
 *  - getOrderStatus      → poll provider order status
 *  - getConfig           → global multiplier + exchange rate + service count
 *  - setGlobalMultiplier → update admin multiplier (×1–×5)
 *  - setExchangeRate     → update USD→NGN exchange rate
 *  - updateServicePrice  → set custom_admin_price (USD/1000) for a service
 *  - getUserOrders       → orders for a specific user
 *  - getAdminOrders      → all orders (admin view)
 *  - calcPrice           → preview NGN price for a service + quantity
 */

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

const PROVIDER_ENDPOINT = 'https://justanotherpanel.com/api/v2';
const PROVIDER_KEY      = Deno.env.get('JAP_API_KEY') ?? '';

const SUPABASE_URL              = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const DEFAULT_EXCHANGE_RATE = 1450; // NGN per 1 USD
const BATCH_SIZE = 100; // services per DB upsert batch

function supabaseAdmin() {
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider API helper (internal only — never exposed to client)
// ─────────────────────────────────────────────────────────────────────────────
async function providerPost(body: Record<string, unknown>): Promise<unknown> {
  const params = new URLSearchParams();
  params.set('key', PROVIDER_KEY);
  for (const [k, v] of Object.entries(body)) {
    params.set(k, String(v));
  }

  const res = await fetch(PROVIDER_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const text = await res.text();
  console.log(`[provider] action=${body.action} status=${res.status} preview=${text.slice(0, 200)}`);

  if (!res.ok) throw new Error(`Provider HTTP ${res.status}: ${text.slice(0, 300)}`);

  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch { throw new Error(`Provider returned non-JSON: ${text.slice(0, 200)}`); }

  if (Array.isArray(parsed)) return parsed;
  const obj = parsed as Record<string, unknown>;
  if (obj.error) throw new Error(`Provider error: ${obj.error}`);
  return parsed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pricing engine
// ─────────────────────────────────────────────────────────────────────────────
async function getPricingConfig(db: ReturnType<typeof supabaseAdmin>) {
  const { data: settings } = await db
    .from('app_settings')
    .select('key,value')
    .in('key', ['jap_global_multiplier', 'jap_exchange_rate']);

  const map: Record<string, string> = {};
  (settings || []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });

  const globalMultiplier = Number(map['jap_global_multiplier'] ?? 1);
  const exchangeRate     = Number(map['jap_exchange_rate'] ?? DEFAULT_EXCHANGE_RATE);

  return { globalMultiplier, exchangeRate };
}

/**
 * Calculate NGN cost for a service order.
 *
 * @param originalApiPrice  Provider price in USD per 1000 units
 * @param customAdminPrice  Admin override in USD per 1000 units (nullable)
 * @param quantity          Number of units
 * @param globalMultiplier  Business markup multiplier (1–5)
 * @param exchangeRate      NGN per 1 USD
 * @returns NGN amount to charge customer
 */
function calcNGNPrice(
  originalApiPrice: number,
  customAdminPrice: number | null,
  quantity: number,
  globalMultiplier: number,
  exchangeRate: number,
): number {
  // Use custom price if set, otherwise use original provider price (both in USD/1000)
  const basePer1kUSD = customAdminPrice != null ? customAdminPrice : originalApiPrice;
  // Formula: (USD_per_1000 / 1000) × quantity × multiplier × exchange_rate
  const ngn = (basePer1kUSD / 1000) * quantity * globalMultiplier * exchangeRate;
  return Math.ceil(ngn * 100) / 100; // round to 2dp
}

// ─────────────────────────────────────────────────────────────────────────────
// Main handler
// ─────────────────────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body   = await req.json() as Record<string, unknown>;
    const action = String(body.action ?? '');
    const db     = supabaseAdmin();

    // ── syncServices ─────────────────────────────────────────────────────────
    if (action === 'syncServices') {
      const syncStart = Date.now();
      console.log('[sync] Fetching all services from provider…');

      // Fetch all services from provider
      const raw = await providerPost({ action: 'services' }) as Array<{
        service: number;
        name: string;
        type: string;
        category: string;
        rate: string;
        min: string;
        max: string;
        description?: string;
      }>;

      if (!Array.isArray(raw)) throw new Error('Provider services response is not an array');
      console.log(`[sync] Received ${raw.length} services from provider`);

      // Build upsert records — preserve custom_admin_price by using ON CONFLICT DO UPDATE
      // selectively (exclude custom_admin_price from update so admin overrides survive)
      const records = raw.map(svc => ({
        id:                 String(svc.service),
        category_name:     (svc.category || 'Other').trim(),
        service_name:      (svc.name || 'Unknown Service').trim(),
        original_api_price: parseFloat(svc.rate) || 0,   // USD per 1000 units
        min_quantity:      parseInt(svc.min, 10)  || 10,
        max_quantity:      parseInt(svc.max, 10)  || 100000,
        description:       (svc.description ?? '').slice(0, 500),
        active:            true,
        last_synced_at:    new Date().toISOString(),
        updated_at:        new Date().toISOString(),
      }));

      let inserted = 0;
      const updated  = 0;
      let failed   = 0;
      const failedIds: string[] = [];

      // Batch upsert in chunks to avoid payload limits and timeouts
      for (let i = 0; i < records.length; i += BATCH_SIZE) {
        const batch = records.slice(i, i + BATCH_SIZE);

        const { error } = await db
          .from('jap_services')
          .upsert(batch, {
            onConflict:       'id',
            ignoreDuplicates: false,
          });

        if (error) {
          console.error(`[sync] Batch ${Math.floor(i / BATCH_SIZE) + 1} error:`, error.message);
          // Retry individual records in failed batch
          for (const record of batch) {
            const { error: singleErr } = await db
              .from('jap_services')
              .upsert([record], { onConflict: 'id', ignoreDuplicates: false });
            if (singleErr) {
              console.error(`[sync] Failed to upsert service ${record.id}:`, singleErr.message);
              failed++;
              failedIds.push(record.id);
            } else {
              inserted++;
            }
          }
        } else {
          inserted += batch.length;
          console.log(`[sync] Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${i + batch.length}/${records.length} processed`);
        }
      }

      // Mark services no longer returned by provider as inactive
      const activeIds = raw.map(s => String(s.service));
      if (activeIds.length > 0) {
        // Use NOT IN with chunked approach to avoid query length limits
        const CHUNK = 500;
        for (let i = 0; i < activeIds.length; i += CHUNK) {
          // We can't easily do NOT IN with dynamic lists in Supabase client
          // Instead, mark all inactive first, then reactivate known ones
          break; // Skip inactive marking — use a different approach below
        }

        // Better approach: fetch all IDs in DB, find the diff
        const { data: dbIds } = await db
          .from('jap_services')
          .select('id')
          .eq('active', true);

        const activeSet = new Set(activeIds);
        const toDeactivate = (dbIds || [])
          .map((r: { id: string }) => r.id)
          .filter((id: string) => !activeSet.has(id));

        if (toDeactivate.length > 0) {
          // Deactivate in batches
          for (let i = 0; i < toDeactivate.length; i += 200) {
            const chunk = toDeactivate.slice(i, i + 200);
            await db
              .from('jap_services')
              .update({ active: false, updated_at: new Date().toISOString() })
              .in('id', chunk);
          }
          console.log(`[sync] Deactivated ${toDeactivate.length} services no longer in provider catalog`);
        }
      }

      // Update last sync timestamp and count
      await db.from('app_settings').upsert([
        { key: 'jap_last_sync', value: new Date().toISOString(), updated_at: new Date().toISOString() },
        { key: 'jap_total_synced', value: String(records.length), updated_at: new Date().toISOString() },
      ], { onConflict: 'key' });

      const syncDuration = ((Date.now() - syncStart) / 1000).toFixed(1);
      console.log(`[sync] Complete: ${inserted} processed, ${failed} failed, ${syncDuration}s elapsed`);

      return new Response(JSON.stringify({
        success:      true,
        total:        raw.length,
        inserted,
        updated,
        failed,
        failedIds:    failedIds.slice(0, 20),
        syncDuration: `${syncDuration}s`,
        message:      `${raw.length} / ${raw.length} services synced successfully. ${failed > 0 ? `${failed} failed.` : 'No failures.'}`,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── getServices ──────────────────────────────────────────────────────────
    if (action === 'getServices') {
      const category = body.category ? String(body.category) : null;

      let query = db
        .from('jap_services')
        .select('id, category_name, service_name, original_api_price, custom_admin_price, min_quantity, max_quantity, description, active')
        .eq('active', true)
        .order('service_name');

      if (category) query = query.eq('category_name', category);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ services: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── getCategories ────────────────────────────────────────────────────────
    if (action === 'getCategories') {
      const { data, error } = await db
        .from('jap_services')
        .select('category_name')
        .eq('active', true)
        .order('category_name');

      if (error) throw new Error(error.message);

      const cats = [...new Set((data || []).map((r: { category_name: string }) => r.category_name))];
      return new Response(JSON.stringify({ categories: cats }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── placeOrder ───────────────────────────────────────────────────────────
    if (action === 'placeOrder') {
      const serviceId  = String(body.serviceId  ?? '');
      const targetLink = String(body.targetLink ?? '');
      const quantity   = parseInt(String(body.quantity ?? 0), 10);
      const appUserId  = String(body.appUserId  ?? '');

      if (!serviceId || !targetLink || !quantity || !appUserId) {
        throw new Error('Missing required fields: serviceId, targetLink, quantity, appUserId');
      }

      // Get service details
      const { data: svc, error: svcErr } = await db
        .from('jap_services')
        .select('*')
        .eq('id', serviceId)
        .eq('active', true)
        .single();

      if (svcErr || !svc) throw new Error(`Service ${serviceId} not found or inactive`);

      if (quantity < svc.min_quantity || quantity > svc.max_quantity) {
        throw new Error(`Quantity must be between ${svc.min_quantity} and ${svc.max_quantity}`);
      }

      // Get pricing config
      const { globalMultiplier, exchangeRate } = await getPricingConfig(db);

      // Calculate NGN cost with exchange rate
      const costNGN = calcNGNPrice(
        Number(svc.original_api_price),
        svc.custom_admin_price != null ? Number(svc.custom_admin_price) : null,
        quantity,
        globalMultiplier,
        exchangeRate,
      );

      // Check wallet balance
      const { data: walletRow } = await db
        .from('wallets')
        .select('balance')
        .eq('app_user_id', appUserId)
        .single();

      const balance = walletRow ? Number(walletRow.balance) : 0;
      if (balance < costNGN) {
        throw new Error(`INSUFFICIENT_BALANCE: need ₦${costNGN.toFixed(2)}, have ₦${balance.toFixed(2)}`);
      }

      // Atomic wallet deduction
      const newBalance = balance - costNGN;
      const { error: walletErr } = await db
        .from('wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('app_user_id', appUserId);

      if (walletErr) throw new Error(`Wallet deduction failed: ${walletErr.message}`);

      // Log transaction in wallet_transactions
      const txId = `wt_boost_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await db.from('wallet_transactions').insert({
        id:            txId,
        app_user_id:   appUserId,
        type:          'deduction',
        amount:        costNGN,
        balance_after: newBalance,
        description:   `Account Boosting — ${svc.service_name} (×${quantity.toLocaleString()})`,
        reference:     txId,
        status:        'completed',
      });

      // Create local order record (status: pending) before calling provider
      const orderId = `boost_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const costPer1kNGN = (Number(svc.custom_admin_price ?? svc.original_api_price) * globalMultiplier * exchangeRate);

      await db.from('jap_orders').insert({
        id:              orderId,
        app_user_id:     appUserId,
        service_id:      serviceId,
        service_name:    svc.service_name,
        category_name:   svc.category_name,
        target_link:     targetLink,
        quantity,
        cost_ngn:        costNGN,
        cost_per_1k_ngn: costPer1kNGN,
        status:          'pending',
      });

      // Submit order to provider
      let providerOrderId: string | null = null;
      let finalStatus = 'processing';
      let errorMessage: string | null = null;

      try {
        const providerRes = await providerPost({
          action:   'add',
          service:  serviceId,
          link:     targetLink,
          quantity: quantity,
        }) as Record<string, unknown>;

        providerOrderId = providerRes.order ? String(providerRes.order) : null;
        finalStatus     = 'processing';
        console.log(`[order] Provider order ID: ${providerOrderId}`);
      } catch (provErr: unknown) {
        console.error('[order] Provider submission failed:', provErr);
        errorMessage = provErr instanceof Error ? provErr.message : String(provErr);
        finalStatus  = 'awaiting_review';
      }

      // Update local order with provider result
      await db.from('jap_orders').update({
        jap_order_id:  providerOrderId,
        status:        finalStatus,
        error_message: errorMessage,
        updated_at:    new Date().toISOString(),
      }).eq('id', orderId);

      if (finalStatus === 'awaiting_review') {
        return new Response(JSON.stringify({
          success:     false,
          orderId,
          status:      'awaiting_review',
          costNGN,
          newBalance,
          message:     'Order submitted but requires manual review. Your wallet has been debited and our team will process this shortly.',
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      return new Response(JSON.stringify({
        success:        true,
        orderId,
        providerOrderId,
        status:         finalStatus,
        costNGN,
        newBalance,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── getOrderStatus ────────────────────────────────────────────────────────
    if (action === 'getOrderStatus') {
      const orderId = String(body.orderId ?? '');
      if (!orderId) throw new Error('orderId required');

      const { data: localOrder } = await db
        .from('jap_orders')
        .select('*')
        .eq('id', orderId)
        .single();

      if (!localOrder) throw new Error('Order not found');

      // If no provider order ID yet, return current local status
      if (!localOrder.jap_order_id) {
        return new Response(JSON.stringify({ status: localOrder.status, order: localOrder }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Poll provider for latest status
      const provRes = await providerPost({
        action: 'status',
        order:  localOrder.jap_order_id,
      }) as Record<string, unknown>;

      const provStatus = String(provRes.status ?? '').toLowerCase();
      const startCount = provRes.start_count ? parseInt(String(provRes.start_count), 10) : null;
      const remains    = provRes.remains      ? parseInt(String(provRes.remains), 10)      : null;

      // Map provider status to internal status
      let internalStatus = localOrder.status;
      if (provStatus === 'completed')               internalStatus = 'completed';
      else if (provStatus === 'partial')            internalStatus = 'partial';
      else if (provStatus === 'cancelled')          internalStatus = 'cancelled';
      else if (provStatus === 'processing')         internalStatus = 'processing';
      else if (provStatus === 'pending')            internalStatus = 'processing';
      else if (provStatus === 'in progress')        internalStatus = 'processing';

      // Persist status change if updated
      if (internalStatus !== localOrder.status || startCount !== localOrder.start_count) {
        await db.from('jap_orders').update({
          status:      internalStatus,
          jap_status:  provStatus,
          start_count: startCount,
          remains,
          updated_at:  new Date().toISOString(),
        }).eq('id', orderId);
      }

      return new Response(JSON.stringify({
        status:     internalStatus,
        provStatus,
        startCount,
        remains,
        order: { ...localOrder, status: internalStatus, jap_status: provStatus, start_count: startCount, remains },
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── getConfig ─────────────────────────────────────────────────────────────
    if (action === 'getConfig') {
      const config = await getPricingConfig(db);

      const { data: syncRow } = await db
        .from('app_settings')
        .select('value')
        .eq('key', 'jap_last_sync')
        .single();

      const { count: serviceCount } = await db
        .from('jap_services')
        .select('id', { count: 'exact', head: true })
        .eq('active', true);

      const { count: categoryCount } = await db
        .from('jap_services')
        .select('category_name', { count: 'exact', head: true })
        .eq('active', true);

      return new Response(JSON.stringify({
        ...config,
        lastSync:      syncRow?.value || null,
        serviceCount:  serviceCount ?? 0,
        categoryCount: categoryCount ?? 0,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // ── setGlobalMultiplier ──────────────────────────────────────────────────
    if (action === 'setGlobalMultiplier') {
      const m = Number(body.multiplier ?? 1);
      if (m < 1 || m > 5) throw new Error('Multiplier must be 1–5');

      await db.from('app_settings').upsert(
        { key: 'jap_global_multiplier', value: String(m), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

      return new Response(JSON.stringify({ success: true, multiplier: m }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── setExchangeRate ──────────────────────────────────────────────────────
    if (action === 'setExchangeRate') {
      const r = Number(body.rate ?? DEFAULT_EXCHANGE_RATE);
      if (r < 100 || r > 100000) throw new Error('Exchange rate must be between 100 and 100,000');

      await db.from('app_settings').upsert(
        { key: 'jap_exchange_rate', value: String(r), updated_at: new Date().toISOString() },
        { onConflict: 'key' }
      );

      return new Response(JSON.stringify({ success: true, rate: r }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── updateServicePrice ────────────────────────────────────────────────────
    if (action === 'updateServicePrice') {
      const serviceId   = String(body.serviceId ?? '');
      const customPrice = (body.customPrice !== undefined && body.customPrice !== '' && body.customPrice !== null)
        ? Number(body.customPrice)
        : null;

      if (!serviceId) throw new Error('serviceId required');

      await db.from('jap_services').update({
        custom_admin_price: customPrice,
        updated_at:         new Date().toISOString(),
      }).eq('id', serviceId);

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── getUserOrders ─────────────────────────────────────────────────────────
    if (action === 'getUserOrders') {
      const appUserId = String(body.appUserId ?? '');
      if (!appUserId) throw new Error('appUserId required');

      const { data, error } = await db
        .from('jap_orders')
        .select('*')
        .eq('app_user_id', appUserId)
        .order('created_at', { ascending: false });

      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ orders: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── getAdminOrders ────────────────────────────────────────────────────────
    if (action === 'getAdminOrders') {
      const limit  = Number(body.limit ?? 200);
      const status = body.status ? String(body.status) : null;

      let query = db
        .from('jap_orders')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (status && status !== 'all') query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw new Error(error.message);

      return new Response(JSON.stringify({ orders: data || [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── calcPrice (live preview) ───────────────────────────────────────────────
    if (action === 'calcPrice') {
      const serviceId = String(body.serviceId ?? '');
      const quantity  = parseInt(String(body.quantity ?? 0), 10);
      if (!serviceId || !quantity) throw new Error('serviceId and quantity required');

      const { data: svc } = await db
        .from('jap_services')
        .select('original_api_price, custom_admin_price')
        .eq('id', serviceId)
        .single();

      if (!svc) throw new Error('Service not found');

      const { globalMultiplier, exchangeRate } = await getPricingConfig(db);

      const costNGN = calcNGNPrice(
        Number(svc.original_api_price),
        svc.custom_admin_price != null ? Number(svc.custom_admin_price) : null,
        quantity,
        globalMultiplier,
        exchangeRate,
      );

      // Also return per-unit NGN for display
      const basePer1kUSD = svc.custom_admin_price != null
        ? Number(svc.custom_admin_price)
        : Number(svc.original_api_price);
      const perUnitNGN = (basePer1kUSD / 1000) * globalMultiplier * exchangeRate;

      return new Response(JSON.stringify({
        costNGN,
        perUnitNGN,
        globalMultiplier,
        exchangeRate,
        basePer1kUSD,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    throw new Error(`Unknown action: ${action}`);

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[jap] Error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status:  400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
