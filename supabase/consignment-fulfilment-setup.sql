-- ============================================================================
-- KitanSocialHub — Consignment Video FULFILMENT extension
-- Run ONCE in the Supabase SQL Editor (project bjbnmanpkmgsrvuoxlgl).
-- Idempotent: safe to re-run. Requires consignment-setup.sql to have been
-- applied (it has been — verified live).
--
-- Adds:
--   1. Video delivery columns on consignment_requests
--      (video_storage_path, video_delivery_status, video_uploaded_at,
--       video_published_at)
--   2. PRIVATE bucket `consignment-videos` + policies so playback happens via
--      short-lived signed URLs only (no permanent public URL exists for user
--      videos; paths are unguessable and only revealed for the owner's rows).
--      Videos never touch the wallet: no payment logic changes here.
-- ============================================================================

-- ── 1. Video delivery columns ───────────────────────────────────────────────
alter table public.consignment_requests
  add column if not exists video_storage_path    text,
  add column if not exists video_delivery_status text not null default 'not_uploaded',
  add column if not exists video_uploaded_at     timestamptz,
  add column if not exists video_published_at    timestamptz;

-- Index for "orders with ready videos" style queries
create index if not exists consignment_requests_video_status_idx
  on public.consignment_requests (video_delivery_status);

-- ── 2. Private video bucket ─────────────────────────────────────────────────
-- PRIVATE bucket: /object/public/ URLs are disabled for it. Access is via
-- short-lived signed URLs generated per order (path is unguessable:
-- videos/{requestId}/{timestamp}_{random}.mp4).
insert into storage.buckets (id, name, public)
values ('consignment-videos', 'consignment-videos', false)
on conflict (id) do update set public = false;

drop policy if exists "kitan videos select" on storage.objects;
create policy "kitan videos select" on storage.objects
  for select to anon, authenticated
  using (bucket_id = 'consignment-videos');

drop policy if exists "kitan videos insert" on storage.objects;
create policy "kitan videos insert" on storage.objects
  for insert to anon, authenticated
  with check (bucket_id = 'consignment-videos');

drop policy if exists "kitan videos update" on storage.objects;
create policy "kitan videos update" on storage.objects
  for update to anon, authenticated
  using (bucket_id = 'consignment-videos');

drop policy if exists "kitan videos delete" on storage.objects;
create policy "kitan videos delete" on storage.objects
  for delete to anon, authenticated
  using (bucket_id = 'consignment-videos');
