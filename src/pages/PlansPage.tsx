/**
 * PlansPage — Choose a subscription plan.
 * Plans load dynamically from DB; features are generated from plan_products (Product Access Manager).
 * Subscriptions are purchased using wallet balance.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Crown, Star, Zap, Shield, CheckCircle, Loader2, X, AlertTriangle,
  Sparkles, ArrowRight, Clock, Package,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useWalletStore } from '@/stores/useStore';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { invalidateSubscriptionCache } from '@/hooks/useSubscriptionAccess';

interface SubscriptionPlan {
  id: string;
  name: string;
  price_ngn: number;
  duration_days: number;
  is_popular: boolean;
  enabled: boolean;
  description: string;
  color_theme: string;
  sort_order: number;
}

interface PlanProduct {
  id: string;
  plan_id: string;
  product_type: string;
  product_id: string | null;
  product_name: string;
  qty_limit: number | null;
}

interface ActiveSubscription {
  id: string;
  plan_id: string;
  plan_name: string;
  status: string;
  activated_at: string;
  expires_at: string;
}

const THEME: Record<string, {
  border: string; bg: string; badge: string; badgeText: string;
  btn: string; icon: React.ElementType; iconColor: string; checkColor: string;
  glow: string;
}> = {
  teal: {
    border: 'border-kitan-teal/40 hover:border-kitan-teal',
    bg: 'from-kitan-teal/8 to-transparent',
    badge: 'bg-kitan-teal/20 border-kitan-teal/30',
    badgeText: 'text-kitan-teal',
    btn: 'bg-kitan-teal hover:bg-kitan-teal-bright text-white',
    icon: Zap, iconColor: 'text-kitan-teal',
    checkColor: 'text-kitan-teal',
    glow: 'rgba(20,184,166,0.12)',
  },
  blue: {
    border: 'border-blue-500/40 hover:border-blue-400',
    bg: 'from-blue-500/8 to-transparent',
    badge: 'bg-blue-500/20 border-blue-500/30',
    badgeText: 'text-blue-400',
    btn: 'bg-blue-600 hover:bg-blue-500 text-white',
    icon: Shield, iconColor: 'text-blue-400',
    checkColor: 'text-blue-400',
    glow: 'rgba(59,130,246,0.12)',
  },
  purple: {
    border: 'border-purple-500/40 hover:border-purple-400',
    bg: 'from-purple-500/8 to-transparent',
    badge: 'bg-purple-500/20 border-purple-500/30',
    badgeText: 'text-purple-400',
    btn: 'bg-purple-600 hover:bg-purple-500 text-white',
    icon: Star, iconColor: 'text-purple-400',
    checkColor: 'text-purple-400',
    glow: 'rgba(168,85,247,0.12)',
  },
  gold: {
    border: 'border-amber-400/50 hover:border-amber-400',
    bg: 'from-amber-500/10 to-transparent',
    badge: 'bg-amber-500/20 border-amber-500/30',
    badgeText: 'text-amber-400',
    btn: 'bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-black font-bold',
    icon: Crown, iconColor: 'text-amber-400',
    checkColor: 'text-amber-400',
    glow: 'rgba(245,158,11,0.15)',
  },
};

function getTheme(colorTheme: string) {
  return THEME[colorTheme] ?? THEME.teal;
}

/** Build human-readable feature bullets from plan_products rows (real product names) */
function buildFeatures(products: PlanProduct[]): string[] {
  // Group by product_type for cleaner display when service-level
  const lines: string[] = [];
  const serviceLevelByType: Record<string, PlanProduct> = {};
  const realProducts: PlanProduct[] = [];

  products.forEach(p => {
    if (!p.product_id) {
      // service-level — one row per type
      if (!serviceLevelByType[p.product_type]) serviceLevelByType[p.product_type] = p;
    } else {
      realProducts.push(p);
    }
  });

  // Service-level entries
  Object.values(serviceLevelByType).forEach(p => {
    const qty = p.qty_limit === null ? 'Unlimited' : String(p.qty_limit);
    lines.push(`${p.product_name}: ${qty === 'Unlimited' ? '∞' : qty} use${p.qty_limit !== 1 ? 's' : ''}`);
  });

  // Real products — group by type
  const byType: Record<string, PlanProduct[]> = {};
  realProducts.forEach(p => {
    if (!byType[p.product_type]) byType[p.product_type] = [];
    byType[p.product_type].push(p);
  });
  Object.entries(byType).forEach(([, items]) => {
    if (items.length === 1) {
      const p = items[0];
      const qty = p.qty_limit === null ? 'Unlimited' : String(p.qty_limit);
      lines.push(`${p.product_name}${qty !== 'Unlimited' ? ` (${qty}×)` : ''}`);
    } else {
      const typeLabel = items[0].product_type.replace('_', ' ');
      lines.push(`${items.length} ${typeLabel}${items.length > 1 ? 's' : ''}`);
    }
  });

  return lines;
}

const PlansPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { wallet, loadWallet, refreshBalance } = useWalletStore();

  const [plans,         setPlans]         = useState<SubscriptionPlan[]>([]);
  const [planProducts,  setPlanProducts]  = useState<Record<string, PlanProduct[]>>({});
  const [loading,       setLoading]       = useState(true);
  const [activeSub,     setActiveSub]     = useState<ActiveSubscription | null>(null);
  const [buying,        setBuying]        = useState<string | null>(null);
  const [confirm,       setConfirm]       = useState<SubscriptionPlan | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);

    const [plansRes, ppRes] = await Promise.all([
      supabase.from('subscription_plans').select('*').eq('enabled', true).order('sort_order'),
      supabase.from('plan_products').select('*'),
    ]);

    const fetchedPlans: SubscriptionPlan[] = plansRes.data || [];
    setPlans(fetchedPlans);

    // Group plan_products by plan_id (all rows are assigned products in the new system)
    const ppMap: Record<string, PlanProduct[]> = {};
    (ppRes.data || []).forEach((row: PlanProduct) => {
      if (!ppMap[row.plan_id]) ppMap[row.plan_id] = [];
      ppMap[row.plan_id].push(row);
    });
    setPlanProducts(ppMap);

    if (user) {
      await loadWallet(user.id);
      const { data: subData } = await supabase
        .from('user_subscriptions')
        .select('*')
        .eq('app_user_id', user.id)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (subData) setActiveSub(subData);
    }

    setLoading(false);
  }, [user, loadWallet]);

  useEffect(() => { loadData(); }, [loadData]);

  const handlePurchase = async (plan: SubscriptionPlan) => {
    if (!user) { navigate('/login'); return; }
    const balance = wallet?.balance ?? 0;
    if (balance < plan.price_ngn) {
      toast.error(`Insufficient balance — need ${formatNGN(plan.price_ngn)}, have ${formatNGN(balance)}`);
      navigate(`/wallet?need=${plan.price_ngn}`);
      return;
    }
    setConfirm(plan);
  };

  const confirmPurchase = async () => {
    if (!confirm || !user) return;
    setBuying(confirm.id);
    setConfirm(null);

    try {
      const balance    = wallet?.balance ?? 0;
      const newBalance = balance - confirm.price_ngn;

      // 1. Deduct wallet
      const { error: walletErr } = await supabase
        .from('wallets')
        .update({ balance: newBalance, updated_at: new Date().toISOString() })
        .eq('app_user_id', user.id);
      if (walletErr) throw new Error(walletErr.message);

      // 2. Log wallet transaction
      const txId = `wt_sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await supabase.from('wallet_transactions').insert({
        id: txId, app_user_id: user.id, type: 'deduction',
        amount: confirm.price_ngn, balance_after: newBalance,
        description: `Subscription — ${confirm.name} Plan (${confirm.duration_days} days)`,
        reference: txId, status: 'completed',
      });

      // 3. Expire any existing active subscriptions
      await supabase
        .from('user_subscriptions')
        .update({ status: 'expired' })
        .eq('app_user_id', user.id)
        .eq('status', 'active');

      // 4. Build plan snapshot (includes real plan_products for the subscription record)
      const includedProducts = planProducts[confirm.id] ?? [];
      const planSnapshot = {
        ...confirm,
        assigned_products: includedProducts,
      };

      // 5. Create new subscription
      const subId      = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const activatedAt = new Date();
      const expiresAt   = new Date(activatedAt.getTime() + confirm.duration_days * 24 * 60 * 60 * 1000);

      const { error: subErr } = await supabase.from('user_subscriptions').insert({
        id:             subId,
        app_user_id:    user.id,
        plan_id:        confirm.id,
        plan_name:      confirm.name,
        plan_snapshot:  planSnapshot,
        price_paid_ngn: confirm.price_ngn,
        status:         'active',
        activated_at:   activatedAt.toISOString(),
        expires_at:     expiresAt.toISOString(),
      });
      if (subErr) throw new Error(subErr.message);

      // 6. Invalidate subscription access cache
      invalidateSubscriptionCache(user.id);

      await refreshBalance(user.id);
      toast.success(`${confirm.name} Plan activated! Valid for ${confirm.duration_days} days.`);
      navigate('/my-plan');
    } catch (e) {
      toast.error(`Purchase failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBuying(null);
    }
  };

  return (
    <div className="space-y-10 pb-10">

      {/* Header */}
      <div className="text-center space-y-3 pt-4">
        <div className="badge-teal inline-flex items-center gap-2 mx-auto">
          <Sparkles size={12} /> Subscription Plans
        </div>
        <h1 className="font-display text-3xl md:text-4xl font-bold text-kitan-off-white">
          Choose Your Plan
        </h1>
        <p className="text-kitan-muted max-w-xl mx-auto leading-relaxed">
          Unlock selected services for the plan period. Direct wallet purchases remain available for everything else.
        </p>
        {user && wallet && (
          <div className="inline-flex items-center gap-2 bg-kitan-surface border border-kitan-border rounded-xl px-4 py-2 mx-auto">
            <Zap size={14} className="text-kitan-teal" />
            <span className="text-sm text-kitan-off-white">
              Wallet Balance: <span className="text-kitan-teal font-bold">{formatNGN(wallet.balance)}</span>
            </span>
          </div>
        )}
      </div>

      {/* Current plan banner */}
      {activeSub && (
        <div className="p-5 rounded-3xl border border-kitan-teal/30 flex items-center justify-between gap-4 flex-wrap"
          style={{ background: 'rgba(20,184,166,0.06)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-kitan-teal/15 border border-kitan-teal/30 flex items-center justify-center">
              <CheckCircle size={18} className="text-kitan-teal" />
            </div>
            <div>
              <p className="text-kitan-teal font-semibold text-sm">Active Plan: {activeSub.plan_name}</p>
              <p className="text-kitan-subtle text-xs">
                Expires {new Date(activeSub.expires_at).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
            </div>
          </div>
          <button onClick={() => navigate('/my-plan')} className="btn-secondary text-sm flex items-center gap-1.5">
            View Plan <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* Plans grid */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card-kitan p-6 animate-pulse space-y-4">
              <div className="h-8 bg-kitan-border/20 rounded w-1/2" />
              <div className="h-10 bg-kitan-border/20 rounded w-2/3" />
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="h-3 bg-kitan-border/15 rounded" />
              ))}
              <div className="h-10 bg-kitan-border/20 rounded-xl" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {plans.map(plan => {
            const theme     = getTheme(plan.color_theme);
            const Icon      = theme.icon;
            const isActive  = activeSub?.plan_id === plan.id;
            const canAfford = (wallet?.balance ?? 0) >= plan.price_ngn;
            const features  = buildFeatures(planProducts[plan.id] ?? []);

            return (
              <div
                key={plan.id}
                className={cn(
                  'relative flex flex-col rounded-3xl border p-6 transition-all',
                  `bg-gradient-to-b ${theme.bg}`,
                  theme.border,
                  plan.is_popular && 'scale-[1.02] shadow-2xl',
                )}
                style={{ boxShadow: plan.is_popular ? `0 8px 40px 0 ${theme.glow}` : undefined }}
              >
                {plan.is_popular && (
                  <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 whitespace-nowrap">
                    <span className={cn('inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold border', theme.badge, theme.badgeText)}>
                      <Star size={11} fill="currentColor" /> Most Popular
                    </span>
                  </div>
                )}

                <div className={cn('w-11 h-11 rounded-2xl border flex items-center justify-center mb-4', theme.badge)}>
                  <Icon size={22} className={theme.iconColor} />
                </div>

                <h3 className="font-display font-bold text-kitan-off-white text-xl mb-1">{plan.name}</h3>
                <p className="text-kitan-muted text-xs mb-4 leading-relaxed">{plan.description}</p>

                <div className="mb-5">
                  <p className={cn('font-display font-bold text-3xl', theme.badgeText)}>{formatNGN(plan.price_ngn)}</p>
                  <p className="text-kitan-subtle text-xs mt-0.5 flex items-center gap-1">
                    <Clock size={11} /> {plan.duration_days} days access
                  </p>
                </div>

                {/* Dynamic features from plan_products */}
                <div className="flex-1 mb-6">
                  {features.length > 0 ? (
                    <ul className="space-y-2">
                      {features.map((f, i) => (
                        <li key={i} className="flex items-start gap-2 text-sm">
                          <CheckCircle size={14} className={cn('flex-shrink-0 mt-0.5', theme.checkColor)} />
                          <span className="text-kitan-muted leading-snug">{f}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div className="flex items-center gap-2 text-kitan-subtle text-xs py-2">
                      <Package size={12} />
                      <span>No products assigned yet</span>
                    </div>
                  )}
                </div>

                {isActive ? (
                  <div className={cn('text-center py-3 rounded-2xl text-sm font-bold border', theme.badge, theme.badgeText)}>
                    <CheckCircle size={14} className="inline mr-1.5" />
                    Active Plan
                  </div>
                ) : (
                  <button
                    onClick={() => handlePurchase(plan)}
                    disabled={!!buying}
                    className={cn(
                      'w-full py-3 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2',
                      theme.btn, 'disabled:opacity-50 disabled:cursor-not-allowed',
                    )}
                  >
                    {buying === plan.id
                      ? <><Loader2 size={14} className="animate-spin" /> Processing…</>
                      : !canAfford && user
                      ? <><AlertTriangle size={14} /> Top Up & Subscribe</>
                      : 'Get Started'}
                  </button>
                )}

                {!canAfford && user && !isActive && (
                  <p className="text-xs text-kitan-subtle text-center mt-2">
                    Need {formatNGN(plan.price_ngn - (wallet?.balance ?? 0))} more
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom notice */}
      <div className="card-kitan p-5 flex items-start gap-3">
        <Shield size={16} className="text-kitan-teal flex-shrink-0 mt-0.5" />
        <div>
          <p className="text-kitan-off-white text-sm font-semibold mb-1">About Subscriptions</p>
          <p className="text-kitan-muted text-xs leading-relaxed">
            Subscriptions unlock selected products for the plan duration. All existing wallet purchases, direct product buys, and orders continue working exactly as normal — subscriptions are an additional access layer, not a replacement. Purchasing a new plan while one is active will replace the current plan.
          </p>
        </div>
      </div>

      {/* Confirm modal */}
      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}
          onClick={() => setConfirm(null)}>
          <div
            className="relative bg-kitan-surface rounded-3xl border border-kitan-border p-6 w-full max-w-sm shadow-2xl"
            onClick={e => e.stopPropagation()}
          >
            <button onClick={() => setConfirm(null)} className="absolute top-4 right-4 text-kitan-subtle hover:text-kitan-off-white">
              <X size={18} />
            </button>
            <div className={cn('w-12 h-12 rounded-2xl border flex items-center justify-center mb-4', THEME[confirm.color_theme]?.badge)}>
              {React.createElement(THEME[confirm.color_theme]?.icon ?? Zap, { size: 22, className: THEME[confirm.color_theme]?.iconColor })}
            </div>
            <h3 className="font-display font-bold text-kitan-off-white text-xl mb-1">Confirm Purchase</h3>
            <p className="text-kitan-muted text-sm mb-5 leading-relaxed">
              Subscribe to <strong className="text-kitan-off-white">{confirm.name}</strong> for <strong className={THEME[confirm.color_theme]?.badgeText}>{formatNGN(confirm.price_ngn)}</strong> ({confirm.duration_days} days)?
            </p>

            {/* Included products summary — real products */}
            {(planProducts[confirm.id] ?? []).length > 0 && (
              <div className="mb-5 p-3 rounded-2xl bg-kitan-bg border border-kitan-border space-y-1.5">
                <p className="text-kitan-subtle text-xs font-semibold uppercase tracking-wide mb-2">Included in this plan</p>
                {(planProducts[confirm.id] ?? []).slice(0, 6).map(p => (
                  <div key={p.id} className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-1.5">
                      <CheckCircle size={11} className={THEME[confirm.color_theme]?.checkColor} />
                      <span className="text-kitan-muted truncate max-w-[160px]">{p.product_name}</span>
                    </div>
                    <span className={cn('font-semibold flex-shrink-0', THEME[confirm.color_theme]?.badgeText)}>
                      {p.qty_limit === null ? '∞' : `${p.qty_limit}×`}
                    </span>
                  </div>
                ))}
                {(planProducts[confirm.id] ?? []).length > 6 && (
                  <p className="text-kitan-subtle text-[10px] pt-1">+{(planProducts[confirm.id] ?? []).length - 6} more products…</p>
                )}
              </div>
            )}

            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-kitan-muted">Plan</span>
                <span className="text-kitan-off-white font-medium">{confirm.name}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-kitan-muted">Duration</span>
                <span className="text-kitan-off-white font-medium">{confirm.duration_days} days</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-kitan-muted">Amount</span>
                <span className={cn('font-bold', THEME[confirm.color_theme]?.badgeText)}>{formatNGN(confirm.price_ngn)}</span>
              </div>
              <div className="flex justify-between text-sm border-t border-kitan-border pt-3">
                <span className="text-kitan-muted">Balance after</span>
                <span className="text-kitan-off-white font-medium">{formatNGN((wallet?.balance ?? 0) - confirm.price_ngn)}</span>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={confirmPurchase} className={cn('flex-1 py-3 rounded-2xl text-sm font-bold', THEME[confirm.color_theme]?.btn)}>
                Confirm & Subscribe
              </button>
              <button onClick={() => setConfirm(null)} className="btn-secondary flex-1 text-sm">Cancel</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default PlansPage;
