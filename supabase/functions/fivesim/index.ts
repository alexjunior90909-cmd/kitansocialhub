/**
 * fivesim — 5SIM virtual number provider (Server 2)
 *
 * Actions: getCatalog, getProducts, buyNumber, checkStatus, cancelNumber
 * Admin:   getMultiplier, setMultiplier
 *
 * Required secret: FIVESIM_API_KEY
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const FIVESIM_API_KEY = Deno.env.get("FIVESIM_API_KEY") ?? "";
const API_BASE = "https://5sim.net/v1";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${FIVESIM_API_KEY}`,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`5SIM API ${res.status} at ${path}: ${text.slice(0, 400)}`);
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(`5SIM non-JSON at ${path}: ${text.slice(0, 300)}`);
  }
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );

  /** Load exchange rate + 5SIM multiplier from DB */
  async function getConfig(): Promise<{ usdToNgn: number; multiplier: number }> {
    const [rateRes, multRes] = await Promise.all([
      sb.from("exchange_rate").select("rate").eq("id", 1).single(),
      sb.from("fivesim_global_settings").select("global_multiplier").eq("id", 1).single(),
    ]);
    return {
      usdToNgn: rateRes.data ? Number(rateRes.data.rate) : 1600,
      multiplier: multRes.data ? Number(multRes.data.global_multiplier) : 1,
    };
  }

  /** Convert 5SIM price (USD) → NGN via exchange rate × multiplier */
  function toNGN(costUSD: number, cfg: { usdToNgn: number; multiplier: number }): number {
    const raw = costUSD * cfg.usdToNgn * cfg.multiplier;
    return Math.max(Math.ceil(raw / 10) * 10, 50);
  }

  /** Refund wallet and log transaction */
  async function refundWallet(appUserId: string, amount: number, ref: string): Promise<void> {
    const { data: w } = await sb.from("wallets").select("balance").eq("app_user_id", appUserId).single();
    const bal = w ? Number(w.balance) : 0;
    const newBal = bal + amount;
    await sb.from("wallets").update({ balance: newBal, updated_at: new Date().toISOString() }).eq("app_user_id", appUserId);
    const txId = `wt_5sim_ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await sb.from("wallet_transactions").insert({
      id: txId, app_user_id: appUserId, type: "refund", amount,
      balance_after: newBal, description: `5SIM refund (${ref})`,
      reference: ref, product_type: "virtual_number_5sim", status: "completed",
    });
  }

  try {
    const body = await req.json() as Record<string, unknown>;
    const { action } = body;

    // ── GET CATALOG: countries ──────────────────────────────────────────────
    if (action === "getCatalog") {
      const raw = await apiGet<Record<string, { text_en?: string; text?: string }>>("/guest/countries");
      const countries = Object.entries(raw).map(([id, c]) => ({
        id,
        name: c.text_en || c.text || id,
      })).sort((a, b) => a.name.localeCompare(b.name));

      const config = await getConfig();
      return jsonRes({ countries, config });
    }

    // ── GET PRODUCTS for a country ──────────────────────────────────────────
    if (action === "getProducts") {
      const country = String(body.country || "russia").toLowerCase();
      const raw = await apiGet<Record<string, {
        Category: string;
        Qty: number;
        Price: number;
      }>>(`/guest/products/${country}/any`);

      const config = await getConfig();

      const services = Object.entries(raw)
        .filter(([, v]) => v.Qty > 0)
        .map(([name, v]) => ({
          id: name,
          name: name.charAt(0).toUpperCase() + name.slice(1).replace(/_/g, " "),
          costUSD: v.Price,
          costNGN: toNGN(v.Price, config),
          qty: v.Qty,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return jsonRes({ services, config });
    }

    // ── GET PRICE for country + service ────────────────────────────────────
    if (action === "getPrice") {
      const country = String(body.country || "").toLowerCase();
      const service = String(body.service || "").toLowerCase();
      if (!country || !service) return jsonRes({ error: "country and service required" }, 400);

      const raw = await apiGet<Record<string, {
        Category: string; Qty: number; Price: number;
      }>>(`/guest/products/${country}/any`);

      const productData = raw[service];
      if (!productData) return jsonRes({ error: `Service '${service}' not found in ${country}` }, 404);

      const config = await getConfig();
      const costUSD = productData.Price;
      const costNGN = toNGN(costUSD, config);

      return jsonRes({ costUSD, costNGN, qty: productData.Qty, config });
    }

    // ── BUY NUMBER ─────────────────────────────────────────────────────────
    if (action === "buyNumber") {
      const country   = String(body.country || "").toLowerCase();
      const service   = String(body.service || "").toLowerCase();
      const appUserId = String(body.appUserId || "");

      if (!country || !service || !appUserId) {
        return jsonRes({ error: "country, service, and appUserId are required" }, 400);
      }

      if (!FIVESIM_API_KEY) {
        return jsonRes({ error: "5SIM API key not configured. Contact admin." }, 503);
      }

      const config = await getConfig();

      // Get current price
      const raw = await apiGet<Record<string, { Price: number; Qty: number }>>(`/guest/products/${country}/any`);
      const productData = raw[service];
      if (!productData || productData.Qty <= 0) {
        return jsonRes({ error: `No numbers available for '${service}' in '${country}'` }, 409);
      }

      const costUSD = productData.Price;
      const costNGN = toNGN(costUSD, config);

      // Check wallet balance
      const { data: walletRow } = await sb.from("wallets").select("balance").eq("app_user_id", appUserId).single();
      const balance = walletRow ? Number(walletRow.balance) : 0;
      if (balance < costNGN) {
        return jsonRes({ error: "INSUFFICIENT_BALANCE", required: costNGN, balance }, 402);
      }

      // Purchase from 5SIM
      const purchase = await apiGet<{
        id: number; phone: string; status: string; operator: string;
      }>(`/user/buy/activation/${country}/any/${service}`);

      if (!purchase.id || !purchase.phone) {
        throw new Error(`5SIM returned invalid purchase: ${JSON.stringify(purchase)}`);
      }

      const fivesimOrderId = String(purchase.id);
      const phone = String(purchase.phone).replace(/^\+/, "");

      // Deduct wallet
      const newBalance = balance - costNGN;
      await sb.from("wallets").update({ balance: newBalance, updated_at: new Date().toISOString() }).eq("app_user_id", appUserId);

      const txId = `wt_5sim_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await sb.from("wallet_transactions").insert({
        id: txId, app_user_id: appUserId, type: "deduction", amount: costNGN,
        balance_after: newBalance, description: `5SIM: ${service} / ${country}`,
        reference: `5sim_${fivesimOrderId}`, product_type: "virtual_number_5sim", status: "completed",
      });

      // Save to fivesim_orders table
      const dbOrderId = `fs_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await sb.from("fivesim_orders").insert({
        id: dbOrderId, app_user_id: appUserId, service, country,
        fivesim_order_id: fivesimOrderId, phone_number: phone,
        status: "PENDING", cost_ngn: costNGN, cost_usd: costUSD,
        created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      });

      console.log(`[5sim] Purchased ${service}/${country} → phone=${phone} id=${fivesimOrderId} cost=₦${costNGN}`);

      return jsonRes({
        orderId: dbOrderId,
        fivesimOrderId,
        phone,
        service,
        country,
        costNGN,
        costUSD,
        status: "PENDING",
      });
    }

    // ── CHECK STATUS ───────────────────────────────────────────────────────
    if (action === "checkStatus") {
      const dbOrderId = String(body.orderId || "");
      if (!dbOrderId) return jsonRes({ error: "orderId required" }, 400);

      const { data: order } = await sb.from("fivesim_orders")
        .select("fivesim_order_id, status")
        .eq("id", dbOrderId)
        .single();

      if (!order) return jsonRes({ error: "Order not found" }, 404);

      const statusData = await apiGet<{
        id: number; status: string;
        sms: Array<{ code: string; text: string; created_at: string }>;
      }>(`/user/check/${order.fivesim_order_id}`);

      const fsStatus = statusData.status; // PENDING, RECEIVED, TIMEOUT, CANCELED, BANNED, FINISHED
      const smsCode = statusData.sms?.[0]?.code || "";

      // Map to our internal states
      let state: "waiting" | "received" | "cancelled" | "expired" = "waiting";
      if (fsStatus === "RECEIVED" || fsStatus === "FINISHED") state = "received";
      else if (fsStatus === "CANCELED" || fsStatus === "BANNED") state = "cancelled";
      else if (fsStatus === "TIMEOUT") state = "expired";

      // Update DB on terminal state
      if (state !== "waiting") {
        const dbStatus = state === "received" ? "RECEIVED" : fsStatus;
        await sb.from("fivesim_orders").update({
          status: dbStatus, sms_code: smsCode || null, updated_at: new Date().toISOString(),
        }).eq("id", dbOrderId);
      }

      return jsonRes({ state, code: smsCode || null, fsStatus });
    }

    // ── CANCEL NUMBER + REFUND ─────────────────────────────────────────────
    if (action === "cancelNumber") {
      const dbOrderId = String(body.orderId || "");
      const appUserId = String(body.appUserId || "");
      if (!dbOrderId) return jsonRes({ error: "orderId required" }, 400);

      const { data: order } = await sb.from("fivesim_orders")
        .select("fivesim_order_id, cost_ngn, app_user_id, status")
        .eq("id", dbOrderId)
        .single();

      if (!order) return jsonRes({ error: "Order not found" }, 404);
      if (order.status === "RECEIVED" || order.status === "CANCELED") {
        return jsonRes({ success: false, error: `Order is already ${order.status}` }, 409);
      }

      // Call 5SIM cancel
      try {
        await apiGet(`/user/cancel/${order.fivesim_order_id}`);
        console.log(`[5sim] Cancelled order ${order.fivesim_order_id}`);
      } catch (e) {
        console.error("[5sim] Cancel API error (continuing with refund):", e);
      }

      // Update DB
      await sb.from("fivesim_orders").update({
        status: "CANCELED", updated_at: new Date().toISOString(),
      }).eq("id", dbOrderId);

      // Refund wallet
      const uid = appUserId || order.app_user_id;
      const refundAmount = Number(order.cost_ngn);
      if (uid && refundAmount > 0) {
        await refundWallet(uid, refundAmount, dbOrderId);
      }

      return jsonRes({ success: true, refunded: refundAmount });
    }

    // ── ADMIN: GET MULTIPLIER ──────────────────────────────────────────────
    if (action === "getMultiplier") {
      const [multRes, rateRes] = await Promise.all([
        sb.from("fivesim_global_settings").select("global_multiplier").eq("id", 1).single(),
        sb.from("exchange_rate").select("rate").eq("id", 1).single(),
      ]);
      return jsonRes({
        multiplier: multRes.data ? Number(multRes.data.global_multiplier) : 1,
        usdToNgn: rateRes.data ? Number(rateRes.data.rate) : 1600,
      });
    }

    // ── ADMIN: SET MULTIPLIER ──────────────────────────────────────────────
    if (action === "setMultiplier") {
      const mult = Number(body.multiplier ?? 1);
      if (isNaN(mult) || mult < 1 || mult > 10) {
        return jsonRes({ error: "multiplier must be between 1 and 10" }, 400);
      }
      await sb.from("fivesim_global_settings").update({
        global_multiplier: mult, updated_at: new Date().toISOString(),
      }).eq("id", 1);
      console.log(`[5sim-admin] Multiplier set to ×${mult}`);
      return jsonRes({ success: true, multiplier: mult });
    }

    return jsonRes({ error: `Unknown action: ${action}` }, 400);

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[5sim] Error:", msg);
    return jsonRes({ error: msg }, 500);
  }
});
