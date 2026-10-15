# KitanSocialHub — Performance & Media Architecture

This update makes the marketplace fast and resilient without changing any
visual design, routes, pricing, payment, wallet, order or admin behavior.

## What was wrong

1. **Base64 images stored in the database.** The admin `ImageUploader` used
   `FileReader.readAsDataURL()` and saved `data:image/...;base64` strings
   directly into `products.images`, `kitan_documents.preview_images`,
   `working_pictures.images` and `formats.preview_images`. Rows became
   megabytes of text, list queries crawled, and thumbnails were full-size.
2. **No network timeouts.** Detail pages awaited raw Supabase queries — a hung
   request left the page spinning forever.
3. **Errors were swallowed as "empty".** `db.ts` returned `[]` on failure, so
   stores replaced cached data with an empty list and pages said
   "No products found" during outages.
4. **Raw `<img>` everywhere.** No fallback, no layout reservation, and the cart
   loaded full-resolution gallery images.

## The new image architecture

```
Admin uploads file
  → validateMediaFile()            (type + size checks)
  → processImage()                 (resize ≤1600px full / ≤560px thumb, WebP)
  → supabase.storage.upload()      (products/ documents/ working-pictures/ formats/)
  → database stores ONLY the public Storage URL
```

- **New files**
  - `src/lib/imageProcessing.ts` — browser-side resize/compress/WebP pipeline
    (thumbnails ~560px, full ~1600px, never upscales, preserves transparency,
    passes through GIF/SVG/video untouched).
  - `src/lib/storage.ts` — bucket map, immutable cache-friendly paths
    (`{bucket}/{recordId}/image-N_<hash>_<nonce>.webp`), public URL helper.
  - `src/components/features/OptimizedImage.tsx` — resilient image: reserved
    layout box, shimmer while loading, icon fallback on error, eager/lazy
    modes; a broken image can never be an infinite spinner.
  - `src/components/features/CollectionState.tsx` — `ErrorState` (retry) and
    `StaleDataBanner` (cached data + manual refresh).
  - `src/components/features/MediaMigrationPanel.tsx` + `src/lib/migration.ts`
    — one-time Base64 → Storage migration (see below).
- **`db.ts`** — every query wrapped in `withTimeout()` (9s). List queries now
  **throw** on failure so stores can keep cached data and offer retry; admin
  getters keep their old resilient behavior. Lightweight list column selects
  are preserved.
- **Stores** (`useStore.ts`) — added `error` (first load failed) and
  `refreshFailed` (background revalidation failed while cached data shows)
  flags plus a `force` retry. Stale-while-revalidate behavior unchanged.
- **Pages** — every customer-facing catalog, detail page, cart surface and
  website page now uses `OptimizedImage` (thumbnail-first) and terminal
  loading states: skeleton → content, or error → Retry. Homepage/Gift catalog
  render the first 4 cards eagerly; everything else lazy-loads.

## Migrating existing Base64 images (one-time)

Admin Dashboard → **Media Migr** tab:

1. Run `supabase/storage-setup.sql` (once) to create the buckets + policies.
2. Open the tab and press **Scan database** — shows what still needs migrating.
3. Press **Run migration**. For each record it decodes the Base64 images,
   re-encodes them through the same optimizer, uploads to
   `{bucket}/{recordId}/`, and rewrites the row with Storage URLs — order and
   metadata preserved, thumbnail rebuilt from the first image.
4. Safety: writes happen **only after** every upload for that record
   succeeded; completed records are checkpointed in `localStorage` (resumable,
   skipped on re-run); failed records keep their original data and are listed
   individually. Re-run any time.
5. Migration runs in the admin's browser with the anon key — the same write
   model as every admin upload. No service-role key, no public endpoint.

## Required one-time setup

- Run `supabase/storage-setup.sql` in the Supabase SQL editor (buckets +
  policies). Without it, the first admin upload will fail with a bucket
  error — the SQL is idempotent and safe to re-run.

## Environment variables

Only the existing two (frontend-safe):

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

`.env` is gitignored and must never be committed. No service-role credentials
exist in this codebase.
