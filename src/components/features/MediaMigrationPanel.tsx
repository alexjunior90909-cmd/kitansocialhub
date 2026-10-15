/**
 * MediaMigrationPanel — Admin-only UI for the one-time Base64 → Storage
 * media migration. Shows what still needs migrating, live progress while
 * running, and per-record failures. Resumable across sessions.
 */
import React, { useState } from 'react';
import { Database, RefreshCw, AlertCircle, CheckCircle, Loader2, Trash2 } from 'lucide-react';
import { scanBase64Usage, runMigration, resetMigrationCheckpoint, type TableScan, type MigrationUpdate } from '@/lib/migration';
import { toast } from 'sonner';

const MediaMigrationPanel: React.FC = () => {
  const [scanning, setScanning] = useState(false);
  const [scans, setScans] = useState<TableScan[] | null>(null);
  const [progress, setProgress] = useState<MigrationUpdate | null>(null);
  const [done, setDone] = useState(false);

  const handleScan = async () => {
    setScanning(true);
    setDone(false);
    try {
      const result = await scanBase64Usage();
      setScans(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleRun = async () => {
    setDone(false);
    try {
      await runMigration(setProgress);
      setDone(true);
      toast.success('Migration run finished');
      // Refresh the scan so the panel reflects what remains.
      const result = await scanBase64Usage();
      setScans(result);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Migration failed');
    }
  };

  const handleResetCheckpoint = () => {
    resetMigrationCheckpoint();
    toast.success('Migration checkpoint cleared — completed records can be re-processed');
  };

  const running = progress?.running ?? false;
  const totalPending = (scans || []).reduce((s, t) => s + t.pendingImages, 0);
  const totalPendingRecords = (scans || []).reduce((s, t) => s + t.pendingRecords, 0);

  return (
    <div className="space-y-5 animate-fade-in max-w-3xl">
      <div>
        <h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2">
          <Database size={18} className="text-kitan-teal" /> Media Migration (Base64 → Storage)
        </h3>
        <p className="text-kitan-muted text-sm mt-1">
          One-time cleanup: moves old Base64 images embedded in the database into Supabase Storage,
          compresses them to WebP, and rewrites the records with lightweight URLs. Safe to re-run —
          completed records are checkpointed and skipped, and a failed record keeps its original data.
        </p>
      </div>

      <div className="flex flex-wrap gap-3">
        <button onClick={handleScan} disabled={scanning || running} className="btn-secondary text-sm flex items-center gap-2">
          {scanning ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
          {scanning ? 'Scanning…' : 'Scan database'}
        </button>
        <button onClick={handleRun} disabled={scanning || running || (totalPending === 0 && !!scans)} className="btn-primary text-sm flex items-center gap-2">
          {running ? <><Loader2 size={14} className="animate-spin" /> Migrating…</> : <>Run migration</>}
        </button>
        <button onClick={handleResetCheckpoint} disabled={running} className="btn-ghost text-xs flex items-center gap-1.5 text-kitan-subtle hover:text-red-400">
          <Trash2 size={12} /> Reset checkpoint
        </button>
      </div>

      {scans && (
        <div className="card-kitan divide-y divide-kitan-border overflow-hidden">
          {scans.map(t => (
            <div key={t.table} className="flex items-center justify-between px-5 py-3">
              <div>
                <p className="text-kitan-off-white text-sm font-medium">{t.label}</p>
                <p className="text-kitan-subtle text-xs font-mono">{t.table}</p>
              </div>
              {t.pendingRecords === -1 ? (
                <span className="text-red-400 text-xs font-semibold">Read failed — re-run the scan</span>
              ) : t.pendingRecords === 0 ? (
                <span className="flex items-center gap-1.5 text-kitan-teal text-xs font-semibold">
                  <CheckCircle size={13} /> Nothing to migrate
                </span>
              ) : (
                <span className="text-amber-300 text-xs font-semibold">
                  {t.pendingRecords} record(s) · {t.pendingImages} Base64 image(s)
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {scans && !running && !done && totalPending > 0 && (
        <p className="text-kitan-muted text-xs">
          {totalPendingRecords} record(s) and {totalPending} image(s) will be processed. Keep this tab open until it finishes.
        </p>
      )}

      {running && progress && (
        <div className="card-kitan p-5 space-y-3">
          <div className="flex items-center gap-3">
            <Loader2 size={16} className="text-kitan-teal animate-spin" />
            <p className="text-kitan-off-white text-sm font-semibold">{progress.currentLabel}</p>
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl bg-kitan-bg border border-kitan-border p-3">
              <p className="text-kitan-teal font-bold text-lg">{progress.stats.migratedImages}</p>
              <p className="text-kitan-subtle text-xs">Images uploaded</p>
            </div>
            <div className="rounded-xl bg-kitan-bg border border-kitan-border p-3">
              <p className="text-kitan-teal font-bold text-lg">{progress.stats.updatedRecords}</p>
              <p className="text-kitan-subtle text-xs">Records updated</p>
            </div>
            <div className="rounded-xl bg-kitan-bg border border-kitan-border p-3">
              <p className={progress.stats.failedRecords > 0 ? 'text-red-400 font-bold text-lg' : 'text-kitan-subtle font-bold text-lg'}>
                {progress.stats.failedRecords}
              </p>
              <p className="text-kitan-subtle text-xs">Failed records</p>
            </div>
          </div>
        </div>
      )}

      {done && progress && (
        <div className="card-kitan p-5 flex items-start gap-3">
          <CheckCircle size={18} className="text-kitan-teal mt-0.5" />
          <div className="text-sm">
            <p className="text-kitan-off-white font-semibold">Migration finished</p>
            <p className="text-kitan-muted text-xs mt-1">
              {progress.stats.migratedImages} image(s) uploaded · {progress.stats.updatedRecords} record(s) updated ·
              {' '}{progress.stats.cleanRecords} record(s) already clean · {progress.stats.failedRecords} failed
              (failed records keep their original data and can be retried).
            </p>
          </div>
        </div>
      )}

      {progress && progress.errors.length > 0 && (
        <div className="card-kitan p-5 border-red-500/30">
          <p className="flex items-center gap-2 text-red-400 text-sm font-semibold mb-2">
            <AlertCircle size={14} /> Failures ({progress.errors.length})
          </p>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {progress.errors.map((err, i) => (
              <li key={i} className="text-kitan-muted text-xs font-mono break-all">{err}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

export default MediaMigrationPanel;
