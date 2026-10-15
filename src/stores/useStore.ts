/**
 * useStore.ts — Zustand stores with stale-while-revalidate caching.
 *
 * Caching strategy (per data store):
 * - lastFetch:  timestamp of last successful fetch
 * - fetching:   mutex to prevent concurrent requests
 * - FRESH_MS:   data is "fresh" for 5 minutes — no refetch needed
 * - If data exists but stale: show it immediately, refresh silently in background
 * - If no data: show loading skeleton, await fetch
 * - try/catch in every loader prevents infinite loading state on network errors
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CartItem, User, Notification, Order, Transaction, KitanDocument, WorkingPicture, Format, DocumentSubmission } from '@/types';
import type { Country } from '@/types';
import { generateId, formatDate } from '@/lib/utils';
import { getCurrentUser, login as authLogin, logout as authLogout, register as authRegister, updateUser as authUpdateUser, restoreSession } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { generateTrackingCode, DEFAULT_EXCHANGE_RATE } from '@/constants';
import { dbProducts, dbDocuments, dbPictures, dbFormats, dbExchangeRate, dbSubmissions, dbAppSettings, dbWallet, dbPayments } from '@/lib/db';
import type { Product } from '@/types';

const FRESH_MS = 5 * 60 * 1000; // 5 minutes before data is considered stale

// =================== GLOBAL WP PRICE STORE ===================
interface GlobalWPPriceState {
  globalWPPrice: number;
  loaded: boolean;
  loadGlobalWPPrice: () => Promise<void>;
  setGlobalWPPrice: (price: number) => Promise<void>;
}

export const useGlobalWPPriceStore = create<GlobalWPPriceState>((set, get) => ({
  globalWPPrice: 0,
  loaded: false,
  loadGlobalWPPrice: async () => {
    if (get().loaded) return; // Load once per session
    try {
      const val = await dbAppSettings.get('global_wp_price');
      set({ globalWPPrice: val ? Number(val) : 0, loaded: true });
    } catch (e) {
      console.error('loadGlobalWPPrice:', e);
    }
  },
  setGlobalWPPrice: async (price) => {
    await dbAppSettings.set('global_wp_price', String(price));
    set({ globalWPPrice: price });
  },
}));

// =================== EXCHANGE RATE STORE ===================
interface ExchangeRateState {
  rate: number;
  loaded: boolean;
  loadRate: () => Promise<void>;
  setRate: (rate: number) => Promise<void>;
}

export const useExchangeRateStore = create<ExchangeRateState>((set, get) => ({
  rate: DEFAULT_EXCHANGE_RATE,
  loaded: false,
  loadRate: async () => {
    if (get().loaded) return; // Load once per session
    try {
      const rate = await dbExchangeRate.get();
      set({ rate, loaded: true });
    } catch (e) {
      console.error('loadRate:', e);
    }
  },
  setRate: async (rate) => {
    await dbExchangeRate.set(rate);
    set({ rate, loaded: true });
  },
}));

// =================== AUTH STORE ===================
interface AuthState {
  user: User | null;
  isLoading: boolean;
  init: () => void;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  register: (name: string, email: string, password: string, referral?: string) => Promise<boolean>;
  updateUser: (updates: Partial<User>) => void;
  refreshUser: () => void;
  totalPaidNGN: () => Promise<number>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: false,
  init: () => {
    // Instant UI from the cached session, then verify against Supabase Auth so
    // signed-in users stay signed in across reloads (and roles stay current).
    const user = getCurrentUser();
    set({ user });
    restoreSession()
      .then(restored => { if (restored) set({ user: restored }); })
      .catch(() => undefined);
    // Propagate explicit sign-outs (e.g. password changed elsewhere) so no
    // zombie sessions remain; refresh-failures never clear the cached user.
    supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') set({ user: null });
    });
  },
  login: async (email, password) => {
    set({ isLoading: true });
    const user = await authLogin(email, password);
    set({ user, isLoading: false });
    return !!user;
  },
  logout: () => {
    void authLogout();
    set({ user: null });
  },
  register: async (name, email, password, referral) => {
    set({ isLoading: true });
    const user = await authRegister(name, email, password, referral);
    set({ user, isLoading: false });
    return !!user;
  },
  updateUser: (updates) => {
    const updated = authUpdateUser(updates);
    if (updated) set({ user: updated });
  },
  refreshUser: () => {
    const user = getCurrentUser();
    set({ user });
  },
  totalPaidNGN: async () => {
    const currentUser = getCurrentUser();
    if (!currentUser) return 0;
    const payments = await dbPayments.getByUser(currentUser.id);
    return payments.filter(p => p.paymentStatus === 'successful').reduce((s, p) => s + p.amountNGN, 0);
  },
}));

// =================== CART STORE ===================
interface CartState {
  items: CartItem[];
  isOpen: boolean;
  addItem: (item: CartItem) => void;
  removeItem: (productId: string) => void;
  updateQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  toggleCart: () => void;
  closeCart: () => void;
  total: () => number;
  itemCount: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isOpen: false,
      addItem: (item) => {
        const { items } = get();
        const existing = items.find(i => i.product.id === item.product.id);
        if (existing) {
          set({ items: items.map(i => i.product.id === item.product.id ? { ...i, quantity: i.quantity + item.quantity } : i) });
        } else {
          set({ items: [...items, item] });
        }
        set({ isOpen: true });
      },
      removeItem: (productId) => set({ items: get().items.filter(i => i.product.id !== productId) }),
      updateQuantity: (productId, quantity) => {
        if (quantity <= 0) { get().removeItem(productId); return; }
        set({ items: get().items.map(i => i.product.id === productId ? { ...i, quantity } : i) });
      },
      clearCart: () => set({ items: [] }),
      toggleCart: () => set({ isOpen: !get().isOpen }),
      closeCart: () => set({ isOpen: false }),
      total: () => get().items.reduce((sum, item) => {
        const price = item.product.countryPricing[item.country] || item.product.price;
        return sum + price * item.quantity;
      }, 0),
      itemCount: () => get().items.reduce((sum, item) => sum + item.quantity, 0),
    }),
    { name: 'kitan-cart' }
  )
);

// =================== COUNTRY STORE ===================
interface CountryState {
  selectedCountry: Country | null;
  showSelector: boolean;
  setCountry: (country: Country) => void;
  setShowSelector: (show: boolean) => void;
}

export const useCountryStore = create<CountryState>()(
  persist(
    (set) => ({
      selectedCountry: null,
      showSelector: false,
      setCountry: (country) => set({ selectedCountry: country, showSelector: false }),
      setShowSelector: (show) => set({ showSelector: show }),
    }),
    { name: 'kitan-country' }
  )
);

// =================== ORDERS STORE ===================
interface OrdersState {
  orders: Order[];
  placeOrder: (orderData: Omit<Order, 'id' | 'trackingCode' | 'createdAt' | 'trackingUpdates'>) => Order;
  getOrder: (trackingCode: string, email: string) => Order | null;
  updateOrderTracking: (orderId: string, update: Omit<import('@/types').TrackingUpdate, 'id' | 'timestamp'>) => void;
  getUserOrders: (userId: string) => Order[];
}

export const useOrdersStore = create<OrdersState>()(
  persist(
    (set, get) => ({
      orders: [],
      placeOrder: (orderData) => {
        const order: Order = {
          ...orderData, id: generateId(), trackingCode: generateTrackingCode(),
          createdAt: new Date().toISOString(),
          trackingUpdates: [{ id: generateId(), status: 'Order Confirmed', message: 'Your order has been received and is being processed.', timestamp: new Date().toISOString() }],
        };
        set({ orders: [order, ...get().orders] });
        return order;
      },
      getOrder: (trackingCode, email) =>
        get().orders.find(o => o.trackingCode === trackingCode && o.deliveryInfo.contactEmail.toLowerCase() === email.toLowerCase()) || null,
      updateOrderTracking: (orderId, update) => {
        set({
          orders: get().orders.map(o => o.id === orderId
            ? { ...o, status: update.status as Order['status'], trackingUpdates: [...o.trackingUpdates, { ...update, id: generateId(), timestamp: new Date().toISOString() }] }
            : o),
        });
      },
      getUserOrders: (userId) => get().orders.filter(o => o.userId === userId),
    }),
    { name: 'kitan-orders' }
  )
);

// =================== TRANSACTIONS STORE ===================
interface TransactionsState {
  transactions: Transaction[];
  addTransaction: (tx: Omit<Transaction, 'id' | 'createdAt'>) => void;
  getUserTransactions: (userId: string) => Transaction[];
}

export const useTransactionsStore = create<TransactionsState>()(
  persist(
    (set, get) => ({
      transactions: [],
      addTransaction: (tx) => {
        const newTx: Transaction = { ...tx, id: generateId(), createdAt: new Date().toISOString() };
        set({ transactions: [newTx, ...get().transactions] });
      },
      getUserTransactions: (userId) => get().transactions.filter(t => t.userId === userId),
    }),
    { name: 'kitan-transactions' }
  )
);

// =================== PRODUCTS STORE (DB-backed) ===================
interface ProductsState {
  products: Product[];
  loading: boolean;
  /** First load failed and there is no cached data to show. */
  error: boolean;
  /** Background revalidation failed — cached products remain visible. */
  refreshFailed: boolean;
  lastFetch: number | null;
  fetching: boolean;
  loadProducts: (force?: boolean) => Promise<void>;
  saveProduct: (product: Product) => Promise<void>;
  removeProduct: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
}

export const useProductsStore = create<ProductsState>((set, get) => ({
  products: [],
  loading: false,
  error: false,
  refreshFailed: false,
  lastFetch: null,
  fetching: false,

  loadProducts: async (force = false) => {
    const { fetching, lastFetch, products } = get();
    if (fetching) return; // single in-flight request per collection
    const now = Date.now();
    if (!force && products.length > 0 && lastFetch && now - lastFetch < FRESH_MS) return;
    if (products.length > 0) {
      // Stale-while-revalidate: show existing data, refresh silently in background.
      set({ fetching: true, refreshFailed: false });
      try {
        const fresh = await dbProducts.getList();
        set({ products: fresh, lastFetch: Date.now(), fetching: false, error: false });
      } catch (e) {
        console.error('loadProducts (revalidate):', e);
        // Keep cached products on screen; flag so the page can offer a manual retry.
        set({ fetching: false, refreshFailed: true });
      }
      return;
    }
    set({ loading: true, fetching: true, error: false });
    try {
      const fresh = await dbProducts.getList();
      set({ products: fresh, loading: false, lastFetch: Date.now(), fetching: false, error: false });
    } catch (e) {
      console.error('loadProducts:', e);
      set({ loading: false, fetching: false, error: true });
    }
  },

  saveProduct: async (product) => {
    await dbProducts.upsert(product);
    // Use getAll for admin context (needs images for editing)
    const products = await dbProducts.getAll();
    set({ products, lastFetch: Date.now() });
  },

  removeProduct: async (id) => {
    await dbProducts.delete(id);
    set({ products: get().products.filter(p => p.id !== id) });
  },

  togglePin: async (id) => {
    const current = get().products.find(p => p.id === id);
    if (!current) return;
    const newPinned = !current.pinned;
    await dbProducts.togglePin(id, newPinned);
    const updated = get().products
      .map(p => p.id === id ? { ...p, pinned: newPinned } : p)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    set({ products: updated });
  },
}));

// =================== DOCUMENTS STORE (DB-backed) ===================
interface DocumentsState {
  documents: KitanDocument[];
  submissions: DocumentSubmission[];
  loading: boolean;
  /** First load failed and there is no cached data to show. */
  error: boolean;
  /** Background revalidation failed — cached documents remain visible. */
  refreshFailed: boolean;
  lastFetch: number | null;
  fetching: boolean;
  loadDocuments: (force?: boolean) => Promise<void>;
  addDocument: (doc: Omit<KitanDocument, 'id' | 'createdAt'>) => Promise<KitanDocument>;
  updateDocument: (id: string, updates: Partial<KitanDocument>) => Promise<void>;
  deleteDocument: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
  addSubmission: (sub: Omit<DocumentSubmission, 'id' | 'createdAt'>) => Promise<DocumentSubmission | null>;
  loadSubmissions: () => Promise<void>;
  getSubmissions: (documentId?: string) => DocumentSubmission[];
}

export const useDocumentsStore = create<DocumentsState>((set, get) => ({
  documents: [],
  submissions: [],
  loading: false,
  error: false,
  refreshFailed: false,
  lastFetch: null,
  fetching: false,

  loadDocuments: async (force = false) => {
    const { fetching, lastFetch, documents } = get();
    if (fetching) return;
    const now = Date.now();
    if (!force && documents.length > 0 && lastFetch && now - lastFetch < FRESH_MS) return;
    if (documents.length > 0) {
      // Stale-while-revalidate: show cached documents, refresh silently.
      set({ fetching: true, refreshFailed: false });
      try {
        const fresh = await dbDocuments.getList();
        set({ documents: fresh, lastFetch: Date.now(), fetching: false, error: false });
      } catch (e) {
        console.error('loadDocuments (revalidate):', e);
        set({ fetching: false, refreshFailed: true });
      }
      return;
    }
    set({ loading: true, fetching: true, error: false });
    try {
      const fresh = await dbDocuments.getList();
      set({ documents: fresh, loading: false, lastFetch: Date.now(), fetching: false, error: false });
    } catch (e) {
      console.error('loadDocuments:', e);
      set({ loading: false, fetching: false, error: true });
    }
  },

  addDocument: async (doc) => {
    const newDoc: KitanDocument = { ...doc, id: `doc_${Date.now()}_${Math.random().toString(36).slice(2,6)}`, createdAt: new Date().toISOString() };
    await dbDocuments.upsert(newDoc);
    const documents = await dbDocuments.getAll();
    set({ documents, lastFetch: Date.now() });
    return newDoc;
  },

  updateDocument: async (id, updates) => {
    // Fetch full document to preserve images before merging
    const full = await dbDocuments.getById(id);
    const existing = get().documents.find(d => d.id === id);
    const updated = { ...full || existing, ...updates } as KitanDocument;
    await dbDocuments.upsert(updated);
    set({ documents: get().documents.map(d => d.id === id ? updated : d) });
  },

  deleteDocument: async (id) => {
    await dbDocuments.delete(id);
    set({ documents: get().documents.filter(d => d.id !== id) });
  },

  togglePin: async (id) => {
    const current = get().documents.find(d => d.id === id);
    if (!current) return;
    const newPinned = !current.pinned;
    await dbDocuments.togglePin(id, newPinned);
    const updated = get().documents
      .map(d => d.id === id ? { ...d, pinned: newPinned } : d)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    set({ documents: updated });
  },

  addSubmission: async (sub) => {
    const result = await dbSubmissions.add(sub);
    if (result) set({ submissions: [result, ...get().submissions] });
    return result;
  },

  loadSubmissions: async () => {
    try {
      const submissions = await dbSubmissions.getAll();
      set({ submissions });
    } catch (e) {
      console.error('loadSubmissions:', e);
    }
  },

  getSubmissions: (documentId) => {
    const { submissions } = get();
    return documentId ? submissions.filter(s => s.documentId === documentId) : submissions;
  },
}));

// =================== WORKING PICTURES STORE (DB-backed) ===================
interface WorkingPicturesState {
  items: WorkingPicture[];
  loading: boolean;
  /** First load failed and there is no cached data to show. */
  error: boolean;
  /** Background revalidation failed — cached items remain visible. */
  refreshFailed: boolean;
  lastFetch: number | null;
  fetching: boolean;
  loadItems: (force?: boolean) => Promise<void>;
  addItem: (item: Omit<WorkingPicture, 'id' | 'createdAt'>) => Promise<WorkingPicture>;
  updateItem: (id: string, updates: Partial<WorkingPicture>) => Promise<void>;
  deleteItem: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
}

export const useWorkingPicturesStore = create<WorkingPicturesState>((set, get) => ({
  items: [],
  loading: false,
  error: false,
  refreshFailed: false,
  lastFetch: null,
  fetching: false,

  loadItems: async (force = false) => {
    const { fetching, lastFetch, items } = get();
    if (fetching) return; // single in-flight request per collection
    const now = Date.now();
    if (!force && items.length > 0 && lastFetch && now - lastFetch < FRESH_MS) return;
    if (items.length > 0) {
      // Stale-while-revalidate: don't show skeleton, just silently refresh.
      set({ fetching: true, refreshFailed: false });
      try {
        const fresh = await dbPictures.getList();
        set({ items: fresh, lastFetch: Date.now(), fetching: false, error: false });
      } catch (e) {
        console.error('loadItems (revalidate):', e);
        set({ fetching: false, refreshFailed: true }); // ← keeps cached items visible
      }
      return;
    }
    // No data at all — show loading skeleton
    set({ loading: true, fetching: true, error: false });
    try {
      const fresh = await dbPictures.getList();
      set({ items: fresh, loading: false, lastFetch: Date.now(), fetching: false, error: false });
    } catch (e) {
      console.error('loadItems:', e);
      // ← critical: terminal states only — never leave the skeleton up
      set({ loading: false, fetching: false, error: true });
    }
  },

  addItem: async (item) => {
    const newItem: WorkingPicture = { ...item, id: `wp_${Date.now()}`, createdAt: new Date().toISOString() };
    await dbPictures.upsert(newItem);
    const items = await dbPictures.getAll();
    set({ items, lastFetch: Date.now() });
    return newItem;
  },

  updateItem: async (id, updates) => {
    const existing = get().items.find(i => i.id === id);
    if (!existing) return;
    const updated = { ...existing, ...updates };
    await dbPictures.upsert(updated);
    set({ items: get().items.map(i => i.id === id ? updated : i) });
  },

  deleteItem: async (id) => {
    await dbPictures.delete(id);
    set({ items: get().items.filter(i => i.id !== id) });
  },

  togglePin: async (id) => {
    const current = get().items.find(i => i.id === id);
    if (!current) return;
    const newPinned = !current.pinned;
    await dbPictures.togglePin(id, newPinned);
    const updated = get().items
      .map(i => i.id === id ? { ...i, pinned: newPinned } : i)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    set({ items: updated });
  },
}));

// =================== FORMATS STORE (DB-backed) ===================
interface FormatsState {
  formats: Format[];
  loading: boolean;
  /** First load failed and there is no cached data to show. */
  error: boolean;
  /** Background revalidation failed — cached formats remain visible. */
  refreshFailed: boolean;
  lastFetch: number | null;
  fetching: boolean;
  loadFormats: (force?: boolean) => Promise<void>;
  addFormat: (fmt: Omit<Format, 'id' | 'createdAt'>) => Promise<Format>;
  updateFormat: (id: string, updates: Partial<Format>) => Promise<void>;
  deleteFormat: (id: string) => Promise<void>;
  togglePin: (id: string) => Promise<void>;
}

export const useFormatsStore = create<FormatsState>((set, get) => ({
  formats: [],
  loading: false,
  error: false,
  refreshFailed: false,
  lastFetch: null,
  fetching: false,

  loadFormats: async (force = false) => {
    const { fetching, lastFetch, formats } = get();
    if (fetching) return; // single in-flight request per collection
    const now = Date.now();
    if (!force && formats.length > 0 && lastFetch && now - lastFetch < FRESH_MS) return;
    if (formats.length > 0) {
      // Stale-while-revalidate: show cached formats, refresh silently.
      set({ fetching: true, refreshFailed: false });
      try {
        const fresh = await dbFormats.getList();
        set({ formats: fresh, lastFetch: Date.now(), fetching: false, error: false });
      } catch (e) {
        console.error('loadFormats (revalidate):', e);
        set({ fetching: false, refreshFailed: true });
      }
      return;
    }
    set({ loading: true, fetching: true, error: false });
    try {
      const fresh = await dbFormats.getList();
      set({ formats: fresh, loading: false, lastFetch: Date.now(), fetching: false, error: false });
    } catch (e) {
      console.error('loadFormats:', e);
      set({ loading: false, fetching: false, error: true });
    }
  },

  addFormat: async (fmt) => {
    const newFmt: Format = { ...fmt, id: `fmt_${Date.now()}`, createdAt: new Date().toISOString() };
    await dbFormats.upsert(newFmt);
    const formats = await dbFormats.getAll();
    set({ formats, lastFetch: Date.now() });
    return newFmt;
  },

  updateFormat: async (id, updates) => {
    // Fetch full format to preserve preview images before merging
    const full = await dbFormats.getById(id);
    const existing = get().formats.find(f => f.id === id);
    const updated = { ...full || existing, ...updates } as Format;
    await dbFormats.upsert(updated);
    set({ formats: get().formats.map(f => f.id === id ? updated : f) });
  },

  deleteFormat: async (id) => {
    await dbFormats.delete(id);
    set({ formats: get().formats.filter(f => f.id !== id) });
  },

  togglePin: async (id) => {
    const current = get().formats.find(f => f.id === id);
    if (!current) return;
    const newPinned = !current.pinned;
    await dbFormats.togglePin(id, newPinned);
    const updated = get().formats
      .map(f => f.id === id ? { ...f, pinned: newPinned } : f)
      .sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
    set({ formats: updated });
  },
}));

// =================== WISHLIST STORE ===================
interface WishlistState {
  items: string[];
  toggle: (productId: string) => void;
  has: (productId: string) => boolean;
}

export const useWishlistStore = create<WishlistState>()(
  persist(
    (set, get) => ({
      items: [],
      toggle: (productId) => {
        const { items } = get();
        set({ items: items.includes(productId) ? items.filter(id => id !== productId) : [...items, productId] });
      },
      has: (productId) => get().items.includes(productId),
    }),
    { name: 'kitan-wishlist' }
  )
);

// =================== NOTIFICATIONS STORE ===================
interface NotificationsState {
  notifications: Notification[];
  unreadCount: () => number;
  markRead: (id: string) => void;
  markAllRead: () => void;
  addNotification: (n: Omit<Notification, 'id' | 'createdAt' | 'read'>) => void;
}

export const useNotificationsStore = create<NotificationsState>()(
  persist(
    (set, get) => ({
      notifications: [{
        id: 'n1', userId: 'u1', title: 'Welcome to KITAN!',
        message: 'Start shopping amazing gifts for your loved ones worldwide.',
        read: false, type: 'system', createdAt: new Date().toISOString(),
      }],
      unreadCount: () => get().notifications.filter(n => !n.read).length,
      markRead: (id) => set({ notifications: get().notifications.map(n => n.id === id ? { ...n, read: true } : n) }),
      markAllRead: () => set({ notifications: get().notifications.map(n => ({ ...n, read: true })) }),
      addNotification: (n) => {
        const newN: Notification = { ...n, id: generateId(), createdAt: new Date().toISOString(), read: false };
        set({ notifications: [newN, ...get().notifications] });
      },
    }),
    { name: 'kitan-notifications' }
  )
);

// =================== WALLET STORE ===================
import type { WalletTransaction, Wallet } from '@/types';

interface WalletState {
  wallet: Wallet | null;
  transactions: WalletTransaction[];
  loading: boolean;
  loadWallet: (appUserId: string) => Promise<void>;
  refreshBalance: (appUserId: string) => Promise<void>;
  getBalance: () => number;
}

export const useWalletStore = create<WalletState>((set) => ({
  wallet: null,
  transactions: [],
  loading: false,
  loadWallet: async (appUserId) => {
    set({ loading: true });
    try {
      const wallet = await dbWallet.getOrCreate(appUserId);
      const transactions = await dbWallet.getTransactions(appUserId);
      set({ wallet, transactions, loading: false });
    } catch (e) {
      console.error('loadWallet:', e);
      set({ loading: false });
    }
  },
  refreshBalance: async (appUserId) => {
    try {
      const wallet = await dbWallet.getOrCreate(appUserId);
      const transactions = await dbWallet.getTransactions(appUserId);
      set({ wallet, transactions });
    } catch (e) {
      console.error('refreshBalance:', e);
    }
  },
  getBalance: function() { return (this as WalletState).wallet?.balance ?? 0; },
}));

// =================== PAGE STATE STORE ===================
interface PageStateEntry {
  page?: number;
  search?: string;
  category?: string;
  viewMode?: 'grid' | 'list';
  scrollY?: number;
  [key: string]: unknown;
}

interface PageStateStore {
  states: Record<string, PageStateEntry>;
  setPageState: (routeKey: string, update: Partial<PageStateEntry>) => void;
  getPageState: (routeKey: string) => PageStateEntry;
}

export const usePageStateStore = create<PageStateStore>()(
  persist(
    (set, get) => ({
      states: {},
      setPageState: (routeKey, update) => {
        set({ states: { ...get().states, [routeKey]: { ...get().states[routeKey], ...update } } });
      },
      getPageState: (routeKey) => get().states[routeKey] ?? {},
    }),
    { name: 'kitan-page-state' }
  )
);

// Re-export formatDate so pages that import from here still work
export { formatDate };
