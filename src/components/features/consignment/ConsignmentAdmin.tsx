/**
 * ConsignmentAdmin — Admin panel section for Consignment Video:
 *   • Submissions: paginated table, search, status filters, detail/edit drawer,
 *     processing-status updates, delete with confirmation.
 *   • Pricing: view/set the service price (app_settings, always authoritative).
 *   • Sample video: set/edit/clear the public sample video URL + live preview.
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  Clapperboard, RefreshCw, Search, ChevronLeft, ChevronRight, Eye, Trash2,
  X, Save, Loader2, Tag, Film, AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNGN } from '@/constants';
import SampleVideo from '@/components/features/consignment/SampleVideo';
import {
  adminFetchSubmissions, adminUpdateSubmission, adminDeleteSubmission,
  getConsignmentSettings, setConsignmentPrice, setSampleVideoUrl,
  type ConsignmentSubmission,
} from '@/lib/consignment';

const PAGE_SIZE = 10;
const PROCESSING_STATUSES = ['pending', 'paid', 'processing', 'completed', 'rejected'] as const;

const ASSET_LABELS: Record<string, string> = {
  gold_bars: 'Gold Bars', rings: 'Rings', necklaces: 'Necklaces', iphone_carton: 'iPhone Carton',
  car_key: 'Car Key', cybertruck_key: 'Cybertruck Key', tesla_key: 'Tesla Key', cash: 'Cash',
};

function statusClass(s: string): string {
  if (s === 'completed' || s === 'paid') return 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30';
  if (s === 'processing') return 'bg-blue-500/10 text-blue-400 border-blue-400/30';
  if (s === 'rejected') return 'bg-red-500/10 text-red-400 border-red-500/30';
  return 'bg-amber-500/10 text-amber-400 border-amber-400/30';
}

const ConsignmentAdmin: React.FC = () => {
  const [view, setView] = useState<'submissions' | 'settings'>('submissions');

  // ── Submissions ────────────────────────────────────────────────────────────
  const [rows, setRows] = useState<ConsignmentSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [processingFilter, setProcessingFilter] = useState('all');
  const [paymentFilter, setPaymentFilter] = useState('all');
  const [editing, setEditing] = useState<ConsignmentSubmission | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<ConsignmentSubmission | null>(null);

  // ── Settings ───────────────────────────────────────────────────────────────
  const [price, setPrice] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingPrice, setSavingPrice] = useState(false);
  const [savingVideo, setSavingVideo] = useState(false);

  const load = useCallback(async (p = page, quiet = false) => {
    if (!quiet) setLoading(true);
    setLoadError(null);
    try {
      const { rows: r, total: t } = await adminFetchSubmissions({
        page: p, pageSize: PAGE_SIZE, search: search.trim() || undefined,
        processingStatus: processingFilter, paymentStatus: paymentFilter,
      });
      setRows(r);
      setTotal(t);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load submissions');
    } finally {
      setLoading(false);
    }
  }, [page, search, processingFilter, paymentFilter]);

  useEffect(() => { load(page); /* eslint-disable-line react-hooks/exhaustive-deps */ }, [page, processingFilter, paymentFilter]);

  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    const s = await getConsignmentSettings(true);
    setPrice(s.price != null ? String(s.price) : '');
    setVideoUrl(s.sampleVideoUrl ?? '');
    setSettingsLoading(false);
  }, []);
  useEffect(() => { if (view === 'settings') loadSettings(); }, [view, loadSettings]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const saveEdit = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await adminUpdateSubmission(editing.id, {
        receiverName: editing.receiverName,
        receiverAddress: editing.receiverAddress,
        senderName: editing.senderName,
        amount: editing.amount,
        note: editing.note ?? '',
        processingStatus: editing.processingStatus,
        paymentStatus: editing.paymentStatus,
      });
      toast.success('Submission updated');
      setEditing(null);
      load(page, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    try {
      await adminDeleteSubmission(deleting.id);
      toast.success('Submission deleted');
      setDeleting(null);
      load(page, true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const savePrice = async () => {
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) { toast.error('Enter a valid price greater than 0'); return; }
    setSavingPrice(true);
    try {
      await setConsignmentPrice(p);
      toast.success(`Consignment Video price set to ${formatNGN(p)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save price');
    } finally {
      setSavingPrice(false);
    }
  };

  const saveVideo = async (clear = false) => {
    setSavingVideo(true);
    try {
      await setSampleVideoUrl(clear ? null : videoUrl.trim());
      toast.success(clear ? 'Sample video removed' : 'Sample video saved');
      if (clear) setVideoUrl('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to save video URL');
    } finally {
      setSavingVideo(false);
    }
  };

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2">
            <Clapperboard size={18} className="text-kitan-teal" /> Consignment Video
          </h3>
          <p className="text-kitan-muted text-sm mt-1">Manage submissions, pricing and the public sample video.</p>
        </div>
        <div className="flex items-center bg-kitan-card border border-kitan-border rounded-xl overflow-hidden">
          {(['submissions', 'settings'] as const).map(v => (
            <button
              key={v}
              onClick={() => setView(v)}
              className={cn('px-4 py-2 text-xs font-semibold capitalize transition-colors', view === v ? 'bg-kitan-teal text-white' : 'text-kitan-muted hover:text-kitan-off-white')}
            >
              {v === 'settings' ? 'Pricing & Video' : 'Submissions'}
            </button>
          ))}
        </div>
      </div>

      {view === 'submissions' ? (
        <>
          {/* Controls */}
          <div className="flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
              <input
                className="input-kitan pl-9 text-sm"
                placeholder="Search request ID, receiver, user…"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <select className="input-kitan text-sm" value={processingFilter} onChange={e => { setProcessingFilter(e.target.value); setPage(1); }}>
              <option value="all">All processing</option>
              {PROCESSING_STATUSES.map(s => <option key={s} value={s} className="capitalize">{s}</option>)}
            </select>
            <select className="input-kitan text-sm" value={paymentFilter} onChange={e => { setPaymentFilter(e.target.value); setPage(1); }}>
              <option value="all">All payments</option>
              <option value="paid">Paid</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            <button onClick={() => load(page)} className="btn-secondary text-sm flex items-center gap-1.5">
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>

          {/* Table */}
          {loadError ? (
            <div className="card-kitan p-8 text-center">
              <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
              <p className="text-kitan-off-white text-sm font-semibold mb-1">Could not load submissions</p>
              <p className="text-kitan-muted text-xs mb-4">{loadError}</p>
              <p className="text-kitan-subtle text-xs">If this mentions a missing table or function, apply <code className="text-kitan-teal">supabase/consignment-setup.sql</code> in the SQL Editor first.</p>
              <button onClick={() => load(page)} className="btn-primary text-sm mt-3">Retry</button>
            </div>
          ) : loading ? (
            <div className="flex items-center gap-3 py-10 justify-center">
              <Loader2 size={18} className="text-kitan-teal animate-spin" />
              <span className="text-kitan-muted text-sm">Loading submissions…</span>
            </div>
          ) : rows.length === 0 ? (
            <div className="card-kitan p-10 text-center">
              <Clapperboard size={32} className="text-kitan-subtle mx-auto mb-3" />
              <p className="text-kitan-muted text-sm">{total === 0 ? 'No consignment submissions yet.' : 'No submissions match your filters.'}</p>
            </div>
          ) : (
            <>
              <div className="card-kitan overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-kitan-border text-kitan-subtle text-xs uppercase tracking-wide">
                      <th className="px-4 py-3">Request</th>
                      <th className="px-4 py-3">User</th>
                      <th className="px-4 py-3">Receiver</th>
                      <th className="px-4 py-3">Assets</th>
                      <th className="px-4 py-3">Paid</th>
                      <th className="px-4 py-3">Processing</th>
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-kitan-border">
                    {rows.map(r => (
                      <tr key={r.id} className="hover:bg-kitan-bg/40 transition-colors text-sm">
                        <td className="px-4 py-3 font-mono text-xs text-kitan-teal">{r.id}</td>
                        <td className="px-4 py-3">
                          <p className="text-kitan-off-white text-xs font-medium">{r.userName || '—'}</p>
                          <p className="text-kitan-subtle text-xs">{r.userEmail || r.appUserId}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-kitan-off-white text-xs">{r.receiverName}</p>
                          <p className="text-kitan-subtle text-xs max-w-[160px] truncate">{r.receiverAddress}</p>
                        </td>
                        <td className="px-4 py-3 text-kitan-muted text-xs">{r.assets.map(a => ASSET_LABELS[a] || a).slice(0, 2).join(', ')}{r.assets.length > 2 ? ` +${r.assets.length - 2}` : ''}</td>
                        <td className="px-4 py-3">
                          <p className="text-kitan-teal font-bold text-xs">{formatNGN(r.paymentAmount)}</p>
                          <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full border', statusClass(r.paymentStatus))}>{r.paymentStatus}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn('text-[10px] px-2 py-0.5 rounded-full border capitalize', statusClass(r.processingStatus))}>{r.processingStatus}</span>
                        </td>
                        <td className="px-4 py-3 text-kitan-subtle text-xs">{new Date(r.createdAt).toLocaleDateString()}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <button onClick={() => setEditing(r)} className="w-8 h-8 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all" title="View / edit">
                              <Eye size={14} />
                            </button>
                            <button onClick={() => setDeleting(r)} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all" title="Delete">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Pagination */}
              <div className="flex items-center justify-between">
                <p className="text-kitan-muted text-xs">Page {page} of {totalPages} · {total} submission{total !== 1 ? 's' : ''}</p>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(Math.max(1, page - 1))} disabled={page === 1} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-40">
                    <ChevronLeft size={13} /> Prev
                  </button>
                  <button onClick={() => setPage(Math.min(totalPages, page + 1))} disabled={page === totalPages} className="btn-secondary text-xs px-3 py-1.5 flex items-center gap-1 disabled:opacity-40">
                    Next <ChevronRight size={13} />
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      ) : (
        /* ── Settings: pricing + sample video ──────────────────────────────── */
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <div className="card-kitan p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Tag size={16} className="text-kitan-teal" />
              <h4 className="font-semibold text-kitan-off-white text-sm">Service Price</h4>
            </div>
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-kitan-muted text-sm py-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
            ) : (
              <>
                <p className="text-kitan-muted text-xs">Flat rate charged from the user's wallet. This value is always read from the database at payment time.</p>
                <div className="flex items-center gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle text-sm">₦</span>
                    <input
                      type="number" min="1" step="any"
                      className="input-kitan pl-8 text-sm"
                      placeholder="e.g. 5000"
                      value={price}
                      onChange={e => setPrice(e.target.value)}
                    />
                  </div>
                  <button onClick={savePrice} disabled={savingPrice} className="btn-primary text-sm flex items-center gap-1.5">
                    {savingPrice ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save
                  </button>
                </div>
              </>
            )}
          </div>

          <div className="card-kitan p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Film size={16} className="text-kitan-teal" />
              <h4 className="font-semibold text-kitan-off-white text-sm">Sample Video (Public Page)</h4>
            </div>
            {settingsLoading ? (
              <div className="flex items-center gap-2 text-kitan-muted text-sm py-2"><Loader2 size={14} className="animate-spin" /> Loading…</div>
            ) : (
              <>
                <p className="text-kitan-muted text-xs">YouTube, Vimeo, Cloudinary or direct MP4/WebM links. Shown on the public Consignment Video page.</p>
                <input
                  className="input-kitan text-sm"
                  placeholder="https://www.youtube.com/watch?v=… or https://…/video.mp4"
                  value={videoUrl}
                  onChange={e => setVideoUrl(e.target.value)}
                />
                <div className="flex flex-wrap gap-2">
                  <button onClick={() => saveVideo(false)} disabled={savingVideo || !videoUrl.trim()} className="btn-primary text-sm flex items-center gap-1.5">
                    {savingVideo ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Video
                  </button>
                  <button onClick={() => saveVideo(true)} disabled={savingVideo || !videoUrl.trim()} className="btn-secondary text-sm flex items-center gap-1.5">
                    <X size={13} /> Remove
                  </button>
                </div>
                <div className="pt-2">
                  <p className="text-kitan-subtle text-xs mb-2">Preview (as shown to users):</p>
                  <SampleVideo url={videoUrl.trim() || null} />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Edit drawer ────────────────────────────────────────────────────── */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setEditing(null)} />
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto bg-kitan-surface border border-kitan-border rounded-3xl p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-bold text-kitan-off-white">Submission <span className="text-kitan-teal font-mono text-sm">{editing.id}</span></h4>
              <button onClick={() => setEditing(null)} className="w-8 h-8 rounded-lg hover:bg-kitan-bg flex items-center justify-center text-kitan-subtle"><X size={16} /></button>
            </div>

            {editing.receiverImageUrl && (
              <img src={editing.receiverImageUrl} alt="Receiver" className="w-full max-w-xs rounded-2xl border border-kitan-border object-cover" />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {([
                ['receiverName', 'Receiver Name'],
                ['receiverAddress', 'Receiver Address'],
                ['senderName', 'Sender Name'],
                ['amount', 'Amount'],
              ] as const).map(([k, label]) => (
                <div key={k} className={k === 'receiverAddress' ? 'sm:col-span-2' : ''}>
                  <label className="text-kitan-muted text-xs mb-1 block">{label}</label>
                  {k === 'receiverAddress' ? (
                    <textarea rows={2} className="input-kitan text-sm resize-none" value={editing[k]} onChange={e => setEditing({ ...editing, [k]: e.target.value })} />
                  ) : (
                    <input className="input-kitan text-sm" value={editing[k]} onChange={e => setEditing({ ...editing, [k]: e.target.value })} />
                  )}
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="text-kitan-muted text-xs mb-1 block">Additional Note</label>
                <textarea rows={2} className="input-kitan text-sm resize-none" value={editing.note ?? ''} onChange={e => setEditing({ ...editing, note: e.target.value })} />
              </div>
            </div>

            <div className="rounded-2xl border border-kitan-border bg-kitan-bg/40 p-4 space-y-3">
              <div>
                <p className="text-kitan-subtle text-xs mb-1">Assets selected</p>
                <div className="flex flex-wrap gap-1.5">
                  {editing.assets.map(a => (
                    <span key={a} className="text-xs bg-kitan-teal/10 text-kitan-teal border border-kitan-teal/20 px-2 py-0.5 rounded-full">{ASSET_LABELS[a] || a}</span>
                  ))}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-kitan-muted text-xs mb-1 block">Processing status</label>
                  <select className="input-kitan text-sm capitalize" value={editing.processingStatus} onChange={e => setEditing({ ...editing, processingStatus: e.target.value })}>
                    {PROCESSING_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-kitan-muted text-xs mb-1 block">Payment status</label>
                  <select className="input-kitan text-sm capitalize" value={editing.paymentStatus} onChange={e => setEditing({ ...editing, paymentStatus: e.target.value })}>
                    {['paid', 'pending', 'failed', 'refunded'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>
              <div className="text-xs text-kitan-subtle space-y-0.5 pt-1 border-t border-kitan-border">
                <p>User: {editing.userName || '—'} ({editing.userEmail || 'no email'}) · ID: <span className="font-mono">{editing.appUserId}</span></p>
                <p>Payment: {formatNGN(editing.paymentAmount)} · Ref: <span className="font-mono">{editing.paymentReference}</span></p>
                <p>Submitted: {new Date(editing.createdAt).toLocaleString()}</p>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={saveEdit} disabled={saving} className="btn-primary text-sm flex items-center gap-1.5">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />} Save Changes
              </button>
              <button onClick={() => setEditing(null)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ─────────────────────────────────────────────────── */}
      {deleting && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDeleting(null)} />
          <div className="relative w-full max-w-sm bg-kitan-surface border border-red-500/30 rounded-3xl p-6 text-center space-y-4">
            <AlertCircle size={32} className="text-red-400 mx-auto" />
            <div>
              <p className="text-kitan-off-white font-semibold">Delete this submission?</p>
              <p className="text-kitan-muted text-xs mt-1 font-mono">{deleting.id}</p>
              <p className="text-kitan-muted text-xs mt-2">This removes the record permanently. Wallet and payment ledger entries are preserved.</p>
            </div>
            <div className="flex gap-3 justify-center">
              <button onClick={confirmDelete} className="btn-primary text-sm bg-red-500 hover:bg-red-600 border-red-500">Delete</button>
              <button onClick={() => setDeleting(null)} className="btn-secondary text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ConsignmentAdmin;
