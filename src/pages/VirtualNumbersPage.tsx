/**
 * VirtualNumbersPage — dual-provider virtual number service
 *
 * Server 1: SMSPool (hero-sms edge function) — UNCHANGED
 * Server 2: 5SIM   (fivesim edge function)   — NEW
 *
 * History tab shows combined orders from both providers.
 */
import React, {
  useState, useEffect, useCallback, useRef, useMemo,
} from 'react';
import {
  Phone, Search, Loader2, Copy, CheckCircle, Clock, XCircle,
  RefreshCw, Info, ChevronDown, History, ArrowLeft, AlertTriangle,
  Shield, Zap, Timer, Ban, RotateCcw, Server,
} from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useWalletStore } from '@/stores/useStore';
import { formatNGN } from '@/constants';
import { dbVirtualOrders } from '@/lib/db';
import type { VirtualNumberOrder } from '@/types';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';
import WatchVideoButton from '@/components/features/WatchVideoButton';

// ─────────────────────────────────────────────────────────────────────────────
// Local types
// ─────────────────────────────────────────────────────────────────────────────
interface SMSPoolCountry { id: string; name: string; shortName: string; }
interface SMSPoolService { id: string; name: string; }

interface FiveSimCountry { id: string; name: string; }
interface FiveSimProduct { id: string; name: string; costNGN: number; qty: number; }

interface FiveSimOrder {
  id: string; fivesimOrderId: string; service: string; serviceName: string;
  country: string; countryName: string; phone: string; status: string;
  smsCode?: string; costNGN: number; createdAt: string;
}

type ActiveStatus = VirtualNumberOrder['status'] | 'cancelling';
type ServerType = 'smspool' | 'fivesim';

// ─────────────────────────────────────────────────────────────────────────────
// Edge function proxies
// ─────────────────────────────────────────────────────────────────────────────
async function smsPool<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('hero-sms', { body: payload });
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

async function fiveSim<T = unknown>(payload: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('fivesim', { body: payload });
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

const COUNTDOWN_SECS = 900; // 15 minutes
const POLL_INTERVAL  = 4000; // 4 seconds

function formatCountdown(secs: number): string {
  const m = Math.floor(secs / 60).toString().padStart(2, '0');
  const s = (secs % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function isActiveOrder(status: VirtualNumberOrder['status']): boolean {
  return status === 'pending' || status === 'waiting';
}

function isActive5SimOrder(status: string): boolean {
  return status === 'PENDING';
}

// ─────────────────────────────────────────────────────────────────────────────
// Status badge — works for both providers
// ─────────────────────────────────────────────────────────────────────────────
const StatusBadge: React.FC<{ status: ActiveStatus | string }> = ({ status }) => {
  const map: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
    pending:    { label: 'Waiting for SMS…',          color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',       icon: <Clock size={11} className="animate-pulse" /> },
    waiting:    { label: 'Waiting for SMS…',          color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',       icon: <Clock size={11} className="animate-pulse" /> },
    PENDING:    { label: 'Waiting for SMS…',          color: 'bg-amber-500/10 text-amber-400 border-amber-500/30',       icon: <Clock size={11} className="animate-pulse" /> },
    received:   { label: 'Code Received!',            color: 'bg-green-500/10 text-green-400 border-green-500/30',       icon: <CheckCircle size={11} /> },
    RECEIVED:   { label: 'Code Received!',            color: 'bg-green-500/10 text-green-400 border-green-500/30',       icon: <CheckCircle size={11} /> },
    FINISHED:   { label: 'Verified Successfully',     color: 'bg-green-500/10 text-green-400 border-green-500/30',       icon: <CheckCircle size={11} /> },
    completed:  { label: 'Verified Successfully',     color: 'bg-green-500/10 text-green-400 border-green-500/30',       icon: <CheckCircle size={11} /> },
    cancelled:  { label: 'Cancelled — Funds Returned',color: 'bg-red-500/10 text-red-400 border-red-500/30',             icon: <XCircle size={11} /> },
    CANCELED:   { label: 'Cancelled — Funds Returned',color: 'bg-red-500/10 text-red-400 border-red-500/30',             icon: <XCircle size={11} /> },
    expired:    { label: 'Expired',                   color: 'bg-kitan-border/40 text-kitan-subtle border-kitan-border', icon: <XCircle size={11} /> },
    TIMEOUT:    { label: 'Expired',                   color: 'bg-kitan-border/40 text-kitan-subtle border-kitan-border', icon: <XCircle size={11} /> },
    cancelling: { label: 'Cancelling…',               color: 'bg-orange-500/10 text-orange-400 border-orange-500/30',   icon: <Loader2 size={11} className="animate-spin" /> },
  };
  const m = map[status] ?? map.pending;
  return (
    <span className={cn('inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border whitespace-nowrap', m.color)}>
      {m.icon} {m.label}
    </span>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
const VirtualNumbersPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user }                        = useAuthStore();
  const { wallet, loadWallet, refreshBalance } = useWalletStore();

  // ── Tab & Server ────────────────────────────────────────────────────────────
  const [tab, setTab] = useState<'buy' | 'history'>(
    searchParams.get('tab') === 'history' ? 'history' : 'buy'
  );
  const [server, setServer] = useState<ServerType>('smspool');

  // ── SMSPool Catalogue (Server 1) ───────────────────────────────────────────
  const [countries,      setCountries]      = useState<SMSPoolCountry[]>([]);
  const [services,       setServices]       = useState<SMSPoolService[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogError,   setCatalogError]   = useState('');

  // ── SMSPool Buy-tab selection ──────────────────────────────────────────────
  const [serviceSearch,  setServiceSearch]  = useState('');
  const [countrySearch,  setCountrySearch]  = useState('');
  const [selService,     setSelService]     = useState('');
  const [selCountry,     setSelCountry]     = useState('');

  // ── SMSPool Price ──────────────────────────────────────────────────────────
  const [priceData,      setPriceData]      = useState<{ costNGN: number; costUSD: number } | null>(null);
  const [priceLoading,   setPriceLoading]   = useState(false);

  // ── SMSPool Active order ───────────────────────────────────────────────────
  const [buying,         setBuying]         = useState(false);
  const [activeOrder,    setActiveOrder]    = useState<VirtualNumberOrder | null>(null);

  // ── SMSPool Countdown ─────────────────────────────────────────────────────
  const [timeLeft,       setTimeLeft]       = useState(COUNTDOWN_SECS);
  const countdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── SMSPool Polling ───────────────────────────────────────────────────────
  const [polling,  setPolling]  = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── SMSPool Cancel ────────────────────────────────────────────────────────
  const [cancelling,        setCancelling]        = useState(false);
  const [cancellingOrderId, setCancellingOrderId] = useState<string | null>(null);

  // ── Copy state ────────────────────────────────────────────────────────────
  const [copiedPhone, setCopiedPhone] = useState(false);
  const [copiedCode,  setCopiedCode]  = useState(false);

  // ── Balance alert ─────────────────────────────────────────────────────────
  const [showBalanceAlert, setShowBalanceAlert] = useState(false);

  // ── SMSPool History ───────────────────────────────────────────────────────
  const [history,     setHistory]     = useState<VirtualNumberOrder[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const histPollRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ── 5SIM State (Server 2) ──────────────────────────────────────────────────
  const [fs5Countries,      setFs5Countries]      = useState<FiveSimCountry[]>([]);
  const [fs5Products,       setFs5Products]       = useState<FiveSimProduct[]>([]);
  const [fs5SelCountry,     setFs5SelCountry]     = useState('');
  const [fs5SelService,     setFs5SelService]     = useState('');
  const [fs5CountrySearch,  setFs5CountrySearch]  = useState('');
  const [fs5ServiceSearch,  setFs5ServiceSearch]  = useState('');
  const [fs5CatalogLoading, setFs5CatalogLoading] = useState(false);
  const [fs5ProductsLoading,setFs5ProductsLoading]= useState(false);
  const [fs5Buying,         setFs5Buying]         = useState(false);
  const [fs5Cancelling,     setFs5Cancelling]     = useState(false);
  const [active5SimOrder,   setActive5SimOrder]   = useState<FiveSimOrder | null>(null);
  const [fs5TimeLeft,       setFs5TimeLeft]       = useState(COUNTDOWN_SECS);
  const [fs5Polling,        setFs5Polling]        = useState(false);
  const [fs5CopiedPhone,    setFs5CopiedPhone]    = useState(false);
  const [fs5CopiedCode,     setFs5CopiedCode]     = useState(false);
  const fs5PollRef      = useRef<ReturnType<typeof setInterval> | null>(null);
  const fs5CountdownRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── 5SIM History ──────────────────────────────────────────────────────────
  const [fs5History,       setFs5History]       = useState<FiveSimOrder[]>([]);
  const [fs5HistLoading,   setFs5HistLoading]   = useState(false);
  const fs5HistPollRefs = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());

  // ─────────────────────────────────────────────────────────────────────────
  // Mount
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    loadCatalog();
    if (user) loadWallet(user.id);
  }, [user]);

  useEffect(() => {
    if (server === 'fivesim' && fs5Countries.length === 0 && !fs5CatalogLoading) {
      load5SimCatalog();
    }
  }, [server]);

  useEffect(() => {
    return () => {
      stopBuyTabPolling();
      stopCountdown();
      histPollRefs.current.forEach(id => clearInterval(id));
      histPollRefs.current.clear();
      stop5SimPolling();
      stop5SimCountdown();
      fs5HistPollRefs.current.forEach(id => clearInterval(id));
      fs5HistPollRefs.current.clear();
    };
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // History tab load
  // ─────────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (tab !== 'history' || !user) return;

    // SMSPool orders
    setHistLoading(true);
    dbVirtualOrders.getByUser(user.id).then(orders => {
      setHistory(orders);
      setHistLoading(false);
      orders.forEach(order => {
        if (isActiveOrder(order.status) && !histPollRefs.current.has(order.id)) {
          startHistoryPoll(order.id);
        }
      });
    });

    // 5SIM orders
    setFs5HistLoading(true);
    supabase.from('fivesim_orders').select('*').eq('app_user_id', user.id)
      .order('created_at', { ascending: false }).then(({ data }) => {
        const orders = (data || []).map(r => ({
          id: r.id, fivesimOrderId: r.fivesim_order_id, service: r.service, serviceName: r.service,
          country: r.country, countryName: r.country, phone: r.phone_number,
          status: r.status, smsCode: r.sms_code ?? undefined, costNGN: Number(r.cost_ngn),
          createdAt: r.created_at,
        })) as FiveSimOrder[];
        setFs5History(orders);
        setFs5HistLoading(false);
        orders.forEach(order => {
          if (isActive5SimOrder(order.status) && !fs5HistPollRefs.current.has(order.id)) {
            start5SimHistoryPoll(order.id);
          }
        });
      });
  }, [tab, user]);

  // SMSPool price fetch
  useEffect(() => {
    if (!selService || !selCountry) { setPriceData(null); return; }
    setPriceLoading(true);
    setPriceData(null);
    smsPool<{ costNGN: number; costUSD: number }>({ action: 'getPrice', service: selService, country: selCountry })
      .then(res => setPriceData(res))
      .catch(err => toast.error(`Price fetch failed: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setPriceLoading(false));
  }, [selService, selCountry]);

  // 5SIM products fetch when country changes
  useEffect(() => {
    if (!fs5SelCountry) { setFs5Products([]); setFs5SelService(''); return; }
    setFs5ProductsLoading(true);
    setFs5Products([]);
    setFs5SelService('');
    fiveSim<{ services: FiveSimProduct[] }>({ action: 'getProducts', country: fs5SelCountry })
      .then(res => setFs5Products(res.services ?? []))
      .catch(err => toast.error(`Server 2 products error: ${err instanceof Error ? err.message : String(err)}`))
      .finally(() => setFs5ProductsLoading(false));
  }, [fs5SelCountry]);

  // ─────────────────────────────────────────────────────────────────────────
  // SMSPool catalog
  // ─────────────────────────────────────────────────────────────────────────
  async function loadCatalog() {
    setCatalogLoading(true);
    setCatalogError('');
    try {
      const res = await smsPool<{ countries: SMSPoolCountry[]; services: SMSPoolService[] }>({ action: 'getPrices' });
      setCountries(res.countries ?? []);
      setServices(res.services  ?? []);
    } catch (e: unknown) {
      setCatalogError(e instanceof Error ? e.message : String(e));
    } finally {
      setCatalogLoading(false);
    }
  }

  // 5SIM catalog
  async function load5SimCatalog() {
    setFs5CatalogLoading(true);
    try {
      const res = await fiveSim<{ countries: FiveSimCountry[] }>({ action: 'getCatalog' });
      setFs5Countries(res.countries ?? []);
    } catch (e: unknown) {
      toast.error(`Server 2 catalog error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setFs5CatalogLoading(false);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SMSPool filtered dropdowns
  // ─────────────────────────────────────────────────────────────────────────
  const filteredServices = useMemo(() =>
    services.filter(s => !serviceSearch || s.name.toLowerCase().includes(serviceSearch.toLowerCase())),
    [services, serviceSearch],
  );
  const filteredCountries = useMemo(() =>
    countries.filter(c => !countrySearch || c.name.toLowerCase().includes(countrySearch.toLowerCase())),
    [countries, countrySearch],
  );
  const selectedServiceName = useMemo(() => services.find(s => s.id === selService)?.name ?? '', [services, selService]);
  const selectedCountryName = useMemo(() => countries.find(c => c.id === selCountry)?.name ?? '', [countries, selCountry]);

  // 5SIM filtered
  const filteredFs5Countries = useMemo(() =>
    fs5Countries.filter(c => !fs5CountrySearch || c.name.toLowerCase().includes(fs5CountrySearch.toLowerCase())),
    [fs5Countries, fs5CountrySearch],
  );
  const filteredFs5Products = useMemo(() =>
    fs5Products.filter(p => !fs5ServiceSearch || p.name.toLowerCase().includes(fs5ServiceSearch.toLowerCase())),
    [fs5Products, fs5ServiceSearch],
  );

  // ─────────────────────────────────────────────────────────────────────────
  // SMSPool polling helpers
  // ─────────────────────────────────────────────────────────────────────────
  function stopBuyTabPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    setPolling(false);
  }

  function stopCountdown() {
    if (countdownRef.current) { clearInterval(countdownRef.current); countdownRef.current = null; }
  }

  function startCountdown(onExpire: () => void) {
    stopCountdown();
    setTimeLeft(COUNTDOWN_SECS);
    let remaining = COUNTDOWN_SECS;
    countdownRef.current = setInterval(() => {
      remaining -= 1;
      setTimeLeft(remaining);
      if (remaining <= 0) { stopCountdown(); onExpire(); }
    }, 1000);
  }

  function startBuyTabPolling(order: VirtualNumberOrder) {
    stopBuyTabPolling();
    setPolling(true);
    pollRef.current = setInterval(async () => {
      try {
        const res = await smsPool<{ state: string; code?: string }>({ action: 'getStatus', orderId: order.id });
        if (res.state === 'received' || res.state === 'completed') {
          stopBuyTabPolling();
          stopCountdown();
          setActiveOrder(prev => prev ? { ...prev, status: 'completed', smsCode: res.code } : prev);
          if (user) await refreshBalance(user.id);
          toast.success(`SMS code received: ${res.code}`);
        } else if (res.state === 'cancelled' || res.state === 'expired') {
          stopBuyTabPolling();
          stopCountdown();
          setActiveOrder(prev => prev ? { ...prev, status: res.state as VirtualNumberOrder['status'] } : prev);
        }
      } catch { /* ignore transient errors */ }
    }, POLL_INTERVAL);
  }

  function startHistoryPoll(orderId: string) {
    if (histPollRefs.current.has(orderId)) return;
    const intervalId = setInterval(async () => {
      try {
        const res = await smsPool<{ state: string; code?: string }>({ action: 'getStatus', orderId });
        const terminal = res.state === 'received' || res.state === 'completed' || res.state === 'cancelled' || res.state === 'expired';
        if (terminal) {
          clearInterval(histPollRefs.current.get(orderId));
          histPollRefs.current.delete(orderId);
          const finalStatus: VirtualNumberOrder['status'] =
            (res.state === 'received' || res.state === 'completed') ? 'completed' : res.state as VirtualNumberOrder['status'];
          setHistory(prev => prev.map(o => o.id === orderId ? { ...o, status: finalStatus, smsCode: res.code ?? o.smsCode } : o));
          if (finalStatus === 'completed') {
            toast.success(`SMS code received: ${res.code}`);
            if (user) refreshBalance(user.id);
          }
        }
      } catch { /* ignore */ }
    }, POLL_INTERVAL);
    histPollRefs.current.set(orderId, intervalId);
  }

  function stopHistoryPoll(orderId: string) {
    const id = histPollRefs.current.get(orderId);
    if (id) { clearInterval(id); histPollRefs.current.delete(orderId); }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5SIM polling helpers
  // ─────────────────────────────────────────────────────────────────────────
  function stop5SimPolling() {
    if (fs5PollRef.current) { clearInterval(fs5PollRef.current); fs5PollRef.current = null; }
    setFs5Polling(false);
  }

  function stop5SimCountdown() {
    if (fs5CountdownRef.current) { clearInterval(fs5CountdownRef.current); fs5CountdownRef.current = null; }
  }

  function start5SimCountdown(onExpire: () => void) {
    stop5SimCountdown();
    setFs5TimeLeft(COUNTDOWN_SECS);
    let remaining = COUNTDOWN_SECS;
    fs5CountdownRef.current = setInterval(() => {
      remaining -= 1;
      setFs5TimeLeft(remaining);
      if (remaining <= 0) { stop5SimCountdown(); onExpire(); }
    }, 1000);
  }

  function start5SimPolling(orderId: string) {
    stop5SimPolling();
    setFs5Polling(true);
    fs5PollRef.current = setInterval(async () => {
      try {
        const res = await fiveSim<{ state: string; code?: string; fsStatus: string }>({ action: 'checkStatus', orderId });
        if (res.state === 'received') {
          stop5SimPolling();
          stop5SimCountdown();
          setActive5SimOrder(prev => prev ? { ...prev, status: 'RECEIVED', smsCode: res.code } : prev);
          if (user) await refreshBalance(user.id);
          toast.success(`SMS code received: ${res.code}`);
        } else if (res.state === 'cancelled' || res.state === 'expired') {
          stop5SimPolling();
          stop5SimCountdown();
          setActive5SimOrder(prev => prev ? { ...prev, status: res.state === 'cancelled' ? 'CANCELED' : 'TIMEOUT' } : prev);
        }
      } catch { /* ignore transient */ }
    }, POLL_INTERVAL);
  }

  function start5SimHistoryPoll(orderId: string) {
    if (fs5HistPollRefs.current.has(orderId)) return;
    const intervalId = setInterval(async () => {
      try {
        const res = await fiveSim<{ state: string; code?: string }>({ action: 'checkStatus', orderId });
        const terminal = res.state !== 'waiting';
        if (terminal) {
          clearInterval(fs5HistPollRefs.current.get(orderId));
          fs5HistPollRefs.current.delete(orderId);
          const finalStatus = res.state === 'received' ? 'RECEIVED' : res.state === 'cancelled' ? 'CANCELED' : 'TIMEOUT';
          setFs5History(prev => prev.map(o => o.id === orderId ? { ...o, status: finalStatus, smsCode: res.code ?? o.smsCode } : o));
          if (finalStatus === 'RECEIVED') {
            toast.success(`Server 2 code received: ${res.code}`);
            if (user) refreshBalance(user.id);
          }
        }
      } catch { /* ignore */ }
    }, POLL_INTERVAL);
    fs5HistPollRefs.current.set(orderId, intervalId);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SMSPool buy handler
  // ─────────────────────────────────────────────────────────────────────────
  const handleBuy = useCallback(async () => {
    if (!user) { navigate('/login'); return; }
    if (!selService || !selCountry || !priceData) return;

    const balance = wallet?.balance ?? 0;
    if (balance < priceData.costNGN) {
      setShowBalanceAlert(true);
      setTimeout(() => setShowBalanceAlert(false), 5000);
      toast.error(`Insufficient funds. Need ${formatNGN(priceData.costNGN)}, have ${formatNGN(balance)}.`);
      return;
    }

    setBuying(true);
    setShowBalanceAlert(false);

    try {
      const res = await smsPool<{
        orderId: string; poolOrderId: string; phone: string;
        service: string; country: string; costNGN: number; costUSD: number;
      }>({ action: 'getNumber', service: selService, country: selCountry, appUserId: user.id });

      const order: VirtualNumberOrder = {
        id: res.orderId, appUserId: user.id, service: res.service, country: res.country,
        heroSmsId: res.poolOrderId, phoneNumber: res.phone, status: 'pending',
        costNGN: res.costNGN, costRub: res.costUSD,
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      };

      setActiveOrder(order);
      await refreshBalance(user.id);
      toast.success(`Number obtained: +${res.phone}`);
      startBuyTabPolling(order);
      startCountdown(() => handleAutoExpiry(order));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('INSUFFICIENT_BALANCE')) {
        setShowBalanceAlert(true);
        toast.error('Insufficient wallet balance.');
        navigate(`/wallet?need=${priceData.costNGN}`);
      } else {
        toast.error(msg.replace('SMSPool: ', ''));
      }
    } finally {
      setBuying(false);
    }
  }, [user, wallet, selService, selCountry, priceData, navigate]);

  const handleAutoExpiry = useCallback(async (order: VirtualNumberOrder) => {
    stopBuyTabPolling();
    toast.error('Order expired — refunding wallet…');
    await performCancel(order.id, order.costNGN, order.appUserId, true, 'buy');
  }, []);

  const handleManualCancelBuyTab = useCallback(async () => {
    if (!activeOrder) return;
    stopBuyTabPolling();
    stopCountdown();
    await performCancel(activeOrder.id, activeOrder.costNGN, activeOrder.appUserId, false, 'buy');
  }, [activeOrder]);

  async function performCancel(
    orderId: string, costNGN: number, appUserId: string,
    isExpiry: boolean, target: 'buy' | 'history',
  ) {
    if (target === 'buy') setCancelling(true);
    if (target === 'history') setCancellingOrderId(orderId);

    try {
      await smsPool<{ success: boolean; refunded: number }>({ action: 'cancelNumber', orderId, appUserId });
      if (target === 'buy') setActiveOrder(prev => prev ? { ...prev, status: 'cancelled' } : prev);
      else setHistory(prev => prev.map(o => o.id === orderId ? { ...o, status: 'cancelled' } : o));
      if (user) await refreshBalance(user.id);
      const msg = isExpiry
        ? `Order expired. ${formatNGN(costNGN)} returned to your wallet.`
        : `Order cancelled. ${formatNGN(costNGN)} returned to your wallet balance.`;
      toast.success(msg);
      if (target === 'buy') setTimeout(() => { setActiveOrder(null); setCancelling(false); }, 3000);
    } catch (e: unknown) {
      toast.error(`Cancel failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (target === 'buy') setCancelling(false);
      if (target === 'history') setCancellingOrderId(null);
    }
  }

  const handleHistoryCancel = useCallback(async (order: VirtualNumberOrder) => {
    stopHistoryPoll(order.id);
    await performCancel(order.id, order.costNGN, order.appUserId, false, 'history');
  }, [user]);

  // ─────────────────────────────────────────────────────────────────────────
  // 5SIM buy handler
  // ─────────────────────────────────────────────────────────────────────────
  const handle5SimBuy = useCallback(async () => {
    if (!user) { navigate('/login'); return; }
    const product = fs5Products.find(p => p.id === fs5SelService);
    if (!fs5SelCountry || !fs5SelService || !product) return;

    const balance = wallet?.balance ?? 0;
    if (balance < product.costNGN) {
      toast.error(`Insufficient funds. Need ${formatNGN(product.costNGN)}, have ${formatNGN(balance)}.`);
      navigate(`/wallet?need=${product.costNGN}`);
      return;
    }

    setFs5Buying(true);
    try {
      const res = await fiveSim<{ orderId: string; fivesimOrderId: string; phone: string; service: string; country: string; costNGN: number }>(
        { action: 'buyNumber', country: fs5SelCountry, service: fs5SelService, appUserId: user.id }
      );

      const selectedCountryName = fs5Countries.find(c => c.id === fs5SelCountry)?.name ?? fs5SelCountry;
      const selectedProductName = product.name;

      const order: FiveSimOrder = {
        id: res.orderId, fivesimOrderId: res.fivesimOrderId,
        service: fs5SelService, serviceName: selectedProductName,
        country: fs5SelCountry, countryName: selectedCountryName,
        phone: res.phone, status: 'PENDING', costNGN: res.costNGN,
        createdAt: new Date().toISOString(),
      };

      setActive5SimOrder(order);
      await refreshBalance(user.id);
      toast.success(`Server 2 number obtained: +${res.phone}`);
      start5SimPolling(res.orderId);
      start5SimCountdown(() => handle5SimAutoExpiry(order));
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('INSUFFICIENT_BALANCE')) {
        toast.error('Insufficient wallet balance.');
        navigate(`/wallet?need=${product.costNGN}`);
      } else {
        toast.error(msg);
      }
    } finally {
      setFs5Buying(false);
    }
  }, [user, wallet, fs5SelCountry, fs5SelService, fs5Products, fs5Countries, navigate]);

  const handle5SimAutoExpiry = useCallback(async (order: FiveSimOrder) => {
    stop5SimPolling();
    toast.error('Server 2 order expired — refunding wallet…');
    await perform5SimCancel(order.id, order.costNGN, user?.id ?? '', 'buy');
  }, [user]);

  const handleManualCancel5Sim = useCallback(async () => {
    if (!active5SimOrder) return;
    stop5SimPolling();
    stop5SimCountdown();
    await perform5SimCancel(active5SimOrder.id, active5SimOrder.costNGN, user?.id ?? '', 'buy');
  }, [active5SimOrder, user]);

  async function perform5SimCancel(
    orderId: string, costNGN: number, appUserId: string, target: 'buy' | 'history',
  ) {
    if (target === 'buy') setFs5Cancelling(true);
    try {
      await fiveSim({ action: 'cancelNumber', orderId, appUserId });
      if (target === 'buy') setActive5SimOrder(prev => prev ? { ...prev, status: 'CANCELED' } : prev);
      else setFs5History(prev => prev.map(o => o.id === orderId ? { ...o, status: 'CANCELED' } : o));
      if (user) await refreshBalance(user.id);
      toast.success(`Order cancelled. ${formatNGN(costNGN)} returned to wallet.`);
      if (target === 'buy') setTimeout(() => { setActive5SimOrder(null); setFs5Cancelling(false); }, 3000);
    } catch (e: unknown) {
      toast.error(`Server 2 cancel failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (target === 'buy') setFs5Cancelling(false);
    }
  }

  // Copy helpers
  async function copyText(text: string, which: 'phone' | 'code') {
    await navigator.clipboard.writeText(text);
    if (which === 'phone') { setCopiedPhone(true); setTimeout(() => setCopiedPhone(false), 2000); }
    else { setCopiedCode(true); setTimeout(() => setCopiedCode(false), 2000); }
    toast.success('Copied to clipboard');
  }

  async function copy5SimText(text: string, which: 'phone' | 'code') {
    await navigator.clipboard.writeText(text);
    if (which === 'phone') { setFs5CopiedPhone(true); setTimeout(() => setFs5CopiedPhone(false), 2000); }
    else { setFs5CopiedCode(true); setTimeout(() => setFs5CopiedCode(false), 2000); }
    toast.success('Copied to clipboard');
  }

  const countdownPct   = (timeLeft / COUNTDOWN_SECS) * 100;
  const countdownColor = timeLeft > 300 ? 'text-kitan-teal' : timeLeft > 120 ? 'text-amber-400' : 'text-red-400';
  const fs5CountdownPct   = (fs5TimeLeft / COUNTDOWN_SECS) * 100;
  const fs5CountdownColor = fs5TimeLeft > 300 ? 'text-kitan-teal' : fs5TimeLeft > 120 ? 'text-amber-400' : 'text-red-400';

  const resolveServiceName = (id: string) => services.find(s => s.id === id)?.name ?? id;
  const resolveCountryName = (id: string) => countries.find(c => c.id === id)?.name ?? id;

  // ── ACTIVE ORDER VIEW (SMSPool) ─────────────────────────────────────────────
  if (activeOrder && server === 'smspool') {
    const isWaiting   = isActiveOrder(activeOrder.status);
    const isCompleted = activeOrder.status === 'completed' || activeOrder.status === 'received';
    const isCancelled = activeOrder.status === 'cancelled';

    return (
      <div className="max-w-lg mx-auto space-y-5 animate-fade-in pb-10">
        {(isCancelled || isCompleted) && (
          <button onClick={() => setActiveOrder(null)} className="flex items-center gap-2 text-kitan-muted hover:text-kitan-off-white text-sm font-medium transition-colors -ml-1">
            <ArrowLeft size={15} /> Back to Services
          </button>
        )}
        <div className={cn('card-kitan p-6 space-y-5 transition-all', isCompleted && 'border-green-500/40', isCancelled && 'border-red-500/20 opacity-75')}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display font-bold text-kitan-off-white text-lg">{resolveServiceName(activeOrder.service)}</h2>
              <p className="text-kitan-muted text-xs mt-0.5">{resolveCountryName(activeOrder.country)}</p>
              <span className="text-xs text-kitan-subtle">Server 1</span>
            </div>
            <StatusBadge status={cancelling ? 'cancelling' : activeOrder.status} />
          </div>
          {isWaiting && (
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-kitan-border/30 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-1000', timeLeft > 300 ? 'bg-kitan-teal' : timeLeft > 120 ? 'bg-amber-400' : 'bg-red-400')} style={{ width: `${countdownPct}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-kitan-subtle text-xs"><Timer size={12} /><span>Time remaining</span></div>
                <span className={cn('font-display font-bold text-lg tabular-nums', countdownColor)}>{formatCountdown(timeLeft)}</span>
              </div>
              {timeLeft <= 120 && <p className="text-red-400 text-xs font-medium flex items-center gap-1"><AlertTriangle size={11} /> Expiring soon — will auto-cancel and refund.</p>}
            </div>
          )}
          <div className="bg-kitan-surface rounded-2xl border border-kitan-border p-4 flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-kitan-subtle text-xs mb-1 font-medium uppercase tracking-wide">Phone Number</p><p className="font-display font-bold text-kitan-off-white text-xl md:text-2xl tracking-widest break-all">+{activeOrder.phoneNumber}</p></div>
            <button onClick={() => copyText(activeOrder.phoneNumber, 'phone')} className={cn('flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all', copiedPhone ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-kitan-card border-kitan-border text-kitan-muted hover:border-kitan-teal hover:text-kitan-teal')}>
              {copiedPhone ? <CheckCircle size={14} /> : <Copy size={14} />} {copiedPhone ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {isWaiting && !cancelling && (
            <div className="bg-amber-500/5 rounded-2xl border border-amber-500/20 p-4 space-y-2">
              <div className="flex items-center gap-2">{polling ? <Loader2 size={15} className="text-amber-400 animate-spin flex-shrink-0" /> : <Clock size={15} className="text-amber-400 flex-shrink-0" />}<p className="text-amber-300 font-semibold text-sm">{polling ? 'Checking for SMS every 4 seconds…' : 'Polling paused'}</p></div>
              <p className="text-amber-400/70 text-xs leading-relaxed pl-6">Use this number on <strong className="text-amber-300">{resolveServiceName(activeOrder.service)}</strong>. Your verification code will appear automatically.</p>
              {!polling && <button onClick={() => startBuyTabPolling(activeOrder)} className="pl-6 flex items-center gap-1.5 text-amber-400 text-xs font-semibold"><RefreshCw size={12} /> Resume checking</button>}
            </div>
          )}
          {cancelling && <div className="bg-orange-500/5 rounded-2xl border border-orange-500/20 p-4 flex items-center gap-3"><Loader2 size={16} className="text-orange-400 animate-spin flex-shrink-0" /><div><p className="text-orange-300 font-semibold text-sm">Cancelling order…</p><p className="text-orange-400/60 text-xs mt-0.5">Sending refund to your wallet.</p></div></div>}
          {isCompleted && activeOrder.smsCode && (
            <div className="bg-green-500/10 rounded-2xl border border-green-500/30 p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1"><CheckCircle size={16} className="text-green-400" /><p className="text-green-400 text-sm font-bold uppercase tracking-wider">Verification Code</p></div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-display font-bold text-kitan-off-white text-4xl tracking-[0.25em] select-all">{activeOrder.smsCode}</p>
                <button onClick={() => copyText(activeOrder.smsCode!, 'code')} className={cn('flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all', copiedCode ? 'bg-green-500/20 text-green-300 border border-green-500/40' : 'btn-primary')}>
                  {copiedCode ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy Code</>}
                </button>
              </div>
            </div>
          )}
          {isCancelled && !cancelling && <div className="bg-red-500/5 rounded-2xl border border-red-500/20 p-4"><div className="flex items-center gap-2 mb-1"><XCircle size={14} className="text-red-400" /><p className="text-red-400 text-sm font-semibold">Order Cancelled</p></div><p className="text-red-400/60 text-xs">{formatNGN(activeOrder.costNGN)} returned to your wallet.</p></div>}
          <div className="flex items-center justify-between text-xs text-kitan-subtle border-t border-kitan-border pt-3"><span>Cost: <span className="text-kitan-muted font-semibold">{formatNGN(activeOrder.costNGN)}</span></span><span className="font-mono">{activeOrder.id.slice(0, 14)}…</span></div>
        </div>
        {isWaiting && !cancelling && <button onClick={handleManualCancelBuyTab} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-500/30 text-red-400 hover:bg-red-500/5 hover:border-red-500/50 text-sm font-semibold transition-all"><Ban size={15} /> Cancel Order &amp; Refund</button>}
        {isWaiting && <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-kitan-surface border border-kitan-border"><Shield size={14} className="text-kitan-teal flex-shrink-0 mt-0.5" /><p className="text-kitan-muted text-xs leading-relaxed">If no code arrives within 15 minutes, this order is automatically cancelled and your full payment is refunded.</p></div>}
      </div>
    );
  }

  // ── ACTIVE ORDER VIEW (5SIM) ────────────────────────────────────────────────
  if (active5SimOrder && server === 'fivesim') {
    const isWaiting   = isActive5SimOrder(active5SimOrder.status);
    const isCompleted = active5SimOrder.status === 'RECEIVED' || active5SimOrder.status === 'FINISHED';
    const isCancelled = active5SimOrder.status === 'CANCELED' || active5SimOrder.status === 'TIMEOUT';

    return (
      <div className="max-w-lg mx-auto space-y-5 animate-fade-in pb-10">
        {(isCancelled || isCompleted) && (
          <button onClick={() => setActive5SimOrder(null)} className="flex items-center gap-2 text-kitan-muted hover:text-kitan-off-white text-sm font-medium transition-colors -ml-1">
            <ArrowLeft size={15} /> Back to Services
          </button>
        )}
        <div className={cn('card-kitan p-6 space-y-5', isCompleted && 'border-green-500/40', isCancelled && 'border-red-500/20 opacity-75')}>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="font-display font-bold text-kitan-off-white text-lg">{active5SimOrder.serviceName}</h2>
              <p className="text-kitan-muted text-xs mt-0.5">{active5SimOrder.countryName}</p>
              <span className="text-xs text-kitan-subtle">Server 2</span>
            </div>
            <StatusBadge status={fs5Cancelling ? 'cancelling' : active5SimOrder.status} />
          </div>
          {isWaiting && (
            <div className="space-y-2">
              <div className="w-full h-1.5 bg-kitan-border/30 rounded-full overflow-hidden">
                <div className={cn('h-full rounded-full transition-all duration-1000', fs5TimeLeft > 300 ? 'bg-kitan-teal' : fs5TimeLeft > 120 ? 'bg-amber-400' : 'bg-red-400')} style={{ width: `${fs5CountdownPct}%` }} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-kitan-subtle text-xs"><Timer size={12} /><span>Time remaining</span></div>
                <span className={cn('font-display font-bold text-lg tabular-nums', fs5CountdownColor)}>{formatCountdown(fs5TimeLeft)}</span>
              </div>
            </div>
          )}
          <div className="bg-kitan-surface rounded-2xl border border-kitan-border p-4 flex items-center justify-between gap-3">
            <div className="min-w-0"><p className="text-kitan-subtle text-xs mb-1 font-medium uppercase tracking-wide">Phone Number</p><p className="font-display font-bold text-kitan-off-white text-xl md:text-2xl tracking-widest break-all">+{active5SimOrder.phone}</p></div>
            <button onClick={() => copy5SimText(active5SimOrder.phone, 'phone')} className={cn('flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-all', fs5CopiedPhone ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-kitan-card border-kitan-border text-kitan-muted hover:border-kitan-teal hover:text-kitan-teal')}>
              {fs5CopiedPhone ? <CheckCircle size={14} /> : <Copy size={14} />} {fs5CopiedPhone ? 'Copied!' : 'Copy'}
            </button>
          </div>
          {isWaiting && !fs5Cancelling && (
            <div className="bg-amber-500/5 rounded-2xl border border-amber-500/20 p-4 space-y-2">
              <div className="flex items-center gap-2">{fs5Polling ? <Loader2 size={15} className="text-amber-400 animate-spin flex-shrink-0" /> : <Clock size={15} className="text-amber-400 flex-shrink-0" />}<p className="text-amber-300 font-semibold text-sm">{fs5Polling ? 'Checking for SMS every 4 seconds…' : 'Polling paused'}</p></div>
              <p className="text-amber-400/70 text-xs leading-relaxed pl-6">Use this number on <strong className="text-amber-300">{active5SimOrder.serviceName}</strong>. Code appears here automatically.</p>
              {!fs5Polling && <button onClick={() => start5SimPolling(active5SimOrder.id)} className="pl-6 flex items-center gap-1.5 text-amber-400 text-xs font-semibold"><RefreshCw size={12} /> Resume</button>}
            </div>
          )}
          {isCompleted && active5SimOrder.smsCode && (
            <div className="bg-green-500/10 rounded-2xl border border-green-500/30 p-5 space-y-3">
              <div className="flex items-center gap-2 mb-1"><CheckCircle size={16} className="text-green-400" /><p className="text-green-400 text-sm font-bold uppercase tracking-wider">Verification Code</p></div>
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <p className="font-display font-bold text-kitan-off-white text-4xl tracking-[0.25em] select-all">{active5SimOrder.smsCode}</p>
                <button onClick={() => copy5SimText(active5SimOrder.smsCode!, 'code')} className={cn('flex-shrink-0 flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold transition-all', fs5CopiedCode ? 'bg-green-500/20 text-green-300 border border-green-500/40' : 'btn-primary')}>
                  {fs5CopiedCode ? <><CheckCircle size={14} /> Copied!</> : <><Copy size={14} /> Copy Code</>}
                </button>
              </div>
            </div>
          )}
          {isCancelled && !fs5Cancelling && <div className="bg-red-500/5 rounded-2xl border border-red-500/20 p-4"><p className="text-red-400 text-sm font-semibold">Order Cancelled</p><p className="text-red-400/60 text-xs mt-1">{formatNGN(active5SimOrder.costNGN)} returned to wallet.</p></div>}
          <div className="flex items-center justify-between text-xs text-kitan-subtle border-t border-kitan-border pt-3"><span>Cost: <span className="text-kitan-muted font-semibold">{formatNGN(active5SimOrder.costNGN)}</span></span><span className="font-mono">{active5SimOrder.id.slice(0, 14)}…</span></div>
        </div>
        {isWaiting && !fs5Cancelling && <button onClick={handleManualCancel5Sim} className="w-full flex items-center justify-center gap-2 py-3 rounded-2xl border border-red-500/30 text-red-400 hover:bg-red-500/5 text-sm font-semibold transition-all"><Ban size={15} /> Cancel Order &amp; Refund</button>}
        {isWaiting && <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-kitan-surface border border-kitan-border"><Shield size={14} className="text-kitan-teal flex-shrink-0 mt-0.5" /><p className="text-kitan-muted text-xs leading-relaxed">Auto-cancelled and refunded if no code arrives in 15 minutes.</p></div>}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ── MAIN PAGE ─────────────────────────────────────────────────────────────
  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-10">
      <WatchVideoButton serviceKey="virtual_numbers" />

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-kitan-surface to-kitan-card border border-kitan-border p-8">
        <div className="hero-glow top-[-80px] right-[-80px] opacity-25" />
        <div className="relative z-10">
          <div className="badge-teal inline-flex items-center gap-2 mb-4"><Phone size={12} /> Virtual Numbers</div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-kitan-off-white mb-3">
            Virtual <span className="gradient-text">Phone Numbers</span>
          </h1>
          <p className="text-kitan-muted max-w-xl leading-relaxed">
            Receive SMS verification codes for WhatsApp, Telegram, Google, and 1000+ services. Two providers available — full refund if no code arrives.
          </p>
          {user && wallet && (
            <div className="mt-4 inline-flex items-center gap-2 bg-kitan-teal/10 border border-kitan-teal/20 rounded-xl px-4 py-2">
              <Zap size={14} className="text-kitan-teal" />
              <p className="text-sm text-kitan-off-white">Wallet: <span className="text-kitan-teal font-bold">{formatNGN(wallet.balance)}</span></p>
            </div>
          )}
        </div>
      </div>

      {showBalanceAlert && (
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30 animate-fade-in">
          <AlertTriangle size={18} className="text-red-400 flex-shrink-0" />
          <div className="flex-1"><p className="text-red-300 font-semibold text-sm">Insufficient Funds</p><p className="text-red-400/70 text-xs mt-0.5">Please fund your wallet to continue.</p></div>
          <button onClick={() => navigate('/wallet')} className="flex-shrink-0 bg-red-500/20 hover:bg-red-500/30 text-red-300 text-xs font-semibold px-3 py-1.5 rounded-lg transition-colors">Top Up</button>
        </div>
      )}

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-kitan-surface border border-kitan-border">
        <Info size={15} className="text-kitan-teal flex-shrink-0 mt-0.5" />
        <p className="text-kitan-muted text-sm leading-relaxed">Select a server, service, and country then purchase. Wallet is debited instantly. Full refund if no code arrives in 15 minutes.</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-kitan-border">
        {(['buy', 'history'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={cn('px-5 py-2.5 text-sm font-semibold transition-all border-b-2 -mb-px', tab === t ? 'border-kitan-teal text-kitan-teal' : 'border-transparent text-kitan-muted hover:text-kitan-off-white')}>
            {t === 'buy' ? 'Buy Number' : 'My Orders'}
          </button>
        ))}
      </div>

      {/* ═══════════════════════ BUY TAB ════════════════════════════════════ */}
      {tab === 'buy' && (
        <div className="space-y-4">

          {/* Server selector */}
          <div className="flex gap-3">
            {([
              { key: 'smspool', label: 'Server 1', sub: '', icon: Server },
              { key: 'fivesim', label: 'Server 2', sub: '',    icon: Server },
            ] as const).map(({ key, label, sub, icon: Icon }) => (
              <button key={key} onClick={() => setServer(key)}
                className={cn('flex items-center gap-3 flex-1 p-4 rounded-2xl border-2 transition-all text-left',
                  server === key ? 'border-kitan-teal bg-kitan-teal/5 shadow-teal-glow' : 'border-kitan-border bg-kitan-surface hover:border-kitan-teal/40')}>
                <div className={cn('w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 border', server === key ? 'bg-kitan-teal/10 border-kitan-teal/30' : 'bg-kitan-bg border-kitan-border')}>
                  <Icon size={16} className={server === key ? 'text-kitan-teal' : 'text-kitan-subtle'} />
                </div>
                <div>
                  <p className={cn('font-bold text-sm', server === key ? 'text-kitan-teal' : 'text-kitan-off-white')}>{label}</p>
                  <p className="text-kitan-subtle text-xs">{sub}</p>
                </div>
              </button>
            ))}
          </div>

          {/* ── Server 1: SMSPool ── */}
          {server === 'smspool' && (
            <div className="card-kitan p-6 space-y-5">
              <h2 className="font-display font-bold text-kitan-off-white text-base flex items-center gap-2">
                <Phone size={16} className="text-kitan-teal" /> Server 1
              </h2>

              {catalogLoading && <div className="flex items-center gap-3 py-4"><Loader2 size={18} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading services…</span></div>}

              {!catalogLoading && catalogError && (
                <div className="flex items-start gap-3 p-4 rounded-xl bg-red-500/5 border border-red-500/20">
                  <XCircle size={16} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1"><p className="text-red-300 text-sm font-semibold">Failed to load services</p><p className="text-red-400/60 text-xs mt-1">{catalogError}</p></div>
                  <button onClick={loadCatalog} className="btn-secondary text-xs flex-shrink-0">Retry</button>
                </div>
              )}

              {!catalogLoading && !catalogError && services.length > 0 && (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">Target Service</label>
                      <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" /><input type="text" placeholder="Search (e.g. WhatsApp)…" value={serviceSearch} onChange={e => setServiceSearch(e.target.value)} className="input-kitan pl-8 text-sm" /></div>
                      <div className="relative"><select value={selService} onChange={e => setSelService(e.target.value)} className="input-kitan text-sm pr-8 appearance-none cursor-pointer"><option value="">-- Choose a service --</option>{filteredServices.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" /></div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">Country</label>
                      <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" /><input type="text" placeholder="Search country…" value={countrySearch} onChange={e => setCountrySearch(e.target.value)} className="input-kitan pl-8 text-sm" /></div>
                      <div className="relative"><select value={selCountry} onChange={e => setSelCountry(e.target.value)} className="input-kitan text-sm pr-8 appearance-none cursor-pointer"><option value="">-- Choose a country --</option>{filteredCountries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" /></div>
                    </div>
                  </div>

                  {selService && selCountry && (
                    <div className="bg-kitan-surface rounded-2xl border border-kitan-teal/30 p-5 space-y-4">
                      <div className="flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-0"><p className="font-display font-bold text-kitan-off-white text-base">{selectedServiceName}</p><p className="text-kitan-muted text-xs mt-0.5">{selectedCountryName}</p></div>
                        <div className="text-right flex-shrink-0">
                          {priceLoading ? <div className="flex items-center gap-2 justify-end"><Loader2 size={14} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Fetching…</span></div> : priceData ? (<><p className="font-display font-bold text-kitan-teal text-2xl">{formatNGN(priceData.costNGN)}</p><p className="text-kitan-subtle text-xs">${priceData.costUSD.toFixed(4)} wholesale</p></>) : <span className="text-kitan-subtle text-sm">—</span>}
                        </div>
                      </div>
                      {priceData && wallet && wallet.balance < priceData.costNGN && (
                        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20"><AlertTriangle size={14} className="text-red-400 flex-shrink-0" /><p className="text-red-300 text-xs flex-1">Need <strong>{formatNGN(priceData.costNGN - wallet.balance)}</strong> more.</p><button onClick={() => navigate(`/wallet?need=${priceData.costNGN}`)} className="text-xs text-red-300 font-semibold underline">Fund wallet</button></div>
                      )}
                      <button onClick={handleBuy} disabled={buying || priceLoading || !priceData || !!(wallet && priceData && wallet.balance < priceData.costNGN)} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                        {buying ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><Phone size={16} /> Purchase Verification Number</>}
                      </button>
                    </div>
                  )}
                  {(!selService || !selCountry) && <div className="p-4 rounded-xl bg-kitan-bg border border-kitan-border text-kitan-subtle text-sm text-center">Select both a service and country to see pricing.</div>}
                </>
              )}
              <button onClick={loadCatalog} className="flex items-center gap-1.5 text-kitan-subtle hover:text-kitan-muted text-xs transition-colors"><RefreshCw size={12} className={catalogLoading ? 'animate-spin' : ''} />{catalogLoading ? 'Refreshing…' : 'Refresh service list'}</button>
            </div>
          )}

          {/* ── Server 2: 5SIM ── */}
          {server === 'fivesim' && (
            <div className="card-kitan p-6 space-y-5">
              <h2 className="font-display font-bold text-kitan-off-white text-base flex items-center gap-2">
                <Phone size={16} className="text-kitan-teal" /> Server 2
              </h2>

              {fs5CatalogLoading && <div className="flex items-center gap-3 py-4"><Loader2 size={18} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading countries…</span></div>}

              {!fs5CatalogLoading && fs5Countries.length > 0 && (
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {/* Country selector */}
                    <div className="space-y-2">
                      <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">Country</label>
                      <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" /><input type="text" placeholder="Search country…" value={fs5CountrySearch} onChange={e => setFs5CountrySearch(e.target.value)} className="input-kitan pl-8 text-sm" /></div>
                      <div className="relative"><select value={fs5SelCountry} onChange={e => setFs5SelCountry(e.target.value)} className="input-kitan text-sm pr-8 appearance-none cursor-pointer"><option value="">-- Choose a country --</option>{filteredFs5Countries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select><ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" /></div>
                    </div>

                    {/* Service selector */}
                    <div className="space-y-2">
                      <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">Service</label>
                      {!fs5SelCountry && <p className="text-kitan-subtle text-xs mt-2">Select a country first</p>}
                      {fs5SelCountry && fs5ProductsLoading && <div className="flex items-center gap-2 py-2"><Loader2 size={14} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-xs">Loading services…</span></div>}
                      {fs5SelCountry && !fs5ProductsLoading && (
                        <>
                          <div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" /><input type="text" placeholder="Search service…" value={fs5ServiceSearch} onChange={e => setFs5ServiceSearch(e.target.value)} className="input-kitan pl-8 text-sm" /></div>
                          <div className="relative"><select value={fs5SelService} onChange={e => setFs5SelService(e.target.value)} className="input-kitan text-sm pr-8 appearance-none cursor-pointer"><option value="">-- Choose a service --</option>{filteredFs5Products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.qty} avail.)</option>)}</select><ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" /></div>
                        </>
                      )}
                    </div>
                  </div>

                  {fs5SelCountry && fs5SelService && (() => {
                    const product = fs5Products.find(p => p.id === fs5SelService);
                    if (!product) return null;
                    return (
                      <div className="bg-kitan-surface rounded-2xl border border-kitan-teal/30 p-5 space-y-4">
                        <div className="flex items-center gap-3 flex-wrap">
                          <div className="flex-1 min-w-0"><p className="font-display font-bold text-kitan-off-white text-base">{product.name}</p><p className="text-kitan-muted text-xs mt-0.5">{fs5Countries.find(c => c.id === fs5SelCountry)?.name} · {product.qty} available</p></div>
                          <div className="text-right flex-shrink-0"><p className="font-display font-bold text-kitan-teal text-2xl">{formatNGN(product.costNGN)}</p></div>
                        </div>
                        {wallet && wallet.balance < product.costNGN && (
                          <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/5 border border-red-500/20"><AlertTriangle size={14} className="text-red-400 flex-shrink-0" /><p className="text-red-300 text-xs flex-1">Need <strong>{formatNGN(product.costNGN - wallet.balance)}</strong> more.</p><button onClick={() => navigate(`/wallet?need=${product.costNGN}`)} className="text-xs text-red-300 font-semibold underline">Fund wallet</button></div>
                        )}
                        <button onClick={handle5SimBuy} disabled={fs5Buying || !!(wallet && wallet.balance < product.costNGN)} className="btn-primary w-full py-3.5 flex items-center justify-center gap-2 text-sm font-bold disabled:opacity-50 disabled:cursor-not-allowed">
                          {fs5Buying ? <><Loader2 size={16} className="animate-spin" /> Processing…</> : <><Phone size={16} /> Purchase Verification Number</>}
                        </button>
                      </div>
                    );
                  })()}

                  {(!fs5SelCountry || !fs5SelService) && <div className="p-4 rounded-xl bg-kitan-bg border border-kitan-border text-kitan-subtle text-sm text-center">Select a country and service to see pricing.</div>}
                </div>
              )}

              {!fs5CatalogLoading && fs5Countries.length === 0 && (
                <div className="text-center py-6">
                  <XCircle size={32} className="text-kitan-subtle mx-auto mb-3" />
                  <p className="text-kitan-muted text-sm">Failed to load Server 2 catalog</p>
                  <button onClick={load5SimCatalog} className="btn-secondary text-xs mt-3">Retry</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════ HISTORY TAB ════════════════════════════════ */}
      {tab === 'history' && (
        <div className="space-y-4">

          {/* Combined loading */}
          {(histLoading || fs5HistLoading) && Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-kitan p-5 animate-pulse flex gap-4">
              <div className="flex-1 space-y-2"><div className="h-4 bg-kitan-border/30 rounded w-1/3" /><div className="h-3 bg-kitan-border/20 rounded w-2/3" /></div>
              <div className="w-24 h-8 bg-kitan-border/20 rounded" />
            </div>
          ))}

          {!histLoading && !fs5HistLoading && history.length === 0 && fs5History.length === 0 && (
            <div className="card-kitan p-16 text-center">
              <History size={40} className="text-kitan-subtle mx-auto mb-3" />
              <p className="text-kitan-off-white font-semibold">No orders yet</p>
              <p className="text-kitan-muted text-sm mt-1">Your purchased virtual numbers will appear here.</p>
            </div>
          )}

          {/* SMSPool orders */}
          {!histLoading && history.map(order => {
            const svcName    = resolveServiceName(order.service);
            const cntName    = resolveCountryName(order.country);
            const isPending  = isActiveOrder(order.status);
            const isComplete = order.status === 'completed' || order.status === 'received';
            const isCancOrExp = order.status === 'cancelled' || order.status === 'expired';
            const isCancellingThis = cancellingOrderId === order.id;
            const isPollingThis    = histPollRefs.current.has(order.id);

            return (
              <div key={order.id} className={cn('card-kitan p-5 space-y-4 transition-all', isPending && 'border-amber-500/25', isComplete && 'border-green-500/25', isCancOrExp && 'opacity-70')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><p className="font-semibold text-kitan-off-white text-sm">{svcName} — {cntName}</p><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-kitan-surface border border-kitan-border text-kitan-subtle">S1</span></div>
                    <p className="text-kitan-teal font-display font-bold tracking-widest text-sm mt-1">+{order.phoneNumber}</p>
                    <p className="text-kitan-subtle text-xs mt-0.5">{new Date(order.createdAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-2"><StatusBadge status={isCancellingThis ? 'cancelling' : order.status} /><p className="text-kitan-teal font-bold text-sm">{formatNGN(order.costNGN)}</p></div>
                </div>
                {isPending && !isCancellingThis && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    {isPollingThis ? <Loader2 size={13} className="text-amber-400 animate-spin flex-shrink-0" /> : <RotateCcw size={13} className="text-amber-400 flex-shrink-0" />}
                    <p className="text-amber-400/80 text-xs flex-1">{isPollingThis ? 'Checking every 4 seconds…' : 'Waiting for SMS'}</p>
                    {!isPollingThis && <button onClick={() => startHistoryPoll(order.id)} className="text-amber-400 text-xs font-semibold hover:text-amber-300 flex items-center gap-1"><RefreshCw size={11} /> Resume</button>}
                  </div>
                )}
                {isComplete && order.smsCode && (
                  <div className="flex items-center justify-between gap-3 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                    <div><p className="text-green-400 text-xs font-semibold uppercase tracking-wide mb-0.5">SMS Code</p><p className="text-kitan-off-white font-bold text-2xl tracking-[0.2em] select-all">{order.smsCode}</p></div>
                    <button onClick={() => { navigator.clipboard.writeText(order.smsCode!); toast.success('Code copied'); }} className="flex items-center gap-1.5 text-green-400 text-xs font-semibold"><Copy size={13} /> Copy</button>
                  </div>
                )}
                {isPending && !isCancellingThis && (
                  <button onClick={() => handleHistoryCancel(order)} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/25 text-red-400 hover:bg-red-500/5 text-xs font-semibold transition-all">
                    <Ban size={13} /> Cancel &amp; Refund {formatNGN(order.costNGN)}
                  </button>
                )}
                {isCancOrExp && <div className="flex items-center gap-2 text-kitan-subtle text-xs"><XCircle size={12} className="flex-shrink-0" /><span>{order.status === 'cancelled' ? `Refunded ${formatNGN(order.costNGN)} to wallet.` : 'Order expired.'}</span></div>}
              </div>
            );
          })}

          {/* 5SIM orders */}
          {!fs5HistLoading && fs5History.map(order => {
            const isPending  = isActive5SimOrder(order.status);
            const isComplete = order.status === 'RECEIVED' || order.status === 'FINISHED';
            const isCancOrExp = order.status === 'CANCELED' || order.status === 'TIMEOUT';
            const isPollingThis = fs5HistPollRefs.current.has(order.id);

            return (
              <div key={order.id} className={cn('card-kitan p-5 space-y-4 transition-all', isPending && 'border-amber-500/25', isComplete && 'border-green-500/25', isCancOrExp && 'opacity-70')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><p className="font-semibold text-kitan-off-white text-sm">{order.serviceName} — {order.countryName}</p><span className="text-[10px] px-1.5 py-0.5 rounded-full bg-kitan-teal/10 border border-kitan-teal/20 text-kitan-teal">S2</span></div>
                    <p className="text-kitan-teal font-display font-bold tracking-widest text-sm mt-1">+{order.phone}</p>
                    <p className="text-kitan-subtle text-xs mt-0.5">{new Date(order.createdAt).toLocaleString('en-NG', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                  <div className="text-right flex-shrink-0 space-y-2"><StatusBadge status={order.status} /><p className="text-kitan-teal font-bold text-sm">{formatNGN(order.costNGN)}</p></div>
                </div>
                {isPending && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-amber-500/5 border border-amber-500/20">
                    {isPollingThis ? <Loader2 size={13} className="text-amber-400 animate-spin flex-shrink-0" /> : <RotateCcw size={13} className="text-amber-400 flex-shrink-0" />}
                    <p className="text-amber-400/80 text-xs flex-1">{isPollingThis ? 'Checking every 4 seconds…' : 'Waiting for SMS'}</p>
                    {!isPollingThis && <button onClick={() => start5SimHistoryPoll(order.id)} className="text-amber-400 text-xs font-semibold flex items-center gap-1"><RefreshCw size={11} /> Resume</button>}
                  </div>
                )}
                {isComplete && order.smsCode && (
                  <div className="flex items-center justify-between gap-3 bg-green-500/5 border border-green-500/20 rounded-xl px-4 py-3">
                    <div><p className="text-green-400 text-xs font-semibold uppercase tracking-wide mb-0.5">SMS Code</p><p className="text-kitan-off-white font-bold text-2xl tracking-[0.2em] select-all">{order.smsCode}</p></div>
                    <button onClick={() => { navigator.clipboard.writeText(order.smsCode!); toast.success('Copied'); }} className="flex items-center gap-1.5 text-green-400 text-xs font-semibold"><Copy size={13} /> Copy</button>
                  </div>
                )}
                {isPending && (
                  <button onClick={() => perform5SimCancel(order.id, order.costNGN, user?.id ?? '', 'history')} className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-red-500/25 text-red-400 hover:bg-red-500/5 text-xs font-semibold transition-all">
                    <Ban size={13} /> Cancel &amp; Refund {formatNGN(order.costNGN)}
                  </button>
                )}
                {isCancOrExp && <div className="flex items-center gap-2 text-kitan-subtle text-xs"><XCircle size={12} className="flex-shrink-0" /><span>{order.status === 'CANCELED' ? `Refunded ${formatNGN(order.costNGN)} to wallet.` : 'Order expired.'}</span></div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default VirtualNumbersPage;
