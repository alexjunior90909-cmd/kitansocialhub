-- ============================================================================
-- KitanSocialHub — Supabase Storage setup for product media
-- Run ONCE in the Supabase SQL editor (Dashboard → SQL Editor → New query).
--
-- Creates one public-read bucket per media collection. Admin uploads go
-- through the browser with the anon key — the exact same write model the
-- existing `order-content` bucket already uses (no service-role key is ever
-- embedded in the frontend). Database rows store ONLY public URLs.
--
-- File layout used by the app:
--   products/{recordId}/image-N_<hash>_<nonce>.webp
--   products/{recordId}/thumbnail_<hash>_<nonce>.webp
--   documents/{recordId}/…            working-pictures/{recordId}/…
--   formats/{recordId}/…              website-products/{recordId}/…
-- Filenames are never overwritten (nonce suffix), so URLs are immutable and
-- CDN-cache-friendly (uploads set Cache-Control: 31536000).
-- ============================================================================

-- 1) Create the buckets (public read)
insert into storage.buckets (id, name, public)
values
  ('products',          'products',          true),
  ('documents',         'documents',         true),
  ('working-pictures',  'working-pictures',  true),
  ('formats',           'formats',           true),
  ('website-products',  'website-products',  true)
on conflict (id) do update set public = true;

-- 2) Public read for all app users (customer-facing galleries/cards)
create policy "kitan media public read"
on storage.objects for select
using (bucket_id in ('products','documents','working-pictures','formats','website-products'));

-- 3) Write access — matches the app's existing security model (anon key +
--    client-side admin gate, identical to the `order-content` bucket).
create policy "kitan media insert"
on storage.objects for insert to anon
with check (bucket_id in ('products','documents','working-pictures','formats','website-products'));

create policy "kitan media update"
on storage.objects for update to anon
using (bucket_id in ('products','documents','working-pictures','formats','website-products'));

create policy "kitan media delete"
on storage.objects for delete to anon
using (bucket_id in ('products','documents','working-pictures','formats','website-products'));

-- ----------------------------------------------------------------------------
-- OPTIONAL hardening (recommended once the app migrates to Supabase Auth):
-- replace policies in section 3 with an auth.uid()-based check, e.g.
--
-- create policy "kitan media authenticated insert"
-- on storage.objects for insert to authenticated
-- with check (bucket_id in ('products','documents','working-pictures',
--                            'formats','website-products'));
--
-- and drop the anon write policies:
-- drop policy "kitan media insert"  on storage.objects;
-- drop policy "kitan media update"  on storage.objects;
-- drop policy "kitan media delete"  on storage.objects;
-- ----------------------------------------------------------------------------
