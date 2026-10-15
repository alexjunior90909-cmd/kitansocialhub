/**
 * storage.ts — Supabase Storage media pipeline.
 *
 * All product/document/working-picture/format media lives in Supabase
 * Storage buckets; the database stores ONLY the resulting public URLs.
 *
 * Layout (cache-friendly — a re-upload writes a NEW filename, never
 * overwrites, so URLs and CDN cache entries stay immutable):
 *
 *   products/{recordId}/image-1_{hash}.webp
 *   products/{recordId}/thumbnail_{hash}.webp
 *   documents/{recordId}/...
 *   working-pictures/{recordId}/...
 *   formats/{recordId}/...
 *   website-products/{recordId}/...
 *
 * Buckets are created once via supabase/storage-setup.sql (public read).
 * Writes use the existing anon-key + admin-gate model already used by the
 * `order-content` bucket — no service-role credentials are involved.
 */
import { supabase } from './supabase';
import { processImage, type ProcessedMedia } from './imageProcessing';

export const MEDIA_BUCKETS = {
  products: 'products',
  documents: 'documents',
  'working-pictures': 'working-pictures',
  formats: 'formats',
  'website-products': 'website-products',
} as const;

export type MediaBucket = keyof typeof MEDIA_BUCKETS;

/** True for data: URLs (legacy Base64 rows that still need migration). */
export function isDataUrl(url: string | null | undefined): boolean {
  return !!url && url.trim().startsWith('data:');
}

/** True when the value looks like a usable image URL (storage, external, etc.). */
export function isHttpUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  const t = url.trim();
  return t.startsWith('http://') || t.startsWith('https://') || t.startsWith('/');
}

/**
 * A safe image source for <img>: any http/storage URL, or null.
 * Legacy Base64 data URLs are allowed so pre-migration rows keep rendering.
 */
export function normalizeImageUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const t = url.trim();
  if (isHttpUrl(t) || isDataUrl(t)) return t;
  return null;
}

/** Short hash for cache-friendly filenames (uniqueness, not security-sensitive). */
function shortHash(input: string): string {
  let h = 5381;
  for (let i = 0; i < input.length; i++) h = ((h << 5) + h + input.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/** Per-attempt nonce so a retried upload can never collide with an existing object. */
function nonce(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export interface UploadOptions {
  bucket: MediaBucket;
  /** Record id used as folder (existing id, or a stable draft-… key for new records). */
  folder: string;
  /** Slot name inside the folder, e.g. "image-1", "image-2", "thumbnail". */
  slot: string;
  cacheControl?: string;
}

/**
 * Upload an optimized media pair and return their public URLs.
 * Videos/GIFs/SVGs pass through with their original extension.
 */
export async function uploadProcessedMedia(
  media: ProcessedMedia,
  { bucket, folder, slot, cacheControl = '31536000' }: UploadOptions,
): Promise<{ fullUrl: string; thumbUrl: string | null }> {
  const b = MEDIA_BUCKETS[bucket];
  const ext = media.ext.replace(/[^a-z0-9]/gi, '') || 'bin';
  const fullPath = `${folder}/${slot}_${shortHash(`${folder}/${slot}/${media.full.size}/${media.full.type}`)}_${nonce()}.${ext}`;

  const { error } = await supabase.storage
    .from(b)
    .upload(fullPath, media.full, { contentType: media.mime, cacheControl, upsert: false });
  if (error) throw new Error(`Storage upload failed: ${error.message}`);

  const { data: fullPub } = supabase.storage.from(b).getPublicUrl(fullPath);

  let thumbUrl: string | null = null;
  if (media.thumb && media.thumb !== media.full) {
    try {
      const thumbPath = `${folder}/thumbnail_${shortHash(`${folder}/${slot}-thumb/${media.thumb.size}`)}_${nonce()}.webp`;
      const { error: tErr } = await supabase.storage
        .from(b)
        .upload(thumbPath, media.thumb, { contentType: media.thumb.type, cacheControl, upsert: false });
      if (!tErr) {
        const { data: thumbPub } = supabase.storage.from(b).getPublicUrl(thumbPath);
        thumbUrl = thumbPub.publicUrl;
      }
    } catch {
      // Thumbnail is an optimization — the full image URL still works.
    }
  }
  return { fullUrl: fullPub.publicUrl, thumbUrl };
}

/** Convenience wrapper: optimize + upload in one call. */
export async function optimizeAndUpload(
  file: File,
  opts: UploadOptions,
): Promise<{ fullUrl: string; thumbUrl: string | null }> {
  const media = await processImage(file);
  return uploadProcessedMedia(media, opts);
}
