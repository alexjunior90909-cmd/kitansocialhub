/**
 * AccountBoostingPage — Professional account growth services.
 *
 * Flow:
 * 1. Load categories from DB (server-side, all categories dynamic)
 * 2. User selects category → services load for that category
 * 3. User selects service → description, min/max, NGN price preview shown
 * 4. User enters target link + quantity → live NGN cost calculated (USD × rate × multiplier)
 * 5. Place Order: wallet check → atomic deduct → provider submission → confirmation
 * 6. My Orders tab: history with live status polling
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  TrendingUp, ChevronDown, Loader2, AlertTriangle, CheckCircle,
  Clock, XCircle, Info, Zap, ArrowLeft, Search, RefreshCw,
  History, Package, ExternalLink, Shield, AlertCircle,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useWalletStore } from '@/stores/useStore';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import WatchVideoButton from '@/components/features/WatchVideoButton';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface BoostService {
  id: string;
  category_name: string;
  service_name: string;
  original_api_price: number; // USD per 1000 units
  custom_admin_price: number | null; // USD per 1000 units override
  min_quantity: number;
  max_quantity: number;
  description: string;
  active: boolean;
}

interface BoostOrder {
  id: string;
  app_user_id: string;
  service_id: string;
  service_name: string;
  category_name: string;
  target_link: string;
  quantity: number;
  cost_ngn: number;
  cost_per_1k_ngn: number;
  jap_order_id: string | null;
  status: string;
  jap_status: string | null;
  start_count: number | null;
  remains: number | null;
  error_message: string | null;
  created_at: string;
}

interface PricingConfig {
  globalMultiplier: number;
  exchangeRate: number;
  serviceCount: number;
  lastSync: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Edge Function proxy
// ─────────────────────────────────────────────────────────────────────────────
async function boostCall<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('jap', { body: payload });
  if (error) {
    let msg = error.message;
    if (error instanceof FunctionsHttpError) {
      try {
        const status = error.context?.status ?? 500;
        const text   = await error.context?.text();
        msg = `[${status}] ${text || error.message}`;
      } catch { /* ignore */ }
    }
    throw new Error(msg);
  }
  return data as T;
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge
// ─────────────────────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending:         { label: 'Pending',        color: 'bg-amber-500/10 text-amber-400 border-amber-400/30',     icon: <Clock size={11} /> },
    processing:      { label: 'Processing',     color: 'bg-blue-500/10 text-blue-400 border-blue-400/30',        icon: <Loader2 size={11} className="animate-spin" /> },
    completed:       { label: 'Completed',      color: 'bg-green-500/10 text-green-400 border-green-500/30',     icon: <CheckCircle size={11} /> },
    partial:         { label: 'Partial',        color: 'bg-purple-500/10 text-purple-400 border-purple-500/30',  icon: <AlertCircle size={11} /> },
    cancelled:       { label: 'Cancelled',      color: 'bg-red-500/10 text-red-400 border-red-500/30',           icon: <XCircle size={11} /> },
    awaiting_review: { label: 'Under Review',   color: 'bg-orange-500/10 text-orange-400 border-orange-500/30', icon: <AlertTriangle size={11} /> },
    'in progress':   { label: 'In Progress',    color: 'bg-blue-500/10 text-blue-400 border-blue-400/30',        icon: <Loader2 size={11} className="animate-spin" /> },
  };
  const m = map[status?.toLowerCase()] ?? map.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap', m.color)}>
      {m.icon} {m.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const AccountBoostingPage: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { wallet, loadWallet, refreshBalance } = useWalletStore();

  // ── Tab ────────────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'order' | 'history'>('order');

  // ── Catalogue ─────────────────────────────────────────────────────────────
  const [categories,   setCategories]   = useState<string[]>([]);
  const [services,     setServices]     = useState<BoostService[]>([]);
  const [catLoading,   setCatLoading]   = useState(false);
  const [svcLoading,   setSvcLoading]   = useState(false);
  const [syncLoading,  setSyncLoading]  = useState(false);
  const [syncProgress, setSyncProgress] = useState('');

  // ── Pricing config ─────────────────────────────────────────────────────────
  const [config, setConfig] = useState<PricingConfig>({
    globalMultiplier: 1,
    exchangeRate: 1450,
    serviceCount: 0,
    lastSync: null,
  });

  // ── Selection ─────────────────────────────────────────────────────────────
  const [selCategory,   setSelCategory]   = useState('');
  const [selServiceId,  setSelServiceId]  = useState('');
  const [targetLink,    setTargetLink]    = useState('');
  const [quantity,      setQuantity]      = useState('');
  const [serviceSearch, setServiceSearch] = useState('');

  // ── Price calculation ──────────────────────────────────────────────────────
  const [priceLoading, setPriceLoading] = useState(false);
  const [costNGN,      setCostNGN]      = useState<number | null>(null);
  const [perUnitNGN,   setPerUnitNGN]   = useState<number | null>(null);

  // ── Order placement ────────────────────────────────────────────────────────
  const [placing, setPlacing] = useState(false);

  // ── Order history ─────────────────────────────────────────────────────────
  const [orders,        setOrders]        = useState<BoostOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Mount
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (user) loadWallet(user.id);
    loadCategories();
    loadConfig();
  }, [user]);

  useEffect(() => {
    return () => { if (pollTimerRef.current) clearInterval(pollTimerRef.current); };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Load pricing config (multiplier, exchange rate, service count)
  // ─────────────────────────────────────────────────────────────────────────
  async function loadConfig() {
    try {
      const res = await boostCall<PricingConfig>({ action: 'getConfig' });
      setConfig(res);
    } catch (e) {
      console.error('loadConfig:', e);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Load all categories dynamically from database
  // ─────────────────────────────────────────────────────────────────────────
  async function loadCategories() {
    setCatLoading(true);
    try {
      const res = await boostCall<{ categories: string[] }>({ action: 'getCategories' });
      setCategories(res.categories || []);
    } catch (e) {
      console.error('loadCategories:', e);
    } finally {
      setCatLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Load services when category changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!selCategory) { setServices([]); setSelServiceId(''); return; }
    setSvcLoading(true);
    setSelServiceId('');
    setCostNGN(null);
    setPerUnitNGN(null);
    boostCall<{ services: BoostService[] }>({ action: 'getServices', category: selCategory })
      .then(res => setServices(res.services || []))
      .catch(e => toast.error(`Failed to load services: ${e instanceof Error ? e.message : String(e)}`))
      .finally(() => setSvcLoading(false));
  }, [selCategory]);

  // ─────────────────────────────────────────────────────────────────────────
  // Recalculate NGN price when service/quantity changes
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    const qty = parseInt(quantity, 10);
    if (!selServiceId || !qty || qty <= 0) { setCostNGN(null); setPerUnitNGN(null); return; }

    setPriceLoading(true);
    boostCall<{ costNGN: number; perUnitNGN: number; globalMultiplier: number; exchangeRate: number }>({
      action:    'calcPrice',
      serviceId: selServiceId,
      quantity:  qty,
    })
      .then(res => {
        setCostNGN(res.costNGN);
        setPerUnitNGN(res.perUnitNGN);
        // Update config with latest rates from server
        setConfig(prev => ({
          ...prev,
          globalMultiplier: res.globalMultiplier,
          exchangeRate:     res.exchangeRate,
        }));
      })
      .catch(() => { setCostNGN(null); setPerUnitNGN(null); })
      .finally(() => setPriceLoading(false));
  }, [selServiceId, quantity]);

  // ─────────────────────────────────────────────────────────────────────────
  // Sync all services from provider
  // ─────────────────────────────────────────────────────────────────────────
  async function handleSyncServices() {
    setSyncLoading(true);
    setSyncProgress('Connecting to delivery network…');
    try {
      setSyncProgress('Fetching service catalog…');
      const res = await boostCall<{
        success: boolean;
        total: number;
        inserted: number;
        failed: number;
        syncDuration: string;
        message: string;
      }>({ action: 'syncServices' });

      setSyncProgress('');
      toast.success(`Catalog updated — ${res.total.toLocaleString()} services synced (${res.syncDuration})`);
      await Promise.all([loadCategories(), loadConfig()]);
    } catch (e) {
      setSyncProgress('');
      toast.error(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Place order
  // ─────────────────────────────────────────────────────────────────────────
  const handlePlaceOrder = useCallback(async () => {
    if (!user) { navigate('/login'); return; }

    const qty = parseInt(quantity, 10);
    if (!selServiceId || !targetLink.trim() || !qty) {
      toast.error('Please fill in all required fields');
      return;
    }

    const balance = wallet?.balance ?? 0;
    if (costNGN && balance < costNGN) {
      toast.error(`Insufficient balance — need ${formatNGN(costNGN)}, have ${formatNGN(balance)}`);
      navigate(`/wallet?need=${Math.ceil(costNGN)}`);
      return;
    }

    setPlacing(true);
    try {
      const res = await boostCall<{
        success: boolean;
        orderId: string;
        providerOrderId?: string;
        status: string;
        costNGN: number;
        newBalance: number;
        message?: string;
      }>({
        action:     'placeOrder',
        serviceId:  selServiceId,
        targetLink: targetLink.trim(),
        quantity:   qty,
        appUserId:  user.id,
      });

      await refreshBalance(user.id);

      if (res.status === 'awaiting_review') {
        toast.error('Order submitted and is under review. Our team will process it shortly.');
      } else {
        toast.success(`Order placed successfully! ${formatNGN(res.costNGN)} deducted from wallet.`);
      }

      // Reset form and go to history
      setTargetLink('');
      setQuantity('');
      setSelServiceId('');
      setSelCategory('');
      setCostNGN(null);
      setPerUnitNGN(null);
      setTab('history');
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('INSUFFICIENT_BALANCE')) {
        toast.error('Insufficient wallet balance.');
        navigate(`/wallet?need=${Math.ceil(costNGN ?? 0)}`);
      } else {
        toast.error(msg);
      }
    } finally {
      setPlacing(false);
    }
  }, [user, wallet, selServiceId, targetLink, quantity, costNGN, navigate]);

  // ─────────────────────────────────────────────────────────────────────────
  // Load order history
  // ─────────────────────────────────────────────────────────────────────────
  const loadOrders = useCallback(async () => {
    if (!user) return;
    setOrdersLoading(true);
    try {
      const res = await boostCall<{ orders: BoostOrder[] }>({ action: 'getUserOrders', appUserId: user.id });
      setOrders(res.orders || []);
    } catch (e) {
      console.error('loadOrders:', e);
    } finally {
      setOrdersLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (tab === 'history') loadOrders();
  }, [tab, loadOrders]);

  // ─────────────────────────────────────────────────────────────────────────
  // Poll a single order's status
  // ─────────────────────────────────────────────────────────────────────────
  async function pollOrderStatus(orderId: string) {
    try {
      const res = await boostCall<{ status: string; startCount: number | null; remains: number | null }>({
        action:  'getOrderStatus',
        orderId,
      });
      setOrders(prev => prev.map(o =>
        o.id === orderId
          ? { ...o, status: res.status, start_count: res.startCount, remains: res.remains }
          : o,
      ));
    } catch { /* ignore transient poll errors */ }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived values
  // ─────────────────────────────────────────────────────────────────────────
  const selectedService = useMemo(() =>
    services.find(s => s.id === selServiceId) ?? null,
    [services, selServiceId],
  );

  const filteredServices = useMemo(() =>
    services.filter(s => !serviceSearch || s.service_name.toLowerCase().includes(serviceSearch.toLowerCase())),
    [services, serviceSearch],
  );

  const qty        = parseInt(quantity, 10);
  const isQtyValid = !!selectedService && qty >= selectedService.min_quantity && qty <= selectedService.max_quantity;
  const canAfford  = !costNGN || !wallet || wallet.balance >= costNGN;
  const canOrder   = !!selServiceId && !!targetLink.trim() && isQtyValid && canAfford && !placing;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">

      {/* Tutorial Video */}
      <WatchVideoButton serviceKey="account_boosting" />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-kitan-border p-8"
        style={{
          background:          'rgba(255,255,255,0.03)',
          backdropFilter:      'blur(12px)',
          WebkitBackdropFilter:'blur(12px)',
          boxShadow:           '0 8px 32px 0 rgba(0,0,0,0.37)',
        }}>
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-60px] right-[-60px] w-[300px] h-[300px] rounded-full bg-kitan-teal/8 blur-3xl" />
          <div className="absolute bottom-[-40px] left-[-40px] w-[200px] h-[200px] rounded-full bg-blue-500/5 blur-3xl" />
        </div>
        <div className="relative z-10">
          <div className="badge-teal inline-flex items-center gap-2 mb-4">
            <TrendingUp size={12} /> Account Boosting
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-kitan-off-white mb-3">
            Boost Your <span className="gradient-text">Social Accounts</span>
          </h1>
          <p className="text-kitan-muted max-w-xl leading-relaxed mb-4">
            Professional account growth services with secure automated processing, instant delivery and wallet-based checkout.
          </p>
          <div className="flex flex-wrap gap-3 items-center">
            {user && wallet && (
              <div className="inline-flex items-center gap-2 bg-kitan-teal/10 border border-kitan-teal/20 rounded-xl px-4 py-2">
                <Zap size={14} className="text-kitan-teal" />
                <span className="text-sm text-kitan-off-white">
                  Balance: <span className="text-kitan-teal font-bold">{formatNGN(wallet.balance)}</span>
                </span>
              </div>
            )}
            {config.serviceCount > 0 && (
              <div className="inline-flex items-center gap-2 bg-kitan-surface border border-kitan-border rounded-xl px-4 py-2">
                <Package size={14} className="text-kitan-subtle" />
                <span className="text-kitan-muted text-sm">
                  {config.serviceCount.toLocaleString()} services · {categories.length} categories
                </span>
              </div>
            )}
            {config.serviceCount === 0 && !catLoading && (
              <button
                onClick={handleSyncServices}
                disabled={syncLoading}
                className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-2 text-amber-400 text-sm font-semibold hover:bg-amber-500/15 transition-colors"
              >
                {syncLoading
                  ? <><Loader2 size={13} className="animate-spin" /> {syncProgress || 'Syncing…'}</>
                  : <><RefreshCw size={13} /> Load Services Catalog</>}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-kitan-border">
        {(['order', 'history'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-5 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px',
              tab === t ? 'border-kitan-teal text-kitan-teal' : 'border-transparent text-kitan-muted hover:text-kitan-off-white',
            )}
          >
            {t === 'order' ? 'New Order' : 'My Orders'}
          </button>
        ))}
      </div>

      {/* ═══════════════════════ ORDER TAB ══════════════════════════════════ */}
      {tab === 'order' && (
        <div className="space-y-5">

          {/* No services loaded */}
          {config.serviceCount === 0 && !catLoading && (
            <div
              className="p-6 rounded-3xl border border-amber-500/30 space-y-4"
              style={{ background: 'rgba(245,158,11,0.05)', backdropFilter: 'blur(12px)' }}
            >
              <div className="flex items-start gap-3">
                <AlertCircle size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-amber-300 font-semibold text-sm">Service catalog not loaded yet</p>
                  <p className="text-amber-400/70 text-xs mt-0.5 leading-relaxed">
                    Click below to load the full service catalog. This syncs all available services and categories from our delivery network.
                  </p>
                </div>
              </div>
              <button
                onClick={handleSyncServices}
                disabled={syncLoading}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {syncLoading
                  ? <><Loader2 size={15} className="animate-spin" /> {syncProgress || 'Loading catalog…'}</>
                  : <><RefreshCw size={15} /> Load Service Catalog</>}
              </button>
            </div>
          )}

          {/* Order form */}
          {config.serviceCount > 0 && (
            <div
              className="rounded-3xl border border-kitan-border p-6 space-y-5"
              style={{
                background:          'rgba(255,255,255,0.04)',
                backdropFilter:      'blur(12px)',
                WebkitBackdropFilter:'blur(12px)',
                boxShadow:           '0 8px 32px 0 rgba(0,0,0,0.37)',
              }}
            >
              <h2 className="font-display font-bold text-kitan-off-white text-base flex items-center gap-2">
                <TrendingUp size={16} className="text-kitan-teal" /> Configure Your Order
              </h2>

              {/* Step 1: Category */}
              <div className="space-y-2">
                <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">
                  1. Select Category
                </label>
                {catLoading ? (
                  <div className="flex items-center gap-2 text-kitan-muted text-sm">
                    <Loader2 size={14} className="animate-spin" /> Loading categories…
                  </div>
                ) : (
                  <div className="relative">
                    <select
                      value={selCategory}
                      onChange={e => setSelCategory(e.target.value)}
                      className="input-kitan text-sm pr-8 appearance-none cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                      <option value="">— Choose a category ({categories.length} available) —</option>
                      {categories.map(cat => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" />
                  </div>
                )}
              </div>

              {/* Step 2: Service */}
              {selCategory && (
                <div className="space-y-2 animate-fade-in">
                  <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">
                    2. Select Service
                  </label>
                  <div className="relative">
                    <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search services…"
                      value={serviceSearch}
                      onChange={e => setServiceSearch(e.target.value)}
                      className="input-kitan pl-8 text-sm"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>
                  {svcLoading ? (
                    <div className="flex items-center gap-2 text-kitan-muted text-sm">
                      <Loader2 size={14} className="animate-spin" /> Loading services…
                    </div>
                  ) : (
                    <select
                      value={selServiceId}
                      onChange={e => setSelServiceId(e.target.value)}
                      className="input-kitan text-sm cursor-pointer"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                      size={Math.min(filteredServices.length + 1, 8)}
                    >
                      <option value="">— Choose a service ({filteredServices.length}) —</option>
                      {filteredServices.map(s => (
                        <option key={s.id} value={s.id}>
                          #{s.id} — {s.service_name}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              )}

              {/* Service details panel */}
              {selectedService && (
                <div
                  className="rounded-2xl border border-kitan-teal/20 p-4 space-y-3 animate-fade-in"
                  style={{ background: 'rgba(20,184,166,0.05)', backdropFilter: 'blur(8px)' }}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="font-semibold text-kitan-off-white text-sm">#{selectedService.id} — {selectedService.service_name}</p>
                      <p className="text-kitan-subtle text-xs mt-0.5">{selectedService.category_name}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      {perUnitNGN !== null ? (
                        <>
                          <p className="text-kitan-teal font-bold text-sm">
                            {formatNGN(perUnitNGN)}
                            <span className="text-kitan-subtle font-normal text-xs"> / unit</span>
                          </p>
                          <p className="text-kitan-subtle text-xs">×{config.globalMultiplier} rate · ₦{config.exchangeRate.toLocaleString()}/USD</p>
                        </>
                      ) : (
                        <p className="text-kitan-subtle text-xs">Enter quantity to see price</p>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-kitan-bg rounded-lg px-3 py-2 border border-kitan-border">
                      <span className="text-kitan-subtle">Min:</span>
                      <span className="text-kitan-off-white font-semibold ml-1.5">{selectedService.min_quantity.toLocaleString()}</span>
                    </div>
                    <div className="bg-kitan-bg rounded-lg px-3 py-2 border border-kitan-border">
                      <span className="text-kitan-subtle">Max:</span>
                      <span className="text-kitan-off-white font-semibold ml-1.5">{selectedService.max_quantity.toLocaleString()}</span>
                    </div>
                  </div>
                  {selectedService.description && (
                    <div className="flex items-start gap-2 text-xs text-kitan-muted">
                      <Info size={11} className="text-kitan-subtle flex-shrink-0 mt-0.5" />
                      <p className="leading-relaxed">{selectedService.description}</p>
                    </div>
                  )}
                </div>
              )}

              {/* Step 3: Target link */}
              {selServiceId && (
                <div className="space-y-2 animate-fade-in">
                  <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">
                    3. Target Link / Username
                  </label>
                  <div className="relative">
                    <ExternalLink size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" />
                    <input
                      type="text"
                      placeholder="https://instagram.com/username  or  @username"
                      value={targetLink}
                      onChange={e => setTargetLink(e.target.value)}
                      className="input-kitan pl-8 text-sm"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>
                </div>
              )}

              {/* Step 4: Quantity */}
              {selServiceId && (
                <div className="space-y-2 animate-fade-in">
                  <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">
                    4. Quantity
                    {selectedService && (
                      <span className="text-kitan-subtle font-normal ml-1">
                        ({selectedService.min_quantity.toLocaleString()} – {selectedService.max_quantity.toLocaleString()})
                      </span>
                    )}
                  </label>
                  <input
                    type="number"
                    min={selectedService?.min_quantity ?? 1}
                    max={selectedService?.max_quantity ?? 100000}
                    step="100"
                    placeholder={`e.g. ${selectedService?.min_quantity ?? 100}`}
                    value={quantity}
                    onChange={e => setQuantity(e.target.value)}
                    className="input-kitan text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  {quantity && selectedService && !isQtyValid && (
                    <p className="text-red-400 text-xs flex items-center gap-1">
                      <AlertTriangle size={11} />
                      Quantity must be {selectedService.min_quantity.toLocaleString()}–{selectedService.max_quantity.toLocaleString()}
                    </p>
                  )}
                </div>
              )}

              {/* Price display */}
              {selServiceId && isQtyValid && (
                <div
                  className="rounded-2xl border border-kitan-border p-4 animate-fade-in"
                  style={{ background: 'rgba(255,255,255,0.03)', backdropFilter: 'blur(8px)' }}
                >
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <p className="text-kitan-subtle text-xs mb-1">Total Cost (NGN)</p>
                      {priceLoading ? (
                        <div className="flex items-center gap-2">
                          <Loader2 size={14} className="text-kitan-teal animate-spin" />
                          <span className="text-kitan-muted text-sm">Calculating…</span>
                        </div>
                      ) : costNGN !== null ? (
                        <p className="font-display font-bold text-kitan-teal text-3xl">{formatNGN(costNGN)}</p>
                      ) : <span className="text-kitan-subtle text-sm">—</span>}
                      {costNGN !== null && perUnitNGN !== null && (
                        <p className="text-kitan-subtle text-xs mt-0.5">
                          {formatNGN(perUnitNGN)} × {qty.toLocaleString()} units
                        </p>
                      )}
                    </div>
                    {wallet && costNGN !== null && wallet.balance >= costNGN && (
                      <div className="text-right">
                        <p className="text-kitan-subtle text-xs">Balance after order</p>
                        <p className="text-kitan-off-white font-semibold text-sm">{formatNGN(wallet.balance - costNGN)}</p>
                      </div>
                    )}
                  </div>

                  {/* Insufficient balance warning */}
                  {wallet && costNGN !== null && wallet.balance < costNGN && (
                    <div className="flex items-center gap-3 mt-3 p-3 rounded-xl bg-red-500/5 border border-red-500/20">
                      <AlertTriangle size={14} className="text-red-400 flex-shrink-0" />
                      <p className="text-red-300 text-xs flex-1">
                        Need <strong>{formatNGN(costNGN - wallet.balance)}</strong> more in your wallet.
                      </p>
                      <button
                        onClick={() => navigate(`/wallet?need=${Math.ceil(costNGN)}`)}
                        className="text-red-300 text-xs font-semibold underline hover:no-underline"
                      >
                        Top Up
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Place Order CTA */}
              <button
                onClick={handlePlaceOrder}
                disabled={!canOrder || priceLoading}
                className="btn-primary w-full py-4 flex items-center justify-center gap-2 text-base font-bold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {placing
                  ? <><Loader2 size={18} className="animate-spin" /> Placing Order…</>
                  : <><Zap size={18} /> Place Order{costNGN ? ` — ${formatNGN(costNGN)}` : ''}</>}
              </button>

              {/* Info */}
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-kitan-surface border border-kitan-border">
                <Shield size={13} className="text-kitan-teal flex-shrink-0 mt-0.5" />
                <p className="text-kitan-subtle text-xs leading-relaxed">
                  Payment is deducted from your wallet when you place the order. Orders are processed automatically
                  through our secure delivery network. If an order cannot be completed automatically, it will be reviewed by our support team.
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ HISTORY TAB ════════════════════════════════ */}
      {tab === 'history' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-kitan-muted text-sm">{orders.length} order{orders.length !== 1 ? 's' : ''}</p>
            <button
              onClick={loadOrders}
              disabled={ordersLoading}
              className="flex items-center gap-1.5 text-xs text-kitan-muted hover:text-kitan-off-white transition-colors"
            >
              <RefreshCw size={12} className={ordersLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>

          {ordersLoading && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-kitan p-5 animate-pulse flex gap-4">
              <div className="flex-1 space-y-2">
                <div className="h-4 bg-kitan-border/30 rounded w-2/5" />
                <div className="h-3 bg-kitan-border/20 rounded w-3/5" />
              </div>
              <div className="w-20 h-7 bg-kitan-border/20 rounded" />
            </div>
          ))}

          {!ordersLoading && orders.length === 0 && (
            <div className="card-kitan p-16 text-center">
              <History size={40} className="text-kitan-subtle mx-auto mb-3" />
              <p className="text-kitan-off-white font-semibold">No orders yet</p>
              <p className="text-kitan-muted text-sm mt-1">Your boosting orders will appear here after you place them.</p>
              <button onClick={() => setTab('order')} className="btn-primary mt-4 text-sm">Place an Order</button>
            </div>
          )}

          {!ordersLoading && orders.map(order => {
            const isActive = order.status === 'pending' || order.status === 'processing' || order.status === 'in progress';
            return (
              <div
                key={order.id}
                className={cn(
                  'rounded-3xl border p-5 space-y-3 transition-all',
                  isActive
                    ? 'border-kitan-teal/25 bg-kitan-teal/3'
                    : order.status === 'awaiting_review'
                    ? 'border-orange-500/25 bg-orange-500/3'
                    : 'border-kitan-border',
                )}
                style={{ backdropFilter: 'blur(12px)', background: 'rgba(255,255,255,0.03)' }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-kitan-off-white text-sm">{order.service_name}</p>
                    <p className="text-kitan-subtle text-xs mt-0.5">{order.category_name}</p>
                    <p className="text-kitan-subtle text-xs mt-0.5 font-mono break-all">{order.target_link}</p>
                    <p className="text-kitan-subtle text-xs mt-1">
                      {new Date(order.created_at).toLocaleString('en-NG', {
                        day: '2-digit', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-2">
                    <StatusBadge status={order.status} />
                    <p className="text-kitan-teal font-display font-bold text-sm">{formatNGN(order.cost_ngn)}</p>
                  </div>
                </div>

                {/* Order metrics */}
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div className="bg-kitan-bg rounded-lg px-3 py-2 border border-kitan-border text-center">
                    <p className="text-kitan-subtle">Quantity</p>
                    <p className="text-kitan-off-white font-semibold">{order.quantity.toLocaleString()}</p>
                  </div>
                  <div className="bg-kitan-bg rounded-lg px-3 py-2 border border-kitan-border text-center">
                    <p className="text-kitan-subtle">Remains</p>
                    <p className="text-kitan-off-white font-semibold">
                      {order.remains != null ? order.remains.toLocaleString() : '—'}
                    </p>
                  </div>
                  <div className="bg-kitan-bg rounded-lg px-3 py-2 border border-kitan-border text-center">
                    <p className="text-kitan-subtle">Order ID</p>
                    <p className="text-kitan-teal font-mono font-semibold text-[10px] break-all">
                      {order.jap_order_id ?? '—'}
                    </p>
                  </div>
                </div>

                {/* Under review notice */}
                {order.status === 'awaiting_review' && (
                  <div className="flex items-start gap-2 p-3 rounded-xl bg-orange-500/5 border border-orange-500/20">
                    <AlertTriangle size={12} className="text-orange-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-orange-300 text-xs font-semibold">Under Manual Review</p>
                      <p className="text-orange-400/70 text-xs mt-0.5 leading-relaxed">
                        Our team will process this order within 24 hours. Your payment has been reserved.
                      </p>
                    </div>
                  </div>
                )}

                {/* Refresh status button for active orders */}
                {isActive && order.jap_order_id && (
                  <button
                    onClick={() => pollOrderStatus(order.id)}
                    className="text-xs text-kitan-teal font-semibold hover:text-kitan-teal-bright transition-colors flex items-center gap-1.5"
                  >
                    <RefreshCw size={11} /> Check Status
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AccountBoostingPage;
