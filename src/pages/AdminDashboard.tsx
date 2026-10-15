import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Package, Users, ShoppingBag, TrendingUp,
  Plus, Edit3, Trash2, Save, X, Search, Upload,
  DollarSign, ArrowUpRight, AlertCircle, FileText, Camera, Layout,
  PlusCircle, Trash, GripVertical, ToggleLeft, ToggleRight, ImageIcon, Pin, PinOff,
  Phone, Zap, Sliders, Loader2, RefreshCw, ChevronDown,
  Settings, ToggleLeft as TogOff, ToggleRight as TogOn, Receipt, History,
  BarChart2, Globe, Video, Crown, Sparkles, Star, Shield, CheckCircle, Clock,
  Database
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import {
  useAuthStore, useOrdersStore, useTransactionsStore, useDocumentsStore,
  useWorkingPicturesStore, useFormatsStore, useExchangeRateStore, useProductsStore,
  useGlobalWPPriceStore
} from '@/stores/useStore';
import { dbOrderContent, dbPurchases, dbPayments, dbUserExport, dbRegisteredUsers, dbAdminAdjustments, dbDocuments, dbPictures, dbFormats, dbProducts } from '@/lib/db';
import type { RegisteredUserRow, AdminAdjustment } from '@/lib/db';
import type { OrderContent, Payment, Product, ProductCategory, KitanDocument, WorkingPicture, Format, DocumentFormField, FormFieldType } from '@/types';
import { formatNGN, CATEGORIES, DEFAULT_EXCHANGE_RATE } from '@/constants';
import { generateId, formatDate } from '@/lib/utils';
import { getAllUsers, syncUserToDB } from '@/lib/auth';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { optimizeAndUpload, type MediaBucket } from '@/lib/storage';
import { validateMediaFile } from '@/lib/imageProcessing';
import MediaMigrationPanel from '@/components/features/MediaMigrationPanel';

type Tab = 'overview' | 'products' | 'orders' | 'users' | 'tracking' | 'documents' | 'pictures' | 'formats' | 'exchange' | 'payments' | 'virtual-pricing' | 'website-settings' | 'receipt-admin' | 'account-boosting' | 'website-products' | 'tutorial-videos' | 'subscriptions' | 'social-accounts' | 'virtual-5sim' | 'migration';

// =================== SMSPOOL TYPES ===================
interface SMSPriceOverride {
  id: string;
  country_id: string;
  service_name: string;
  custom_naira_price: number;
  updated_at: string;
}

interface PricingConfig {
  usdToNgn: number;
  globalMultiplier: number;
  overrides: SMSPriceOverride[];
}

// Proxy helper — same pattern as VirtualNumbersPage
async function smsAdmin<T = unknown>(payload: Record<string, unknown>): Promise<T> {
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

// =================== REUSABLE IMAGE UPLOADER (Supabase Storage) ===================
/**
 * Uploads go through the browser-side optimizer (resize → WebP → thumbnail)
 * and land in Supabase Storage. Only the resulting public URLs are stored in
 * the database — Base64/data URLs are never written to new records.
 */
const ImageUploader: React.FC<{
  label?: string;
  images: string[];
  onChange: (images: string[]) => void;
  maxImages?: number;
  bucket: MediaBucket;
  /** Storage folder: the record id when editing, a stable draft-… key when creating. */
  folder: string;
}> = ({ label = 'Images', images, onChange, maxImages = 10, bucket, folder }) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (inputRef.current) inputRef.current.value = '';
    if (!files.length) return;

    const remaining = maxImages - images.length;
    const toProcess = files.slice(0, remaining);
    if (toProcess.length === 0) { toast.error(`Maximum ${maxImages} images allowed`); return; }
    if (files.length > toProcess.length) toast.error(`Only ${toProcess.length} more image(s) allowed — extras skipped`);

    setUploading(true);
    setProgress({ done: 0, total: toProcess.length });
    const uploaded: string[] = [];
    for (let i = 0; i < toProcess.length; i++) {
      const file = toProcess[i];
      const invalid = validateMediaFile(file);
      if (invalid) { toast.error(invalid); continue; }
      try {
        const { fullUrl } = await optimizeAndUpload(file, {
          bucket,
          folder,
          slot: `image-${images.length + uploaded.length + 1}`,
        });
        uploaded.push(fullUrl);
      } catch (err) {
        console.error('ImageUploader upload failed:', err);
        toast.error(`${file.name}: ${err instanceof Error ? err.message : 'upload failed'}`);
      }
      setProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setUploading(false);
    setProgress({ done: 0, total: 0 });
    if (uploaded.length) {
      onChange([...images, ...uploaded]);
      toast.success(`${uploaded.length} image(s) uploaded to storage`);
    }
  };

  const removeImage = (idx: number) => onChange(images.filter((_, i) => i !== idx));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-kitan-muted text-xs">{label} ({images.length}/{maxImages})</label>
        {images.length < maxImages && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 text-kitan-teal text-xs font-semibold hover:text-kitan-teal-bright transition-colors bg-kitan-teal/10 px-3 py-1.5 rounded-lg border border-kitan-teal/30"
          >
            {uploading
              ? <><div className="w-3 h-3 border border-kitan-teal/30 border-t-kitan-teal rounded-full animate-spin" /> Uploading {progress.done}/{progress.total}…</>
              : <><Upload size={12} /> Upload from Device</>}
          </button>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={handleFiles} />

      {images.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {images.map((img, i) => (
            <div key={i} className="relative rounded-xl overflow-hidden border border-kitan-border group" style={{ aspectRatio: '4/3' }}>
              <img src={img} alt="" className="w-full h-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-kitan-bg/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <button type="button" onClick={() => removeImage(i)} className="w-9 h-9 rounded-full bg-red-500 flex items-center justify-center text-white shadow-lg">
                  <Trash size={16} />
                </button>
              </div>
              {i === 0 && <span className="absolute top-2 left-2 bg-kitan-teal text-white text-[10px] font-bold px-2 py-0.5 rounded-full">Cover</span>}
            </div>
          ))}
          {images.length < maxImages && (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-xl border-2 border-dashed border-kitan-border hover:border-kitan-teal flex flex-col items-center justify-center gap-2 text-kitan-subtle hover:text-kitan-teal transition-all"
              style={{ aspectRatio: '4/3' }}
            >
              <Plus size={22} />
              <span className="text-xs font-medium">Add More</span>
            </button>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="w-full h-28 rounded-xl border-2 border-dashed border-kitan-border hover:border-kitan-teal bg-kitan-bg/30 flex flex-col items-center justify-center gap-2 transition-all group"
        >
          <ImageIcon size={24} className="text-kitan-subtle group-hover:text-kitan-teal" />
          <span className="text-kitan-muted text-sm group-hover:text-kitan-off-white transition-colors">Click to upload images from device</span>
          <span className="text-kitan-subtle text-xs">JPG, PNG, WebP, GIF, MP4 — auto-optimized to WebP</span>
        </button>
      )}
    </div>
  );
};

// =================== PIN BUTTON ===================
const PinButton: React.FC<{ pinned?: boolean; onClick: () => void; loading?: boolean }> = ({ pinned, onClick, loading }) => (
  <button
    onClick={onClick}
    disabled={loading}
    title={pinned ? 'Unpin (currently showing first)' : 'Pin to top'}
    className={cn(
      'w-8 h-8 rounded-lg flex items-center justify-center transition-all',
      pinned
        ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
        : 'hover:bg-kitan-teal/10 text-kitan-subtle hover:text-kitan-teal'
    )}
  >
    {pinned ? <Pin size={14} fill="currentColor" /> : <PinOff size={14} />}
  </button>
);

// =================== MAIN DASHBOARD ===================
const AdminDashboard: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const { orders, updateOrderTracking } = useOrdersStore();
  const { transactions } = useTransactionsStore();
  const { documents, submissions, addDocument, updateDocument, deleteDocument, loadDocuments, loadSubmissions, togglePin: toggleDocPin } = useDocumentsStore();
  const { items: pictures, addItem: addPicture, updateItem: updatePicture, deleteItem: deletePicture, loadItems: loadPictures, togglePin: togglePicPin } = useWorkingPicturesStore();
  const { formats, addFormat, updateFormat, deleteFormat, loadFormats, togglePin: toggleFmtPin } = useFormatsStore();
  const { rate: exchangeRate, setRate: setExchangeRate } = useExchangeRateStore();
  const { globalWPPrice, setGlobalWPPrice } = useGlobalWPPriceStore();
  const { products, saveProduct, removeProduct, loadProducts, togglePin: toggleProductPin } = useProductsStore();

  // Storage folders for the image uploader: record id when editing, a stable
  // per-session draft key when creating (files are grouped per record either way).
  const draftFoldersRef = useRef<Partial<Record<MediaBucket, string>>>({});
  const getUploadFolder = (bucket: MediaBucket, editingId?: string): string => {
    if (editingId) return editingId;
    if (!draftFoldersRef.current[bucket]) {
      draftFoldersRef.current[bucket] = `draft-${bucket}-${Date.now().toString(36)}`;
    }
    return draftFoldersRef.current[bucket]!;
  };

  const [newRate, setNewRate] = useState(String(exchangeRate));
  const [newGlobalWPPrice, setNewGlobalWPPrice] = useState(String(globalWPPrice));
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [editingProduct, setEditingProduct] = useState<Partial<Product> | null>(null);
  const [isNewProduct, setIsNewProduct] = useState(false);
  const [_userBalanceEdit, _setUserBalanceEdit] = useState<{ userId: string; amount: string } | null>(null);
  const [trackingEdit, setTrackingEdit] = useState<{ orderId: string; status: string; message: string } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [pinLoading, setPinLoading] = useState<string | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'successful' | 'pending' | 'failed'>('all');
  const [csvExporting, setCsvExporting] = useState(false);

  // ── DB-backed users ───────────────────────────────────────────────────────
  const [dbUsers,        setDbUsers]        = useState<RegisteredUserRow[]>([]);
  const [dbUsersLoading, setDbUsersLoading] = useState(false);

  // ── Manual Wallet Adjustment ──────────────────────────────────────────────
  const [adjTarget,      setAdjTarget]      = useState<RegisteredUserRow | null>(null);
  const [adjType,        setAdjType]        = useState<'credit' | 'debit'>('credit');
  const [adjAmount,      setAdjAmount]      = useState('');
  const [adjReason,      setAdjReason]      = useState('');
  const [adjSubmitting,  setAdjSubmitting]  = useState(false);
  const [adjHistory,     setAdjHistory]     = useState<AdminAdjustment[]>([]);
  const [adjHistLoading, setAdjHistLoading] = useState(false);
  const [walletBalances, setWalletBalances] = useState<Record<string, number>>({});

  // ── Enhanced payment product map ──────────────────────────────────────────
  const [paymentProductMap, setPaymentProductMap] = useState<Record<string, string>>({});

  // ── Website Settings ──────────────────────────────────────────────────────
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  const [savingMaintenance, setSavingMaintenance] = useState(false);
  const [maintenanceLoaded, setMaintenanceLoaded] = useState(false);

  // ── Receipt Admin ─────────────────────────────────────────────────────────
  const [receiptPrice, setReceiptPrice] = useState(2500);
  const [receiptProducts, setReceiptProducts] = useState<Array<{id:string;name:string;slug:string;enabled:boolean;sortOrder:number}>>([]);
  const [receiptHistory, setReceiptHistory] = useState<Array<{id:string;app_user_id:string;product_name:string;form_data:Record<string,string>;amount_ngn:number;created_at:string}>>([]);
  const [receiptAdminLoading, setReceiptAdminLoading] = useState(false);
  const [savingReceiptPrice, setSavingReceiptPrice] = useState(false);
  const [newReceiptPrice, setNewReceiptPrice] = useState('2500');

  // ── Virtual Pricing state ──────────────────────────────────────────────
  const [vpConfig,           setVpConfig]           = useState<PricingConfig | null>(null);
  const [vpLoading,          setVpLoading]          = useState(false);
  const [vpSavingMult,       setVpSavingMult]       = useState(false);
  const [vpMultiplier,       setVpMultiplier]       = useState(1);
  const [vpOvrCountry,       setVpOvrCountry]       = useState('');
  const [vpOvrService,       setVpOvrService]       = useState('');
  const [vpOvrPrice,         setVpOvrPrice]         = useState('');
  const [vpSavingOvr,        setVpSavingOvr]        = useState(false);
  const [vpDeletingId,       setVpDeletingId]       = useState<string | null>(null);
  const [vpCatalogCountries, setVpCatalogCountries] = useState<{id:string;name:string}[]>([]);
  const [vpCatalogServices,  setVpCatalogServices]  = useState<{id:string;name:string}[]>([]);
  const [vpCatalogLoaded,    setVpCatalogLoaded]    = useState(false);
  const [vpOvrFilter,        setVpOvrFilter]        = useState('');

  // ── Account Boosting Admin state ────────────────────────────────────────
  const [japConfig, setJapConfig] = useState<{
    globalMultiplier: number;
    exchangeRate: number;
    lastSync: string | null;
    serviceCount: number;
    categoryCount?: number;
  } | null>(null);
  const [japConfigLoading,      setJapConfigLoading]      = useState(false);
  const [japMultiplier,         setJapMultiplier]         = useState(1);
  const [japSavingMult,         setJapSavingMult]         = useState(false);
  const [japSyncing,            setJapSyncing]            = useState(false);
  const [japSyncProgress,       setJapSyncProgress]       = useState('');
  const [japExchangeRateInput,  setJapExchangeRateInput]  = useState('1450');
  const [japSavingExchangeRate, setJapSavingExchangeRate] = useState(false);
  const [japServices, setJapServices] = useState<Array<{
    id: string; service_name: string; category_name: string;
    original_api_price: number; custom_admin_price: number | null;
    min_quantity: number; max_quantity: number; active: boolean;
  }>>([]);
  const [japServicesLoading, setJapServicesLoading] = useState(false);
  const [japServiceSearch,   setJapServiceSearch]   = useState('');
  const [japEditPrices,      setJapEditPrices]      = useState<Record<string, string>>({});
  const [japSavingPrice,     setJapSavingPrice]     = useState<string | null>(null);
  const [japOrders, setJapOrders] = useState<Array<{
    id: string; app_user_id: string; service_name: string; category_name: string;
    target_link: string; quantity: number; cost_ngn: number;
    jap_order_id: string | null; status: string; created_at: string; error_message: string | null;
  }>>([]);
  const [japOrdersLoading, setJapOrdersLoading] = useState(false);
  const [japOrderFilter,   setJapOrderFilter]   = useState('all');

  // ── Website Products ─────────────────────────────────────────────────────
  const [websiteProducts,       setWebsiteProducts]       = useState<Array<{id:string;title:string;description:string;price_ngn:number;preview_images:string[];features:string[];available:boolean;tags:string[];is_premium:boolean;pinned:boolean}>>([]);
  const [websiteProductsLoading,setWebsiteProductsLoading]= useState(false);
  const [editingWP,             setEditingWP]             = useState<Record<string,unknown> | null>(null);
  const [isNewWP,               setIsNewWP]               = useState(false);

  // ── Tutorial Videos ───────────────────────────────────────────────────────
  const SERVICE_KEYS = [
    { key: 'gifts',            label: 'Gift Items' },
    { key: 'documents',        label: 'Documents' },
    { key: 'working_pictures', label: 'Working Pictures' },
    { key: 'formats',          label: 'Formats & Templates' },
    { key: 'virtual_numbers',  label: 'Virtual Numbers' },
    { key: 'receipt_generator',label: 'Receipt Generator' },
    { key: 'account_boosting', label: 'Account Boosting' },
    { key: 'website',          label: 'Website Services' },
  ];
  const [tutorialVideos,       setTutorialVideos]       = useState<Record<string, { title: string; video_url: string }>>({});
  const [tutorialVideosLoading,setTutorialVideosLoading]= useState(false);
  const [savingVideoKey,       setSavingVideoKey]       = useState<string | null>(null);
  const [videoEdits,           setVideoEdits]           = useState<Record<string, { title: string; video_url: string }>>({});

  // ── Subscriptions Admin ────────────────────────────────────────────────────
  const [subPlans,          setSubPlans]          = useState<Array<{id:string;name:string;price_ngn:number;duration_days:number;is_popular:boolean;enabled:boolean;description:string;color_theme:string;sort_order:number}>>([]);
  const [subPlansLoading,   setSubPlansLoading]   = useState(false);
  const [editingPlan,       setEditingPlan]       = useState<Record<string,unknown> | null>(null);
  const [isNewPlan,         setIsNewPlan]         = useState(false);
  const [subscribers,       setSubscribers]       = useState<Array<{id:string;app_user_id:string;plan_name:string;status:string;price_paid_ngn:number;activated_at:string;expires_at:string}>>([]);
  const [subscribersLoading,setSubscribersLoading]= useState(false);

  // ── Product Access Manager (PAM) — real product assignment ─────────────────
  // Service-level types (no individual product records — access granted at service level)
  const PAM_SERVICE_TYPES = [
    { type: 'virtual_numbers',   table: null as string | null, label: 'Virtual Numbers' },
    { type: 'receipt_generator', table: null as string | null, label: 'Receipt Generator' },
    { type: 'account_boosting',  table: null as string | null, label: 'Account Boosting' },
  ];
  // Product tables (have real product records)
  const PAM_PRODUCT_TABLES: Array<{ type: string; table: string; label: string }> = [
    { type: 'gift',             table: 'products',         label: 'Gift Items' },
    { type: 'document',         table: 'kitan_documents',  label: 'Documents' },
    { type: 'working_picture',  table: 'working_pictures', label: 'Working Pictures' },
    { type: 'format',           table: 'formats',          label: 'Formats & Templates' },
    { type: 'website',          table: 'website_products', label: 'Website Services' },
  ];
  interface PamRow {
    id: string;
    product_type: string;
    product_table: string | null;
    product_id: string | null;  // null = service-level
    product_name: string;
    qty_limit: number | null;
  }
  interface PamCatalogItem { id: string; title: string; type: string; table: string; }
  const [pamRows,         setPamRows]         = useState<PamRow[]>([]);
  const [pamCatalog,      setPamCatalog]      = useState<PamCatalogItem[]>([]);
  const [pamLoading,      setPamLoading]      = useState(false);
  const [pamCatalogLoading,setPamCatalogLoading] = useState(false);
  const [pamSaving,       setPamSaving]       = useState(false);
  const [pamPlanId,       setPamPlanId]       = useState<string | null>(null);
  const [pamSearch,       setPamSearch]       = useState('');  // filter catalog



  // Order content state
  const [orderContentMap,      setOrderContentMap]      = useState<Record<string, OrderContent | null>>({});
  const [orderContentDraft,    setOrderContentDraft]    = useState<Record<string, { text: string; imageUrls: string[] }>>({});
  const [orderContentUploading,setOrderContentUploading]= useState<Record<string, boolean>>({});
  const [orderContentSaving,   setOrderContentSaving]   = useState<Record<string, boolean>>({});

  // ── 5SIM Admin state ──────────────────────────────────────────────────────
  const [fiveSimMult,         setFiveSimMult]         = useState(1);
  const [fiveSimMultInput,    setFiveSimMultInput]    = useState(1);
  const [fiveSimAdminLoading, setFiveSimAdminLoading] = useState(false);
  const [fiveSimAdminSaving,  setFiveSimAdminSaving]  = useState(false);
  const [fiveSimUsdToNgn,     setFiveSimUsdToNgn]     = useState(1600);

  const load5SimConfig = useCallback(async () => {
    setFiveSimAdminLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('fivesim', { body: { action: 'getMultiplier' } });
      if (!error && data) {
        setFiveSimMult(data.multiplier ?? 1);
        setFiveSimMultInput(data.multiplier ?? 1);
        setFiveSimUsdToNgn(data.usdToNgn ?? 1600);
      }
    } catch (e) { toast.error(`5SIM config error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setFiveSimAdminLoading(false); }
  }, []);

  const save5SimMultiplier = async () => {
    setFiveSimAdminSaving(true);
    try {
      const { error } = await supabase.functions.invoke('fivesim', { body: { action: 'setMultiplier', multiplier: fiveSimMultInput } });
      if (error) throw new Error(error.message);
      setFiveSimMult(fiveSimMultInput);
      toast.success(`5SIM multiplier set to ×${fiveSimMultInput}`);
    } catch (e) { toast.error(`Save failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setFiveSimAdminSaving(false); }
  };

  // ── Social Accounts state ─────────────────────────────────────────────────
  const SOCIAL_CATEGORIES = ['Facebook','Instagram','X (Twitter)','TikTok','Gmail','VPN','Other'];
  interface SocialAccountRow {
    id: string; title: string; category: string; price: number;
    description: string; notes: string; available: boolean; stock: number;
    pinned: boolean; pin_position: number | null;
  }
  const [socialAccounts,        setSocialAccounts]        = useState<SocialAccountRow[]>([]);
  const [socialAccountsLoading, setSocialAccountsLoading] = useState(false);
  const [editingSA,             setEditingSA]             = useState<Partial<SocialAccountRow> | null>(null);
  const [isNewSA,               setIsNewSA]               = useState(false);

  const loadSocialAccounts = useCallback(async () => {
    setSocialAccountsLoading(true);
    const { data } = await supabase
      .from('social_accounts')
      .select('*')
      .order('pin_position', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false });
    setSocialAccounts((data || []) as SocialAccountRow[]);
    setSocialAccountsLoading(false);
  }, []);

  const handleSaveSA = async () => {
    if (!editingSA?.title || editingSA.price === undefined) { toast.error('Title and price are required'); return; }
    const payload = {
      title: editingSA.title, category: editingSA.category || 'Other',
      price: editingSA.price, description: editingSA.description || '',
      notes: editingSA.notes || '', available: editingSA.available ?? true,
      stock: editingSA.stock ?? 0, pinned: editingSA.pinned ?? false,
      pin_position: editingSA.pin_position ?? null, updated_at: new Date().toISOString(),
    };
    if (isNewSA) {
      const id = 'sac_adm_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
      await supabase.from('social_accounts').insert({ ...payload, id, created_at: new Date().toISOString() });
      toast.success('Account product created');
    } else {
      await supabase.from('social_accounts').update(payload).eq('id', editingSA.id!);
      toast.success('Account product updated');
    }
    setEditingSA(null); setIsNewSA(false); loadSocialAccounts();
  };

  const handleDeleteSA = async (id: string) => {
    await supabase.from('social_accounts').delete().eq('id', id);
    toast.success('Deleted'); loadSocialAccounts();
  };

  const toggleSAPinned = async (id: string, pinned: boolean) => {
    await supabase.from('social_accounts').update({ pinned }).eq('id', id);
    setSocialAccounts(prev => prev.map(a => a.id === id ? { ...a, pinned } : a));
    toast.success('Pin status updated');
  };

  const loadWebsiteProducts = useCallback(async () => {
    setWebsiteProductsLoading(true);
    const { data } = await supabase.from('website_products').select('*').order('created_at', { ascending: false });
    setWebsiteProducts(data || []);
    setWebsiteProductsLoading(false);
  }, []);

  const loadTutorialVideos = useCallback(async () => {
    setTutorialVideosLoading(true);
    const { data } = await supabase.from('tutorial_videos').select('*');
    const map: Record<string, { title: string; video_url: string }> = {};
    (data || []).forEach((r: {service_key:string;title:string;video_url:string}) => { map[r.service_key] = { title: r.title, video_url: r.video_url }; });
    setTutorialVideos(map);
    const edits: Record<string, { title: string; video_url: string }> = {};
    SERVICE_KEYS.forEach(({ key }) => { edits[key] = map[key] || { title: '', video_url: '' }; });
    setVideoEdits(edits);
    setTutorialVideosLoading(false);
  }, [SERVICE_KEYS]);

  const saveTutorialVideo = async (serviceKey: string) => {
    const edit = videoEdits[serviceKey];
    if (!edit) return;
    setSavingVideoKey(serviceKey);
    await supabase.from('tutorial_videos').upsert({ service_key: serviceKey, title: edit.title, video_url: edit.video_url, updated_at: new Date().toISOString() }, { onConflict: 'service_key' });
    setTutorialVideos(prev => ({ ...prev, [serviceKey]: edit }));
    toast.success('Tutorial video saved');
    setSavingVideoKey(null);
  };

  const loadSubPlans = useCallback(async () => {
    setSubPlansLoading(true);
    const { data } = await supabase.from('subscription_plans').select('id,name,price_ngn,duration_days,is_popular,enabled,description,color_theme,sort_order').order('sort_order');
    setSubPlans((data || []) as Parameters<typeof setSubPlans>[0]);
    setSubPlansLoading(false);
  }, []);

  /** Load all real product records from every product table into pamCatalog */
  const loadPamCatalog = useCallback(async () => {
    setPamCatalogLoading(true);
    const items: PamCatalogItem[] = [];
    for (const tbl of PAM_PRODUCT_TABLES) {
      // Pick the right title/name column
      const titleCol = tbl.table === 'website_products' ? 'title' : 'title';
      const { data } = await supabase
        .from(tbl.table)
        .select(`id, ${titleCol}`)
        .order('created_at', { ascending: false });
      (data || []).forEach((r: Record<string,unknown>) => {
        items.push({ id: r.id as string, title: (r[titleCol] as string) || 'Untitled', type: tbl.type, table: tbl.table });
      });
    }
    setPamCatalog(items);
    setPamCatalogLoading(false);
  }, []);

  const loadPamRows = useCallback(async (planId: string, _isNew: boolean) => {
    setPamLoading(true);
    setPamPlanId(planId);
    // Always load from DB (empty if new plan)
    const { data } = await supabase.from('plan_products').select('*').eq('plan_id', planId);
    setPamRows((data || []).map((r: Record<string,unknown>) => ({
      id: r.id as string,
      product_type: r.product_type as string,
      product_table: r.product_table as string | null,
      product_id: r.product_id as string | null,
      product_name: r.product_name as string,
      qty_limit: r.qty_limit != null ? Number(r.qty_limit) : null,
    })));
    setPamLoading(false);
    // Also ensure catalog is loaded
    if (pamCatalog.length === 0) loadPamCatalog();
  }, [pamCatalog.length, loadPamCatalog]);

  /** Is a given product or service already assigned to this plan? */
  const isPamRowAssigned = (productId: string | null, productType: string) =>
    pamRows.some(r => r.product_id === productId && r.product_type === productType);

  /** Toggle assignment of a product in the plan */
  const togglePamItem = (item: { id: string | null; type: string; table: string | null; name: string }) => {
    const exists = isPamRowAssigned(item.id, item.type);
    if (exists) {
      setPamRows(prev => prev.filter(r => !(r.product_id === item.id && r.product_type === item.type)));
    } else {
      const newRow: PamRow = {
        id: `${pamPlanId}_${item.type}_${item.id ?? 'svc'}_${Date.now()}`,
        product_type: item.type,
        product_table: item.table,
        product_id: item.id,
        product_name: item.name,
        qty_limit: null,
      };
      setPamRows(prev => [...prev, newRow]);
    }
  };

  /** Update qty_limit for a specific row */
  const updatePamRowQty = (productId: string | null, productType: string, qty: number | null) => {
    setPamRows(prev => prev.map(r =>
      r.product_id === productId && r.product_type === productType
        ? { ...r, qty_limit: qty }
        : r
    ));
  };

  const savePamRowsToDB = async (planId: string) => {
    setPamSaving(true);
    // 1. Delete all existing rows for this plan
    await supabase.from('plan_products').delete().eq('plan_id', planId);
    // 2. Insert fresh rows
    if (pamRows.length > 0) {
      const insertRows = pamRows.map(row => ({
        id: row.id,
        plan_id: planId,
        product_type: row.product_type,
        product_table: row.product_table,
        product_id: row.product_id,
        product_name: row.product_name,
        qty_limit: row.qty_limit,
        included: true,  // all saved rows are included; removed = not in list
      }));
      const { error } = await supabase.from('plan_products').insert(insertRows);
      if (error) console.error('savePamRowsToDB:', error.message);
    }
    setPamSaving(false);
  };

  const loadSubscribers = useCallback(async () => {
    setSubscribersLoading(true);
    const { data } = await supabase.from('user_subscriptions').select('*').order('created_at', { ascending: false }).limit(100);
    setSubscribers(data || []);
    setSubscribersLoading(false);
  }, []);

  const savePlan = async () => {
    if (!editingPlan) return;
    const { features: _f, ...planData } = editingPlan as Record<string,unknown>; void _f;
    let finalPlanId: string;
    if (isNewPlan) {
      finalPlanId = pamPlanId || `plan_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      await supabase.from('subscription_plans').insert({ ...planData, id: finalPlanId, features: '[]', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
      toast.success('Plan created');
    } else {
      finalPlanId = editingPlan.id as string;
      await supabase.from('subscription_plans').update({ ...planData, features: '[]', updated_at: new Date().toISOString() }).eq('id', finalPlanId);
      toast.success('Plan updated');
    }
    await savePamRowsToDB(finalPlanId);
    setEditingPlan(null); setIsNewPlan(false); setPamRows([]); setPamPlanId(null); setPamSearch(''); loadSubPlans();
  };

  const saveWebsiteProduct = async () => {
    if (!editingWP || !editingWP.title) { toast.error('Title required'); return; }
    const featuresList = (String(editingWP._featuresRaw || '')).split('\n').map(s => s.trim()).filter(Boolean);
    const tagsList = (String(editingWP._tagsRaw || '')).split(',').map(s => s.trim()).filter(Boolean);
    const { _featuresRaw: _fr, _tagsRaw: _tr, ...rest } = editingWP;
    const payload = { ...rest, features: featuresList, tags: tagsList, updated_at: new Date().toISOString() };
    if (isNewWP) {
      const id = `wp_site_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
      await supabase.from('website_products').insert({ ...payload, id, created_at: new Date().toISOString() });
      toast.success('Website product created');
    } else {
      await supabase.from('website_products').update(payload).eq('id', editingWP.id as string);
      toast.success('Website product updated');
    }
    setEditingWP(null); setIsNewWP(false); loadWebsiteProducts();
  };

  const loadOrderContent = async (productId: string, productType: 'working_picture' | 'format') => {
    const existing = await dbOrderContent.get(productId, productType);
    setOrderContentMap(prev => ({ ...prev, [productId]: existing }));
    setOrderContentDraft(prev => ({
      ...prev,
      [productId]: { text: existing?.textContent || '', imageUrls: existing?.imageUrls || [] },
    }));
  };

  const saveOrderContent = async (productId: string, productType: 'working_picture' | 'format') => {
    const draft = orderContentDraft[productId];
    if (!draft) return;
    setOrderContentSaving(prev => ({ ...prev, [productId]: true }));
    const result = await dbOrderContent.upsert({ productId, productType, textContent: draft.text, imageUrls: draft.imageUrls });
    if (result) {
      setOrderContentMap(prev => ({ ...prev, [productId]: result }));
      toast.success('Order content saved! Purchasers will see this immediately.');
    } else {
      toast.error('Failed to save order content');
    }
    setOrderContentSaving(prev => ({ ...prev, [productId]: false }));
  };

  const handleOrderContentImageUpload = async (productId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setOrderContentUploading(prev => ({ ...prev, [productId]: true }));
    const newUrls: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > 50 * 1024 * 1024) { toast.error(`${file.name} exceeds 50MB limit`); continue; }
      const url = await dbOrderContent.uploadImage(file, productId);
      if (url) newUrls.push(url);
      else toast.error(`Failed to upload ${file.name}`);
    }
    if (newUrls.length > 0) {
      setOrderContentDraft(prev => ({
        ...prev,
        [productId]: { ...prev[productId], imageUrls: [...(prev[productId]?.imageUrls || []), ...newUrls] },
      }));
      toast.success(`${newUrls.length} image(s) uploaded to storage`);
    }
    setOrderContentUploading(prev => ({ ...prev, [productId]: false }));
  };

  const removeOrderContentImage = async (productId: string, url: string, index: number) => {
    await dbOrderContent.deleteImage(url);
    setOrderContentDraft(prev => ({
      ...prev,
      [productId]: { ...prev[productId], imageUrls: prev[productId].imageUrls.filter((_, i) => i !== index) },
    }));
  };

  const [editingDoc, setEditingDoc] = useState<Partial<KitanDocument> | null>(null);
  const [isNewDoc, setIsNewDoc] = useState(false);
  const [editingPic, setEditingPic] = useState<Partial<WorkingPicture> | null>(null);
  const [isNewPic, setIsNewPic] = useState(false);
  const [editingFmt, setEditingFmt] = useState<Partial<Format> | null>(null);
  const [isNewFmt, setIsNewFmt] = useState(false);

  // ── Loaders (declared BEFORE the admin-gate early return so hook order
  //    stays stable — rules-of-hooks) ────────────────────────────────────────
  const loadVpConfig = useCallback(async () => {
    setVpLoading(true);
    try {
      const res = await smsAdmin<PricingConfig>({ action: 'getPricingConfig' });
      setVpConfig(res); setVpMultiplier(res.globalMultiplier);
    } catch (e) { toast.error(`Failed to load pricing config: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setVpLoading(false); }
  }, []);

  const loadVpCatalog = useCallback(async () => {
    if (vpCatalogLoaded) return;
    try {
      const res = await smsAdmin<{ countries: {id:string;name:string}[]; services: {id:string;name:string}[] }>({ action: 'getPrices' });
      setVpCatalogCountries(res.countries ?? []); setVpCatalogServices(res.services ?? []); setVpCatalogLoaded(true);
    } catch (e) { toast.error(`Failed to load SMSPool catalog: ${e instanceof Error ? e.message : String(e)}`); }
  }, [vpCatalogLoaded]);

  const loadJapConfig = useCallback(async () => {
    setJapConfigLoading(true);
    try {
      const res = await japAdmin<{ globalMultiplier: number; exchangeRate: number; lastSync: string | null; serviceCount: number; categoryCount?: number }>({ action: 'getConfig' });
      setJapConfig(res);
      setJapMultiplier(res.globalMultiplier);
      setJapExchangeRateInput(String(res.exchangeRate ?? 1450));
    } catch (e) { toast.error(`Boosting config error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setJapConfigLoading(false); }
  }, []);

  const loadJapServices = useCallback(async () => {
    setJapServicesLoading(true);
    try {
      const res = await japAdmin<{ services: unknown[] }>({ action: 'getServices' });
      setJapServices((res.services || []) as Parameters<typeof setJapServices>[0]);
    } catch (e) { toast.error(`Boosting services error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setJapServicesLoading(false); }
  }, []);

  const loadJapOrders = useCallback(async () => {
    setJapOrdersLoading(true);
    try {
      const res = await japAdmin<{ orders: Parameters<typeof setJapOrders>[0] }>({ action: 'getAdminOrders', limit: 200 });
      setJapOrders(res.orders || []);
    } catch (e) { toast.error(`Boosting orders error: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setJapOrdersLoading(false); }
  }, []);

  const loadMaintenanceMode = useCallback(async () => {
    const { data } = await supabase.from('website_settings').select('value').eq('key', 'maintenance_mode').single();
    setMaintenanceMode(data?.value === 'true'); setMaintenanceLoaded(true);
  }, []);

  const loadReceiptAdmin = useCallback(async () => {
    setReceiptAdminLoading(true);
    const [prodRes, settingsRes, histRes] = await Promise.all([
      supabase.from('receipt_products').select('*').order('sort_order'),
      supabase.from('receipt_settings').select('price_ngn').eq('id', 1).single(),
      supabase.from('receipt_generations').select('*').order('created_at', { ascending: false }).limit(50),
    ]);
    if (prodRes.data) setReceiptProducts(prodRes.data.map(r => ({ id: r.id, name: r.name, slug: r.slug, enabled: r.enabled, sortOrder: r.sort_order })));
    if (settingsRes.data) { const p = Number(settingsRes.data.price_ngn); setReceiptPrice(p); setNewReceiptPrice(String(p)); }
    if (histRes.data) setReceiptHistory(histRes.data.map(r => ({ id: r.id, app_user_id: r.app_user_id, product_name: r.product_name, form_data: r.form_data, amount_ngn: Number(r.amount_ngn), created_at: r.created_at })));
    setReceiptAdminLoading(false);
  }, []);

  // ── Load DB users + wallet balances ────────────────────────────────────
  const loadDbUsers = useCallback(async () => {
    setDbUsersLoading(true);
    const localUsers = getAllUsers();
    localUsers.forEach(u => syncUserToDB(u));
    const [rows, balances] = await Promise.all([
      dbRegisteredUsers.getAll(),
      dbUserExport.getAllWalletBalances(),
    ]);
    setDbUsers(rows);
    setWalletBalances(balances);
    setDbUsersLoading(false);
  }, []);

  if (!user || user.role !== 'admin') {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-kitan-off-white text-xl font-bold mb-2">Access Denied</h2>
        <p className="text-kitan-muted mb-4">You need admin privileges to access this page.</p>
        <button onClick={() => navigate('/')} className="btn-primary">Go Home</button>
      </div>
    );
  }

  const allUsers = getAllUsers();
  const totalRevenue = transactions.filter(t => t.type === 'debit').reduce((s, t) => s + t.amount, 0);

  // ── CSV Export (DB-backed — captures all devices/sessions) ──────────────
  const handleExportUsersCSV = async () => {
    setCsvExporting(true);
    try {
      const localUsers = getAllUsers();
      await Promise.all(localUsers.map(u => syncUserToDB(u)));
      const [rows_db, balances] = await Promise.all([
        dbRegisteredUsers.getAll(),
        dbUserExport.getAllWalletBalances(),
      ]);
      const escape = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
      const csvRows: string[] = [['Email', 'Username', 'Role', 'Wallet Balance (NGN)', 'Account Status', 'Registered At'].join(',')];
      rows_db.forEach(u => {
        const balance = balances[u.id] ?? 0;
        csvRows.push([escape(u.email), escape(u.username || ''), escape(u.role), balance.toFixed(2), escape(u.account_status), escape(new Date(u.registered_at).toISOString())].join(','));
      });
      const csv  = csvRows.join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `kitan_users_export_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
      toast.success(`Exported ${rows_db.length} users to CSV (DB-synced)`);
    } catch (e) {
      toast.error(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setCsvExporting(false);
    }
  };

  const totalOrders   = orders.length;
  const pendingOrders = orders.filter(o => o.status === 'pending' || o.status === 'confirmed').length;

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview',         label: 'Overview',      icon: LayoutDashboard },
    { key: 'products',         label: 'Products',      icon: Package },
    { key: 'documents',        label: 'Documents',     icon: FileText },
    { key: 'pictures',         label: 'Pictures',      icon: Camera },
    { key: 'formats',          label: 'Formats',       icon: Layout },
    { key: 'payments',         label: 'Payments',      icon: DollarSign },
    { key: 'virtual-pricing',  label: 'VN Pricing',    icon: Phone },
    { key: 'receipt-admin',    label: 'Receipt Gen',   icon: Receipt },
    { key: 'website-products', label: 'Websites',      icon: Globe },
    { key: 'tutorial-videos',  label: 'Videos',        icon: Video },
    { key: 'subscriptions',    label: 'Subscriptions', icon: Crown },
    { key: 'orders',           label: 'Orders',        icon: ShoppingBag },
    { key: 'users',            label: 'Users',         icon: Users },
    { key: 'tracking',         label: 'Tracking',      icon: TrendingUp },
    { key: 'exchange',         label: 'Exchange Rate', icon: DollarSign },
    { key: 'website-settings', label: 'Website',       icon: Settings },
    { key: 'account-boosting', label: 'Boosting',      icon: BarChart2 },
    { key: 'social-accounts',  label: 'Social Accts',  icon: Users },
    { key: 'virtual-5sim',     label: '5SIM Config',   icon: Phone },
    { key: 'migration',        label: 'Media Migr',    icon: Database },
  ];

  const handlePin = async (id: string, fn: (id: string) => Promise<void>) => {
    setPinLoading(id);
    await fn(id);
    setPinLoading(null);
    toast.success('Pin status updated');
  };

  const handleSaveProduct = async () => {
    if (!editingProduct?.title || !editingProduct?.price) { toast.error('Title and price are required'); return; }
    const productToSave: Product = {
      id: editingProduct.id || `prod_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: editingProduct.title!, images: editingProduct.images || [],
      description: editingProduct.description || '', price: editingProduct.price!,
      countryPricing: editingProduct.countryPricing || { US: editingProduct.price! },
      countries: editingProduct.countries || ['US'],
      category: editingProduct.category as ProductCategory || 'Customized Items',
      available: editingProduct.available ?? true, createdAt: editingProduct.createdAt || new Date().toISOString(),
      tags: editingProduct.tags || [], featured: editingProduct.featured || false,
      pinned: editingProduct.pinned || false, rating: editingProduct.rating, reviewCount: editingProduct.reviewCount,
    };
    await saveProduct(productToSave);
    toast.success(isNewProduct ? 'Product created and saved!' : 'Product updated!');
    setEditingProduct(null); setIsNewProduct(false);
  };

  const handleDeleteProduct = async (id: string) => { await removeProduct(id); toast.success('Product deleted'); };

  // ── Virtual Pricing handlers (loaders declared above the admin gate) ──────
  const handleSaveMultiplier = async () => {
    setVpSavingMult(true);
    try {
      await smsAdmin({ action: 'setGlobalMultiplier', multiplier: vpMultiplier });
      setVpConfig(prev => prev ? { ...prev, globalMultiplier: vpMultiplier } : prev);
      toast.success(`Global multiplier set to ${vpMultiplier}×`);
    } catch (e) { toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setVpSavingMult(false); }
  };

  const handleSaveOverride = async () => {
    if (!vpOvrCountry || !vpOvrService || !vpOvrPrice) { toast.error('Fill all override fields'); return; }
    const price = parseFloat(vpOvrPrice);
    if (isNaN(price) || price < 0) { toast.error('Enter a valid price'); return; }
    setVpSavingOvr(true);
    try {
      await smsAdmin({ action: 'upsertPriceOverride', countryId: vpOvrCountry, serviceName: vpOvrService, customPrice: price });
      toast.success('Override saved successfully'); setVpOvrCountry(''); setVpOvrService(''); setVpOvrPrice('');
      await loadVpConfig();
    } catch (e) { toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setVpSavingOvr(false); }
  };

  const handleDeleteOverride = async (id: string) => {
    setVpDeletingId(id);
    try {
      await smsAdmin({ action: 'deletePriceOverride', overrideId: id });
      toast.success('Override removed');
      setVpConfig(prev => prev ? { ...prev, overrides: prev.overrides.filter(o => o.id !== id) } : prev);
    } catch (e) { toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`); }
    finally { setVpDeletingId(null); }
  };

  // ── Boosting admin helpers ────────────────────────────────────────────────
  async function japAdmin<T = unknown>(payload: Record<string, unknown>): Promise<T> {
    const { data, error } = await supabase.functions.invoke('jap', { body: payload });
    if (error) {
      let msg = error.message;
      if (error instanceof FunctionsHttpError) {
        try { const t = await error.context?.text(); msg = t || msg; } catch { /* ignore */ }
      }
      throw new Error(msg);
    }
    return data as T;
  }

  // (loadJapConfig / loadJapServices / loadJapOrders / loadMaintenanceMode /
  //  loadReceiptAdmin / loadDbUsers are declared above the admin gate.)

  const openAdjustModal = async (targetUser: RegisteredUserRow) => {
    setAdjTarget(targetUser);
    setAdjType('credit');
    setAdjAmount('');
    setAdjReason('');
    setAdjHistLoading(true);
    const hist = await dbAdminAdjustments.getByUser(targetUser.id);
    setAdjHistory(hist);
    setAdjHistLoading(false);
  };

  const handleApplyAdjustment = async () => {
    if (!adjTarget || !adjAmount || !adjReason.trim()) { toast.error('Fill in amount and reason'); return; }
    const amount = parseFloat(adjAmount);
    if (isNaN(amount) || amount <= 0) { toast.error('Enter a valid positive amount'); return; }
    setAdjSubmitting(true);
    try {
      const result = await dbAdminAdjustments.applyAdjustment({
        appUserId: adjTarget.id,
        adminName: user?.name ?? 'Admin',
        type: adjType,
        amount,
        reason: adjReason.trim(),
      });
      setWalletBalances(prev => ({ ...prev, [adjTarget.id]: result.newBalance }));
      toast.success(`Wallet ${adjType === 'credit' ? 'credited' : 'debited'} ₦${amount.toLocaleString('en-NG')} successfully`);
      setAdjAmount('');
      setAdjReason('');
      const hist = await dbAdminAdjustments.getByUser(adjTarget.id);
      setAdjHistory(hist);
    } catch (e) {
      toast.error(`Adjustment failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setAdjSubmitting(false);
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    if (tab === 'documents') { loadDocuments(); loadSubmissions(); }
    if (tab === 'pictures') loadPictures();
    if (tab === 'formats') loadFormats();
    if (tab === 'products') loadProducts();
    if (tab === 'payments') {
      setPaymentsLoading(true);
      dbPayments.getAll().then(p => {
        setPayments(p);
        setPaymentsLoading(false);
        supabase.from('purchases').select('reference, product_id, product_type').then(({ data: pd }) => {
          if (!pd) return;
          const map: Record<string, string> = {};
          pd.forEach(row => { map[row.reference as string] = `${String(row.product_type || '').replace(/_/g, ' ')} · ${String(row.product_id || '').slice(0, 14)}`; });
          setPaymentProductMap(map);
        });
      });
    }
    if (tab === 'virtual-pricing') { loadVpConfig(); loadVpCatalog(); }
    if (tab === 'account-boosting') { loadJapConfig(); loadJapServices(); loadJapOrders(); }
    if (tab === 'website-settings' && !maintenanceLoaded) loadMaintenanceMode();
    if (tab === 'receipt-admin') loadReceiptAdmin();
    if (tab === 'website-products') loadWebsiteProducts();
    if (tab === 'tutorial-videos') loadTutorialVideos();
    if (tab === 'subscriptions') { loadSubPlans(); loadSubscribers(); }
    if (tab === 'users') loadDbUsers();
    if (tab === 'social-accounts') loadSocialAccounts();
    if (tab === 'virtual-5sim') load5SimConfig();
  };

  const handleUpdateTracking = () => {
    if (!trackingEdit?.orderId || !trackingEdit.status || !trackingEdit.message) { toast.error('Fill all fields'); return; }
    updateOrderTracking(trackingEdit.orderId, { status: trackingEdit.status, message: trackingEdit.message });
    toast.success('Tracking updated!'); setTrackingEdit(null);
  };

  const handleSaveDocument = async () => {
    if (!editingDoc?.title || !editingDoc?.price) { toast.error('Title and price are required'); return; }
    if (isNewDoc) {
      await addDocument({ title: editingDoc.title!, description: editingDoc.description || '', price: editingDoc.price!, previewImages: editingDoc.previewImages || [], formFields: [], available: editingDoc.available ?? true, category: editingDoc.category || 'General' });
      toast.success('Document created!');
    } else {
      await updateDocument(editingDoc.id!, editingDoc as Partial<KitanDocument>); toast.success('Document updated!');
    }
    setEditingDoc(null); setIsNewDoc(false);
  };



  const OrderContentEditor = ({ productId, productType }: { productId: string; productType: 'working_picture' | 'format' }) => {
    const draft = orderContentDraft[productId];
    const isLoaded = productId in orderContentMap;
    const uploading = orderContentUploading[productId] || false;
    const saving = orderContentSaving[productId] || false;
    const ocInputRef = React.useRef<HTMLInputElement>(null);

    if (!isLoaded) {
      return (
        <div className="border-t border-kitan-border pt-4">
          <button type="button" onClick={() => loadOrderContent(productId, productType)} className="text-kitan-teal text-xs font-semibold hover:text-kitan-teal-bright flex items-center gap-1.5">
            <PlusCircle size={14} /> Load / Edit Order Content
          </button>
          <p className="text-kitan-subtle text-xs mt-1">Order Content is what purchasers receive after buying this product.</p>
        </div>
      );
    }

    return (
      <div className="border-t border-kitan-border pt-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-kitan-off-white text-sm font-semibold flex items-center gap-2"><ImageIcon size={15} className="text-kitan-teal" /> Order Content</h4>
            <p className="text-kitan-subtle text-xs mt-0.5">Delivered to purchasers automatically. Full-resolution images stored in cloud storage.</p>
          </div>
          {orderContentMap[productId] && <span className="text-kitan-teal text-xs font-semibold flex items-center gap-1"><Save size={11} /> Saved</span>}
        </div>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-kitan-muted text-xs">Order Images ({draft?.imageUrls.length || 0} uploaded)</label>
            <button type="button" onClick={() => ocInputRef.current?.click()} disabled={uploading} className="flex items-center gap-1.5 text-kitan-teal text-xs font-semibold hover:text-kitan-teal-bright transition-colors bg-kitan-teal/10 px-3 py-1.5 rounded-lg border border-kitan-teal/30 disabled:opacity-50">
              {uploading ? <div className="w-3 h-3 border border-kitan-teal/30 border-t-kitan-teal rounded-full animate-spin" /> : <Upload size={12} />}
              {uploading ? 'Uploading...' : 'Upload Images'}
            </button>
          </div>
          <input ref={ocInputRef} type="file" accept="image/*" multiple className="hidden" onChange={e => handleOrderContentImageUpload(productId, e.target.files)} />
          {draft?.imageUrls.length ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {draft.imageUrls.map((url, i) => (
                <div key={i} className="relative rounded-xl overflow-hidden border border-kitan-border group" style={{ minHeight: '80px' }}>
                  <img src={url} alt="" className="w-full h-auto object-contain bg-kitan-bg" style={{ maxHeight: '160px' }} />
                  <div className="absolute inset-0 bg-kitan-bg/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button type="button" onClick={() => removeOrderContentImage(productId, url, i)} className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center text-white shadow"><Trash size={14} /></button>
                  </div>
                  {i === 0 && <span className="absolute top-1.5 left-1.5 bg-kitan-teal text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">Cover</span>}
                </div>
              ))}
            </div>
          ) : (
            <div className="w-full h-24 rounded-xl border-2 border-dashed border-kitan-border hover:border-kitan-teal flex flex-col items-center justify-center gap-1.5 cursor-pointer transition-all" onClick={() => ocInputRef.current?.click()}>
              <ImageIcon size={20} className="text-kitan-subtle" />
              <span className="text-kitan-subtle text-xs">Click to upload full-resolution order images</span>
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <label className="text-kitan-muted text-xs block">Notes / Instructions</label>
          <textarea rows={5} className="input-kitan text-xs resize-none font-mono" placeholder="Add notes, instructions, or text content for the buyer." value={draft?.text || ''} onChange={e => setOrderContentDraft(prev => ({ ...prev, [productId]: { ...prev[productId], text: e.target.value } }))} />
        </div>
        <button type="button" onClick={() => saveOrderContent(productId, productType)} disabled={saving} className="btn-primary flex items-center gap-2 text-sm py-2.5">
          {saving ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save size={14} />}
          {saving ? 'Saving...' : 'Save Order Content'}
        </button>
      </div>
    );
  };

  const handleSavePicture = async () => {
    if (!editingPic?.title) { toast.error('Title is required'); return; }
    const priceVal = editingPic.price || 0;
    if (isNewPic) {
      await addPicture({ title: editingPic.title!, description: editingPic.description || '', price: priceVal, images: editingPic.images || [], mediaType: editingPic.mediaType || 'image', available: editingPic.available ?? true, tags: editingPic.tags || [], featured: editingPic.featured || false, externalUrl: editingPic.externalUrl || undefined });
      toast.success('Working Picture created!');
    } else { await updatePicture(editingPic.id!, editingPic as Partial<WorkingPicture>); toast.success('Working Picture updated!'); }
    setEditingPic(null); setIsNewPic(false);
  };

  const handleSaveFormat = async () => {
    if (!editingFmt?.title || !editingFmt?.price) { toast.error('Title and price are required'); return; }
    if (isNewFmt) {
      await addFormat({ title: editingFmt.title!, description: editingFmt.description || '', price: editingFmt.price!, previewImages: editingFmt.previewImages || [], fileType: editingFmt.fileType || 'PDF', available: editingFmt.available ?? true, tags: editingFmt.tags || [], downloadUrl: editingFmt.downloadUrl || '#' });
      toast.success('Format created!');
    } else { await updateFormat(editingFmt.id!, editingFmt as Partial<Format>); toast.success('Format updated!'); }
    setEditingFmt(null); setIsNewFmt(false);
  };

  const filteredProducts = (products || []).filter(p => p.title.toLowerCase().includes(searchQuery.toLowerCase()));
  const filteredOrders = orders.filter(o => o.trackingCode.includes(searchQuery.toUpperCase()) || o.deliveryInfo.fullName.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="section-heading">Admin Dashboard</h1>
          <p className="text-kitan-muted text-sm mt-1">Manage your entire platform</p>
        </div>
        <span className="badge-teal">Admin Access</span>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto scrollbar-hide gap-1 bg-kitan-card border border-kitan-border rounded-2xl p-1">
        {tabs.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => handleTabChange(key)}
            className={cn('flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all flex-1 justify-center', activeTab === key ? 'bg-kitan-teal text-white shadow-teal-glow' : 'text-kitan-muted hover:text-kitan-off-white')}>
            <Icon size={16} />{label}
          </button>
        ))}
      </div>

      {/* =================== OVERVIEW =================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-fade-in">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Total Revenue', value: `₦${(totalRevenue * exchangeRate).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`, sub: `${orders.length} orders`, icon: DollarSign, color: 'text-kitan-teal' },
              { label: 'Total Orders', value: totalOrders, icon: ShoppingBag, color: 'text-blue-400', sub: `${pendingOrders} pending` },
              { label: 'Gift Products', value: products.length, icon: Package, color: 'text-purple-400', sub: `${CATEGORIES.length} categories` },
              { label: 'Customers', value: allUsers.filter(u => u.role === 'user').length, icon: Users, color: 'text-amber-400', sub: 'Registered users' },
            ].map(({ label, value, icon: Icon, color, sub }) => (
              <div key={label} className="card-kitan p-5">
                <div className="flex items-start justify-between mb-3"><Icon size={20} className={color} /><ArrowUpRight size={16} className="text-kitan-subtle" /></div>
                <p className={cn('font-display font-bold text-2xl', color)}>{value}</p>
                <p className="text-kitan-off-white text-sm font-medium mt-1">{label}</p>
                <p className="text-kitan-subtle text-xs">{sub}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[
              { label: 'Documents', value: documents.length, sub: `${submissions.length} submissions`, icon: FileText, color: 'text-blue-400' },
              { label: 'Work Pictures', value: pictures.length, sub: 'Photo packs', icon: Camera, color: 'text-purple-400' },
              { label: 'Format Templates', value: formats.length, sub: 'Templates available', icon: Layout, color: 'text-amber-400' },
              { label: 'Exchange Rate', value: `₦${exchangeRate.toLocaleString()}`, sub: 'Per $1 USD', icon: DollarSign, color: 'text-kitan-teal' },
            ].map(({ label, value, icon: Icon, color, sub }) => (
              <div key={label} className="card-kitan p-5">
                <div className="flex items-start justify-between mb-3"><Icon size={20} className={color} /><ArrowUpRight size={16} className="text-kitan-subtle" /></div>
                <p className={cn('font-display font-bold text-2xl', color)}>{value}</p>
                <p className="text-kitan-off-white text-sm font-medium mt-1">{label}</p>
                <p className="text-kitan-subtle text-xs">{sub}</p>
              </div>
            ))}
          </div>
          <div className="card-kitan p-5">
            <h3 className="font-semibold text-kitan-off-white mb-4">Recent Orders</h3>
            {orders.length === 0 ? <p className="text-kitan-muted text-sm text-center py-6">No orders yet</p> : (
              <div className="space-y-3">
                {orders.slice(0, 5).map(order => (
                  <div key={order.id} className="flex items-center gap-4 p-3 rounded-xl bg-kitan-bg border border-kitan-border">
                    <div className="flex-1 min-w-0">
                      <p className="font-mono text-kitan-teal text-xs">{order.trackingCode}</p>
                      <p className="text-kitan-off-white text-sm">{order.deliveryInfo.fullName}</p>
                    </div>
                    <span className="text-kitan-muted text-xs">{order.country}</span>
                    <p className="text-kitan-teal font-bold text-sm">₦{(order.total * exchangeRate).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                    <span className={cn('text-xs px-2 py-1 rounded-full capitalize border', { 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30': order.status === 'delivered', 'bg-amber-500/10 text-amber-400 border-amber-400/30': order.status === 'confirmed', 'bg-kitan-card text-kitan-muted border-kitan-border': order.status === 'pending' })}>{order.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== PAYMENTS =================== */}
      {activeTab === 'payments' && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display font-bold text-kitan-off-white">Payment Records</h3>
              <p className="text-kitan-muted text-xs mt-0.5">All Flutterwave transactions — server-side verified</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {(['all', 'successful', 'pending', 'failed'] as const).map(f => (
                <button key={f} onClick={() => setPaymentFilter(f)} className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all', paymentFilter === f ? 'bg-kitan-teal text-white' : 'bg-kitan-surface text-kitan-muted border border-kitan-border hover:text-kitan-off-white')}>{f}</button>
              ))}
              <button onClick={() => { setPaymentsLoading(true); dbPayments.getAll().then(p => { setPayments(p); setPaymentsLoading(false); }); }} className="btn-secondary text-xs px-3 py-1.5">↻ Refresh</button>
            </div>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { label: 'Total Payments', value: payments.length, color: 'text-kitan-off-white' },
              { label: 'Successful', value: payments.filter(p => p.paymentStatus === 'successful').length, color: 'text-kitan-teal' },
              { label: 'Pending', value: payments.filter(p => p.paymentStatus === 'pending').length, color: 'text-amber-400' },
              { label: 'Failed', value: payments.filter(p => p.paymentStatus === 'failed' || p.paymentStatus === 'cancelled').length, color: 'text-red-400' },
            ].map(({ label, value, color }) => (<div key={label} className="card-kitan p-4"><p className={cn('font-display font-bold text-2xl', color)}>{value}</p><p className="text-kitan-muted text-xs mt-1">{label}</p></div>))}
          </div>
          <div className="card-kitan p-4"><p className="text-kitan-muted text-xs">Verified Revenue</p><p className="text-kitan-teal font-display font-bold text-2xl">₦{payments.filter(p => p.verificationStatus === 'verified').reduce((s, p) => s + p.amountNGN, 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p></div>
          <div className="card-kitan overflow-hidden">
            {paymentsLoading ? (<div className="flex items-center justify-center py-10 gap-3"><div className="w-5 h-5 border-2 border-kitan-teal/30 border-t-kitan-teal rounded-full animate-spin" /><p className="text-kitan-muted text-sm">Loading payments...</p></div>) : (() => {
              const filtered = payments.filter(p => paymentFilter === 'all' ? true : paymentFilter === 'failed' ? (p.paymentStatus === 'failed' || p.paymentStatus === 'cancelled') : p.paymentStatus === paymentFilter);
              return filtered.length === 0 ? (<p className="text-kitan-muted text-sm text-center py-10">No {paymentFilter === 'all' ? '' : paymentFilter} payments yet</p>) : (
                <div className="divide-y divide-kitan-border">
                  {filtered.map(pay => {
                    const productDetail = paymentProductMap[pay.txRef] || `${pay.productType.replace(/_/g,' ')} · ${pay.productId.slice(0,14)}`;
                    return (
                    <div key={pay.id} className="p-4 hover:bg-kitan-bg/50 transition-colors">
                      <div className="flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-mono text-kitan-teal text-xs">{pay.txRef}</p>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full border capitalize font-semibold', pay.paymentStatus === 'successful' ? 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30' : pay.paymentStatus === 'pending' ? 'bg-amber-500/10 text-amber-400 border-amber-400/30' : 'bg-red-500/10 text-red-400 border-red-500/30')}>{pay.paymentStatus}</span>
                            <span className={cn('text-xs px-2 py-0.5 rounded-full border', pay.verificationStatus === 'verified' ? 'bg-green-500/10 text-green-400 border-green-500/30' : pay.verificationStatus === 'mismatch' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-kitan-surface text-kitan-muted border-kitan-border')}>{pay.verificationStatus}</span>
                          </div>
                          <p className="text-kitan-off-white text-sm font-medium mt-1">{pay.customerName}</p>
                          <p className="text-kitan-subtle text-xs">{pay.customerEmail}</p>
                          {/* Product purchased */}
                          <div className="flex items-center gap-1.5 mt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-kitan-subtle">Product:</span>
                            <span className="text-kitan-off-white text-xs font-medium capitalize">{productDetail}</span>
                          </div>
                          {/* Payment method */}
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-kitan-subtle">Method:</span>
                            <span className="text-kitan-muted text-xs">{pay.currency === 'NGN' ? 'Flutterwave (NGN)' : pay.currency}</span>
                          </div>
                          {pay.flwTransactionId && (
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] font-bold uppercase tracking-wide text-kitan-subtle">FLW ID:</span>
                              <span className="font-mono text-kitan-muted text-xs">{pay.flwTransactionId}</span>
                            </div>
                          )}
                          <p className="text-kitan-subtle text-xs mt-1">{new Date(pay.createdAt).toLocaleString('en-NG', { day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' })}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-kitan-teal font-display font-bold text-lg">₦{pay.amountNGN.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                          <p className="text-kitan-subtle text-xs">User: {pay.appUserId.slice(0,10)}…</p>
                        </div>
                      </div>
                    </div>
                  );})},
                </div>
              );
            })()}
          </div>
          <div className="card-kitan p-4">
            <p className="text-kitan-off-white text-sm font-semibold mb-2">Webhook Configuration</p>
            <p className="text-kitan-muted text-xs mb-2">Add this URL to your Flutterwave dashboard under Webhooks:</p>
            <code className="block bg-kitan-bg border border-kitan-border rounded-xl px-4 py-3 text-kitan-teal text-xs font-mono break-all select-all">https://swrqtcayrnndpzkmswrq.backend.onspace.ai/functions/v1/flw-webhook</code>
            <p className="text-kitan-subtle text-xs mt-2">Set your Secret Hash to the value stored as FLW_WEBHOOK_SECRET in backend secrets.</p>
          </div>
        </div>
      )}

      {/* =================== VIRTUAL NUMBER PRICING =================== */}
      {activeTab === 'virtual-pricing' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2"><Phone size={18} className="text-kitan-teal" /> Virtual Number Margin Manager</h3>
              <p className="text-kitan-muted text-sm mt-1">Control the NGN selling price for all virtual number purchases. Overrides take priority over the global multiplier.</p>
            </div>
            <button onClick={() => { loadVpConfig(); loadVpCatalog(); }} className="btn-secondary text-sm flex items-center gap-2"><RefreshCw size={14} className={vpLoading ? 'animate-spin' : ''} /> Refresh</button>
          </div>
          {vpLoading && <div className="flex items-center gap-3 py-6"><Loader2 size={20} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading pricing configuration…</span></div>}
          {!vpLoading && vpConfig && (
            <>
              <div className="card-kitan p-6 space-y-5">
                <div className="flex items-center gap-3 mb-1">
                  <div className="w-9 h-9 rounded-xl bg-kitan-teal/10 border border-kitan-teal/20 flex items-center justify-center flex-shrink-0"><Zap size={16} className="text-kitan-teal" /></div>
                  <div>
                    <h4 className="font-semibold text-kitan-off-white text-sm">Global Price Multiplier</h4>
                    <p className="text-kitan-subtle text-xs mt-0.5">Formula: <span className="font-mono text-kitan-muted">Base USD × Exchange Rate × Multiplier</span></p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[1, 2, 3, 4, 5, 6].map(m => (
                    <button key={m} onClick={() => setVpMultiplier(m)} className={cn('py-4 rounded-2xl border-2 font-display font-bold text-xl transition-all', vpMultiplier === m ? 'border-kitan-teal bg-kitan-teal/10 text-kitan-teal shadow-teal-glow' : 'border-kitan-border bg-kitan-surface text-kitan-muted hover:border-kitan-teal/40 hover:text-kitan-off-white')}>
                      ×{m}<span className="block text-xs font-normal mt-0.5">{m === 1 ? 'Standard' : m === 2 ? 'Double' : m === 3 ? 'Triple' : `×${m}`}</span>
                    </button>
                  ))}
                </div>
                <div className="bg-kitan-bg rounded-xl border border-kitan-border p-4">
                  <p className="text-kitan-subtle text-xs mb-3 font-medium uppercase tracking-wide">Price Preview at ×{vpMultiplier} multiplier</p>
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {[0.05, 0.07, 0.10, 0.15, 0.20, 0.50, 1.00, 2.00].map(usd => {
                      const ngn = Math.ceil(usd * vpConfig.usdToNgn * vpMultiplier / 10) * 10;
                      return (<div key={usd} className="text-center p-2 rounded-lg bg-kitan-surface border border-kitan-border"><p className="text-kitan-teal font-bold text-sm">₦{ngn.toLocaleString()}</p><p className="text-kitan-subtle text-xs">${usd.toFixed(2)}</p></div>);
                    })}
                  </div>
                </div>
                <div className="flex items-center gap-3 pt-1">
                  <button onClick={handleSaveMultiplier} disabled={vpSavingMult} className="btn-primary flex items-center gap-2 text-sm">
                    {vpSavingMult ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Global Multiplier (×{vpMultiplier})</>}
                  </button>
                  {vpConfig.globalMultiplier !== vpMultiplier && <span className="text-amber-400 text-xs font-medium">Unsaved — current: ×{vpConfig.globalMultiplier}</span>}
                </div>
              </div>

              <div className="card-kitan p-6 space-y-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0"><Sliders size={15} className="text-amber-400" /></div>
                  <div><h4 className="font-semibold text-kitan-off-white text-sm">Add / Update Custom Price Override</h4><p className="text-kitan-subtle text-xs mt-0.5">Set an exact NGN price for a specific service + country pair.</p></div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">Country</label>
                    <div className="relative">
                      <select value={vpOvrCountry} onChange={e => setVpOvrCountry(e.target.value)} className="input-kitan text-sm pr-8 appearance-none cursor-pointer">
                        <option value="">-- Select country --</option>
                        {vpCatalogCountries.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">Service</label>
                    <div className="relative">
                      <select value={vpOvrService} onChange={e => setVpOvrService(e.target.value)} className="input-kitan text-sm pr-8 appearance-none cursor-pointer">
                        <option value="">-- Select service --</option>
                        {vpCatalogServices.map(s => <option key={s.id} value={s.name.toLowerCase()}>{s.name}</option>)}
                      </select>
                      <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">Custom NGN Price</label>
                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-teal font-bold text-sm">₦</span><input type="number" min="0" step="10" className="input-kitan pl-8 text-sm" placeholder="e.g. 500" value={vpOvrPrice} onChange={e => setVpOvrPrice(e.target.value)} /></div>
                  </div>
                </div>
                <button onClick={handleSaveOverride} disabled={vpSavingOvr || !vpOvrCountry || !vpOvrService || !vpOvrPrice} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed">
                  {vpSavingOvr ? <><Loader2 size={14} className="animate-spin" /> Saving Override…</> : <><Save size={14} /> Apply Custom Override</>}
                </button>
              </div>

              <div className="card-kitan p-6 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <h4 className="font-semibold text-kitan-off-white text-sm">Active Overrides ({vpConfig.overrides.length})</h4>
                  {vpConfig.overrides.length > 0 && (
                    <div className="relative"><Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" /><input type="text" placeholder="Filter overrides…" value={vpOvrFilter} onChange={e => setVpOvrFilter(e.target.value)} className="input-kitan pl-8 text-xs py-2 w-48" /></div>
                  )}
                </div>
                {vpConfig.overrides.length === 0 ? (<div className="text-center py-8"><Sliders size={32} className="text-kitan-subtle mx-auto mb-3" /><p className="text-kitan-muted text-sm">No overrides yet</p></div>) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead><tr className="border-b border-kitan-border">
                        <th className="text-left text-kitan-subtle text-xs font-semibold uppercase tracking-wide py-2 pr-4">Country ID</th>
                        <th className="text-left text-kitan-subtle text-xs font-semibold uppercase tracking-wide py-2 pr-4">Service</th>
                        <th className="text-left text-kitan-subtle text-xs font-semibold uppercase tracking-wide py-2 pr-4">Custom NGN Price</th>
                        <th className="py-2"></th>
                      </tr></thead>
                      <tbody className="divide-y divide-kitan-border/50">
                        {vpConfig.overrides.filter(o => !vpOvrFilter || o.service_name.includes(vpOvrFilter.toLowerCase()) || o.country_id.includes(vpOvrFilter)).map(override => (
                          <tr key={override.id} className="hover:bg-kitan-bg/40 transition-colors">
                            <td className="py-3 pr-4"><span className="font-mono text-kitan-muted text-xs bg-kitan-surface border border-kitan-border px-2 py-0.5 rounded">{override.country_id}</span></td>
                            <td className="py-3 pr-4"><span className="text-kitan-off-white font-medium capitalize">{override.service_name}</span></td>
                            <td className="py-3 pr-4"><span className="text-kitan-teal font-display font-bold">₦{Number(override.custom_naira_price).toLocaleString('en-NG')}</span></td>
                            <td className="py-3">
                              <button onClick={() => handleDeleteOverride(override.id)} disabled={vpDeletingId === override.id} className="w-7 h-7 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all disabled:opacity-50">
                                {vpDeletingId === override.id ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <div className="flex items-start gap-3 p-4 rounded-2xl bg-kitan-surface border border-kitan-border">
                <AlertCircle size={15} className="text-kitan-teal flex-shrink-0 mt-0.5" />
                <p className="text-kitan-subtle text-xs leading-relaxed">Override exists → use custom_naira_price directly. No override → Base USD × Rate ₦{vpConfig.usdToNgn.toLocaleString()} × ×{vpConfig.globalMultiplier}.</p>
              </div>
            </>
          )}
        </div>
      )}

      {/* =================== EXCHANGE RATE =================== */}
      {activeTab === 'exchange' && (
        <div className="space-y-6 animate-fade-in">
          <div className="card-kitan p-6 space-y-5">
            <div><h3 className="font-display font-bold text-kitan-off-white text-lg">Exchange Rate Manager</h3><p className="text-kitan-muted text-sm mt-1">Set the USD → NGN rate. All prices sitewide update instantly.</p></div>
            <div className="grid grid-cols-2 gap-4">
              <div className="card-kitan p-5 bg-kitan-teal/5 border-kitan-teal/30"><p className="text-kitan-subtle text-xs mb-1">Current Rate</p><p className="font-display font-bold text-kitan-teal text-3xl">₦{exchangeRate.toLocaleString()}</p><p className="text-kitan-muted text-xs mt-1">Per $1 USD</p></div>
              <div className="card-kitan p-5"><p className="text-kitan-subtle text-xs mb-1">Example</p><p className="font-display font-bold text-kitan-off-white text-xl">$100 = ₦{(100 * exchangeRate).toLocaleString()}</p><p className="text-kitan-muted text-xs mt-1">At current rate</p></div>
            </div>
            <div className="space-y-3">
              <label className="text-kitan-muted text-sm block">New Rate (NGN per $1 USD)</label>
              <div className="flex gap-3">
                <div className="relative flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-teal font-bold">₦</span><input type="number" className="input-kitan pl-8" placeholder="e.g. 1350" value={newRate} onChange={e => setNewRate(e.target.value)} /></div>
                <button onClick={async () => { const r = parseFloat(newRate); if (isNaN(r) || r <= 0) { toast.error('Enter a valid positive rate'); return; } await setExchangeRate(r); toast.success(`Rate updated to ₦${r.toLocaleString()} per $1`); }} className="btn-primary px-6 flex items-center gap-2"><Save size={16} /> Update</button>
              </div>
              <p className="text-kitan-subtle text-xs">Default: ₦{DEFAULT_EXCHANGE_RATE} / $1. Changes take effect immediately.</p>
            </div>
            <div className="border-t border-kitan-border pt-4">
              <p className="text-kitan-off-white text-sm font-semibold mb-3">Price Preview at Current Rate</p>
              <div className="grid grid-cols-3 gap-3">
                {[25, 45, 79, 95, 149, 299].map(usd => (<div key={usd} className="card-kitan p-3 text-center"><p className="text-kitan-teal font-bold">₦{(usd * exchangeRate).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p><p className="text-kitan-subtle text-xs">${usd} USD</p></div>))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* =================== DOCUMENTS =================== */}
      {activeTab === 'documents' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-kitan-muted text-sm">{documents.length} documents · {submissions.length} submissions</p>
            <button onClick={() => { setIsNewDoc(true); setEditingDoc({ title: '', description: '', price: 0, previewImages: [], formFields: [], available: true, category: 'General' }); }} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> Add Document</button>
          </div>

          {editingDoc && (
            <div className="card-kitan p-6 space-y-5 border-kitan-teal/40 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-kitan-off-white">{isNewDoc ? 'New Document' : 'Edit Document'}</h3>
                <button onClick={() => { setEditingDoc(null); setIsNewDoc(false); }}><X size={16} className="text-kitan-subtle" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Title *</label><input className="input-kitan text-sm" value={editingDoc.title || ''} onChange={e => setEditingDoc({ ...editingDoc, title: e.target.value })} placeholder="Document title" /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Price (NGN) *</label><input type="number" className="input-kitan text-sm" value={editingDoc.price || ''} onChange={e => setEditingDoc({ ...editingDoc, price: parseFloat(e.target.value) })} /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Category</label><input className="input-kitan text-sm" value={editingDoc.category || ''} onChange={e => setEditingDoc({ ...editingDoc, category: e.target.value })} placeholder="e.g. Immigration, Education" /></div>
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Description</label><textarea rows={3} className="input-kitan text-sm resize-none" value={editingDoc.description || ''} onChange={e => setEditingDoc({ ...editingDoc, description: e.target.value })} /></div>
                <div className="sm:col-span-2"><ImageUploader label="Preview Images (upload from device)" images={editingDoc.previewImages || []} onChange={imgs => setEditingDoc({ ...editingDoc, previewImages: imgs })} maxImages={6} bucket="documents" folder={getUploadFolder('documents', editingDoc.id)} /></div>
              </div>
              <div className="p-3 rounded-xl bg-kitan-teal/5 border border-kitan-teal/20">
                <p className="text-kitan-muted text-xs leading-relaxed flex items-center gap-1.5">
                  <span className="text-kitan-teal">ℹ</span>
                  Documents now grant KitanLab generation credits directly. No form fields required.
                </p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveDocument} className="btn-primary flex items-center gap-2 text-sm"><Save size={14} /> Save Document</button>
                <button onClick={() => { setEditingDoc(null); setIsNewDoc(false); }} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="card-kitan overflow-hidden">
            {documents.length === 0 ? <p className="text-kitan-muted text-sm text-center py-10">No documents yet</p> : (
              <div className="divide-y divide-kitan-border">
                {documents.map(doc => (
                  <div key={doc.id} className={cn('flex items-center gap-4 p-4 hover:bg-kitan-bg/50 transition-colors', doc.pinned && 'bg-amber-500/5 border-l-2 border-amber-500')}>
                    <img src={doc.previewImages[0]} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className="text-kitan-off-white text-sm font-medium truncate">{doc.title}</p>{doc.pinned && <span className="flex-shrink-0 flex items-center gap-0.5 text-amber-400 text-xs font-semibold"><Pin size={10} fill="currentColor" /> Pinned</span>}</div>
                      <p className="text-kitan-subtle text-xs">{doc.category} · {submissions.filter(s => s.documentId === doc.id).length} submissions</p>
                    </div>
                    <p className="text-kitan-teal font-bold text-sm flex-shrink-0">₦{doc.price.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                    <span className={cn('text-xs px-2 py-1 rounded-full', doc.available ? 'bg-kitan-teal/10 text-kitan-teal' : 'bg-red-500/10 text-red-400')}>{doc.available ? 'Active' : 'Hidden'}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <PinButton pinned={doc.pinned} loading={pinLoading === doc.id} onClick={() => handlePin(doc.id, toggleDocPin)} />
                      <button onClick={async () => { const full = await dbDocuments.getById(doc.id); setIsNewDoc(false); setEditingDoc(full || doc); }} className="w-8 h-8 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all"><Edit3 size={14} /></button>
                      <button onClick={() => { deleteDocument(doc.id); toast.success('Document deleted'); }} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== WORKING PICTURES =================== */}
      {activeTab === 'pictures' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-kitan-muted text-sm">{pictures.length} picture packs</p>
            <button onClick={() => { setIsNewPic(true); setEditingPic({ title: '', description: '', price: 0, images: [], mediaType: 'image', available: true, tags: [], featured: false }); }} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> Add Pack</button>
          </div>
          <div className="card-kitan p-5 space-y-3 border-kitan-teal/20">
            <div><h4 className="font-semibold text-kitan-off-white text-sm">Global Working Pictures Price</h4><p className="text-kitan-subtle text-xs mt-0.5">Default price applied to all packs. Individual packs with a non-zero price override this.</p></div>
            <div className="flex gap-3 items-center flex-wrap">
              <div className="relative flex-1 max-w-xs"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-teal font-bold text-sm">₦</span><input type="number" className="input-kitan pl-8 text-sm" placeholder="e.g. 5000" value={newGlobalWPPrice} onChange={e => setNewGlobalWPPrice(e.target.value)} /></div>
              <button onClick={async () => { const p = parseFloat(newGlobalWPPrice); if (isNaN(p) || p < 0) { toast.error('Enter a valid price'); return; } await setGlobalWPPrice(p); toast.success(p === 0 ? 'Global WP price cleared' : `Global WP price set to ₦${p.toLocaleString('en-NG')}`); }} className="btn-primary text-sm px-4 flex items-center gap-2"><Save size={14} /> Save</button>
            </div>
          </div>
          {editingPic && (
            <div className="card-kitan p-6 space-y-4 border-kitan-teal/40 animate-fade-in">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-kitan-off-white">{isNewPic ? 'New Picture Pack' : 'Edit Picture Pack'}</h3><button onClick={() => { setEditingPic(null); setIsNewPic(false); }}><X size={16} className="text-kitan-subtle" /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Title *</label><input className="input-kitan text-sm" value={editingPic.title || ''} onChange={e => setEditingPic({ ...editingPic, title: e.target.value })} placeholder="Pack title" /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Price (NGN)</label><input type="number" className="input-kitan text-sm" value={editingPic.price ?? ''} onChange={e => setEditingPic({ ...editingPic, price: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Media Type</label><select className="input-kitan text-sm" value={editingPic.mediaType || 'image'} onChange={e => setEditingPic({ ...editingPic, mediaType: e.target.value as WorkingPicture['mediaType'] })}><option value="image">Images</option><option value="video">Video</option><option value="mixed">Mixed</option></select></div>
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Description</label><textarea rows={3} className="input-kitan text-sm resize-none" value={editingPic.description || ''} onChange={e => setEditingPic({ ...editingPic, description: e.target.value })} /></div>
                <div className="sm:col-span-2"><ImageUploader label="Pack Images (upload from device — max 6)" images={editingPic.images || []} onChange={imgs => setEditingPic({ ...editingPic, images: imgs })} maxImages={6} bucket="working-pictures" folder={getUploadFolder('working-pictures', editingPic.id)} /></div>
                {!isNewPic && editingPic.id && (<div className="sm:col-span-2"><OrderContentEditor productId={editingPic.id} productType="working_picture" /></div>)}
                {isNewPic && (<div className="sm:col-span-2 p-3 rounded-xl bg-kitan-bg border border-kitan-border"><p className="text-kitan-subtle text-xs">Save the product first, then edit it to add Order Content.</p></div>)}
                <div><label className="text-kitan-muted text-xs mb-1 block">Tags (comma-separated)</label><input className="input-kitan text-sm" value={(editingPic.tags || []).join(', ')} onChange={e => setEditingPic({ ...editingPic, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></div>
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">External URL (optional)</label><input type="url" className="input-kitan text-sm" value={(editingPic as WorkingPicture).externalUrl || ''} onChange={e => setEditingPic({ ...editingPic, externalUrl: e.target.value })} placeholder="https://drive.google.com/..." /></div>
              </div>
              <div className="flex gap-3"><button onClick={handleSavePicture} className="btn-primary flex items-center gap-2 text-sm"><Save size={14} /> Save Pack</button><button onClick={() => { setEditingPic(null); setIsNewPic(false); }} className="btn-secondary text-sm">Cancel</button></div>
            </div>
          )}
          <div className="card-kitan overflow-hidden">
            {pictures.length === 0 ? <p className="text-kitan-muted text-sm text-center py-10">No picture packs yet</p> : (
              <div className="divide-y divide-kitan-border">
                {pictures.map(pic => (
                  <div key={pic.id} className={cn('flex items-center gap-4 p-4 hover:bg-kitan-bg/50 transition-colors', pic.pinned && 'bg-amber-500/5 border-l-2 border-amber-500')}>
                    <img src={pic.images[0]} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className="text-kitan-off-white text-sm font-medium truncate">{pic.title}</p>{pic.pinned && <span className="flex-shrink-0 flex items-center gap-0.5 text-amber-400 text-xs font-semibold"><Pin size={10} fill="currentColor" /> Pinned</span>}</div>
                      <p className="text-kitan-subtle text-xs">{pic.mediaType} · {pic.images.length} photos</p>
                    </div>
                    <p className="text-kitan-teal font-bold text-sm flex-shrink-0">₦{pic.price.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                    <span className={cn('text-xs px-2 py-1 rounded-full', pic.available ? 'bg-kitan-teal/10 text-kitan-teal' : 'bg-red-500/10 text-red-400')}>{pic.available ? 'Active' : 'Hidden'}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <PinButton pinned={pic.pinned} loading={pinLoading === pic.id} onClick={() => handlePin(pic.id, togglePicPin)} />
                      <button onClick={async () => { const full = await dbPictures.getById(pic.id); setIsNewPic(false); setEditingPic(full || pic); }} className="w-8 h-8 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all"><Edit3 size={14} /></button>
                      <button onClick={() => { deletePicture(pic.id); toast.success('Picture pack deleted'); }} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== FORMATS =================== */}
      {activeTab === 'formats' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center justify-between">
            <p className="text-kitan-muted text-sm">{formats.length} format templates</p>
            <button onClick={() => { setIsNewFmt(true); setEditingFmt({ title: '', description: '', price: 0, previewImages: [], fileType: 'PDF', available: true, tags: [], downloadUrl: '#' }); }} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> Add Format</button>
          </div>
          {editingFmt && (
            <div className="card-kitan p-6 space-y-4 border-kitan-teal/40 animate-fade-in">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-kitan-off-white">{isNewFmt ? 'New Format' : 'Edit Format'}</h3><button onClick={() => { setEditingFmt(null); setIsNewFmt(false); }}><X size={16} className="text-kitan-subtle" /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Title *</label><input className="input-kitan text-sm" value={editingFmt.title || ''} onChange={e => setEditingFmt({ ...editingFmt, title: e.target.value })} placeholder="Template title" /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Price (NGN) *</label><input type="number" className="input-kitan text-sm" value={editingFmt.price || ''} onChange={e => setEditingFmt({ ...editingFmt, price: parseFloat(e.target.value) })} /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">File Type</label><input className="input-kitan text-sm" value={editingFmt.fileType || ''} onChange={e => setEditingFmt({ ...editingFmt, fileType: e.target.value })} placeholder="e.g. PDF, DOCX, ZIP" /></div>
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Description</label><textarea rows={3} className="input-kitan text-sm resize-none" value={editingFmt.description || ''} onChange={e => setEditingFmt({ ...editingFmt, description: e.target.value })} /></div>
                <div className="sm:col-span-2"><ImageUploader label="Preview Images (upload from device)" images={editingFmt.previewImages || []} onChange={imgs => setEditingFmt({ ...editingFmt, previewImages: imgs })} maxImages={6} bucket="formats" folder={getUploadFolder('formats', editingFmt.id)} /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Tags (comma-separated)</label><input className="input-kitan text-sm" value={(editingFmt.tags || []).join(', ')} onChange={e => setEditingFmt({ ...editingFmt, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) })} /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Download URL</label><input className="input-kitan text-sm" value={editingFmt.downloadUrl || ''} onChange={e => setEditingFmt({ ...editingFmt, downloadUrl: e.target.value })} placeholder="https://..." /></div>
                {!isNewFmt && editingFmt.id && (<div className="sm:col-span-2"><OrderContentEditor productId={editingFmt.id} productType="format" /></div>)}
                {isNewFmt && (<div className="sm:col-span-2 p-3 rounded-xl bg-kitan-bg border border-kitan-border"><p className="text-kitan-subtle text-xs">Save the format first, then edit it to add Order Content.</p></div>)}
              </div>
              <div className="flex gap-3"><button onClick={handleSaveFormat} className="btn-primary flex items-center gap-2 text-sm"><Save size={14} /> Save Format</button><button onClick={() => { setEditingFmt(null); setIsNewFmt(false); }} className="btn-secondary text-sm">Cancel</button></div>
            </div>
          )}
          <div className="card-kitan overflow-hidden">
            {formats.length === 0 ? <p className="text-kitan-muted text-sm text-center py-10">No formats yet</p> : (
              <div className="divide-y divide-kitan-border">
                {formats.map(fmt => (
                  <div key={fmt.id} className={cn('flex items-center gap-4 p-4 hover:bg-kitan-bg/50 transition-colors', fmt.pinned && 'bg-amber-500/5 border-l-2 border-amber-500')}>
                    <img src={fmt.previewImages[0]} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className="text-kitan-off-white text-sm font-medium truncate">{fmt.title}</p>{fmt.pinned && <span className="flex-shrink-0 flex items-center gap-0.5 text-amber-400 text-xs font-semibold"><Pin size={10} fill="currentColor" /> Pinned</span>}</div>
                      <p className="text-kitan-subtle text-xs">{fmt.fileType} · {fmt.tags.join(', ')}</p>
                    </div>
                    <p className="text-kitan-teal font-bold text-sm flex-shrink-0">₦{fmt.price.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                    <span className={cn('text-xs px-2 py-1 rounded-full', fmt.available ? 'bg-kitan-teal/10 text-kitan-teal' : 'bg-red-500/10 text-red-400')}>{fmt.available ? 'Active' : 'Hidden'}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <PinButton pinned={fmt.pinned} loading={pinLoading === fmt.id} onClick={() => handlePin(fmt.id, toggleFmtPin)} />
                      <button onClick={async () => { const full = await dbFormats.getById(fmt.id); setIsNewFmt(false); setEditingFmt(full || fmt); }} className="w-8 h-8 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all"><Edit3 size={14} /></button>
                      <button onClick={() => { deleteFormat(fmt.id); toast.success('Format deleted'); }} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== PRODUCTS =================== */}
      {activeTab === 'products' && (
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" /><input placeholder="Search products..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="input-kitan pl-9 text-sm" /></div>
            <button onClick={() => loadProducts(true)} className="btn-secondary text-sm flex items-center gap-1.5"><ArrowUpRight size={14} /> Refresh</button>
            <button onClick={() => { setIsNewProduct(true); setEditingProduct({ title: '', price: 0, description: '', category: 'Customized Items', available: true, countries: ['US'], images: [], pinned: false }); }} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> Add Product</button>
          </div>
          {editingProduct && (
            <div className="card-kitan p-6 space-y-4 animate-fade-in border-kitan-teal/30">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-kitan-off-white">{isNewProduct ? 'New Product' : 'Edit Product'}</h3><button onClick={() => { setEditingProduct(null); setIsNewProduct(false); }} className="btn-ghost p-1"><X size={16} /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Title *</label><input className="input-kitan text-sm" value={editingProduct.title || ''} onChange={e => setEditingProduct({ ...editingProduct, title: e.target.value })} placeholder="Product title" /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Price (NGN) *</label><input type="number" className="input-kitan text-sm" value={editingProduct.price || ''} onChange={e => setEditingProduct({ ...editingProduct, price: parseFloat(e.target.value) })} /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Category</label><select className="input-kitan text-sm" value={editingProduct.category || ''} onChange={e => setEditingProduct({ ...editingProduct, category: e.target.value as ProductCategory })}>{CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Description</label><textarea rows={3} className="input-kitan text-sm resize-none" value={editingProduct.description || ''} onChange={e => setEditingProduct({ ...editingProduct, description: e.target.value })} /></div>
                <div className="flex items-center gap-3"><label className="text-kitan-muted text-sm">Pin to Top</label><button type="button" onClick={() => setEditingProduct({ ...editingProduct, pinned: !editingProduct.pinned })} className={cn('transition-colors', editingProduct.pinned ? 'text-amber-400' : 'text-kitan-subtle')}>{editingProduct.pinned ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</button></div>
                <div className="space-y-1.5"><label className="text-kitan-muted text-xs block">Pin Order Position</label><input type="number" min="1" step="1" className="input-kitan text-sm w-32" placeholder="e.g. 1" value={editingProduct.pinPosition ?? ''} onChange={e => setEditingProduct({ ...editingProduct, pinPosition: e.target.value ? parseInt(e.target.value) : undefined })} /></div>
                <div className="flex items-center gap-3"><label className="text-kitan-muted text-sm">Available</label><button type="button" onClick={() => setEditingProduct({ ...editingProduct, available: !editingProduct.available })} className={cn('transition-colors', editingProduct.available ? 'text-kitan-teal' : 'text-kitan-subtle')}>{editingProduct.available ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</button></div>
                <div className="sm:col-span-2"><ImageUploader label="Product Images (upload from device)" images={editingProduct.images || []} onChange={imgs => setEditingProduct({ ...editingProduct, images: imgs })} maxImages={8} bucket="products" folder={getUploadFolder('products', editingProduct.id)} /></div>
              </div>
              <div className="flex gap-3"><button onClick={handleSaveProduct} className="btn-primary flex items-center gap-2 text-sm"><Save size={14} /> Save</button><button onClick={() => { setEditingProduct(null); setIsNewProduct(false); }} className="btn-secondary text-sm">Cancel</button></div>
            </div>
          )}
          <div className="card-kitan overflow-hidden">
            {filteredProducts.length === 0 ? (<p className="text-kitan-muted text-sm text-center py-10">{searchQuery ? 'No products match your search' : 'No products yet'}</p>) : (
              <div className="divide-y divide-kitan-border">
                {filteredProducts.map(product => (
                  <div key={product.id} className={cn('flex items-center gap-4 p-4 hover:bg-kitan-bg/50 transition-colors', product.pinned && 'bg-amber-500/5 border-l-2 border-amber-500')}>
                    <img src={product.images[0]} alt="" className="w-12 h-12 rounded-xl object-cover flex-shrink-0 bg-kitan-bg" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className="text-kitan-off-white text-sm font-medium truncate">{product.title}</p>{product.pinned && <span className="flex-shrink-0 flex items-center gap-0.5 text-amber-400 text-xs font-semibold"><Pin size={10} fill="currentColor" /> Pinned</span>}</div>
                      <p className="text-kitan-subtle text-xs">{product.category} · {product.countries.join(', ')}</p>
                    </div>
                    <p className="text-kitan-teal font-bold text-sm flex-shrink-0">₦{product.price.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                    <span className={cn('text-xs px-2 py-1 rounded-full', product.available ? 'bg-kitan-teal/10 text-kitan-teal' : 'bg-red-500/10 text-red-400')}>{product.available ? 'Active' : 'Inactive'}</span>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <PinButton pinned={product.pinned} loading={pinLoading === product.id} onClick={() => handlePin(product.id, toggleProductPin)} />
                      <button onClick={async () => { const full = await dbProducts.getById(product.id); setIsNewProduct(false); setEditingProduct(full || product); }} className="w-8 h-8 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all"><Edit3 size={14} /></button>
                      <button onClick={() => handleDeleteProduct(product.id)} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== ORDERS =================== */}
      {activeTab === 'orders' && (
        <div className="space-y-4 animate-fade-in">
          <div className="relative"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" /><input placeholder="Search by tracking code or name..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} className="input-kitan pl-9 text-sm" /></div>
          <div className="card-kitan overflow-hidden">
            {filteredOrders.length === 0 ? <p className="text-kitan-muted text-sm text-center py-10">No orders found</p> : (
              <div className="divide-y divide-kitan-border">
                {filteredOrders.map(order => (
                  <div key={order.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div><p className="font-mono text-kitan-teal text-sm">{order.trackingCode}</p><p className="text-kitan-off-white text-sm font-medium">{order.deliveryInfo.fullName}</p><p className="text-kitan-subtle text-xs">{order.deliveryInfo.city}, {order.deliveryInfo.country} · {formatDate(order.createdAt)}</p></div>
                      <div className="text-right">
                        <p className="text-kitan-teal font-bold">₦{(order.total * exchangeRate).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                        <span className={cn('text-xs px-2 py-1 rounded-full capitalize border mt-1 inline-block', { 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30': order.status === 'delivered', 'bg-blue-500/10 text-blue-400 border-blue-400/30': order.status === 'shipped', 'bg-amber-500/10 text-amber-400 border-amber-400/30': order.status === 'processing' || order.status === 'confirmed', 'bg-kitan-card text-kitan-muted border-kitan-border': order.status === 'pending' })}>{order.status}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== USERS =================== */}
      {activeTab === 'users' && (
        <div className="space-y-5 animate-fade-in">

          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-kitan-off-white font-semibold">Registered Users</p>
              <p className="text-kitan-muted text-xs mt-0.5">{dbUsers.length > 0 ? `${dbUsers.length} users in database` : 'Click Refresh to sync'}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button onClick={loadDbUsers} disabled={dbUsersLoading} className="btn-secondary text-sm flex items-center gap-2">
                <RefreshCw size={14} className={dbUsersLoading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button onClick={handleExportUsersCSV} disabled={csvExporting} className="btn-primary flex items-center gap-2 text-sm disabled:opacity-60">
                {csvExporting ? <><Loader2 size={14} className="animate-spin" /> Exporting…</> : <><ArrowUpRight size={14} /> Export CSV</>}
              </button>
            </div>
          </div>

          <div className="flex items-start gap-3 p-4 rounded-2xl bg-kitan-teal/5 border border-kitan-teal/20">
            <Shield size={14} className="text-kitan-teal flex-shrink-0 mt-0.5" />
            <p className="text-kitan-muted text-xs leading-relaxed">
              Every signup is now recorded in the database regardless of device or browser. Click <strong className="text-kitan-off-white">Refresh</strong> to sync local accounts. Click the <strong className="text-kitan-off-white">₦ icon</strong> on any user to make a manual wallet adjustment.
            </p>
          </div>

          {dbUsersLoading ? (
            <div className="flex items-center gap-3 py-8"><Loader2 size={18} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading users from database…</span></div>
          ) : (
            <div className="card-kitan overflow-hidden">
              {dbUsers.length === 0 ? (
                <p className="text-kitan-muted text-sm text-center py-10">No users found — click Refresh to sync</p>
              ) : (
                <div className="divide-y divide-kitan-border">
                  {dbUsers.map(u => {
                    const balance = walletBalances[u.id] ?? 0;
                    return (
                      <div key={u.id} className="flex items-center gap-3 p-4 hover:bg-kitan-bg/50 transition-colors">
                        <div className="w-10 h-10 rounded-xl bg-teal-gradient flex items-center justify-center flex-shrink-0">
                          <span className="text-white font-bold text-sm">{(u.username || u.email).charAt(0).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-kitan-off-white text-sm font-medium">{u.username || '—'}</p>
                          <p className="text-kitan-subtle text-xs">{u.email}</p>
                          <p className="text-kitan-subtle text-xs">{new Date(u.registered_at).toLocaleDateString('en-NG', { day:'2-digit', month:'short', year:'numeric' })}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-kitan-teal font-bold text-xs">₦{balance.toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                          <p className="text-kitan-subtle text-[10px]">wallet</p>
                        </div>
                        <span className={cn('text-xs capitalize flex-shrink-0', u.role === 'admin' ? 'text-amber-400' : 'text-kitan-muted')}>{u.role}</span>
                        <button
                          onClick={() => openAdjustModal(u)}
                          title="Manual Wallet Adjustment (Admin Only)"
                          className="w-8 h-8 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all flex-shrink-0"
                        >
                          <DollarSign size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Manual Wallet Adjustment Modal ── */}
          {adjTarget && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center p-4"
              style={{ background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(6px)' }}
              onClick={() => setAdjTarget(null)}
            >
              <div
                className="relative bg-kitan-surface rounded-3xl border border-kitan-border w-full max-w-md shadow-2xl overflow-hidden"
                onClick={e => e.stopPropagation()}
              >
                <div className="flex items-center justify-between px-6 py-5 border-b border-kitan-border">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-kitan-teal/10 border border-kitan-teal/20 flex items-center justify-center"><DollarSign size={16} className="text-kitan-teal" /></div>
                    <div>
                      <p className="font-bold text-kitan-off-white text-sm">Manual Wallet Adjustment</p>
                      <p className="text-kitan-subtle text-xs">Admin only · {adjTarget.email}</p>
                    </div>
                  </div>
                  <button onClick={() => setAdjTarget(null)} className="text-kitan-subtle hover:text-kitan-off-white"><X size={18} /></button>
                </div>

                <div className="px-6 pt-5">
                  <div className="flex items-center justify-between p-3 rounded-xl bg-kitan-bg border border-kitan-border mb-5">
                    <span className="text-kitan-muted text-sm">Current Balance</span>
                    <span className="text-kitan-teal font-display font-bold text-lg">₦{(walletBalances[adjTarget.id] ?? 0).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <button onClick={() => setAdjType('credit')} className={cn('py-2.5 rounded-xl text-sm font-bold border transition-all', adjType === 'credit' ? 'bg-kitan-teal/15 text-kitan-teal border-kitan-teal/40' : 'bg-kitan-bg border-kitan-border text-kitan-muted hover:text-kitan-off-white')}>
                      + Credit
                    </button>
                    <button onClick={() => setAdjType('debit')} className={cn('py-2.5 rounded-xl text-sm font-bold border transition-all', adjType === 'debit' ? 'bg-red-500/10 text-red-400 border-red-500/30' : 'bg-kitan-bg border-kitan-border text-kitan-muted hover:text-kitan-off-white')}>
                      − Debit
                    </button>
                  </div>

                  <div className="space-y-1.5 mb-3">
                    <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">Amount (NGN) *</label>
                    <div className="relative"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-teal font-bold text-sm">₦</span>
                      <input type="number" min="1" step="100" className="input-kitan pl-8 text-sm" placeholder="e.g. 5000" value={adjAmount} onChange={e => setAdjAmount(e.target.value)} />
                    </div>
                  </div>

                  <div className="space-y-1.5 mb-4">
                    <label className="text-kitan-muted text-xs font-semibold uppercase tracking-wide">Reason / Notes *</label>
                    <textarea rows={3} className="input-kitan text-sm resize-none" placeholder="e.g. Compensation for failed order, Manual top-up request…" value={adjReason} onChange={e => setAdjReason(e.target.value)} />
                  </div>

                  {adjAmount && parseFloat(adjAmount) > 0 && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-kitan-bg border border-kitan-border mb-4">
                      <span className="text-kitan-muted text-sm">Balance after</span>
                      <span className={cn('font-display font-bold text-sm', adjType === 'credit' ? 'text-kitan-teal' : 'text-red-400')}>
                        ₦{Math.max(0, (walletBalances[adjTarget.id] ?? 0) + (adjType === 'credit' ? 1 : -1) * (parseFloat(adjAmount) || 0)).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                      </span>
                    </div>
                  )}

                  <div className="flex gap-3 mb-5">
                    <button
                      onClick={handleApplyAdjustment}
                      disabled={adjSubmitting || !adjAmount || !adjReason.trim()}
                      className={cn('flex-1 py-3 rounded-2xl text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed', adjType === 'credit' ? 'bg-kitan-teal hover:bg-kitan-teal-bright text-white' : 'bg-red-600 hover:bg-red-500 text-white')}
                    >
                      {adjSubmitting ? <><Loader2 size={14} className="animate-spin" /> Processing…</> : adjType === 'credit' ? '+ Apply Credit' : '− Apply Debit'}
                    </button>
                    <button onClick={() => setAdjTarget(null)} className="btn-secondary text-sm flex-shrink-0">Cancel</button>
                  </div>
                </div>

                <div className="border-t border-kitan-border">
                  <div className="px-6 py-3 flex items-center justify-between">
                    <p className="text-kitan-subtle text-xs font-semibold uppercase tracking-wide">Adjustment History</p>
                    {adjHistLoading && <Loader2 size={12} className="text-kitan-teal animate-spin" />}
                  </div>
                  {adjHistory.length === 0 ? (
                    <p className="text-kitan-subtle text-xs text-center pb-5">No previous adjustments</p>
                  ) : (
                    <div className="max-h-52 overflow-y-auto divide-y divide-kitan-border">
                      {adjHistory.map(adj => (
                        <div key={adj.id} className="px-6 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn('text-xs font-bold', adj.adjustment_type === 'credit' ? 'text-kitan-teal' : 'text-red-400')}>
                                {adj.adjustment_type === 'credit' ? '+' : '−'}₦{Number(adj.amount).toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                              </span>
                              <span className="text-kitan-subtle text-[10px]">by {adj.admin_name}</span>
                            </div>
                            <p className="text-kitan-muted text-xs truncate mt-0.5">{adj.reason}</p>
                            <p className="text-kitan-subtle text-[10px] mt-0.5">{new Date(adj.created_at).toLocaleString('en-NG', { day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit' })}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-kitan-subtle text-[10px]">Before: ₦{Number(adj.balance_before).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                            <p className="text-kitan-off-white text-[10px] font-semibold">After: ₦{Number(adj.balance_after).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================== WEBSITE SETTINGS =================== */}
      {activeTab === 'website-settings' && (
        <div className="space-y-6 animate-fade-in">
          <div><h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2"><Settings size={18} className="text-kitan-teal" /> Website Settings</h3><p className="text-kitan-muted text-sm mt-1">Global configuration for the entire platform.</p></div>
          <div className="card-kitan p-6 space-y-5">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0"><Settings size={18} className="text-amber-400" /></div>
              <div className="flex-1"><h4 className="font-semibold text-kitan-off-white">Maintenance Mode</h4><p className="text-kitan-muted text-xs mt-0.5">When enabled, all non-admin users are redirected to the maintenance page.</p></div>
            </div>
            {!maintenanceLoaded ? (<div className="flex items-center gap-3"><Loader2 size={16} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading settings…</span></div>) : (
              <>
                <div className="flex items-center justify-between p-4 rounded-2xl bg-kitan-bg border border-kitan-border">
                  <div className="flex items-center gap-3">
                    <div className={cn('w-3 h-3 rounded-full flex-shrink-0 transition-colors', maintenanceMode ? 'bg-amber-400 animate-pulse' : 'bg-green-400')} />
                    <div><p className="text-kitan-off-white text-sm font-semibold">{maintenanceMode ? 'Maintenance Mode: ON' : 'Maintenance Mode: OFF'}</p><p className="text-kitan-subtle text-xs">{maintenanceMode ? 'Website is currently unavailable to regular users.' : 'Website is fully operational.'}</p></div>
                  </div>
                  <button onClick={() => setMaintenanceMode(m => !m)} className={cn('transition-colors flex-shrink-0', maintenanceMode ? 'text-amber-400' : 'text-kitan-subtle')}>{maintenanceMode ? <TogOn size={36} /> : <TogOff size={36} />}</button>
                </div>
                <button onClick={async () => { setSavingMaintenance(true); try { await supabase.from('website_settings').upsert({ key: 'maintenance_mode', value: String(maintenanceMode), updated_at: new Date().toISOString() }, { onConflict: 'key' }); toast.success(`Maintenance mode ${maintenanceMode ? 'enabled' : 'disabled'}!`); } catch (e) { toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`); } finally { setSavingMaintenance(false); } }} disabled={savingMaintenance} className="btn-primary flex items-center gap-2 text-sm">
                  {savingMaintenance ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Website Settings</>}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* =================== RECEIPT GENERATOR ADMIN =================== */}
      {activeTab === 'receipt-admin' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div><h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2"><Receipt size={18} className="text-kitan-teal" /> Receipt Generator Settings</h3><p className="text-kitan-muted text-sm mt-1">Manage receipt generation pricing, products and history.</p></div>
            <button onClick={loadReceiptAdmin} className="btn-secondary text-sm flex items-center gap-2"><RefreshCw size={14} className={receiptAdminLoading ? 'animate-spin' : ''} /> Refresh</button>
          </div>
          {receiptAdminLoading ? (<div className="flex items-center gap-3 py-6"><Loader2 size={20} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading receipt data…</span></div>) : (
            <>
              <div className="card-kitan p-6 space-y-4">
                <h4 className="font-semibold text-kitan-off-white text-sm flex items-center gap-2"><DollarSign size={14} className="text-kitan-teal" /> Generation Price</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div className="card-kitan p-4 bg-kitan-teal/5 border-kitan-teal/30"><p className="text-kitan-subtle text-xs">Current Price</p><p className="font-display font-bold text-kitan-teal text-2xl">₦{receiptPrice.toLocaleString()}</p><p className="text-kitan-muted text-xs mt-1">Per receipt generation</p></div>
                  <div className="card-kitan p-4"><p className="text-kitan-subtle text-xs">Total Generations</p><p className="font-display font-bold text-kitan-off-white text-2xl">{receiptHistory.length}</p></div>
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1"><span className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-teal font-bold">₦</span><input type="number" min="0" step="100" className="input-kitan pl-8 text-sm" value={newReceiptPrice} onChange={e => setNewReceiptPrice(e.target.value)} /></div>
                  <button onClick={async () => { const p = parseFloat(newReceiptPrice); if (isNaN(p) || p < 0) { toast.error('Enter a valid price'); return; } setSavingReceiptPrice(true); await supabase.from('receipt_settings').upsert({ id: 1, price_ngn: p, updated_at: new Date().toISOString() }); setReceiptPrice(p); toast.success(`Receipt price updated to ₦${p.toLocaleString()}`); setSavingReceiptPrice(false); }} disabled={savingReceiptPrice} className="btn-primary px-5 flex items-center gap-2 text-sm">
                    {savingReceiptPrice ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />} Save
                  </button>
                </div>
              </div>
              <div className="card-kitan p-6 space-y-4">
                <h4 className="font-semibold text-kitan-off-white text-sm">Receipt Products ({receiptProducts.length})</h4>
                <div className="divide-y divide-kitan-border">
                  {receiptProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-4 py-3">
                      <div className="flex-1"><p className="text-kitan-off-white text-sm font-medium">{p.name}</p><p className="text-kitan-subtle text-xs font-mono">{p.slug}</p></div>
                      <button onClick={async () => { const newVal = !p.enabled; await supabase.from('receipt_products').update({ enabled: newVal }).eq('id', p.id); setReceiptProducts(prev => prev.map(x => x.id === p.id ? { ...x, enabled: newVal } : x)); toast.success(`${p.name} ${newVal ? 'enabled' : 'disabled'}`); }} className={cn('transition-colors', p.enabled ? 'text-kitan-teal' : 'text-kitan-subtle')}>{p.enabled ? <TogOn size={28} /> : <TogOff size={28} />}</button>
                      <span className={cn('text-xs px-2 py-1 rounded-full', p.enabled ? 'bg-kitan-teal/10 text-kitan-teal' : 'bg-red-500/10 text-red-400')}>{p.enabled ? 'On' : 'Off'}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card-kitan p-6 space-y-4">
                <div className="flex items-center gap-2"><History size={15} className="text-kitan-teal" /><h4 className="font-semibold text-kitan-off-white text-sm">Recent Generations ({receiptHistory.length})</h4></div>
                {receiptHistory.length === 0 ? (<p className="text-kitan-muted text-sm text-center py-6">No generations yet</p>) : (
                  <div className="divide-y divide-kitan-border">
                    {receiptHistory.slice(0, 20).map(r => (
                      <div key={r.id} className="py-3 flex items-start justify-between gap-4 flex-wrap">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2"><p className="text-kitan-off-white text-sm font-semibold">{r.product_name}</p><span className="text-kitan-teal text-xs font-bold">{formatNGN(r.amount_ngn)}</span></div>
                          <p className="text-kitan-subtle text-xs mt-0.5 font-mono">User: {r.app_user_id.slice(0, 14)}… · {new Date(r.created_at).toLocaleString('en-NG', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</p>
                        </div>
                        <span className="bg-green-500/10 text-green-400 border border-green-500/20 text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0">Completed</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* =================== ACCOUNT BOOSTING ADMIN =================== */}
      {activeTab === 'account-boosting' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2"><BarChart2 size={18} className="text-kitan-teal" /> Account Boosting Settings</h3>
              <p className="text-kitan-muted text-sm mt-1">Manage service pricing, multipliers, exchange rate, and order history.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => { loadJapConfig(); loadJapServices(); loadJapOrders(); }} className="btn-secondary text-sm flex items-center gap-2"><RefreshCw size={14} className={japConfigLoading ? 'animate-spin' : ''} /> Refresh</button>
              <button
                onClick={async () => {
                  setJapSyncing(true);
                  setJapSyncProgress('Connecting to delivery network…');
                  try {
                    setJapSyncProgress('Fetching service catalog…');
                    const res = await japAdmin<{ total: number; inserted: number; failed: number; syncDuration: string; message: string }>({ action: 'syncServices' });
                    setJapSyncProgress('');
                    toast.success(res.message || `Sync complete — ${res.total.toLocaleString()} services synced (${res.syncDuration})`);
                    await loadJapConfig(); await loadJapServices();
                  } catch (e) {
                    setJapSyncProgress('');
                    toast.error(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
                  }
                  finally { setJapSyncing(false); }
                }}
                disabled={japSyncing}
                className="btn-primary text-sm flex items-center gap-2"
              >
                {japSyncing ? <><Loader2 size={14} className="animate-spin" /> {japSyncProgress || 'Syncing…'}</> : <><RefreshCw size={14} /> Sync Service Catalog</>}
              </button>
            </div>
          </div>

          {/* Stats */}
          {japConfig && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Active Services', value: japConfig.serviceCount.toLocaleString(), color: 'text-kitan-teal' },
                { label: 'Price Multiplier', value: `×${japConfig.globalMultiplier}`, color: 'text-amber-400' },
                { label: 'Exchange Rate', value: `₦${japConfig.exchangeRate.toLocaleString()}`, color: 'text-green-400' },
                { label: 'Total Orders', value: japOrders.length, color: 'text-blue-400' },
              ].map(({ label, value, color }) => (
                <div key={label} className="card-kitan p-4"><p className={cn('font-display font-bold text-xl', color)}>{value}</p><p className="text-kitan-muted text-xs mt-1">{label}</p></div>
              ))}
            </div>
          )}

          {/* API Coverage Diagnostic */}
          {japServices.length > 0 && (() => {
            const nonInstagramCats = [...new Set(japServices.filter(s => !s.category_name.toLowerCase().includes('instagram')).map(s => s.category_name))];
            const instagramOnly = nonInstagramCats.length <= 2;
            if (!instagramOnly) return null;
            return (
              <div className="p-5 rounded-2xl border border-amber-500/40 space-y-3" style={{ background: 'rgba(245,158,11,0.06)' }}>
                <div className="flex items-start gap-3">
                  <AlertCircle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="text-amber-300 font-semibold text-sm">API Key Limited to Instagram Only</p>
                    <p className="text-amber-400/80 text-xs mt-1 leading-relaxed">
                      The current API key only returns Instagram services ({japServices.filter(s => s.category_name.toLowerCase().includes('instagram')).length} of {japServices.length} services). 
                      Facebook, YouTube, TikTok, Twitter/X, Discord, Telegram and other platforms are not available with this key.
                    </p>
                    <p className="text-amber-400/70 text-xs mt-2 leading-relaxed">
                      <strong>Fix:</strong> Log into your provider dashboard → check which service categories are enabled on your account → contact provider support to unlock all platforms → update the API key secret in the Cloud Secrets panel.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {['Facebook', 'YouTube', 'TikTok', 'Twitter/X', 'Telegram', 'Discord'].map(p => (
                    <div key={p} className="flex items-center gap-2 p-2 rounded-lg bg-red-500/10 border border-red-500/20">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-400 flex-shrink-0" />
                      <span className="text-red-400 font-medium">{p}: Not Available</span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}

          {/* Exchange Rate */}
          <div className="card-kitan p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center"><DollarSign size={16} className="text-green-400" /></div>
              <div>
                <h4 className="font-semibold text-kitan-off-white text-sm">USD → NGN Exchange Rate</h4>
                <p className="text-kitan-subtle text-xs mt-0.5">All boosting service prices are in USD — converted to NGN at this rate. Change here to update all prices instantly without re-syncing.</p>
              </div>
            </div>
            <div className="flex gap-3 items-center flex-wrap">
              <div className="relative flex-1 max-w-xs">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-teal font-bold text-sm">₦</span>
                <input type="number" min="100" step="50" className="input-kitan pl-8 text-sm" placeholder="e.g. 1450" value={japExchangeRateInput} onChange={e => setJapExchangeRateInput(e.target.value)} />
              </div>
              <button
                onClick={async () => {
                  const r = parseFloat(japExchangeRateInput);
                  if (isNaN(r) || r < 100) { toast.error('Enter a valid rate (min 100)'); return; }
                  setJapSavingExchangeRate(true);
                  try {
                    await japAdmin({ action: 'setExchangeRate', rate: r });
                    setJapConfig(prev => prev ? { ...prev, exchangeRate: r } : prev);
                    toast.success(`Boosting exchange rate set to ₦${r.toLocaleString()} per USD`);
                  } catch (e) { toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`); }
                  finally { setJapSavingExchangeRate(false); }
                }}
                disabled={japSavingExchangeRate}
                className="btn-primary text-sm px-5 flex items-center gap-2"
              >
                {japSavingExchangeRate ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Update Rate</>}
              </button>
            </div>
            {japConfig && (
              <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 text-xs">
                {[1, 2, 5, 10, 20].map(usd => (
                  <div key={usd} className="bg-kitan-bg rounded-lg px-3 py-2 border border-kitan-border text-center">
                    <p className="text-kitan-teal font-bold">{formatNGN(usd * japConfig.exchangeRate)}</p>
                    <p className="text-kitan-subtle">${usd} USD</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Global Multiplier */}
          <div className="card-kitan p-6 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-kitan-teal/10 border border-kitan-teal/20 flex items-center justify-center"><Zap size={16} className="text-kitan-teal" /></div>
              <div>
                <h4 className="font-semibold text-kitan-off-white text-sm">Global Price Multiplier (×1–×5)</h4>
                <p className="text-kitan-subtle text-xs mt-0.5">Formula: <span className="font-mono">(provider_usd / 1000) × qty × multiplier × exchange_rate</span></p>
              </div>
            </div>
            <div className="grid grid-cols-5 gap-3">
              {[1, 2, 3, 4, 5].map(m => (
                <button key={m} onClick={() => setJapMultiplier(m)} className={cn('py-4 rounded-2xl border-2 font-display font-bold text-xl transition-all', japMultiplier === m ? 'border-kitan-teal bg-kitan-teal/10 text-kitan-teal shadow-teal-glow' : 'border-kitan-border bg-kitan-surface text-kitan-muted hover:border-kitan-teal/40')}>
                  ×{m}<span className="block text-xs font-normal mt-0.5">{['Std','×2','×3','×4','×5'][m-1]}</span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={async () => {
                  setJapSavingMult(true);
                  try {
                    await japAdmin({ action: 'setGlobalMultiplier', multiplier: japMultiplier });
                    setJapConfig(prev => prev ? { ...prev, globalMultiplier: japMultiplier } : prev);
                    toast.success(`Boosting multiplier set to ×${japMultiplier}`);
                  } catch (e) { toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`); }
                  finally { setJapSavingMult(false); }
                }}
                disabled={japSavingMult}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                {japSavingMult ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Multiplier (×{japMultiplier})</>}
              </button>
              {japConfig && japConfig.globalMultiplier !== japMultiplier && <span className="text-amber-400 text-xs font-medium">Unsaved — current: ×{japConfig.globalMultiplier}</span>}
            </div>
          </div>

          {/* Service Overrides Table */}
          <div className="card-kitan p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h4 className="font-semibold text-kitan-off-white text-sm flex items-center gap-2"><Sliders size={14} className="text-amber-400" /> Service Price Overrides ({japServices.length} services)</h4>
              <div className="relative"><Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" /><input type="text" placeholder="Search services…" value={japServiceSearch} onChange={e => setJapServiceSearch(e.target.value)} className="input-kitan pl-8 text-xs py-2 w-44" /></div>
            </div>
            {japServicesLoading ? (<div className="flex items-center gap-3 py-4"><Loader2 size={16} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading…</span></div>) : japServices.length === 0 ? (
              <p className="text-kitan-muted text-sm text-center py-8">No services — click "Sync Service Catalog" to load.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b border-kitan-border">
                    <th className="text-left text-kitan-subtle text-xs font-semibold uppercase tracking-wide py-2 pr-3">Service</th>
                    <th className="text-right text-kitan-subtle text-xs font-semibold uppercase tracking-wide py-2 pr-3">Provider USD/1k → NGN/unit</th>
                    <th className="text-left text-kitan-subtle text-xs font-semibold uppercase tracking-wide py-2 pr-3">Override (USD/1k)</th>
                    <th className="py-2"></th>
                  </tr></thead>
                  <tbody className="divide-y divide-kitan-border/50">
                    {japServices
                      .filter(s => !japServiceSearch || s.service_name.toLowerCase().includes(japServiceSearch.toLowerCase()) || s.category_name.toLowerCase().includes(japServiceSearch.toLowerCase()))
                      .slice(0, 100)
                      .map(svc => (
                        <tr key={svc.id} className="hover:bg-kitan-bg/40 transition-colors">
                          <td className="py-2.5 pr-3">
                            <p className="text-kitan-off-white text-xs font-medium truncate max-w-[180px]">{svc.service_name}</p>
                            <p className="text-kitan-subtle text-[10px] font-mono">ID #{svc.id} · {svc.category_name}</p>
                          </td>
                          <td className="py-2.5 pr-3 text-right">
                            <p className="text-kitan-subtle text-xs font-mono">${Number(svc.original_api_price).toFixed(4)}/1k</p>
                            {japConfig && (
                              <p className="text-kitan-teal text-[10px]">
                                {formatNGN(Number(svc.original_api_price) / 1000 * japConfig.exchangeRate * japConfig.globalMultiplier)}/unit
                              </p>
                            )}
                          </td>
                          <td className="py-2.5 pr-3">
                            <div className="flex items-center gap-1.5">
                              <input type="number" min="0" step="0.001" placeholder="USD/1k (blank=auto)" className="input-kitan text-xs py-1.5 w-28"
                                value={japEditPrices[svc.id] !== undefined ? japEditPrices[svc.id] : (svc.custom_admin_price != null ? String(svc.custom_admin_price) : '')}
                                onChange={e => setJapEditPrices(prev => ({ ...prev, [svc.id]: e.target.value }))}
                              />
                              {svc.custom_admin_price != null && <span className="text-amber-400 text-[10px] font-semibold">Custom</span>}
                            </div>
                          </td>
                          <td className="py-2.5">
                            <button
                              disabled={japSavingPrice === svc.id}
                              onClick={async () => {
                                setJapSavingPrice(svc.id);
                                const raw = japEditPrices[svc.id];
                                const customPrice = raw === '' ? null : raw !== undefined ? Number(raw) : null;
                                try {
                                  await japAdmin({ action: 'updateServicePrice', serviceId: svc.id, customPrice });
                                  setJapServices(prev => prev.map(s => s.id === svc.id ? { ...s, custom_admin_price: customPrice } : s));
                                  toast.success('Override saved');
                                } catch (e) { toast.error(`Failed: ${e instanceof Error ? e.message : String(e)}`); }
                                finally { setJapSavingPrice(null); }
                              }}
                              className="w-7 h-7 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all disabled:opacity-50"
                            >
                              {japSavingPrice === svc.id ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
                {japServices.filter(s => !japServiceSearch || s.service_name.toLowerCase().includes(japServiceSearch.toLowerCase())).length > 100 && (
                  <p className="text-kitan-subtle text-xs text-center mt-3">Showing 100 of {japServices.length} services. Use search to filter.</p>
                )}
              </div>
            )}
          </div>

          {/* Order History */}
          <div className="card-kitan p-6 space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <h4 className="font-semibold text-kitan-off-white text-sm flex items-center gap-2"><History size={14} className="text-kitan-teal" /> All Boosting Orders ({japOrders.length})</h4>
              <div className="flex gap-2 flex-wrap">
                {(['all', 'pending', 'processing', 'completed', 'awaiting_review', 'cancelled']).map(f => (
                  <button key={f} onClick={() => setJapOrderFilter(f)} className={cn('px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all', japOrderFilter === f ? 'bg-kitan-teal text-white' : 'bg-kitan-surface text-kitan-muted border border-kitan-border hover:text-kitan-off-white')}>{f.replace('_', ' ')}</button>
                ))}
              </div>
            </div>
            {japOrdersLoading ? (<div className="flex items-center gap-3 py-4"><Loader2 size={16} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading…</span></div>) : (() => {
              const filtered = japOrders.filter(o => japOrderFilter === 'all' || o.status === japOrderFilter);
              return filtered.length === 0 ? (<p className="text-kitan-muted text-sm text-center py-8">No orders found</p>) : (
                <div className="divide-y divide-kitan-border">
                  {filtered.map(order => (
                    <div key={order.id} className="py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-kitan-off-white text-sm font-semibold">{order.service_name}</p>
                          <p className="text-kitan-subtle text-xs">{order.category_name} · {order.quantity.toLocaleString()} units</p>
                          <p className="text-kitan-subtle text-xs font-mono break-all mt-0.5">{order.target_link}</p>
                          <p className="text-kitan-subtle text-xs mt-0.5 font-mono">User: {order.app_user_id.slice(0,12)}… · Ref: {order.jap_order_id ?? 'Pending'}</p>
                          <p className="text-kitan-subtle text-xs">{new Date(order.created_at).toLocaleString()}</p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <span className={cn('inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border capitalize',
                            order.status === 'completed' ? 'bg-green-500/10 text-green-400 border-green-500/30' :
                            order.status === 'processing' ? 'bg-blue-500/10 text-blue-400 border-blue-400/30' :
                            order.status === 'awaiting_review' ? 'bg-orange-500/10 text-orange-400 border-orange-500/30' :
                            order.status === 'cancelled' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                            'bg-amber-500/10 text-amber-400 border-amber-400/30'
                          )}>{order.status.replace('_', ' ')}</span>
                          <p className="text-kitan-teal font-display font-bold text-sm mt-2">{formatNGN(order.cost_ngn)}</p>
                        </div>
                      </div>
                      {order.error_message && (<div className="mt-2 p-2.5 rounded-lg bg-orange-500/5 border border-orange-500/20"><p className="text-orange-400/80 text-xs">{order.error_message}</p></div>)}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* =================== WEBSITE PRODUCTS ADMIN =================== */}
      {activeTab === 'website-products' && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div><h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2"><Globe size={18} className="text-kitan-teal" /> Website Products</h3><p className="text-kitan-muted text-sm mt-1">Manage website service packages visible to users.</p></div>
            <button onClick={() => { setIsNewWP(true); setEditingWP({ title: '', description: '', price_ngn: 0, features: [], tags: [], available: true, is_premium: true, pinned: false, preview_images: [], _featuresRaw: '', _tagsRaw: '' }); }} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> Add Package</button>
          </div>

          {editingWP && (
            <div className="card-kitan p-6 space-y-4 border-kitan-teal/40 animate-fade-in">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-kitan-off-white">{isNewWP ? 'New Website Package' : 'Edit Package'}</h3><button onClick={() => { setEditingWP(null); setIsNewWP(false); }}><X size={16} className="text-kitan-subtle" /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Title *</label><input className="input-kitan text-sm" value={String(editingWP.title || '')} onChange={e => setEditingWP({ ...editingWP, title: e.target.value })} placeholder="e.g. Business Website Package" /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Price (NGN)</label><input type="number" className="input-kitan text-sm" value={String(editingWP.price_ngn || '')} onChange={e => setEditingWP({ ...editingWP, price_ngn: parseFloat(e.target.value) || 0 })} /></div>
                <div className="flex items-center gap-3 mt-5"><label className="text-kitan-muted text-sm">Available</label><button type="button" onClick={() => setEditingWP({ ...editingWP, available: !editingWP.available })} className={cn('transition-colors', editingWP.available ? 'text-kitan-teal' : 'text-kitan-subtle')}>{editingWP.available ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</button></div>
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Description</label><textarea rows={3} className="input-kitan text-sm resize-none" value={String(editingWP.description || '')} onChange={e => setEditingWP({ ...editingWP, description: e.target.value })} /></div>
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Features (one per line)</label><textarea rows={5} className="input-kitan text-xs resize-none font-mono" value={String(editingWP._featuresRaw || '')} onChange={e => setEditingWP({ ...editingWP, _featuresRaw: e.target.value })} placeholder="Responsive Design\n5 Pages\nSEO Optimised\n1 Year Hosting" /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Tags (comma-separated)</label><input className="input-kitan text-sm" value={String(editingWP._tagsRaw || '')} onChange={e => setEditingWP({ ...editingWP, _tagsRaw: e.target.value })} placeholder="Landing Page, E-commerce" /></div>
              </div>
              <div className="flex gap-3"><button onClick={saveWebsiteProduct} className="btn-primary flex items-center gap-2 text-sm"><Save size={14} /> Save</button><button onClick={() => { setEditingWP(null); setIsNewWP(false); }} className="btn-secondary text-sm">Cancel</button></div>
            </div>
          )}

          {websiteProductsLoading ? (<div className="flex items-center gap-3 py-8"><Loader2 size={18} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading…</span></div>) : (
            <div className="card-kitan overflow-hidden">
              {websiteProducts.length === 0 ? <p className="text-kitan-muted text-sm text-center py-10">No website products yet</p> : (
                <div className="divide-y divide-kitan-border">
                  {websiteProducts.map(p => (
                    <div key={p.id} className="flex items-center gap-4 p-4 hover:bg-kitan-bg/50 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0"><Globe size={18} className="text-indigo-400" /></div>
                      <div className="flex-1 min-w-0"><p className="text-kitan-off-white text-sm font-medium truncate">{p.title}</p><p className="text-kitan-subtle text-xs">{p.features.length} features · {p.tags.join(', ')}</p></div>
                      <p className="text-kitan-teal font-bold text-sm flex-shrink-0">{formatNGN(p.price_ngn)}</p>
                      <span className={cn('text-xs px-2 py-1 rounded-full', p.available ? 'bg-kitan-teal/10 text-kitan-teal' : 'bg-red-500/10 text-red-400')}>{p.available ? 'Active' : 'Hidden'}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button onClick={() => { setIsNewWP(false); setEditingWP({ ...p, _featuresRaw: p.features.join('\n'), _tagsRaw: p.tags.join(', ') }); }} className="w-8 h-8 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all"><Edit3 size={14} /></button>
                        <button onClick={async () => { await supabase.from('website_products').delete().eq('id', p.id); toast.success('Deleted'); loadWebsiteProducts(); }} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =================== TUTORIAL VIDEOS ADMIN =================== */}
      {activeTab === 'tutorial-videos' && (
        <div className="space-y-5 animate-fade-in">
          <div><h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2"><Video size={18} className="text-kitan-teal" /> Tutorial Videos</h3><p className="text-kitan-muted text-sm mt-1">Assign a tutorial video URL to each service. Supports YouTube, Vimeo, and direct MP4 links.</p></div>
          {tutorialVideosLoading ? (<div className="flex items-center gap-3 py-8"><Loader2 size={18} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading videos…</span></div>) : (
            <div className="space-y-4">
              {SERVICE_KEYS.map(({ key, label }) => (
                <div key={key} className="card-kitan p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <Video size={15} className="text-kitan-teal" />
                    <span className="font-semibold text-kitan-off-white text-sm">{label}</span>
                    {tutorialVideos[key]?.video_url && <span className="text-xs bg-kitan-teal/10 text-kitan-teal border border-kitan-teal/20 px-2 py-0.5 rounded-full">Video set</span>}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="text-kitan-muted text-xs mb-1 block">Video Title</label><input className="input-kitan text-sm" placeholder={`${label} Tutorial`} value={videoEdits[key]?.title || ''} onChange={e => setVideoEdits(prev => ({ ...prev, [key]: { ...prev[key], title: e.target.value } }))} /></div>
                    <div><label className="text-kitan-muted text-xs mb-1 block">Video URL (YouTube / Vimeo / MP4)</label><input className="input-kitan text-sm" placeholder="https://youtube.com/watch?v=..." value={videoEdits[key]?.video_url || ''} onChange={e => setVideoEdits(prev => ({ ...prev, [key]: { ...prev[key], video_url: e.target.value } }))} /></div>
                  </div>
                  <div className="flex gap-3">
                    <button onClick={() => saveTutorialVideo(key)} disabled={savingVideoKey === key} className="btn-primary flex items-center gap-2 text-xs py-2 px-4">
                      {savingVideoKey === key ? <><Loader2 size={12} className="animate-spin" /> Saving…</> : <><Save size={12} /> Save</>}
                    </button>
                    {videoEdits[key]?.video_url && (
                      <button onClick={() => { setVideoEdits(prev => ({ ...prev, [key]: { title: '', video_url: '' } })); saveTutorialVideo(key); }} className="btn-secondary text-xs py-2 px-3 text-red-400 border-red-500/20 hover:border-red-500/40">Remove</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* =================== SUBSCRIPTIONS ADMIN =================== */}
      {activeTab === 'subscriptions' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div><h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2"><Crown size={18} className="text-kitan-teal" /> Subscription Management</h3><p className="text-kitan-muted text-sm mt-1">Manage plans, pricing, features, and view subscriber details.</p></div>
            <div className="flex gap-2">
              <button onClick={() => { loadSubPlans(); loadSubscribers(); }} className="btn-secondary text-sm flex items-center gap-2"><RefreshCw size={14} /> Refresh</button>
              <button onClick={() => { const newId = `plan_${Date.now()}_${Math.random().toString(36).slice(2,6)}`; setIsNewPlan(true); setPamPlanId(newId); setEditingPlan({ name: 'New Plan', price_ngn: 5000, duration_days: 30, is_popular: false, enabled: true, description: '', color_theme: 'teal', sort_order: 10 }); loadPamRows(newId, true); loadPamCatalog(); }} className="btn-primary flex items-center gap-2 text-sm"><Plus size={16} /> Add Plan</button>
            </div>
          </div>

          {/* Plan editor */}
          {editingPlan && (
            <div className="card-kitan p-6 space-y-5 border-kitan-teal/40 animate-fade-in">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-kitan-off-white">{isNewPlan ? 'New Plan' : 'Edit Plan'}</h3><button onClick={() => { setEditingPlan(null); setIsNewPlan(false); setPamRows([]); setPamPlanId(null); }}><X size={16} className="text-kitan-subtle" /></button></div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="text-kitan-muted text-xs mb-1 block">Plan Name</label><input className="input-kitan text-sm" value={String(editingPlan.name || '')} onChange={e => setEditingPlan({ ...editingPlan, name: e.target.value })} /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Price (NGN)</label><input type="number" className="input-kitan text-sm" value={String(editingPlan.price_ngn || '')} onChange={e => setEditingPlan({ ...editingPlan, price_ngn: parseFloat(e.target.value) || 0 })} /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Duration (days)</label><input type="number" className="input-kitan text-sm" value={String(editingPlan.duration_days || 30)} onChange={e => setEditingPlan({ ...editingPlan, duration_days: parseInt(e.target.value) || 30 })} /></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Color Theme</label><select className="input-kitan text-sm" value={String(editingPlan.color_theme || 'teal')} onChange={e => setEditingPlan({ ...editingPlan, color_theme: e.target.value })}>{['teal', 'blue', 'purple', 'gold'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}</select></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Sort Order</label><input type="number" className="input-kitan text-sm" value={String(editingPlan.sort_order || 0)} onChange={e => setEditingPlan({ ...editingPlan, sort_order: parseInt(e.target.value) || 0 })} /></div>
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-2"><label className="text-kitan-muted text-xs">Most Popular</label><button type="button" onClick={() => setEditingPlan({ ...editingPlan, is_popular: !editingPlan.is_popular })} className={cn('transition-colors', editingPlan.is_popular ? 'text-amber-400' : 'text-kitan-subtle')}>{editingPlan.is_popular ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}</button></div>
                  <div className="flex items-center gap-2"><label className="text-kitan-muted text-xs">Enabled</label><button type="button" onClick={() => setEditingPlan({ ...editingPlan, enabled: !editingPlan.enabled })} className={cn('transition-colors', editingPlan.enabled ? 'text-kitan-teal' : 'text-kitan-subtle')}>{editingPlan.enabled ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}</button></div>
                </div>
                <div className="sm:col-span-2"><label className="text-kitan-muted text-xs mb-1 block">Description</label><input className="input-kitan text-sm" value={String(editingPlan.description || '')} onChange={e => setEditingPlan({ ...editingPlan, description: e.target.value })} /></div>
              </div>

              {/* ── Product Access Manager (real products) ── */}
              <div className="rounded-2xl border border-kitan-teal/25 overflow-hidden" style={{ background: 'rgba(20,184,166,0.03)' }}>
                <div className="flex items-center justify-between px-5 py-3 border-b border-kitan-border flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles size={14} className="text-kitan-teal" />
                    <span className="font-semibold text-kitan-off-white text-sm">Assigned Products</span>
                    {pamRows.length > 0 && (
                      <span className="text-xs bg-kitan-teal/15 text-kitan-teal border border-kitan-teal/30 px-2 py-0.5 rounded-full font-semibold">{pamRows.length} assigned</span>
                    )}
                  </div>
                  <span className="text-kitan-subtle text-xs">Select real products from your catalog to include in this plan</span>
                </div>

                {(pamLoading || pamCatalogLoading) ? (
                  <div className="flex items-center gap-3 px-5 py-6"><Loader2 size={15} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading products…</span></div>
                ) : (
                  <div className="p-5 space-y-5">

                    {/* ── Service-level access (Virtual Numbers, Receipt Gen, Account Boosting) ── */}
                    <div className="space-y-2">
                      <p className="text-kitan-subtle text-xs font-semibold uppercase tracking-wide">Service Access (no individual products)</p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        {PAM_SERVICE_TYPES.map(svc => {
                          const assigned = isPamRowAssigned(null, svc.type);
                          const row = pamRows.find(r => r.product_id === null && r.product_type === svc.type);
                          return (
                            <div key={svc.type} className={cn('rounded-2xl border p-3 transition-all', assigned ? 'border-kitan-teal/40 bg-kitan-teal/5' : 'border-kitan-border bg-kitan-bg/30')}>
                              <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="text-kitan-off-white text-xs font-semibold">{svc.label}</p>
                                <button type="button"
                                  onClick={() => togglePamItem({ id: null, type: svc.type, table: null, name: svc.label })}
                                  className={cn('transition-colors flex-shrink-0', assigned ? 'text-kitan-teal' : 'text-kitan-subtle')}
                                >{assigned ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}</button>
                              </div>
                              {assigned && (
                                <div className="flex items-center gap-1.5">
                                  <input type="number" min="1" step="1" placeholder="∞"
                                    className="input-kitan text-xs py-1 w-16 text-center"
                                    value={row?.qty_limit !== null && row?.qty_limit !== undefined ? String(row.qty_limit) : ''}
                                    onChange={e => updatePamRowQty(null, svc.type, e.target.value === '' ? null : parseInt(e.target.value) || null)}
                                  />
                                  <span className="text-kitan-subtle text-[10px]">uses (∞ = unlimited)</span>
                                </div>
                              )}
                              {!assigned && <p className="text-kitan-subtle text-[10px]">Not included</p>}
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* ── Real product selection ── */}
                    <div className="space-y-3">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <p className="text-kitan-subtle text-xs font-semibold uppercase tracking-wide">Individual Products ({pamCatalog.length} available)</p>
                        <div className="relative">
                          <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                          <input type="text" placeholder="Search products…" value={pamSearch} onChange={e => setPamSearch(e.target.value)} className="input-kitan pl-7 text-xs py-1.5 w-44" />
                        </div>
                      </div>

                      {pamCatalog.length === 0 ? (
                        <p className="text-kitan-muted text-xs text-center py-4">No products found. Create some in the Products, Documents, Pictures, Formats, or Website tabs first.</p>
                      ) : (
                        <div className="space-y-3">
                          {PAM_PRODUCT_TABLES.map(tbl => {
                            const items = pamCatalog
                              .filter(c => c.type === tbl.type)
                              .filter(c => !pamSearch || c.title.toLowerCase().includes(pamSearch.toLowerCase()));
                            if (items.length === 0) return null;
                            const assignedCount = items.filter(c => isPamRowAssigned(c.id, c.type)).length;
                            return (
                              <div key={tbl.type} className="rounded-xl border border-kitan-border overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-2 bg-kitan-bg/50 border-b border-kitan-border">
                                  <p className="text-kitan-off-white text-xs font-semibold">{tbl.label}</p>
                                  <div className="flex items-center gap-2">
                                    {assignedCount > 0 && <span className="text-[10px] bg-kitan-teal/15 text-kitan-teal px-2 py-0.5 rounded-full">{assignedCount} assigned</span>}
                                    <button type="button"
                                      onClick={() => {
                                        const allAssigned = items.every(c => isPamRowAssigned(c.id, c.type));
                                        if (allAssigned) {
                                          setPamRows(prev => prev.filter(r => !items.some(c => c.id === r.product_id && c.type === r.product_type)));
                                        } else {
                                          const toAdd = items.filter(c => !isPamRowAssigned(c.id, c.type));
                                          const newRows: PamRow[] = toAdd.map(c => ({
                                            id: `${pamPlanId}_${c.type}_${c.id}_${Date.now()}`,
                                            product_type: c.type, product_table: c.table,
                                            product_id: c.id, product_name: c.title, qty_limit: null,
                                          }));
                                          setPamRows(prev => [...prev, ...newRows]);
                                        }
                                      }}
                                      className="text-[10px] text-kitan-teal hover:text-kitan-teal-bright font-semibold transition-colors"
                                    >
                                      {items.every(c => isPamRowAssigned(c.id, c.type)) ? 'Deselect All' : 'Select All'}
                                    </button>
                                  </div>
                                </div>
                                <div className="divide-y divide-kitan-border/50 max-h-52 overflow-y-auto">
                                  {items.map(item => {
                                    const assigned = isPamRowAssigned(item.id, item.type);
                                    const row = pamRows.find(r => r.product_id === item.id && r.product_type === item.type);
                                    return (
                                      <div key={item.id} className={cn('flex items-center gap-3 px-4 py-2.5 transition-colors cursor-pointer hover:bg-kitan-bg/40', assigned && 'bg-kitan-teal/3')} onClick={() => togglePamItem({ id: item.id, type: item.type, table: item.table, name: item.title })}>
                                        <div className={cn('w-4 h-4 rounded border-2 flex items-center justify-center flex-shrink-0 transition-all', assigned ? 'bg-kitan-teal border-kitan-teal' : 'border-kitan-border bg-transparent')}>
                                          {assigned && <CheckCircle size={10} className="text-white" />}
                                        </div>
                                        <p className="text-kitan-off-white text-xs font-medium flex-1 truncate">{item.title}</p>
                                        {assigned && (
                                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                                            <input type="number" min="1" step="1" placeholder="∞"
                                              className="input-kitan text-xs py-1 w-14 text-center"
                                              value={row?.qty_limit !== null && row?.qty_limit !== undefined ? String(row.qty_limit) : ''}
                                              onChange={e => updatePamRowQty(item.id, item.type, e.target.value === '' ? null : parseInt(e.target.value) || null)}
                                            />
                                            <span className="text-kitan-subtle text-[9px]">uses</span>
                                          </div>
                                        )}
                                        {!assigned && <span className="text-kitan-border text-[10px]">—</span>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Summary */}
                    <div className="flex items-center gap-2 pt-2 border-t border-kitan-border">
                      <CheckCircle size={12} className="text-kitan-teal flex-shrink-0" />
                      <p className="text-kitan-subtle text-xs">
                        {pamRows.length} product{pamRows.length !== 1 ? 's' : ''} assigned to this plan · Any new product added in the admin will appear here automatically
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3">
                <button onClick={savePlan} disabled={pamSaving} className="btn-primary flex items-center gap-2 text-sm">
                  {pamSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Plan &amp; Products</>}
                </button>
                <button onClick={() => { setEditingPlan(null); setIsNewPlan(false); setPamRows([]); setPamPlanId(null); setPamSearch(''); }} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Plans list */}
          <div className="card-kitan overflow-hidden">
            <div className="p-4 border-b border-kitan-border flex items-center justify-between"><p className="font-semibold text-kitan-off-white text-sm">Plans ({subPlans.length})</p></div>
            {subPlansLoading ? (<div className="flex items-center gap-3 py-8 px-4"><Loader2 size={16} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading…</span></div>) : subPlans.length === 0 ? (<p className="text-kitan-muted text-sm text-center py-10">No plans</p>) : (
              <div className="divide-y divide-kitan-border">
                {subPlans.map(plan => (
                  <div key={plan.id} className="flex items-center gap-4 p-4 hover:bg-kitan-bg/50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2"><p className="text-kitan-off-white font-medium text-sm">{plan.name}</p>{plan.is_popular && <span className="text-xs bg-amber-500/15 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-semibold">Popular</span>}{!plan.enabled && <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded-full">Disabled</span>}</div>
                      <p className="text-kitan-subtle text-xs">{plan.duration_days}d</p>
                    </div>
                    <p className="text-kitan-teal font-bold text-sm">{formatNGN(plan.price_ngn)}</p>
                    <div className="flex gap-1">
                      <button onClick={() => { setIsNewPlan(false); setEditingPlan(plan as unknown as Record<string,unknown>); loadPamRows(plan.id, false); loadPamCatalog(); }} className="w-8 h-8 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all"><Edit3 size={14} /></button>
                      <button onClick={async () => { await supabase.from('subscription_plans').delete().eq('id', plan.id); toast.success('Plan deleted'); loadSubPlans(); }} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Subscribers */}
          <div className="card-kitan overflow-hidden">
            <div className="p-4 border-b border-kitan-border flex items-center justify-between">
              <p className="font-semibold text-kitan-off-white text-sm">Subscribers ({subscribers.length})</p>
              <button onClick={loadSubscribers} className="btn-ghost text-xs flex items-center gap-1"><RefreshCw size={11} /> Refresh</button>
            </div>
            {subscribersLoading ? (<div className="flex items-center gap-3 py-8 px-4"><Loader2 size={16} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading…</span></div>) : subscribers.length === 0 ? (<p className="text-kitan-muted text-sm text-center py-10">No subscribers yet</p>) : (
              <div className="divide-y divide-kitan-border">
                {subscribers.map(sub => {
                  const daysLeft = Math.max(0, Math.ceil((new Date(sub.expires_at).getTime() - Date.now()) / (1000*60*60*24)));
                  return (
                    <div key={sub.id} className="p-4 hover:bg-kitan-bg/50 transition-colors">
                      <div className="flex items-start justify-between gap-3 flex-wrap">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-kitan-off-white font-medium text-sm">{sub.plan_name}</p>
                            <span className={cn('text-xs px-2.5 py-0.5 rounded-full border font-semibold capitalize', sub.status === 'active' ? 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30' : sub.status === 'expired' ? 'bg-kitan-surface text-kitan-muted border-kitan-border' : 'bg-red-500/10 text-red-400 border-red-500/30')}>{sub.status}</span>
                          </div>
                          <p className="text-kitan-subtle text-xs font-mono mt-0.5">{sub.app_user_id.slice(0,16)}…</p>
                          <p className="text-kitan-subtle text-xs">
                            {new Date(sub.activated_at).toLocaleDateString('en-NG', { day:'numeric',month:'short',year:'numeric' })} → {new Date(sub.expires_at).toLocaleDateString('en-NG', { day:'numeric',month:'short',year:'numeric' })}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-kitan-teal font-bold text-sm">{formatNGN(sub.price_paid_ngn)}</p>
                          {sub.status === 'active' && <p className="text-kitan-subtle text-xs mt-0.5">{daysLeft}d left</p>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================== SOCIAL ACCOUNTS ADMIN =================== */}
      {activeTab === 'social-accounts' && (
        <div className="space-y-5 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2">
                <Users size={18} className="text-kitan-teal" /> Social Media Accounts
              </h3>
              <p className="text-kitan-muted text-sm mt-1">Manage digital account products. Notes/credentials shown to buyers after purchase.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={loadSocialAccounts} className="btn-secondary text-sm flex items-center gap-2">
                <RefreshCw size={14} className={socialAccountsLoading ? 'animate-spin' : ''} /> Refresh
              </button>
              <button
                onClick={() => { setIsNewSA(true); setEditingSA({ title: '', category: 'Facebook', price: 0, description: '', notes: '', available: true, stock: 1, pinned: false }); }}
                className="btn-primary flex items-center gap-2 text-sm"
              >
                <Plus size={16} /> Add Product
              </button>
            </div>
          </div>

          {editingSA && (
            <div className="card-kitan p-6 space-y-4 border-kitan-teal/40 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-kitan-off-white">{isNewSA ? 'New Account Product' : 'Edit Account Product'}</h3>
                <button onClick={() => { setEditingSA(null); setIsNewSA(false); }}><X size={16} className="text-kitan-subtle" /></button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="text-kitan-muted text-xs mb-1 block">Title *</label>
                  <input className="input-kitan text-sm" value={editingSA.title || ''} onChange={e => setEditingSA({ ...editingSA, title: e.target.value })} placeholder="e.g. Facebook Account 1000 Friends" />
                </div>
                <div>
                  <label className="text-kitan-muted text-xs mb-1 block">Category *</label>
                  <select className="input-kitan text-sm" value={editingSA.category || 'Other'} onChange={e => setEditingSA({ ...editingSA, category: e.target.value })}>
                    {SOCIAL_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-kitan-muted text-xs mb-1 block">Price (NGN) *</label>
                  <input type="number" className="input-kitan text-sm" value={editingSA.price ?? ''} onChange={e => setEditingSA({ ...editingSA, price: parseFloat(e.target.value) || 0 })} />
                </div>
                <div>
                  <label className="text-kitan-muted text-xs mb-1 block">Stock (units available)</label>
                  <input type="number" min="0" className="input-kitan text-sm" value={editingSA.stock ?? 0} onChange={e => setEditingSA({ ...editingSA, stock: parseInt(e.target.value) || 0 })} />
                </div>
                <div className="flex items-center gap-3 mt-4">
                  <label className="text-kitan-muted text-sm">Available to users</label>
                  <button type="button" onClick={() => setEditingSA({ ...editingSA, available: !editingSA.available })} className={cn('transition-colors', editingSA.available ? 'text-kitan-teal' : 'text-kitan-subtle')}>
                    {editingSA.available ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                  </button>
                </div>
                <div className="sm:col-span-2">
                  <label className="text-kitan-muted text-xs mb-1 block">Description (shown on listing page)</label>
                  <textarea rows={3} className="input-kitan text-sm resize-none" value={editingSA.description || ''} onChange={e => setEditingSA({ ...editingSA, description: e.target.value })} placeholder="Describe the account: age, followers, niche, etc." />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-kitan-muted text-xs mb-1 block">Account Notes / Credentials</label>
                  <p className="text-kitan-subtle text-[10px] mb-2">Shown to buyer AFTER purchase. Include login details, passwords, recovery codes. Leave blank to show WhatsApp support button instead.</p>
                  <textarea rows={6} className="input-kitan text-sm resize-none font-mono" value={editingSA.notes || ''} onChange={e => setEditingSA({ ...editingSA, notes: e.target.value })} placeholder="Email: user@gmail.com&#10;Password: pass123&#10;2FA Backup: xxx" />
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                <p className="text-amber-400/80 text-xs leading-relaxed">Notes/credentials are only visible to users who completed payment. Keep them accurate.</p>
              </div>
              <div className="flex gap-3">
                <button onClick={handleSaveSA} className="btn-primary flex items-center gap-2 text-sm"><Save size={14} /> Save Product</button>
                <button onClick={() => { setEditingSA(null); setIsNewSA(false); }} className="btn-secondary text-sm">Cancel</button>
              </div>
            </div>
          )}

          {socialAccountsLoading ? (
            <div className="flex items-center gap-3 py-8"><Loader2 size={18} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading accounts...</span></div>
          ) : (
            <div className="card-kitan overflow-hidden">
              {socialAccounts.length === 0 ? (
                <div className="text-center py-12">
                  <Users size={40} className="text-kitan-subtle mx-auto mb-3" />
                  <p className="text-kitan-muted text-sm">No account products yet</p>
                </div>
              ) : (
                <div className="divide-y divide-kitan-border">
                  {socialAccounts.map(acct => (
                    <div key={acct.id} className={cn('flex items-start gap-4 p-4 hover:bg-kitan-bg/50 transition-colors', acct.pinned && 'bg-amber-500/5 border-l-2 border-amber-500')}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-kitan-off-white text-sm font-semibold">{acct.title}</p>
                          {acct.pinned && <span className="flex items-center gap-0.5 text-amber-400 text-xs font-semibold"><Pin size={10} fill="currentColor" /> Pinned</span>}
                          <span className="text-xs px-2 py-0.5 rounded-full border bg-kitan-bg border-kitan-border text-kitan-muted">{acct.category}</span>
                        </div>
                        <p className="text-kitan-subtle text-xs mt-0.5">Stock: {acct.stock} · {acct.notes ? 'Notes set' : 'No notes (WhatsApp support shown)'}</p>
                        {acct.description && <p className="text-kitan-muted text-xs mt-1 line-clamp-1">{acct.description}</p>}
                      </div>
                      <p className="text-kitan-teal font-bold text-sm flex-shrink-0">N{Number(acct.price).toLocaleString('en-NG', { maximumFractionDigits: 0 })}</p>
                      <span className={cn('text-xs px-2 py-1 rounded-full flex-shrink-0', acct.available ? 'bg-kitan-teal/10 text-kitan-teal' : 'bg-red-500/10 text-red-400')}>{acct.available ? 'Active' : 'Hidden'}</span>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <PinButton pinned={acct.pinned} loading={pinLoading === acct.id} onClick={() => { setPinLoading(acct.id); toggleSAPinned(acct.id, !acct.pinned).finally(() => setPinLoading(null)); }} />
                        <button onClick={() => { setIsNewSA(false); setEditingSA(acct); }} className="w-8 h-8 rounded-lg hover:bg-kitan-teal/10 flex items-center justify-center text-kitan-subtle hover:text-kitan-teal transition-all"><Edit3 size={14} /></button>
                        <button onClick={() => handleDeleteSA(acct.id)} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all"><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* =================== 5SIM ADMIN =================== */}
      {activeTab === 'virtual-5sim' && (
        <div className="space-y-6 animate-fade-in">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="font-display font-bold text-kitan-off-white text-lg flex items-center gap-2">
                <Phone size={18} className="text-kitan-teal" /> 5SIM Server 2 Settings
              </h3>
              <p className="text-kitan-muted text-sm mt-1">Configure pricing multiplier for 5SIM virtual numbers (Server 2). Exchange rate is shared with Server 1.</p>
            </div>
            <button onClick={load5SimConfig} className="btn-secondary text-sm flex items-center gap-2">
              <RefreshCw size={14} className={fiveSimAdminLoading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
          {fiveSimAdminLoading ? (
            <div className="flex items-center gap-3 py-6"><Loader2 size={18} className="text-kitan-teal animate-spin" /><span className="text-kitan-muted text-sm">Loading…</span></div>
          ) : (
            <div className="card-kitan p-6 space-y-5">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-kitan-teal/10 border border-kitan-teal/20 flex items-center justify-center flex-shrink-0"><Zap size={16} className="text-kitan-teal" /></div>
                <div>
                  <h4 className="font-semibold text-kitan-off-white text-sm">Global Price Multiplier (Server 2 only)</h4>
                  <p className="text-kitan-subtle text-xs mt-0.5">Formula: <span className="font-mono">API price (USD) × Exchange Rate × Multiplier</span></p>
                </div>
              </div>
              <div className="grid grid-cols-4 gap-3">
                {[1,2,3,4].map(m => (
                  <button key={m} onClick={() => setFiveSimMultInput(m)}
                    className={cn('py-4 rounded-2xl border-2 font-display font-bold text-xl transition-all',
                      fiveSimMultInput === m ? 'border-kitan-teal bg-kitan-teal/10 text-kitan-teal shadow-teal-glow' : 'border-kitan-border bg-kitan-surface text-kitan-muted hover:border-kitan-teal/40')}>
                    ×{m}<span className="block text-xs font-normal mt-0.5">{m === 1 ? 'Standard' : `×${m}`}</span>
                  </button>
                ))}
              </div>
              <div className="bg-kitan-bg rounded-xl border border-kitan-border p-4">
                <p className="text-kitan-subtle text-xs mb-3 font-medium uppercase tracking-wide">Price Preview at ×{fiveSimMultInput} (rate: ₦{fiveSimUsdToNgn.toLocaleString()}/USD)</p>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {[0.05,0.07,0.10,0.20,0.50].map(usd => {
                    const ngn = Math.max(Math.ceil(usd*fiveSimUsdToNgn*fiveSimMultInput/10)*10, 50);
                    return (<div key={usd} className="text-center p-2 rounded-lg bg-kitan-surface border border-kitan-border"><p className="text-kitan-teal font-bold text-sm">₦{ngn.toLocaleString()}</p><p className="text-kitan-subtle text-xs">${usd.toFixed(2)}</p></div>);
                  })}
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={save5SimMultiplier} disabled={fiveSimAdminSaving} className="btn-primary flex items-center gap-2 text-sm">
                  {fiveSimAdminSaving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : <><Save size={14} /> Save Multiplier (×{fiveSimMultInput})</>}
                </button>
                {fiveSimMult !== fiveSimMultInput && <span className="text-amber-400 text-xs font-medium">Unsaved — current: ×{fiveSimMult}</span>}
              </div>
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-kitan-surface border border-kitan-border">
                <AlertCircle size={13} className="text-kitan-teal flex-shrink-0 mt-0.5" />
                <p className="text-kitan-subtle text-xs leading-relaxed">This multiplier only affects Server 2 (5SIM). Server 1 (SMSPool) uses its own multiplier in the "VN Pricing" tab. Exchange rate is shared via the Exchange Rate tab.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* =================== TRACKING =================== */}
      {activeTab === 'tracking' && (
        <div className="space-y-4 animate-fade-in">
          <p className="text-kitan-muted text-sm">Update tracking status for customer orders</p>
          {trackingEdit && (
            <div className="card-kitan p-5 border-kitan-teal/30 space-y-4 animate-fade-in">
              <div className="flex items-center justify-between"><h3 className="font-semibold text-kitan-off-white">Update Tracking</h3><button onClick={() => setTrackingEdit(null)}><X size={16} className="text-kitan-subtle" /></button></div>
              <div className="grid gap-3">
                <div><label className="text-kitan-muted text-xs mb-1 block">Status</label><select className="input-kitan text-sm" value={trackingEdit.status} onChange={e => setTrackingEdit({ ...trackingEdit, status: e.target.value })}>{['pending', 'confirmed', 'processing', 'shipped', 'delivered'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                <div><label className="text-kitan-muted text-xs mb-1 block">Update Message</label><textarea rows={3} className="input-kitan text-sm resize-none" value={trackingEdit.message} onChange={e => setTrackingEdit({ ...trackingEdit, message: e.target.value })} placeholder="e.g. Package picked up from warehouse..." /></div>
              </div>
              <button onClick={handleUpdateTracking} className="btn-primary flex items-center gap-2 text-sm"><Save size={14} /> Save Update</button>
            </div>
          )}
          <div className="card-kitan overflow-hidden">
            {orders.length === 0 ? <p className="text-kitan-muted text-sm text-center py-10">No orders to track</p> : (
              <div className="divide-y divide-kitan-border">
                {orders.map(order => (
                  <div key={order.id} className="flex items-center gap-4 p-4 hover:bg-kitan-bg/50 transition-colors">
                    <div className="flex-1 min-w-0"><p className="font-mono text-kitan-teal text-xs">{order.trackingCode}</p><p className="text-kitan-off-white text-sm">{order.deliveryInfo.fullName} · {order.deliveryInfo.city}</p><p className="text-kitan-subtle text-xs">{order.trackingUpdates.length} update(s)</p></div>
                    <span className={cn('text-xs px-2 py-1 rounded-full capitalize border', { 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30': order.status === 'delivered', 'bg-blue-500/10 text-blue-400 border-blue-400/30': order.status === 'shipped', 'bg-amber-500/10 text-amber-400 border-amber-400/30': order.status === 'confirmed', 'bg-kitan-card text-kitan-muted border-kitan-border': order.status === 'pending' })}>{order.status}</span>
                    <button onClick={() => setTrackingEdit({ orderId: order.id, status: order.status, message: '' })} className="btn-secondary text-xs px-3 py-2 flex items-center gap-1"><Upload size={12} /> Update</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
      {/* =================== MEDIA MIGRATION =================== */}
      {activeTab === 'migration' && <MediaMigrationPanel />}
    </div>
  );
};

export default AdminDashboard;
