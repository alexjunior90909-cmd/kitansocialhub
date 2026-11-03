/**
 * ConsignmentOrdersPage — "My Consignment Orders".
 * Lists ONLY the signed-in user's own submissions (every query filters by
 * their app_user_id), paginated, with status indicators and video state.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Clapperboard, ChevronRight, RefreshCw, Loader2, AlertCircle,
  CheckCircle2, Clock, Video, PackageCheck, XCircle, Film,
} from 'lucide-react';
import { useAuthStore } from '@/stores/useStore';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';
import { fetchMyOrders, userOrderStatus, hasPublishedVideo, type ConsignmentSubmission } from '@/lib/consignment';

const PAGE_SIZE = 10;

function StatusChip({ status }: { status: string }) {
  const s = userOrderStatus(status);
  const styles = s.rejected
    ? 'bg-red-500/10 text-red-400 border-red-500/30'
    : s.step === 4
      ? 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30'
      : s.step === 3
        ? 'bg-green-500/10 text-green-400 border-green-500/30'
        : s.step === 2
          ? 'bg-blue-500/10 text-blue-400 border-blue-400/30'
          : 'bg-amber-500/10 text-amber-400 border-amber-400/30';
  return <span className={cn('text-[11px] font-semibold px-2.5 py-1 rounded-full border', styles)}>{s.label}</span>;
}

function VideoChip({ order }: { order: ConsignmentSubmission }) {
  const ready = hasPublishedVideo(order);
  return (
    <span className={cn(
      'inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1 rounded-full border',
      ready ? 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30' : 'bg-kitan-bg/70 text-kitan-subtle border-kitan-border',
    )}>
      {ready ? <Video size={11} /> : <Film size={11} />}
      {ready ? 'Video Ready' : 'Video Pending'}
    </span>
  );
}

const ConsignmentOrdersPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<ConsignmentSubmission[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (p: number) => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const { rows, total: t } = await fetchMyOrders(user.id, p, PAGE_SIZE);
      setOrders(rows);
      setTotal(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load orders');
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { setPage(1); load(1); }, [load]);

  if (!user) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <Clapperboard size={44} className="text-kitan-subtle mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-2">View your consignment orders</p>
        <p className="text-kitan-muted text-sm mb-5">Sign in to see your submissions and delivered videos.</p>
        <Link to="/login" className="btn-primary text-sm">Sign In</Link>
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-8">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="section-heading">My Consignment Orders</h1>
          <p className="text-kitan-muted text-sm mt-1">Track your submissions and watch your delivered videos.</p>
        </div>
        <button onClick={() => load(page)} disabled={loading} className="btn-secondary text-sm flex items-center gap-2">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-kitan p-5 animate-pulse space-y-3">
              <div className="h-4 bg-kitan-border/30 rounded w-1/3" />
              <div className="h-3 bg-kitan-border/20 rounded w-2/3" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="card-kitan p-10 text-center">
          <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
          <p className="text-kitan-off-white font-semibold mb-1">Could not load your orders</p>
          <p className="text-kitan-muted text-xs mb-4">{error}</p>
          <button onClick={() => load(page)} className="btn-primary text-sm">Retry</button>
        </div>
      ) : orders.length === 0 ? (
        <div className="card-kitan p-12 text-center">
          <Clapperboard size={40} className="text-kitan-subtle mx-auto mb-4" />
          <p className="text-kitan-off-white font-semibold mb-1">No consignment orders yet</p>
          <p className="text-kitan-muted text-sm mb-5">Create your first professional consignment video presentation.</p>
          <Link to="/consignment" className="btn-primary text-sm">Create Your Video</Link>
        </div>
      ) : (
        <>
          <div className="space-y-4">
            {orders.map(order => {
              const s = userOrderStatus(order.processingStatus);
              return (
                <button
                  key={order.id}
                  onClick={() => navigate(`/consignment/orders/${order.id}`)}
                  className="card-kitan p-5 w-full text-left group hover:border-kitan-teal/50 transition-all"
                >
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <span className="font-mono text-xs text-kitan-teal">{order.id}</span>
                        <StatusChip status={order.processingStatus} />
                        <VideoChip order={order} />
                      </div>
                      <p className="text-kitan-off-white text-sm font-semibold">
                        For: {order.receiverName} · {order.amount}
                      </p>
                      <p className="text-kitan-subtle text-xs mt-0.5">
                        {new Date(order.createdAt).toLocaleString()} · Paid {formatNGN(order.paymentAmount)} · Wallet
                      </p>
                    </div>
                    <div className="flex items-center gap-3 flex-shrink-0">
                      <div className="hidden sm:flex items-center gap-1.5">
                        {[
                          { icon: PackageCheck, on: s.step >= 1 },
                          { icon: Clock, on: s.step >= 2 },
                          { icon: Video, on: s.step >= 3 },
                          { icon: CheckCircle2, on: s.step >= 4 },
                        ].map(({ icon: Icon, on }, i) => (
                          <span key={i} className={cn('w-6 h-6 rounded-full flex items-center justify-center border', on ? 'bg-kitan-teal/15 border-kitan-teal/40 text-kitan-teal' : 'bg-kitan-bg border-kitan-border text-kitan-subtle')}>
                            <Icon size={11} />
                          </span>
                        ))}
                      </div>
                      <ChevronRight size={16} className="text-kitan-subtle group-hover:text-kitan-teal transition-colors" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-kitan-muted text-xs">Page {page} of {totalPages} · {total} order{total !== 1 ? 's' : ''}</p>
              <div className="flex gap-2">
                <button onClick={() => { const p = Math.max(1, page - 1); setPage(p); load(p); }} disabled={page === 1} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">Prev</button>
                <button onClick={() => { const p = Math.min(totalPages, page + 1); setPage(p); load(p); }} disabled={page === totalPages} className="btn-secondary text-xs px-3 py-1.5 disabled:opacity-40">Next</button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ConsignmentOrdersPage;
