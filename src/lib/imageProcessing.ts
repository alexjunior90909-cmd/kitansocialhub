/**
 * imageProcessing.ts — Browser-side image optimization pipeline.
 *
 * Every admin upload is validated, resized and re-encoded here BEFORE it
 * touches Supabase Storage, so the database only ever stores lightweight
 * Storage URLs (never Base64) and the CDN serves small files.
 *
 * - Thumbnails:  ~560px longest side  (list/grid views)
 * - Full images: ~1600px longest side (detail pages)
 * - Preferred format: WebP (with alpha support); falls back to PNG/JPEG
 *   only when the browser cannot encode WebP.
 * - Small images are never upscaled; animated GIFs and SVGs are passed
 *   through untouched (canvas would destroy animation / vector data).
 */

export interface ProcessedMedia {
  /** Optimized full-size image blob (or original file for passthrough types). */
  full: Blob;
  /** Small optimized thumbnail blob. */
  thumb: Blob;
  /** File extension for the FULL image (thumb is always webp for photos). */
  ext: string;
  /** Mime type of `full`. */
  mime: string;
  /** True when the source was passed through without re-encoding. */
  passthrough: boolean;
}

/** Max accepted source size for images (25MB — oversized sources are rejected, not silently downscaled from 100MB). */
export const MAX_IMAGE_BYTES = 25 * 1024 * 1024;
/** Max accepted size for video files (matches the existing order-content limit). */
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;

const THUMB_LONGEST_SIDE = 560;   // within the 400–600px target
const FULL_LONGEST_SIDE = 1600;   // within the 1200–1800px target
const FULL_QUALITY = 0.82;
const THUMB_QUALITY = 0.8;

const RASTER_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/bmp']);
const PASSTHROUGH_TYPES = new Set(['image/gif', 'image/svg+xml']);
const VIDEO_PREFIX = 'video/';

export function isImageFile(file: File): boolean {
  return RASTER_TYPES.has(file.type) || PASSTHROUGH_TYPES.has(file.type);
}

export function isVideoFile(file: File): boolean {
  return file.type.startsWith(VIDEO_PREFIX);
}

/** Human-readable validation. Returns an error message, or null when the file is acceptable. */
export function validateMediaFile(file: File): string | null {
  if (isVideoFile(file)) {
    if (file.size > MAX_VIDEO_BYTES) return `${file.name} is larger than 50MB — please compress the video first`;
    return null;
  }
  if (!isImageFile(file)) return `${file.name} is not a supported image format`;
  if (file.size > MAX_IMAGE_BYTES) return `${file.name} is larger than 25MB`;
  if (file.size === 0) return `${file.name} is empty`;
  return null;
}

interface DecodeResult {
  bitmap: ImageBitmap | HTMLImageElement;
  width: number;
  height: number;
}

async function decodeImage(file: Blob): Promise<DecodeResult> {
  // createImageBitmap is available in all modern browsers and off the main thread.
  if ('createImageBitmap' in window) {
    try {
      const bitmap = await createImageBitmap(file);
      return { bitmap, width: bitmap.width, height: bitmap.height };
    } catch { /* fall through to <img> decoding */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Could not decode image'));
      img.src = url;
    });
    return { bitmap: img, width: img.naturalWidth, height: img.naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function drawScaled(source: DecodeResult, longestSide: number): HTMLCanvasElement {
  const scale = Math.min(1, longestSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale));
  const h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source.bitmap as CanvasImageSource, 0, 0, w, h);
  return canvas;
}

/** True when the (small) canvas has any transparent pixel — used to pick a safe fallback format. */
function canvasHasAlpha(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  // Sample a grid — a full scan is unnecessary for format selection.
  const step = Math.max(1, Math.floor(Math.sqrt((width * height) / 4096)));
  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      if (data[(y * width + x) * 4 + 3] < 250) return true;
    }
  }
  return false;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error(`Failed to encode ${mime}`))),
      mime,
      quality,
    );
  });
}

async function encodeWebpOrFallback(canvas: HTMLCanvasElement, quality: number): Promise<{ blob: Blob; ext: string; mime: string }> {
  // Preferred path: WebP (quality + alpha support).
  try {
    const blob = await canvasToBlob(canvas, 'image/webp', quality);
    if (blob.type === 'image/webp') return { blob, ext: 'webp', mime: 'image/webp' };
  } catch { /* browser may not encode WebP */ }
  // Fallback: preserve alpha with PNG, otherwise use JPEG.
  if (canvasHasAlpha(canvas)) {
    return { blob: await canvasToBlob(canvas, 'image/png', 1), ext: 'png', mime: 'image/png' };
  }
  return { blob: await canvasToBlob(canvas, 'image/jpeg', quality), ext: 'jpg', mime: 'image/jpeg' };
}

/**
 * Optimize an uploaded image into a { full, thumb } pair of Blobs ready for
 * Storage upload. Throws for unsupported/oversized files — callers should
 * run validateMediaFile() first for a friendly message.
 */
export async function processImage(file: File): Promise<ProcessedMedia> {
  const validation = validateMediaFile(file);
  if (validation) throw new Error(validation);

  // Videos and animation/vector formats: upload as-is (canvas would destroy them).
  if (isVideoFile(file) || PASSTHROUGH_TYPES.has(file.type)) {
    const ext = file.name.split('.').pop()?.toLowerCase() || (isVideoFile(file) ? 'mp4' : 'bin');
    return { full: file, thumb: file, ext, mime: file.type || 'application/octet-stream', passthrough: true };
  }

  const source = await decodeImage(file);

  // Tiny sources (≤ thumbnail size): keep one image, re-encode only.
  if (Math.max(source.width, source.height) <= THUMB_LONGEST_SIDE) {
    const canvas = drawScaled(source, THUMB_LONGEST_SIDE);
    const { blob, ext, mime } = await encodeWebpOrFallback(canvas, FULL_QUALITY);
    return { full: blob, thumb: blob, ext, mime, passthrough: false };
  }

  const [fullCanvas, thumbCanvas] = [drawScaled(source, FULL_LONGEST_SIDE), drawScaled(source, THUMB_LONGEST_SIDE)];
  const full = await encodeWebpOrFallback(fullCanvas, FULL_QUALITY);
  let thumb: { blob: Blob; ext: string; mime: string };
  try {
    thumb = await encodeWebpOrFallback(thumbCanvas, THUMB_QUALITY);
  } catch {
    // Thumbnail is an optimization — never fail the upload because of it.
    thumb = full;
  }
  return { full: full.blob, thumb: thumb.blob, ext: full.ext, mime: full.mime, passthrough: false };
}

/** Decode an existing Base64 data URL back into a File so the same pipeline can re-encode it. */
export async function dataUrlToFile(dataUrl: string, name: string): Promise<File> {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  const extMatch = /^data:image\/([a-z0-9.+-]+);/i.exec(dataUrl);
  const ext = extMatch ? extMatch[1].replace('jpeg', 'jpg').replace('svg+xml', 'svg') : 'jpg';
  return new File([blob], name.endsWith(`.${ext}`) ? name : `${name}.${ext}`, { type: blob.type || 'image/jpeg' });
}
