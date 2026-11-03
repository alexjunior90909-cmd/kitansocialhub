/**
 * consignment.ts — Consignment Video service data layer.
 *
 * Settings (price + sample video URL) live in the existing `app_settings`
 * table and are cached per session. Payments run through the server-side
 * `pay_consignment` RPC (atomic, idempotent, price read from the database).
 */
import { supabase } from './supabase';
import { withTimeout } from './db';
import { optimizeAndUpload } from './storage';
import { validateMediaFile } from './imageProcessing';

export const CONSIGNMENT_ASSETS = [
  'gold_bars',
  'rings',
  'necklaces',
  'iphone_carton',
  'car_key',
  'cybertruck_key',
  'tesla_key',
  'cash',
] as const;

export type ConsignmentAsset = typeof CONSIGNMENT_ASSETS[number];

export interface ConsignmentSettings {
  price: number | null;
  sampleVideoUrl: string | null;
}

export interface ConsignmentSubmission {
  id: string;
  appUserId: string;
  userName: string | null;
  userEmail: string | null;
  receiverName: string;
  receiverAddress: string;
  senderName: string;
  amount: string;
  assets: string[];
  note: string | null;
  receiverImageUrl: string | null;
  paymentAmount: number;
  paymentReference: string;
  paymentStatus: string;
  processingStatus: string;
  videoStoragePath: string | null;
  videoDeliveryStatus: string;
  videoUploadedAt: string | null;
  videoPublishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Video delivery ───────────────────────────────────────────────────────────
export const VIDEO_BUCKET = 'consignment-videos';
export const MAX_VIDEO_BYTES = 50 * 1024 * 1024; // matches the bucket's 50MB limit

/** User-facing processing status shown across order UIs. */
export function userOrderStatus(processingStatus: string): { label: string; step: 1 | 2 | 3 | 4; rejected: boolean } {
  switch (processingStatus) {
    case 'processing':   return { label: 'Processing',   step: 2, rejected: false };
    case 'video_ready':  return { label: 'Video Ready',  step: 3, rejected: false };
    case 'completed':    return { label: 'Completed',    step: 4, rejected: false };
    case 'rejected':     return { label: 'Rejected',     step: 1, rejected: true };
    default:             return { label: 'Order Received', step: 1, rejected: false }; // pending | paid
  }
}

/** True once a published video is attached to the order. */
export function hasPublishedVideo(s: ConsignmentSubmission): boolean {
  return s.videoDeliveryStatus === 'ready' && !!s.videoStoragePath;
}

/** Short-lived signed URL for a delivered video (private bucket — no public URL exists). */
export async function getVideoSignedUrl(storagePath: string): Promise<string> {
  const { data, error } = await supabase.storage.from(VIDEO_BUCKET).createSignedUrl(storagePath, 3600);
  if (error || !data?.signedUrl) throw new Error(error?.message || 'Could not load video');
  return data.signedUrl;
}

/**
 * Upload a finished consignment video with real progress reporting.
 * Raw XHR against the Storage API (same request supabase-js makes) so we get
 * upload progress events. Returns the stored path.
 */
export function uploadOrderVideo(
  file: File,
  requestId: string,
  onProgress: (pct: number) => void,
): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^video\//.test(file.type) && !/\.(mp4|webm|mov|m4v)$/i.test(file.name)) {
      reject(new Error('Please choose an MP4 or WebM video file'));
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      reject(new Error(`Video exceeds the ${Math.round(MAX_VIDEO_BYTES / 1024 / 1024)}MB upload limit`));
      return;
    }
    const ext = (file.name.split('.').pop() || 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4';
    const path = `videos/${requestId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const url = `${import.meta.env.VITE_SUPABASE_URL as string}/storage/v1/object/${VIDEO_BUCKET}/${path}`;
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('apikey', (import.meta.env.VITE_SUPABASE_ANON_KEY as string));
    xhr.setRequestHeader('Authorization', `Bearer ${(import.meta.env.VITE_SUPABASE_ANON_KEY as string)}`);
    xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.upload.onprogress = e => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
    xhr.onload = () => {
      if (xhr.status === 200 || xhr.status === 201) { resolve(path); }
      else { reject(new Error(`Upload failed (HTTP ${xhr.status})`)); }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(file);
  });
}

// ── Admin video lifecycle (never touches the wallet) ────────────────────────
export async function adminSaveVideoDraft(requestId: string, storagePath: string): Promise<void> {
  const { error } = await supabase.from('consignment_requests').update({
    video_storage_path: storagePath,
    video_delivery_status: 'uploaded',
    video_uploaded_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);
  if (error) throw new Error(error.message);
}

export async function adminPublishVideo(requestId: string): Promise<void> {
  const { error } = await supabase.from('consignment_requests').update({
    video_delivery_status: 'ready',
    video_published_at: new Date().toISOString(),
    processing_status: 'video_ready',
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);
  if (error) throw new Error(error.message);
}

export async function adminRemoveVideo(requestId: string): Promise<string | null> {
  const { data, error } = await supabase.from('consignment_requests')
    .select('video_storage_path').eq('id', requestId).single();
  if (error) throw new Error(error.message);
  const oldPath = data?.video_storage_path ?? null;
  const { error: upErr } = await supabase.from('consignment_requests').update({
    video_storage_path: null,
    video_delivery_status: 'not_uploaded',
    video_uploaded_at: null,
    video_published_at: null,
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);
  if (upErr) throw new Error(upErr.message);
  if (oldPath) { void supabase.storage.from(VIDEO_BUCKET).remove([oldPath]).catch(() => undefined); }
  return oldPath;
}

export async function adminMarkCompleted(requestId: string): Promise<void> {
  const { error } = await supabase.from('consignment_requests').update({
    processing_status: 'completed',
    updated_at: new Date().toISOString(),
  }).eq('id', requestId);
  if (error) throw new Error(error.message);
}

// ── User order queries (owner-scoped: every read filters by the caller's id) ─
export async function fetchMyOrders(
  appUserId: string,
  page = 1,
  pageSize = 10,
): Promise<{ rows: ConsignmentSubmission[]; total: number }> {
  const { data, error, count } = await withTimeout(
    supabase
      .from('consignment_requests')
      .select('*', { count: 'exact' })
      .eq('app_user_id', appUserId)
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1),
    'my consignment orders',
  );
  if (error) throw new Error(error.message);
  return { rows: (data || []).map(mapRow), total: count ?? 0 };
}

export async function fetchMyOrder(appUserId: string, requestId: string): Promise<ConsignmentSubmission | null> {
  const { data } = await withTimeout(
    supabase
      .from('consignment_requests')
      .select('*')
      .eq('id', requestId)
      .eq('app_user_id', appUserId) // owner scope — other users' orders return nothing
      .limit(1),
    'consignment order detail',
  );
  if (!data || data.length === 0) return null;
  return mapRow(data[0] as Record<string, unknown>);
}

// ── Settings (session-cached — avoids a DB hit on every visit) ───────────────
const SETTINGS_TTL_MS = 5 * 60 * 1000;
let settingsCache: { at: number; value: ConsignmentSettings } | null = null;

export async function getConsignmentSettings(force = false): Promise<ConsignmentSettings> {
  if (!force && settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) {
    return settingsCache.value;
  }
  const fallback: ConsignmentSettings = { price: null, sampleVideoUrl: null };
  try {
    const { data, error } = await withTimeout(
      supabase.from('app_settings').select('key,value').in('key', ['consignment_price', 'consignment_sample_video_url']),
      'consignment settings',
    );
    if (error) throw new Error(error.message);
    const map: Record<string, string> = {};
    (data || []).forEach((r: { key: string; value: string }) => { map[r.key] = r.value; });
    const value: ConsignmentSettings = {
      price: map.consignment_price ? Number(map.consignment_price) : null,
      sampleVideoUrl: map.consignment_sample_video_url || null,
    };
    settingsCache = { at: Date.now(), value };
    return value;
  } catch (e) {
    console.error('getConsignmentSettings:', e);
    return settingsCache?.value ?? fallback;
  }
}

export function invalidateConsignmentSettings(): void {
  settingsCache = null;
}

export async function setConsignmentPrice(price: number): Promise<void> {
  const { error } = await supabase.from('app_settings')
    .upsert({ key: 'consignment_price', value: String(price), updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  invalidateConsignmentSettings();
}

export async function setSampleVideoUrl(url: string | null): Promise<void> {
  const { error } = await supabase.from('app_settings')
    .upsert({ key: 'consignment_sample_video_url', value: url ?? '', updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
  invalidateConsignmentSettings();
}

// ── Receiver image (optimized, Supabase Storage — never Base64 in DB) ───────
export async function uploadReceiverImage(file: File, appUserId: string): Promise<string> {
  const invalid = validateMediaFile(file);
  if (invalid) throw new Error(invalid);
  const { fullUrl } = await optimizeAndUpload(file, { bucket: 'consignment', folder: appUserId, slot: 'receiver' });
  return fullUrl;
}

// ── Payment + submission (server-side atomic RPC) ───────────────────────────
export interface PayConsignmentParams {
  appUserId: string;
  userName: string;
  userEmail: string;
  reference: string;
  receiverName: string;
  receiverAddress: string;
  senderName: string;
  amount: string;
  note: string | null;
  receiverImageUrl: string | null;
  assets: string[];
}

export interface PayConsignmentResult {
  requestId?: string;
  price?: number;
  newBalance?: number;
  idempotent?: boolean;
  error?: 'VALIDATION' | 'PRICE_NOT_SET' | 'INSUFFICIENT_BALANCE' | 'RPC_UNAVAILABLE' | 'UNKNOWN';
  message?: string;
  required?: number;
  balance?: number;
}

export async function payConsignment(p: PayConsignmentParams): Promise<PayConsignmentResult> {
  try {
    const { data, error } = await withTimeout(
      supabase.rpc('pay_consignment', {
        p_app_user_id: p.appUserId,
        p_user_name: p.userName,
        p_user_email: p.userEmail,
        p_reference: p.reference,
        p_receiver_name: p.receiverName,
        p_receiver_address: p.receiverAddress,
        p_sender_name: p.senderName,
        p_amount: p.amount,
        p_note: p.note ?? '',
        p_receiver_image_url: p.receiverImageUrl ?? '',
        p_assets: p.assets,
      }),
      'consignment payment',
    );
    if (error) {
      // Function not yet applied (PGRST202) vs real failure
      if (/function.*does not exist|schema cache/i.test(error.message)) return { error: 'RPC_UNAVAILABLE', message: 'Consignment setup SQL has not been applied yet.' };
      return { error: 'UNKNOWN', message: error.message };
    }
    return (data ?? {}) as PayConsignmentResult;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: 'UNKNOWN', message: msg };
  }
}

// ── Own-submission lookup (used for the ?ref= status banner) ────────────────
export async function getOwnSubmission(appUserId: string, reference: string): Promise<ConsignmentSubmission | null> {
  try {
    const { data } = await withTimeout(
      supabase
        .from('consignment_requests')
        .select('*')
        .eq('app_user_id', appUserId)
        .eq('payment_reference', reference)
        .limit(1),
      'consignment lookup',
    );
    if (!data || data.length === 0) return null;
    return mapRow(data[0] as Record<string, unknown>);
  } catch {
    return null;
  }
}

// ── Admin (paginated, server-side search/filter) ────────────────────────────
export interface AdminQuery {
  page: number;
  pageSize: number;
  search?: string;
  processingStatus?: string;
  paymentStatus?: string;
}

function mapRow(r: Record<string, unknown>): ConsignmentSubmission {
  return {
    id: r.id as string,
    appUserId: r.app_user_id as string,
    userName: (r.user_name as string) ?? null,
    userEmail: (r.user_email as string) ?? null,
    receiverName: (r.receiver_name as string) ?? '',
    receiverAddress: (r.receiver_address as string) ?? '',
    senderName: (r.sender_name as string) ?? '',
    amount: (r.amount as string) ?? '',
    assets: (r.assets as string[]) || [],
    note: (r.note as string) ?? null,
    receiverImageUrl: (r.receiver_image_url as string) ?? null,
    paymentAmount: Number(r.payment_amount ?? 0),
    paymentReference: (r.payment_reference as string) ?? '',
    paymentStatus: (r.payment_status as string) ?? 'paid',
    processingStatus: (r.processing_status as string) ?? 'pending',
    videoStoragePath: (r.video_storage_path as string) ?? null,
    videoDeliveryStatus: (r.video_delivery_status as string) ?? 'not_uploaded',
    videoUploadedAt: (r.video_uploaded_at as string) ?? null,
    videoPublishedAt: (r.video_published_at as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  };
}

export async function adminFetchSubmissions(q: AdminQuery): Promise<{ rows: ConsignmentSubmission[]; total: number }> {
  let req = supabase.from('consignment_requests').select('*', { count: 'exact' });
  if (q.search) {
    const s = `%${q.search.replace(/[%,]/g, '')}%`;
    req = req.or(`id.ilike.${s},receiver_name.ilike.${s},user_name.ilike.${s},user_email.ilike.${s},payment_reference.ilike.${s}`);
  }
  if (q.processingStatus && q.processingStatus !== 'all') req = req.eq('processing_status', q.processingStatus);
  if (q.paymentStatus && q.paymentStatus !== 'all') req = req.eq('payment_status', q.paymentStatus);
  const { data, error, count } = await withTimeout(
    req.order('created_at', { ascending: false }).range((q.page - 1) * q.pageSize, q.page * q.pageSize - 1),
    'consignment admin list',
  );
  if (error) throw new Error(error.message);
  return { rows: (data || []).map(mapRow), total: count ?? 0 };
}

export async function adminUpdateSubmission(id: string, updates: Partial<ConsignmentSubmission>): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (updates.receiverName !== undefined) row.receiver_name = updates.receiverName;
  if (updates.receiverAddress !== undefined) row.receiver_address = updates.receiverAddress;
  if (updates.senderName !== undefined) row.sender_name = updates.senderName;
  if (updates.amount !== undefined) row.amount = updates.amount;
  if (updates.note !== undefined) row.note = updates.note;
  if (updates.processingStatus !== undefined) row.processing_status = updates.processingStatus;
  if (updates.paymentStatus !== undefined) row.payment_status = updates.paymentStatus;
  const { error } = await supabase.from('consignment_requests').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function adminDeleteSubmission(id: string): Promise<void> {
  const { error } = await supabase.from('consignment_requests').delete().eq('id', id);
  if (error) throw new Error(error.message);
}
