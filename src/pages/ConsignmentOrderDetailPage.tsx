/**
 * ConsignmentOrderDetailPage — a single consignment order (owner-only).
 * Loads by id AND the signed-in user's id; other users' orders are "not found".
 * Shows the status timeline, submitted details, and the delivered video
 * (lazy signed-URL playback) plus WhatsApp support.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, AlertCircle, RefreshCw, Loader2, CheckCircle2, Clock, Video,
  PackageCheck, MessageCircle, Copy, Film, User, Send, Banknote, NotebookPen,
} from 'lucide-react';
import { useAuthStore } from '@/stores/useStore';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import OrderVideoPlayer from '@/components/features/consignment/OrderVideoPlayer';
import { fetchMyOrder, userOrderStatus, hasPublishedVideo, type ConsignmentSubmission } from '@/lib/consignment';

const WHATSAPP_URL = 'https://wa.me/message/BBF2QJWLCFJHL1';

const STATUS_STEPS = [
  { label: 'Order Received', icon: PackageCheck },
  { label: 'Processing', icon: Clock },
  { label: 'Video Ready', icon: Video },
  { label: 'Completed', icon: CheckCircle2 },
];

const DetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [order, setOrder] = useState<ConsignmentSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const load = useCallback(async () => {
    if (!user || !id) return;
    setLoading(true);
    setNotFound(false);
    const o = await fetchMyOrder(user.id, id);
    setOrder(o);
    setNotFound(!o);
    setLoading(false);
  }, [user, id]);

  useEffect(() => { load(); }, [load]);

  if (!user) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={40} className="text-kitan-subtle mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-3">Sign in to view this order</p>
        <Link to="/login" className="btn-primary text-sm">Sign In</Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <Loader2 size={22} className="text-kitan-teal animate-spin" />
        <span className="text-kitan-muted text-sm">Loading your order…</span>
      </div>
    );
  }

  if (notFound || !order) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={44} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-2">Order not found</p>
        <p className="text-kitan-muted text-sm mb-5">This order doesn't exist or doesn't belong to your account.</p>
        <Link to="/consignment/orders" className="btn-primary text-sm">Back to My Orders</Link>
      </div>
    );
  }

  const s = userOrderStatus(order.processingStatus);
  const videoReady = hasPublishedVideo(order);

  return (
    <div className="space-y-7 max-w-3xl mx-auto pb-10">
      <button onClick={() => navigate('/consignment/orders')} className="btn-ghost flex items-center gap-2 text-sm -ml-2">
        <ArrowLeft size={15} /> My Consignment Orders
      </button>

      {/* Header */}
      <div className="card-kitan p-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-kitan-subtle text-xs uppercase tracking-wide mb-1">Order Reference</p>
          <div className="flex items-center gap-2">
            <p className="text-kitan-teal font-mono font-bold text-lg select-all">{order.id}</p>
            <button
              onClick={() => { void navigator.clipboard?.writeText(order.id); toast.success('Order reference copied'); }}
              className="w-7 h-7 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all"
              title="Copy reference"
            >
              <Copy size={13} />
            </button>
          </div>
          <p className="text-kitan-muted text-xs mt-1.5">
            Submitted {new Date(order.createdAt).toLocaleString()} · Paid {formatNGN(order.paymentAmount)} · Wallet
          </p>
        </div>
        <button onClick={load} className="btn-secondary text-xs flex items-center gap-1.5">
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* Status timeline */}
      <div className="card-kitan p-6">
        <p className="text-kitan-off-white font-semibold text-sm mb-5 flex items-center gap-2">
          {s.rejected ? <AlertCircle size={15} className="text-red-400" /> : <PackageCheck size={15} className="text-kitan-teal" />}
          Order Status: <span className={s.rejected ? 'text-red-400' : 'text-kitan-teal'}>{s.label}</span>
        </p>
        {!s.rejected ? (
          <div className="flex items-center">
            {STATUS_STEPS.map(({ label, icon: Icon }, i) => {
              const stepNum = i + 1;
              const done = s.step > stepNum;
              const active = s.step === stepNum;
              return (
                <React.Fragment key={label}>
                  <div className="flex flex-col items-center gap-2 min-w-[72px]">
                    <span className={cn(
                      'w-9 h-9 rounded-full flex items-center justify-center border transition-all',
                      done || active ? 'bg-kitan-teal/15 border-kitan-teal text-kitan-teal' : 'bg-kitan-bg border-kitan-border text-kitan-subtle',
                      active && 'shadow-teal-glow',
                    )}>
                      <Icon size={15} />
                    </span>
                    <span className={cn('text-[10px] text-center leading-tight', active ? 'text-kitan-teal font-semibold' : 'text-kitan-subtle')}>
                      {label}
                    </span>
                  </div>
                  {i < STATUS_STEPS.length - 1 && (
                    <div className={cn('flex-1 h-0.5 rounded -mt-5', s.step > stepNum ? 'bg-kitan-teal/60' : 'bg-kitan-border')} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        ) : (
          <p className="text-kitan-muted text-sm">This order was rejected. Please contact support for details.</p>
        )}
      </div>

      {/* Video delivery */}
      <div className="card-kitan p-6 space-y-4">
        <p className="text-kitan-off-white font-semibold text-sm flex items-center gap-2">
          <Film size={15} className="text-kitan-teal" /> Your Video
        </p>
        {videoReady && order.videoStoragePath ? (
          <OrderVideoPlayer storagePath={order.videoStoragePath} />
        ) : (
          <div className="rounded-2xl border border-kitan-border bg-kitan-bg/40 p-8 text-center">
            <span className="w-14 h-14 rounded-2xl bg-kitan-card border border-kitan-border flex items-center justify-center mx-auto mb-3">
              <Video size={22} className="text-kitan-subtle" />
            </span>
            <p className="text-kitan-off-white font-semibold">Your video is being prepared</p>
            <p className="text-kitan-muted text-sm mt-1">Our team is working on your consignment video. Please check back soon.</p>
          </div>
        )}
      </div>

      {/* Order details */}
      <div className="card-kitan p-6">
        <p className="text-kitan-off-white font-semibold text-sm mb-4">Order Details</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { icon: User, label: 'Receiver', value: `${order.receiverName} — ${order.receiverAddress}` },
            { icon: Send, label: 'Sender', value: order.senderName },
            { icon: Banknote, label: 'Amount', value: order.amount },
            { icon: NotebookPen, label: 'Note', value: order.note || '—' },
          ].map(({ icon: Icon, label, value }) => (
            <div key={label} className="flex items-start gap-3">
              <span className="w-8 h-8 rounded-xl bg-kitan-bg border border-kitan-border flex items-center justify-center flex-shrink-0">
                <Icon size={14} className="text-kitan-teal" />
              </span>
              <div className="min-w-0">
                <p className="text-kitan-subtle text-xs">{label}</p>
                <p className="text-kitan-off-white text-sm break-words">{value}</p>
              </div>
            </div>
          ))}
        </div>
        {order.assets.length > 0 && (
          <div className="mt-4 pt-4 border-t border-kitan-border">
            <p className="text-kitan-subtle text-xs mb-2">Featured assets</p>
            <div className="flex flex-wrap gap-1.5">
              {order.assets.map(a => (
                <span key={a} className="text-xs bg-kitan-teal/10 text-kitan-teal border border-kitan-teal/20 px-2 py-0.5 rounded-full capitalize">
                  {a.replace(/_/g, ' ')}
                </span>
              ))}
            </div>
          </div>
        )}
        {order.receiverImageUrl && (
          <div className="mt-4 pt-4 border-t border-kitan-border">
            <p className="text-kitan-subtle text-xs mb-2">Receiver image</p>
            <img src={order.receiverImageUrl} alt="Receiver" className="w-28 h-28 rounded-2xl object-cover border border-kitan-border" loading="lazy" />
          </div>
        )}
      </div>

      {/* WhatsApp support */}
      <div className="rounded-3xl border border-kitan-border bg-kitan-card/50 backdrop-blur-md p-6">
        <p className="text-kitan-off-white font-semibold mb-1.5">Need assistance with your order?</p>
        <p className="text-kitan-muted text-sm mb-4 max-w-lg">
          Have a question about your consignment video, or would you prefer to receive your completed video directly
          through WhatsApp? Our team is available to assist you.
        </p>
        <div className="flex flex-wrap gap-3 items-center">
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm flex items-center gap-2">
            <MessageCircle size={15} /> Message Our Team
          </a>
          <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm flex items-center gap-2">
            <MessageCircle size={15} /> Request WhatsApp Video Delivery
          </a>
          <button
            onClick={() => { void navigator.clipboard?.writeText(`My consignment order reference: ${order.id}`); toast.success('Order reference copied — paste it in the WhatsApp chat'); }}
            className="btn-ghost text-xs flex items-center gap-1.5"
          >
            <Copy size={12} /> Copy order reference
          </button>
        </div>
        <p className="text-kitan-subtle text-xs mt-3">Include your order reference <span className="font-mono text-kitan-teal">{order.id}</span> so our team can find your order instantly.</p>
      </div>
    </div>
  );
};

const ConsignmentOrderDetailPage = DetailPage;
export default ConsignmentOrderDetailPage;
