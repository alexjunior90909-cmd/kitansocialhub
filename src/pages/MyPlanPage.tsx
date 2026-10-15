/**
 * MyPlanPage — User's subscription library.
 * Shows real assigned products from DB with thumbnails, titles, and direct-access buttons.
 * Features are derived entirely from plan_products (real product IDs — never placeholder text).
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown, CheckCircle, Clock, CalendarDays, Zap, ArrowRight,
  AlertCircle, Shield, Star, Loader2, RefreshCw, XCircle, Lock,
  Gift, FileText, Camera, Layout, Phone, Receipt, TrendingUp, Globe,
  ExternalLink,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useStore';
import { cn } from '@/lib/utils';
import { formatNGN } from '@/constants';
import { invalidateSubscriptionCache } from '@/hooks/useSubscriptionAccess';
import OptimizedImage from '@/components/features/OptimizedImage';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface UserSubscription {
  id: string;
  plan_id: string;
  plan_name: string;
  plan_snapshot: Record<string, unknown>;
  price_paid_ngn: number;
  status: string;
  activated_at: string;
  expires_at: string;
}

/** A row from plan_products joined with real product data */
interface AssignedProduct {
  // plan_products fields
  id: string;
  plan_id: string;
  product_type: string;        // 'gift' | 'document' | 'working_picture' | 'format' | 'website' | 'virtual_numbers' | 'receipt_generator' | 'account_boosting'
  product_id: string | null;   // null = service-level access
  product_table: string | null;
  product_name: string;
  qty_limit: number | null;
  // Resolved from actual product table
  thumbnail: string | null;
  description: string | null;
  price: number | null;
  route: string | null;        // navigation target when user clicks
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const PLAN_THEME: Record<string, {
  border: string; bg: string; badge: string; badgeText: string;
  icon: React.ElementType; iconBg: string; checkColor: string; glow: string;
}> = {
  teal:   { border: 'border-kitan-teal/40',  bg: 'from-kitan-teal/6',  badge: 'bg-kitan-teal/15 border-kitan-teal/30',  badgeText: 'text-kitan-teal',   icon: Zap,   iconBg: 'bg-kitan-teal/15 border-kitan-teal/30',  checkColor: 'text-kitan-teal',   glow: '#14b8a6' },
  blue:   { border: 'border-blue-500/40',    bg: 'from-blue-500/6',    badge: 'bg-blue-500/15 border-blue-500/30',      badgeText: 'text-blue-400',     icon: Shield,iconBg: 'bg-blue-500/15 border-blue-500/30',    checkColor: 'text-blue-400',     glow: '#3b82f6' },
  purple: { border: 'border-purple-500/40',  bg: 'from-purple-500/6',  badge: 'bg-purple-500/15 border-purple-500/30',  badgeText: 'text-purple-400',   icon: Star,  iconBg: 'bg-purple-500/15 border-purple-500/30',  checkColor: 'text-purple-400',   glow: '#a855f7' },
  gold:   { border: 'border-amber-400/50',   bg: 'from-amber-500/8',   badge: 'bg-amber-500/15 border-amber-500/30',    badgeText: 'text-amber-400',    icon: Crown, iconBg: 'bg-amber-500/15 border-amber-500/30',  checkColor: 'text-amber-400',    glow: '#f59e0b' },
};

/** Icon for each service/product type */
const TYPE_ICON: Record<string, React.ElementType> = {
  gift: Gift,
  document: FileText,
  working_picture: Camera,
  format: Layout,
  virtual_numbers: Phone,
  receipt_generator: Receipt,
  account_boosting: TrendingUp,
  website: Globe,
};

/** Route generator for each product type */
function getProductRoute(productType: string, productId: string | null): string {
  if (!productId) {
    // Service-level — go to the service page
    const serviceRoutes: Record<string, string> = {
      virtual_numbers: '/virtual-numbers',
      receipt_generator: '/receipt-generator',
      account_boosting: '/account-boosting',
    };
    return serviceRoutes[productType] || '/services';
  }
  const routes: Record<string, string> = {
    gift: `/gifts/${productId}`,
    document: `/documents/${productId}`,
    working_picture: `/working-pictures/${productId}`,
    format: `/formats/${productId}`,
    website: `/website/${productId}`,
  };
  return routes[productType] || '/services';
}

function daysRemaining(expiresAt: string): number {
  return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 86_400_000));
}

// ─────────────────────────────────────────────────────────────────────────────
// Fetch real product details for a list of plan_products rows
// ─────────────────────────────────────────────────────────────────────────────
async function resolveProductDetails(
  rows: Array<{
    id: string; plan_id: string; product_type: string; product_id: string | null;
    product_table: string | null; product_name: string; qty_limit: number | null;
  }>
): Promise<AssignedProduct[]> {
  const result: AssignedProduct[] = [];

  for (const row of rows) {
    if (!row.product_id || !row.product_table) {
      // Service-level access (virtual_numbers, receipt_generator, account_boosting)
      result.push({
        ...row,
        thumbnail: null,
        description: null,
        price: null,
        route: getProductRoute(row.product_type, null),
      });
      continue;
    }

    // Fetch from the real table
    const tableMap: Record<string, { imgField: string; descField: string; priceField: string }> = {
      products:         { imgField: 'images',          descField: 'description', priceField: 'price' },
      kitan_documents:  { imgField: 'preview_images',  descField: 'description', priceField: 'price' },
      working_pictures: { imgField: 'images',          descField: 'description', priceField: 'price' },
      formats:          { imgField: 'preview_images',  descField: 'description', priceField: 'price' },
      website_products: { imgField: 'preview_images',  descField: 'description', priceField: 'price_ngn' },
    };

    const meta = tableMap[row.product_table];
    if (!meta) {
      result.push({ ...row, thumbnail: null, description: null, price: null, route: '/services' });
      continue;
    }

    const { data } = await supabase
      .from(row.product_table)
      .select(`title, ${meta.imgField}, ${meta.descField}, ${meta.priceField}`)
      .eq('id', row.product_id)
      .single();

    // Dynamic table name → supabase types the row generically; read it as a record.
    const rec = (data ?? null) as unknown as Record<string, unknown> | null;
    const imgs = (rec?.[meta.imgField] as string[]) || [];
    result.push({
      ...row,
      product_name: (rec?.title as string) || row.product_name,
      thumbnail: imgs[0] || null,
      description: (rec?.[meta.descField] as string) || null,
      price: rec ? Number(rec[meta.priceField]) : null,
      route: getProductRoute(row.product_type, row.product_id),
    });
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Product card component
// ─────────────────────────────────────────────────────────────────────────────
const ProductCard: React.FC<{
  product: AssignedProduct;
  themeCheckColor: string;
  themeBadgeText: string;
  themeBadge: string;
  onOpen: (route: string) => void;
}> = ({ product, themeCheckColor, themeBadgeText, themeBadge, onOpen }) => {
  const TypeIcon = TYPE_ICON[product.product_type] || Gift;
  const isServiceLevel = !product.product_id;

  return (
    <div className="card-kitan overflow-hidden group hover:border-kitan-teal/50 transition-all flex flex-col">
      {/* Thumbnail */}
      {product.thumbnail ? (
        <div className="relative h-40 overflow-hidden bg-kitan-bg flex-shrink-0">
          <OptimizedImage
            src={product.thumbnail}
            alt={product.product_name}
            className="w-full h-full"
            imgClassName="object-cover group-hover:scale-105 transition-transform duration-500"
            fallback={<Gift size={28} className="text-kitan-subtle opacity-40" />}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-kitan-bg/70 via-transparent to-transparent" />
          <div className="absolute top-2 left-2">
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize', themeBadge, themeBadgeText)}>
              {product.product_type.replace('_', ' ')}
            </span>
          </div>
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-kitan-teal/90 text-white">
              {product.qty_limit === null ? '∞ Unlimited' : `${product.qty_limit}× uses`}
            </span>
          </div>
        </div>
      ) : (
        <div className="relative h-40 flex items-center justify-center bg-gradient-to-br from-kitan-surface to-kitan-bg flex-shrink-0">
          <TypeIcon size={40} className="text-kitan-subtle/40" />
          <div className="absolute top-2 left-2">
            <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full border capitalize', themeBadge, themeBadgeText)}>
              {product.product_type.replace('_', ' ')}
            </span>
          </div>
          <div className="absolute top-2 right-2">
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-kitan-teal/90 text-white">
              {product.qty_limit === null ? '∞ Unlimited' : `${product.qty_limit}× uses`}
            </span>
          </div>
        </div>
      )}

      {/* Body */}
      <div className="p-4 flex flex-col flex-1">
        <div className="flex items-start gap-2 mb-2">
          <div className="w-8 h-8 rounded-xl bg-kitan-surface border border-kitan-border flex items-center justify-center flex-shrink-0 mt-0.5">
            <TypeIcon size={14} className={themeCheckColor} />
          </div>
          <h4 className="font-semibold text-kitan-off-white text-sm leading-snug line-clamp-2 flex-1">
            {product.product_name}
          </h4>
        </div>

        {product.description && (
          <p className="text-kitan-muted text-xs leading-relaxed line-clamp-2 mb-3 flex-1">
            {product.description}
          </p>
        )}

        {isServiceLevel && (
          <p className="text-kitan-subtle text-xs mb-3 flex-1">
            Full service access included in your plan.
          </p>
        )}

        <div className="flex items-center justify-between mt-auto pt-3 border-t border-kitan-border gap-2">
          <div className="flex items-center gap-1.5">
            <CheckCircle size={12} className={cn('flex-shrink-0', themeCheckColor)} />
            <span className="text-kitan-muted text-xs">Included</span>
          </div>
          <button
            onClick={() => onOpen(product.route!)}
            className="flex items-center gap-1.5 text-xs font-semibold text-kitan-teal hover:text-kitan-teal-bright transition-colors group-hover:gap-2"
          >
            {isServiceLevel ? 'Open Service' : 'Open Product'}
            <ExternalLink size={11} />
          </button>
        </div>
      </div>
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
const MyPlanPage: React.FC = () => {
  const navigate  = useNavigate();
  const { user }  = useAuthStore();

  const [sub,           setSub]           = useState<UserSubscription | null>(null);
  const [assigned,      setAssigned]      = useState<AssignedProduct[]>([]);
  const [history,       setHistory]       = useState<UserSubscription[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [resolving,     setResolving]     = useState(false);
  const [filterType,    setFilterType]    = useState<string>('all');

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);

    // 1. Active subscription
    const { data: activeSub } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('app_user_id', user.id)
      .eq('status', 'active')
      .gt('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    setSub(activeSub || null);

    // 2. Plan products — real product rows from plan_products
    if (activeSub) {
      const { data: pp } = await supabase
        .from('plan_products')
        .select('*')
        .eq('plan_id', activeSub.plan_id)
        .order('product_type');

      const rows = (pp || []) as Array<{
        id: string; plan_id: string; product_type: string; product_id: string | null;
        product_table: string | null; product_name: string; qty_limit: number | null;
      }>;

      setLoading(false);
      setResolving(true);
      const resolved = await resolveProductDetails(rows);
      setAssigned(resolved);
      setResolving(false);
    } else {
      setAssigned([]);
      setLoading(false);
    }

    // 3. History
    const { data: hist } = await supabase
      .from('user_subscriptions')
      .select('*')
      .eq('app_user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    setHistory(hist || []);
  }, [user]);

  useEffect(() => {
    if (!user) { navigate('/login'); return; }
    loadData();
  }, [user, loadData, navigate]);

  const handleRefresh = () => {
    if (user) invalidateSubscriptionCache(user.id);
    loadData();
  };

  const handleOpenProduct = (route: string) => {
    navigate(route);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <Loader2 size={24} className="text-kitan-teal animate-spin" />
        <span className="text-kitan-muted">Loading subscription…</span>
      </div>
    );
  }

  // ── No active plan ────────────────────────────────────────────────────────
  if (!sub) {
    return (
      <div className="space-y-6 pb-10">
        <div>
          <h1 className="section-heading">My Plan</h1>
          <p className="text-kitan-muted text-sm mt-1">Your subscription library</p>
        </div>
        <div className="card-kitan p-12 text-center space-y-4">
          <div className="w-16 h-16 rounded-full bg-kitan-surface border border-kitan-border flex items-center justify-center mx-auto">
            <Crown size={28} className="text-kitan-subtle" />
          </div>
          <h2 className="font-display font-bold text-kitan-off-white text-xl">No Active Plan</h2>
          <p className="text-kitan-muted max-w-sm mx-auto leading-relaxed">
            Choose a plan to unlock access to selected products and services. Direct wallet purchases always remain available regardless of subscription status.
          </p>
          <button onClick={() => navigate('/plans')} className="btn-primary flex items-center gap-2 mx-auto">
            <Zap size={16} /> View Plans <ArrowRight size={14} />
          </button>
        </div>
        {history.length > 1 && <HistorySection history={history} />}
      </div>
    );
  }

  const snapshot   = sub.plan_snapshot as Record<string, unknown>;
  const colorTheme = (snapshot.color_theme as string) || 'teal';
  const theme      = PLAN_THEME[colorTheme] ?? PLAN_THEME.teal;
  const Icon       = theme.icon;
  const days       = daysRemaining(sub.expires_at);

  // Filter types for the library
  const allTypes = Array.from(new Set(assigned.map(p => p.product_type)));
  const displayed = filterType === 'all'
    ? assigned
    : assigned.filter(p => p.product_type === filterType);

  const TYPE_LABELS: Record<string, string> = {
    gift: 'Gift Items',
    document: 'Documents',
    working_picture: 'Working Pictures',
    format: 'Formats',
    website: 'Websites',
    virtual_numbers: 'Virtual Numbers',
    receipt_generator: 'Receipt Generator',
    account_boosting: 'Account Boosting',
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="section-heading">My Plan</h1>
          <p className="text-kitan-muted text-sm mt-1">Your subscription library</p>
        </div>
        <button onClick={handleRefresh} className="btn-ghost text-sm flex items-center gap-1.5">
          <RefreshCw size={13} className={resolving ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* Active plan header card */}
      <div
        className={cn('relative overflow-hidden rounded-3xl border p-6 bg-gradient-to-b', theme.border, theme.bg, 'to-transparent')}
        style={{ boxShadow: `0 8px 40px -10px rgba(0,0,0,0.4)` }}
      >
        <div className="absolute top-[-60px] right-[-60px] w-[200px] h-[200px] rounded-full opacity-10 blur-2xl pointer-events-none"
          style={{ background: `radial-gradient(circle, ${theme.glow} 0%, transparent 70%)` }} />
        <div className="relative z-10">
          <div className="flex items-start justify-between gap-4 flex-wrap mb-5">
            <div className="flex items-center gap-4">
              <div className={cn('w-12 h-12 rounded-2xl border flex items-center justify-center flex-shrink-0', theme.iconBg)}>
                <Icon size={22} className={theme.badgeText} />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="font-display font-bold text-kitan-off-white text-xl">{sub.plan_name}</h2>
                  <span className={cn('text-xs font-bold px-2 py-0.5 rounded-full border', theme.badge, theme.badgeText)}>Active</span>
                </div>
                <p className="text-kitan-muted text-sm">{formatNGN(sub.price_paid_ngn)} paid · {assigned.length} product{assigned.length !== 1 ? 's' : ''} assigned</p>
              </div>
            </div>
            <div className={cn('text-center px-4 py-2.5 rounded-2xl border flex-shrink-0', theme.iconBg)}>
              <p className={cn('font-display font-bold text-2xl', theme.badgeText)}>{days}</p>
              <p className="text-kitan-subtle text-xs mt-0.5">days left</p>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-kitan-bg/50 rounded-2xl border border-kitan-border px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <CalendarDays size={12} className="text-kitan-teal" />
                <span className="text-kitan-subtle text-[10px] font-semibold uppercase tracking-wide">Activated</span>
              </div>
              <p className="text-kitan-off-white font-semibold text-xs">
                {new Date(sub.activated_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div className="bg-kitan-bg/50 rounded-2xl border border-kitan-border px-4 py-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Clock size={12} className={days < 5 ? 'text-red-400' : 'text-amber-400'} />
                <span className="text-kitan-subtle text-[10px] font-semibold uppercase tracking-wide">Expires</span>
              </div>
              <p className={cn('font-semibold text-xs', days < 5 ? 'text-red-300' : 'text-kitan-off-white')}>
                {new Date(sub.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Expiry warning */}
      {days < 5 && days > 0 && (
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
          <AlertCircle size={15} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-amber-300 text-sm font-semibold">Plan Expiring Soon</p>
            <p className="text-amber-400/70 text-xs mt-0.5">Your plan expires in {days} day{days !== 1 ? 's' : ''}. Renew now to keep access.</p>
          </div>
        </div>
      )}

      {/* ── Subscription Library ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="font-display font-bold text-kitan-off-white text-lg">Your Subscription Library</h2>
            <p className="text-kitan-muted text-xs mt-0.5">
              {assigned.length} product{assigned.length !== 1 ? 's' : ''} included in your plan — click any to open it directly
            </p>
          </div>
        </div>

        {/* Type filters */}
        {allTypes.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setFilterType('all')}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all', filterType === 'all' ? 'bg-kitan-teal text-white border-kitan-teal' : 'bg-kitan-surface border-kitan-border text-kitan-muted hover:text-kitan-off-white')}
            >All ({assigned.length})</button>
            {allTypes.map(t => (
              <button
                key={t}
                onClick={() => setFilterType(t)}
                className={cn('px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all capitalize', filterType === t ? 'bg-kitan-teal text-white border-kitan-teal' : 'bg-kitan-surface border-kitan-border text-kitan-muted hover:text-kitan-off-white')}
              >
                {TYPE_LABELS[t] || t.replace('_', ' ')} ({assigned.filter(p => p.product_type === t).length})
              </button>
            ))}
          </div>
        )}

        {/* Resolving spinner */}
        {resolving && (
          <div className="flex items-center gap-2 py-2">
            <Loader2 size={14} className="text-kitan-teal animate-spin" />
            <span className="text-kitan-muted text-xs">Loading product details…</span>
          </div>
        )}

        {/* Empty state */}
        {!resolving && assigned.length === 0 && (
          <div className="card-kitan p-12 text-center space-y-3">
            <Lock size={36} className="text-kitan-subtle mx-auto" />
            <p className="text-kitan-off-white font-semibold">No products assigned yet</p>
            <p className="text-kitan-muted text-sm">The admin hasn't assigned products to this plan yet. Check back soon.</p>
          </div>
        )}

        {/* Product grid */}
        {!resolving && displayed.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {displayed.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                themeCheckColor={theme.checkColor}
                themeBadgeText={theme.badgeText}
                themeBadge={theme.badge}
                onOpen={handleOpenProduct}
              />
            ))}
          </div>
        )}
      </div>

      {/* Important notice */}
      <div className="flex items-start gap-3 p-4 rounded-2xl bg-kitan-surface border border-kitan-border">
        <Shield size={14} className="text-kitan-teal flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-kitan-off-white text-sm font-semibold mb-1">About Subscription Access</p>
          <p className="text-kitan-muted text-xs leading-relaxed">
            Clicking any product above opens it directly. Your subscription grants access for the plan duration. Direct wallet purchases and all other services remain fully available regardless of subscription status. When your plan expires, subscription access is automatically revoked.
          </p>
        </div>
      </div>

      {/* Upgrade CTA */}
      <div className="relative overflow-hidden rounded-3xl border border-kitan-border p-6 flex items-center justify-between gap-4 flex-wrap"
        style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.06) 0%, rgba(15,23,42,0) 100%)' }}>
        <div>
          <p className="font-display font-bold text-kitan-off-white text-base mb-1">Explore Other Plans</p>
          <p className="text-kitan-muted text-sm">Upgrade to unlock more products and services.</p>
        </div>
        <button onClick={() => navigate('/plans')} className="btn-primary flex items-center gap-2 flex-shrink-0">
          <Crown size={16} /> View Plans <ArrowRight size={14} />
        </button>
      </div>

      {/* History */}
      {history.length > 0 && <HistorySection history={history} />}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// History Section
// ─────────────────────────────────────────────────────────────────────────────
const HistorySection: React.FC<{ history: UserSubscription[] }> = ({ history }) => (
  <div className="space-y-3">
    <h3 className="font-display font-bold text-kitan-off-white">Subscription History</h3>
    <div className="card-kitan overflow-hidden divide-y divide-kitan-border">
      {history.map(h => (
        <div key={h.id} className="p-4 flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-kitan-off-white text-sm font-semibold">{h.plan_name}</p>
            <p className="text-kitan-subtle text-xs">
              {new Date(h.activated_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
              {' → '}
              {new Date(h.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className={cn(
              'text-xs px-2.5 py-1 rounded-full border font-semibold capitalize',
              h.status === 'active' ? 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30' :
              h.status === 'expired' ? 'bg-kitan-surface text-kitan-muted border-kitan-border' :
              'bg-red-500/10 text-red-400 border-red-500/30',
            )}>{h.status}</span>
            <span className="text-kitan-teal font-bold text-sm">{formatNGN(h.price_paid_ngn)}</span>
          </div>
        </div>
      ))}
    </div>
  </div>
);

export default MyPlanPage;
