/**
 * OrderHistoryPage — Unified order history for ALL purchase types.
 *
 * Shows:
 *  - Gift / physical orders (from useOrdersStore)
 *  - Virtual number orders  (from Supabase virtual_number_orders)
 *  - Working Picture purchases (from Supabase purchases table)
 *  - Format purchases         (from Supabase purchases table)
 *  - Document submissions     (from Supabase document_submissions)
 *
 * Every row is clickable and deep-links to the relevant page/detail.
 */
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ShoppingBag, Phone, Camera, Layout, FileText, Package,
  ChevronRight, Loader2, Filter, Search, AlertCircle,
  Clock, CheckCircle, XCircle, Truck, Zap,
} from 'lucide-react';
import { useAuthStore, useOrdersStore, useWorkingPicturesStore, useFormatsStore, useDocumentsStore } from '@/stores/useStore';
import { dbVirtualOrders, dbPurchases, dbSubmissions } from '@/lib/db';
import type { VirtualNumberOrder, Purchase, DocumentSubmission } from '@/types';
import { formatDate } from '@/lib/utils';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import OptimizedImage from '@/components/features/OptimizedImage';

// ─────────────────────────────────────────────────────────────────────────────
// Unified order record shape
// ─────────────────────────────────────────────────────────────────────────────
type OrderType = 'gift' | 'virtual' | 'picture' | 'format' | 'document';

interface UnifiedOrder {
  id:          string;
  type:        OrderType;
  title:       string;
  subtitle:    string;
  amount:      number;      // NGN
  status:      string;
  date:        string;
  image?:      string;
  badge?:      string;
  rawData:     unknown;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status helpers
// ─────────────────────────────────────────────────────────────────────────────
const statusStyle: Record<string, string> = {
  pending:    'bg-amber-500/10 text-amber-400 border-amber-400/30',
  waiting:    'bg-amber-500/10 text-amber-400 border-amber-400/30',
  confirmed:  'bg-blue-500/10 text-blue-400 border-blue-400/30',
  processing: 'bg-blue-500/10 text-blue-400 border-blue-400/30',
  shipped:    'bg-purple-500/10 text-purple-400 border-purple-400/30',
  delivered:  'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30',
  completed:  'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30',
  received:   'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30',
  cancelled:  'bg-red-500/10 text-red-400 border-red-400/30',
  expired:    'bg-kitan-surface text-kitan-muted border-kitan-border',
};

const statusIcon: Record<string, React.ReactNode> = {
  pending:    <Clock size={11} />,
  waiting:    <Clock size={11} className="animate-pulse" />,
  confirmed:  <CheckCircle size={11} />,
  processing: <Loader2 size={11} className="animate-spin" />,
  shipped:    <Truck size={11} />,
  delivered:  <CheckCircle size={11} />,
  completed:  <CheckCircle size={11} />,
  received:   <CheckCircle size={11} />,
  cancelled:  <XCircle size={11} />,
  expired:    <XCircle size={11} />,
};

const typeLabel: Record<OrderType, { label: string; icon: React.ReactNode; color: string }> = {
  gift:     { label: 'Gift Order',       icon: <ShoppingBag size={13} />,  color: 'text-purple-400 bg-purple-500/10 border-purple-500/20' },
  virtual:  { label: 'Virtual Number',   icon: <Phone size={13} />,        color: 'text-kitan-teal bg-kitan-teal/10 border-kitan-teal/20' },
  picture:  { label: 'Working Picture',  icon: <Camera size={13} />,       color: 'text-amber-400 bg-amber-500/10 border-amber-500/20' },
  format:   { label: 'Format',           icon: <Layout size={13} />,       color: 'text-blue-400 bg-blue-500/10 border-blue-500/20' },
  document: { label: 'Document',         icon: <FileText size={13} />,     color: 'text-green-400 bg-green-500/10 border-green-500/20' },
};

const filterTabs: { key: OrderType | 'all'; label: string; icon: React.ReactNode }[] = [
  { key: 'all',      label: 'All',          icon: <Filter size={13} /> },
  { key: 'gift',     label: 'Gifts',        icon: <ShoppingBag size={13} /> },
  { key: 'virtual',  label: 'Numbers',      icon: <Phone size={13} /> },
  { key: 'picture',  label: 'Pictures',     icon: <Camera size={13} /> },
  { key: 'format',   label: 'Formats',      icon: <Layout size={13} /> },
  { key: 'document', label: 'Documents',    icon: <FileText size={13} /> },
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────
const OrderHistoryPage: React.FC = () => {
  const navigate  = useNavigate();
  const { user }  = useAuthStore();
  const { getUserOrders } = useOrdersStore();
  const { items: pictures }  = useWorkingPicturesStore();
  const { formats }          = useFormatsStore();
  const { documents }        = useDocumentsStore();

  const [loading,         setLoading]         = useState(true);
  const [virtualOrders,   setVirtualOrders]   = useState<VirtualNumberOrder[]>([]);
  const [purchases,       setPurchases]       = useState<Purchase[]>([]);
  const [submissions,     setSubmissions]     = useState<DocumentSubmission[]>([]);
  const [activeFilter,    setActiveFilter]    = useState<OrderType | 'all'>('all');
  const [search,          setSearch]          = useState('');

  // Load remote data
  useEffect(() => {
    if (!user) { setLoading(false); return; }
    setLoading(true);
    Promise.all([
      dbVirtualOrders.getByUser(user.id),
      dbPurchases.getUserPurchases(user.id),
      dbSubmissions.getAll(),
    ]).then(([vOrders, purs, subs]) => {
      setVirtualOrders(vOrders);
      // Filter purchases and submissions to this user
      setPurchases(purs.filter(p => p.appUserId === user.id));
      setSubmissions(subs.filter(s => {
        // submissions store _appUserId in form_data
        const fd = s.formData as Record<string, string>;
        return fd._appUserId === user.id || s.userId === user.id;
      }));
      setLoading(false);
    }).catch(err => {
      console.error('OrderHistory load error:', err);
      toast.error('Failed to load some order history');
      setLoading(false);
    });
  }, [user]);

  // Build unified list
  const unified: UnifiedOrder[] = useMemo(() => {
    if (!user) return [];
    const list: UnifiedOrder[] = [];

    // 1. Gift orders (from store)
    const giftOrders = getUserOrders(user.id);
    giftOrders.forEach(o => {
      const firstImg = o.items[0]?.product.images[0];
      list.push({
        id:       o.id,
        type:     'gift',
        title:    o.items.map(i => i.product.title).join(', '),
        subtitle: `${o.trackingCode} · ${o.deliveryInfo.fullName} · ${o.deliveryInfo.city}`,
        amount:   o.total,
        status:   o.status,
        date:     o.createdAt,
        image:    firstImg,
        badge:    o.trackingCode,
        rawData:  o,
      });
    });

    // 2. Virtual number orders
    virtualOrders.forEach(v => {
      const isActive = v.status === 'pending' || v.status === 'waiting';
      list.push({
        id:       v.id,
        type:     'virtual',
        title:    `${v.service.replace(/^\w/, c => c.toUpperCase())} Number`,
        subtitle: `+${v.phoneNumber} · ${v.country}${v.smsCode ? ` · Code: ${v.smsCode}` : ''}`,
        amount:   v.costNGN,
        status:   v.status,
        date:     v.createdAt,
        badge:    isActive ? 'Live' : undefined,
        rawData:  v,
      });
    });

    // 3. Working Picture purchases
    purchases
      .filter(p => p.productType === 'working_picture')
      .forEach(p => {
        const pic = pictures.find(pi => pi.id === p.productId);
        list.push({
          id:       p.id,
          type:     'picture',
          title:    pic?.title ?? `Picture Pack`,
          subtitle: `Purchased · ${formatNGN(p.amount)}`,
          amount:   p.amount,
          status:   'completed',
          date:     p.createdAt,
          image:    pic?.images[0],
          rawData:  p,
        });
      });

    // 4. Format purchases
    purchases
      .filter(p => p.productType === 'format')
      .forEach(p => {
        const fmt = formats.find(f => f.id === p.productId);
        list.push({
          id:       p.id,
          type:     'format',
          title:    fmt?.title ?? `Format Template`,
          subtitle: `${fmt?.fileType ?? 'Template'} · ${formatNGN(p.amount)}`,
          amount:   p.amount,
          status:   'completed',
          date:     p.createdAt,
          image:    fmt?.previewImages[0],
          rawData:  p,
        });
      });

    // 5. Document submissions
    submissions.forEach(sub => {
      const doc = documents.find(d => d.id === sub.documentId);
      list.push({
        id:       sub.id,
        type:     'document',
        title:    doc?.title ?? `Document`,
        subtitle: `Submission · ${sub.status}${doc?.category ? ` · ${doc.category}` : ''}`,
        amount:   doc?.price ?? 0,
        status:   sub.status,
        date:     sub.createdAt,
        image:    doc?.previewImages[0],
        rawData:  sub,
      });
    });

    // Sort newest first
    return list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [user, getUserOrders, virtualOrders, purchases, submissions, pictures, formats, documents]);

  // Filter + search
  const filtered = useMemo(() => {
    let result = activeFilter === 'all' ? unified : unified.filter(o => o.type === activeFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(o =>
        o.title.toLowerCase().includes(q) ||
        o.subtitle.toLowerCase().includes(q) ||
        (o.badge ?? '').toLowerCase().includes(q),
      );
    }
    return result;
  }, [unified, activeFilter, search]);

  // Deep-link navigation
  const handleRowClick = (order: UnifiedOrder) => {
    switch (order.type) {
      case 'gift': {
        // Navigate to track page with the tracking code pre-filled
        navigate(`/track?code=${(order.rawData as { trackingCode: string }).trackingCode}`);
        break;
      }
      case 'virtual': {
        // Navigate to virtual numbers page with history tab active
        navigate('/virtual-numbers?tab=history');
        break;
      }
      case 'picture': {
        const p = order.rawData as Purchase;
        navigate(`/pictures/${p.productId}`);
        break;
      }
      case 'format': {
        const p = order.rawData as Purchase;
        navigate(`/formats/${p.productId}`);
        break;
      }
      case 'document': {
        const s = order.rawData as DocumentSubmission;
        navigate(`/documents/${s.documentId}`);
        break;
      }
    }
  };

  if (!user) {
    return (
      <div className="text-center py-20">
        <ShoppingBag size={48} className="text-kitan-subtle mx-auto mb-4" />
        <p className="text-kitan-muted text-sm">Please sign in to view your orders.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-10">

      {/* Header */}
      <div>
        <h1 className="section-heading">Order History</h1>
        <p className="text-kitan-muted text-sm mt-1">
          {loading ? 'Loading…' : `${unified.length} total order${unified.length !== 1 ? 's' : ''} across all categories`}
        </p>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name, code, number…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-kitan pl-9 text-sm"
        />
      </div>

      {/* Filter tabs */}
      <div className="flex gap-1.5 overflow-x-auto scrollbar-hide pb-1">
        {filterTabs.map(({ key, label, icon }) => {
          const count = key === 'all' ? unified.length : unified.filter(o => o.type === key).length;
          return (
            <button
              key={key}
              onClick={() => setActiveFilter(key)}
              className={cn(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex-shrink-0',
                activeFilter === key
                  ? 'bg-kitan-teal text-white border-kitan-teal shadow-teal-glow'
                  : 'bg-kitan-surface text-kitan-muted border-kitan-border hover:text-kitan-off-white hover:border-kitan-teal/30',
              )}
            >
              {icon} {label}
              {count > 0 && (
                <span className={cn(
                  'text-[10px] px-1.5 py-0.5 rounded-full font-bold ml-0.5',
                  activeFilter === key ? 'bg-white/20 text-white' : 'bg-kitan-bg text-kitan-muted',
                )}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-kitan p-5 animate-pulse flex gap-4 items-center">
              <div className="w-12 h-12 rounded-xl bg-kitan-border/30 flex-shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-kitan-border/30 rounded w-2/5" />
                <div className="h-3 bg-kitan-border/20 rounded w-3/5" />
              </div>
              <div className="w-16 h-6 bg-kitan-border/20 rounded-full" />
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && filtered.length === 0 && (
        <div className="card-kitan p-16 text-center">
          {activeFilter !== 'all' ? (
            <>
              <AlertCircle size={40} className="text-kitan-subtle mx-auto mb-3" />
              <p className="text-kitan-off-white font-semibold">No {typeLabel[activeFilter as OrderType]?.label ?? ''} orders</p>
              <p className="text-kitan-muted text-sm mt-1">Your {typeLabel[activeFilter as OrderType]?.label.toLowerCase() ?? ''} orders will appear here.</p>
              <button onClick={() => setActiveFilter('all')} className="btn-secondary mt-4 text-sm">View All Orders</button>
            </>
          ) : (
            <>
              <ShoppingBag size={48} className="text-kitan-subtle mx-auto mb-4" />
              <p className="text-kitan-off-white font-semibold text-lg mb-2">No orders yet</p>
              <p className="text-kitan-muted text-sm mb-5">All your purchases — gifts, documents, virtual numbers and more — will appear here.</p>
              <button onClick={() => navigate('/')} className="btn-primary">Start Shopping</button>
            </>
          )}
        </div>
      )}

      {/* Order rows */}
      {!loading && filtered.length > 0 && (
        <div className="space-y-3">
          {filtered.map(order => {
            const tl = typeLabel[order.type];
            const isLive = (order.type === 'virtual') &&
              (order.status === 'pending' || order.status === 'waiting');

            return (
              <button
                key={order.id}
                onClick={() => handleRowClick(order)}
                className={cn(
                  'w-full text-left card-kitan p-4 flex items-center gap-4 transition-all',
                  'hover:border-kitan-teal/40 hover:bg-kitan-surface/80 active:scale-[0.99]',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-kitan-teal/50',
                  isLive && 'border-amber-500/30 bg-amber-500/5',
                )}
              >
                {/* Thumbnail / icon */}
                <div className="w-12 h-12 rounded-xl overflow-hidden flex-shrink-0 border border-kitan-border bg-kitan-bg flex items-center justify-center">
                  {order.image ? (
                    <OptimizedImage src={order.image} alt="" className="w-full h-full" imgClassName="object-cover" fallback={<span className={cn('text-base', tl.color.split(' ')[0])}>{tl.icon}</span>} />
                  ) : (
                    <span className={cn('text-base', tl.color.split(' ')[0])}>{tl.icon}</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 space-y-1">
                  {/* Type badge + live indicator */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={cn('inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full border', tl.color)}>
                      {tl.icon} {tl.label}
                    </span>
                    {isLive && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 rounded-full">
                        <Zap size={9} className="animate-pulse" /> LIVE
                      </span>
                    )}
                    {order.badge && order.type === 'gift' && (
                      <span className="font-mono text-kitan-teal text-[10px] font-bold">{order.badge}</span>
                    )}
                  </div>

                  <p className="text-kitan-off-white text-sm font-semibold truncate">{order.title}</p>
                  <p className="text-kitan-subtle text-xs truncate leading-relaxed">{order.subtitle}</p>
                  <p className="text-kitan-subtle text-xs">{formatDate(order.date)}</p>
                </div>

                {/* Right side */}
                <div className="flex-shrink-0 text-right flex flex-col items-end gap-2">
                  {order.amount > 0 && (
                    <p className="text-kitan-teal font-display font-bold text-sm">
                      {formatNGN(order.amount)}
                    </p>
                  )}
                  <span className={cn(
                    'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize whitespace-nowrap',
                    statusStyle[order.status] ?? statusStyle.pending,
                  )}>
                    {statusIcon[order.status] ?? <Clock size={10} />}
                    {order.status}
                  </span>
                  <ChevronRight size={14} className="text-kitan-subtle mt-0.5" />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default OrderHistoryPage;
