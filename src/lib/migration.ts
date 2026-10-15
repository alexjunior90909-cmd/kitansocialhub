/**
 * migration.ts — One-time Base64 → Supabase Storage media migration.
 *
 * Runs entirely in the admin's browser using the anon key (the same write
 * model every admin upload already uses). No service-role credentials are
 * involved and no public unauthenticated endpoint is created.
 *
 * Safety properties:
 * - Finds records whose image columns contain data: URLs (Base64).
 * - Re-encodes each image through the standard optimizer (resize + WebP +
 *   thumbnail) and uploads to {bucket}/{recordId}/image-N_*.webp.
 * - Writes the record back ONLY after every upload for that record succeeded,
 *   preserving image order and all other columns.
 * - Resumable: completed records are checkpointed in localStorage; a failed
 *   record is reported individually and can be retried by running again.
 * - Existing non-Base64 values (storage URLs, external URLs) are untouched.
 */
import { supabase } from './supabase';
import { isDataUrl, uploadProcessedMedia, type MediaBucket } from './storage';
import { processImage, dataUrlToFile } from './imageProcessing';

interface TableConfig {
  table: string;
  bucket: MediaBucket;
  arrayColumn: 'images' | 'preview_images';
  label: string;
}

const TABLES: TableConfig[] = [
  { table: 'products',         bucket: 'products',         arrayColumn: 'images',         label: 'Gift products' },
  { table: 'kitan_documents',  bucket: 'documents',        arrayColumn: 'preview_images', label: 'Documents' },
  { table: 'working_pictures', bucket: 'working-pictures', arrayColumn: 'images',         label: 'Working pictures' },
  { table: 'formats',          bucket: 'formats',          arrayColumn: 'preview_images', label: 'Formats' },
];

const PROGRESS_KEY = 'kitan_media_migration_v1';

interface Checkpoint {
  /** `${table}:${recordId}:${index}` entries whose DB row was successfully rewritten. */
  done: string[];
}

function loadCheckpoint(): Checkpoint {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw) as Checkpoint;
  } catch { /* corrupted checkpoint → start fresh */ }
  return { done: [] };
}

function saveCheckpoint(cp: Checkpoint): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(cp));
  } catch (e) {
    console.error('migration checkpoint save failed:', e);
  }
}

export function resetMigrationCheckpoint(): void {
  localStorage.removeItem(PROGRESS_KEY);
}

export interface TableScan {
  label: string;
  table: string;
  /** Records that still contain Base64 images. */
  pendingRecords: number;
  /** Total Base64 images across those records. */
  pendingImages: number;
}

/**
 * Read a table's id/thumbnail/arrayColumn in PAGES. Supabase enforces an ~8s
 * statement timeout on REST reads; Base64-heavy tables exceed it in one shot,
 * so full-table reads must be chunked.
 */
async function readRowsPaged(
  table: string,
  arrayColumn: string,
  onPage: (rows: Array<Record<string, unknown>>) => Promise<void>,
): Promise<{ ok: boolean; total: number; error?: string }> {
  const PAGE = 10;
  const cols = `id, thumbnail, ${arrayColumn}`;
  const { count, error: countErr } = await supabase.from(table).select('id', { count: 'exact', head: true });
  if (countErr) return { ok: false, total: 0, error: countErr.message };
  const total = count ?? 0;
  for (let offset = 0; offset < total; offset += PAGE) {
    const { data, error } = await supabase.from(table).select(cols).order('created_at', { ascending: true }).range(offset, offset + PAGE - 1);
    if (error) return { ok: false, total, error: error.message };
    if (!data || data.length === 0) break;
    await onPage(data as unknown as Array<Record<string, unknown>>);
  }
  return { ok: true, total };
}

/** Lightweight scan — counts what still needs migration without changing anything. */
export async function scanBase64Usage(): Promise<TableScan[]> {
  const scans: TableScan[] = [];
  for (const t of TABLES) {
    let pendingRecords = 0;
    let pendingImages = 0;
    const res = await readRowsPaged(t.table, t.arrayColumn, async rows => {
      for (const row of rows) {
        const urls = (row[t.arrayColumn] as string[] | null) || [];
        const count = urls.filter(isDataUrl).length;
        if (count > 0) { pendingRecords++; pendingImages += count; }
      }
    });
    if (!res.ok) {
      console.error(`migration scan ${t.table}:`, res.error);
      // -1 signals a READ FAILURE to the UI (never silently "nothing to migrate")
      scans.push({ label: t.label, table: t.table, pendingRecords: -1, pendingImages: -1 });
      continue;
    }
    scans.push({ label: t.label, table: t.table, pendingRecords, pendingImages });
  }
  return scans;
}

export interface MigrationStats {
  migratedImages: number;
  updatedRecords: number;
  failedRecords: number;
  cleanRecords: number;
}

export interface MigrationUpdate {
  running: boolean;
  /** e.g. "Gift products (12/40)" */
  currentLabel: string;
  stats: MigrationStats;
  errors: string[];
}

/**
 * Runs the full migration sequentially. `onUpdate` receives progress after
 * every record; resolve when all tables are processed (or failed).
 */
export async function runMigration(onUpdate: (u: MigrationUpdate) => void): Promise<MigrationStats> {
  const cp = loadCheckpoint();
  const stats: MigrationStats = { migratedImages: 0, updatedRecords: 0, failedRecords: 0, cleanRecords: 0 };
  const errors: string[] = [];

  const emit = (running: boolean, currentLabel: string): void => {
    onUpdate({ running, currentLabel, stats: { ...stats }, errors: [...errors] });
  };

  emit(true, 'Starting…');

  for (const t of TABLES) {
    let idx = 0;
    let readError: string | null = null;
    const res = await readRowsPaged(t.table, t.arrayColumn, async rows => {
      if (readError) return;
      for (const row of rows) {
        idx++;
        emit(true, `${t.label} (${idx})`);
        const urls = (row[t.arrayColumn] as string[] | null) || [];
        const pendingIdx = urls
          .map((u, i) => ({ u, i }))
          .filter(({ u, i }) => isDataUrl(u) && !cp.done.includes(`${t.table}:${row.id}:${i}`));

        if (pendingIdx.length === 0) {
          // Either already migrated (checkpointed) or no Base64 images at all.
          if (!urls.some(isDataUrl)) stats.cleanRecords++;
          continue;
        }

        try {
          const newUrls = [...urls];
          let firstThumb: string | null = null;

          for (const { u, i } of pendingIdx) {
            const file = await dataUrlToFile(u, `${row.id}-image-${i + 1}`);
            const media = await processImage(file);
            const { fullUrl, thumbUrl } = await uploadProcessedMedia(media, {
              bucket: t.bucket,
              folder: String(row.id),
              slot: `image-${i + 1}`,
            });
            newUrls[i] = fullUrl;
            if (i === 0) firstThumb = thumbUrl || fullUrl;
            stats.migratedImages++;
          }

          // Only reach here if every upload succeeded → safe to rewrite the row.
          const thumbnail = row.thumbnail as string | null | undefined;
          const payload: Record<string, unknown> = { [t.arrayColumn]: newUrls };
          if (isDataUrl(thumbnail) || !thumbnail) payload.thumbnail = firstThumb ?? newUrls[0] ?? thumbnail ?? null;

          const { error: upErr } = await supabase.from(t.table).update(payload).eq('id', String(row.id));
          if (upErr) throw new Error(upErr.message);

          for (const { i } of pendingIdx) cp.done.push(`${t.table}:${row.id}:${i}`);
          saveCheckpoint(cp);
          stats.updatedRecords++;
        } catch (e) {
          // Record left untouched — original Base64 values remain in the DB.
          const msg = e instanceof Error ? e.message : String(e);
          errors.push(`${t.label} "${String(row.id)}": ${msg}`);
          stats.failedRecords++;
        }
      }
    });
    if (!res.ok) {
      readError = res.error ?? 'unknown error';
      errors.push(`${t.label}: could not read table (${readError}) — processed ${idx} row(s) before the failure`);
      emit(true, t.label);
    }
  }

  emit(false, 'Finished');
  return stats;
}
