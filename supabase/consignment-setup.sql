-- ============================================================================
-- KitanSocialHub — Consignment Video extension setup
-- Run ONCE in the Supabase SQL Editor (project bjbnmanpkmgsrvuoxlgl).
-- Idempotent: safe to re-run.
--
-- Creates:
--   1. Table  consignment_requests (+ indexes, permissive RLS like the rest
--      of the app, which runs on the publishable/anon key)
--   2. RPC    pay_consignment(...) — server-side, atomic, idempotent:
--        • reads the price from app_settings (never trusts the client)
--        • locks + validates the wallet balance
--        • debits atomically (balance >= price guard)
--        • records wallet_transactions row  (existing wallet infrastructure)
--        • records payments row             (existing Payment History page)
--        • inserts the consignment_requests row
--        • duplicate calls with the same reference return the original
--          request without charging twice
--   3. Storage policies extended with the `consignment` bucket (created via
--      the Storage API — receiver images, optimized, never Base64 in DB).
-- ============================================================================

-- ── 1. Table ────────────────────────────────────────────────────────────────
create table if not exists public.consignment_requests (
  id                 text primary key,
  app_user_id        text not null,
  user_name          text,
  user_email         text,
  receiver_name      text not null default '',
  receiver_address   text not null default '',
  sender_name        text not null default '',
  amount             text not null default '',
  assets             jsonb not null default '[]'::jsonb,
  note               text,
  receiver_image_url text,
  payment_amount     numeric not null default 0,
  payment_reference  text not null,
  payment_status     text not null default 'paid',
  processing_status  text not null default 'pending',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists consignment_requests_app_user_id_idx   on public.consignment_requests (app_user_id);
create index if not exists consignment_requests_created_at_idx    on public.consignment_requests (created_at desc);
create index if not exists consignment_requests_processing_idx    on public.consignment_requests (processing_status);
create unique index if not exists consignment_requests_reference_uk on public.consignment_requests (payment_reference);

alter table public.consignment_requests enable row level security;
drop policy if exists "kitan anon all consignment" on public.consignment_requests;
create policy "kitan anon all consignment" on public.consignment_requests
  for all to anon, authenticated using (true) with check (true);

-- ── 2. Atomic payment + submission RPC ─────────────────────────────────────
create or replace function public.pay_consignment(
  p_app_user_id        text,
  p_user_name          text,
  p_user_email         text,
  p_reference          text,
  p_receiver_name      text,
  p_receiver_address   text,
  p_sender_name        text,
  p_amount             text,
  p_note               text,
  p_receiver_image_url text,
  p_assets             jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_price      numeric;
  v_balance    numeric;
  v_new_balance numeric;
  v_request_id text;
  v_tx_id      text;
  v_pay_id     text;
begin
  -- Idempotency: the same reference never charges twice
  select id into v_request_id from consignment_requests where payment_reference = p_reference limit 1;
  if v_request_id is not null then
    return jsonb_build_object('request_id', v_request_id, 'idempotent', true);
  end if;

  -- Required-field validation (server side)
  if coalesce(trim(p_receiver_name), '') = '' or coalesce(trim(p_receiver_address), '') = ''
     or coalesce(trim(p_sender_name), '') = '' or coalesce(trim(p_amount), '') = ''
     or p_app_user_id is null or p_reference is null then
    return jsonb_build_object('error', 'VALIDATION', 'message', 'Missing required fields.');
  end if;

  -- Authoritative price from the database
  select (value)::numeric into v_price from app_settings where key = 'consignment_price';
  if v_price is null or v_price <= 0 then
    return jsonb_build_object('error', 'PRICE_NOT_SET', 'message', 'Consignment pricing is not configured yet. Please contact support.');
  end if;

  -- Wallet: create on first use (matches existing getOrCreate behaviour)
  insert into wallets (id, app_user_id, balance)
  values ('wal_csg_' || floor(random() * 1000000000)::text || '_' || substr(md5(random()::text), 1, 5), p_app_user_id, 0)
  on conflict (app_user_id) do nothing;

  select balance into v_balance from wallets where app_user_id = p_app_user_id for update;

  if v_balance < v_price then
    return jsonb_build_object('error', 'INSUFFICIENT_BALANCE', 'required', v_price, 'balance', v_balance);
  end if;

  -- Atomic debit (guarded — no double-spend even under races)
  update wallets
     set balance = balance - v_price, updated_at = now()
   where app_user_id = p_app_user_id and balance >= v_price
  returning balance into v_new_balance;

  if v_new_balance is null then
    return jsonb_build_object('error', 'INSUFFICIENT_BALANCE', 'required', v_price, 'balance', v_balance);
  end if;

  v_request_id := 'csg_' || (floor(extract(epoch from clock_timestamp()) * 1000))::text || '_' || substr(md5(random()::text), 1, 5);
  v_tx_id      := 'wt_csg_' || (floor(extract(epoch from clock_timestamp()) * 1000))::text || '_' || substr(md5(random()::text), 1, 5);
  v_pay_id     := 'pay_csg_' || (floor(extract(epoch from clock_timestamp()) * 1000))::text || '_' || substr(md5(random()::text), 1, 5);

  -- Wallet ledger entry (existing wallet infrastructure)
  insert into wallet_transactions (id, app_user_id, type, amount, balance_after,
    description, reference, product_id, product_type, status)
  values (v_tx_id, p_app_user_id, 'deduction', v_price, v_new_balance,
    'Consignment Video — ' || v_request_id, p_reference, v_request_id, 'consignment_video', 'completed');

  -- Payment History entry (existing payments infrastructure)
  insert into payments (id, tx_ref, product_id, product_type, app_user_id,
    amount_ngn, amount_usd, currency, customer_email, customer_name,
    payment_status, verification_status, metadata)
  values (v_pay_id, p_reference, v_request_id, 'consignment', p_app_user_id,
    v_price, 0, 'NGN', p_user_email, p_user_name,
    'successful', 'verified',
    jsonb_build_object('method', 'wallet', 'request_id', v_request_id));

  -- The submission itself
  insert into consignment_requests (id, app_user_id, user_name, user_email,
    receiver_name, receiver_address, sender_name, amount, assets, note,
    receiver_image_url, payment_amount, payment_reference,
    payment_status, processing_status, created_at, updated_at)
  values (v_request_id, p_app_user_id, p_user_name, p_user_email,
    p_receiver_name, p_receiver_address, p_sender_name, p_amount,
    coalesce(p_assets, '[]'::jsonb), nullif(trim(coalesce(p_note, '')), ''),
    p_receiver_image_url, v_price, p_reference,
    'paid', 'pending', now(), now());

  return jsonb_build_object('request_id', v_request_id, 'price', v_price, 'new_balance', v_new_balance);
end;
$$;

grant execute on function public.pay_consignment to anon, authenticated;

-- ── 3. Storage: allow the consignment bucket (public read + anon write) ────
insert into storage.buckets (id, name, public)
values ('consignment', 'consignment', true)
on conflict (id) do update set public = true;

drop policy if exists "kitan media public read" on storage.objects;
create policy "kitan media public read" on storage.objects
  for select
  using (bucket_id in ('order-content','products','documents','working-pictures','formats','website-products','consignment'));

drop policy if exists "kitan media anon insert" on storage.objects;
create policy "kitan media anon insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id in ('order-content','products','documents','working-pictures','formats','website-products','consignment'));

drop policy if exists "kitan media anon update" on storage.objects;
create policy "kitan media anon update" on storage.objects
  for update to anon, authenticated
  using (bucket_id in ('order-content','products','documents','working-pictures','formats','website-products','consignment'));

drop policy if exists "kitan media anon delete" on storage.objects;
create policy "kitan media anon delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id in ('order-content','products','documents','working-pictures','formats','website-products','consignment'));
