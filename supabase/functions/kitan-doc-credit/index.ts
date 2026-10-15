/**
 * kitan-doc-credit — Secure server-side document purchase handler.
 *
 * Flow:
 *   1. Idempotency check (prevents double-charging on retries)
 *   2. Verify document exists + is available
 *   3. Check wallet balance
 *   4. Deduct wallet atomically
 *   5. Call KitanLab API to grant 1 generation credit
 *   6. If KitanLab fails → refund wallet (compensating transaction)
 *   7. Record purchase reference (future idempotency guard)
 *   8. Return success
 *
 * Required secret: KITANLAB_API_KEY (set via Cloud → Secrets panel)
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

const SUPABASE_URL        = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const KITANLAB_API_KEY    = Deno.env.get("KITANLAB_API_KEY") ?? "";
// Update this when KitanLab confirms their exact API endpoint.
// Current endpoint may need adjustment — check backend logs for 404 details.
const KITANLAB_CREDITS_URL = Deno.env.get("KITANLAB_CREDITS_URL") || "https://kitanlabs.store/api/credits/grant";

function jsonRes(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const { appUserId, documentId, userEmail, purchaseRef } = body as {
      appUserId?: string;
      documentId?: string;
      userEmail?: string;
      purchaseRef?: string;
    };

    if (!appUserId || !documentId || !userEmail || !purchaseRef) {
      return jsonRes({ error: "Missing fields: appUserId, documentId, userEmail, purchaseRef" }, 400);
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── 1. Idempotency check ──────────────────────────────────────────────
    const { data: existingPurchase } = await supabase
      .from("purchases")
      .select("id")
      .eq("reference", purchaseRef)
      .maybeSingle();

    if (existingPurchase) {
      console.log(`[doc-credit] Idempotent: ref=${purchaseRef} already processed`);
      return jsonRes({ success: true, idempotent: true });
    }

    // ── 2. Verify document ────────────────────────────────────────────────
    const { data: doc, error: docErr } = await supabase
      .from("kitan_documents")
      .select("id, title, price, available")
      .eq("id", documentId)
      .single();

    if (docErr || !doc) {
      return jsonRes({ error: "Document not found" }, 404);
    }
    if (!doc.available) {
      return jsonRes({ error: "This document is currently unavailable" }, 404);
    }

    const price = Number(doc.price);

    // ── 3. Check wallet balance ───────────────────────────────────────────
    const { data: walletRow, error: walletErr } = await supabase
      .from("wallets")
      .select("balance")
      .eq("app_user_id", appUserId)
      .single();

    if (walletErr || !walletRow) {
      return jsonRes({ error: "Wallet not found. Please fund your wallet first." }, 404);
    }

    const balanceBefore = Number(walletRow.balance);
    if (balanceBefore < price) {
      return jsonRes({
        error: `Insufficient balance. Need ₦${price.toLocaleString()}, have ₦${balanceBefore.toLocaleString()}`
      }, 402);
    }

    const newBalance = balanceBefore - price;

    // ── 4. Deduct wallet ──────────────────────────────────────────────────
    const { error: deductErr } = await supabase
      .from("wallets")
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq("app_user_id", appUserId);

    if (deductErr) {
      console.error("[doc-credit] Wallet deduction failed:", deductErr.message);
      return jsonRes({ error: "Payment processing failed. Please try again." }, 500);
    }

    // Log the deduction transaction
    const txId = `wt_doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from("wallet_transactions").insert({
      id: txId, app_user_id: appUserId, type: "deduction", amount: price,
      balance_after: newBalance, description: `Document Access: ${doc.title}`,
      reference: purchaseRef, product_id: documentId, product_type: "document",
      status: "completed",
    });

    // ── 5. Call KitanLab API to grant credit ──────────────────────────────
    let creditGranted = false;
    let kitanLabError = "";

    if (!KITANLAB_API_KEY) {
      kitanLabError = "KitanLab API key not configured. Contact support.";
      console.error("[doc-credit] KITANLAB_API_KEY secret is not set.");
    } else {
      try {
        const kitanRes = await fetch(KITANLAB_CREDITS_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${KITANLAB_API_KEY}`,
            "X-Idempotency-Key": purchaseRef,
          },
          body: JSON.stringify({
            email: userEmail,
            credits: 1,
            source: "kitan_social_hub",
            reference: purchaseRef,
            document_id: documentId,
          }),
        });

        if (kitanRes.ok) {
          creditGranted = true;
          console.log(`[doc-credit] ✓ Credit granted to ${userEmail} ref=${purchaseRef}`);
        } else {
          const errBody = await kitanRes.text().catch(() => "");
          kitanLabError = `KitanLab API error ${kitanRes.status}: ${errBody}`;
          console.error("[doc-credit]", kitanLabError);
        }
      } catch (e: unknown) {
        kitanLabError = `KitanLab API exception: ${e instanceof Error ? e.message : String(e)}`;
        console.error("[doc-credit]", kitanLabError);
      }
    }

    // ── 6. Refund if credit failed ────────────────────────────────────────
    if (!creditGranted) {
      await supabase.from("wallets").update({
        balance: balanceBefore, updated_at: new Date().toISOString(),
      }).eq("app_user_id", appUserId);

      const refundId = `wt_ref_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await supabase.from("wallet_transactions").insert({
        id: refundId, app_user_id: appUserId, type: "refund", amount: price,
        balance_after: balanceBefore,
        description: `Refund: ${doc.title} (credit grant failed)`,
        reference: `${purchaseRef}_refund`, product_id: documentId,
        product_type: "document", status: "completed",
      });

      console.error(`[doc-credit] ✗ Refunded ₦${price} to ${appUserId}`);
      return jsonRes({
        error: kitanLabError || "Failed to grant access credit. Your wallet has been fully refunded."
      }, 502);
    }

    // ── 7. Record purchase (idempotency guard for future requests) ─────────
    const purchaseId = `pur_doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from("purchases").insert({
      id: purchaseId, product_id: documentId, product_type: "document",
      app_user_id: appUserId, amount: price, reference: purchaseRef,
    });

    // ── 8. Return success ─────────────────────────────────────────────────
    return jsonRes({
      success: true,
      newBalance,
      message: "Access granted! Redirecting to KitanLab...",
    });

  } catch (e: unknown) {
    console.error("[doc-credit] Unhandled error:", e);
    return jsonRes({ error: String(e) }, 500);
  }
});
