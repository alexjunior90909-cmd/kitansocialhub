/**
 * db.ts — Central database service (Supabase-backed).
 *
 * Key design decisions:
 * - getList()  → fast list queries (no large image arrays, uses thumbnail column)
 * - getById()  → full row including all images (for detail pages / admin edits)
 * - getAll()   → full rows for admin operations that need complete data
 * - upsert()   → writes full data + auto-sets thumbnail from images[0]
 */
import { supabase } from './supabase';
import type {
  Product, KitanDocument, WorkingPicture, Format, Country,
  DocumentSubmission, OrderContent, Purchase, Payment,
  OrderContentProductType, PurchaseProductType, Wallet, WalletTransaction,
} from '@/types';

// ── Network timeout ──────────────────────────────────────────────────────────
// Every query gets a hard deadline so a hung request can never leave a page
// loading forever. Callers (stores/pages) catch the rejection and show retry UI.
export class DbTimeoutError extends Error {
  constructor(label: string) {
    super(`${label} timed out after ${REQUEST_TIMEOUT_MS}ms`);
    this.name = 'DbTimeoutError';
  }
}

export const REQUEST_TIMEOUT_MS = 9000;

/** Rejects if the promise neither resolves nor rejects within REQUEST_TIMEOUT_MS. */
export function withTimeout<T>(promise: PromiseLike<T>, label = 'Database request'): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new DbTimeoutError(label)), REQUEST_TIMEOUT_MS);
    promise.then(
      value => { clearTimeout(timer); resolve(value); },
      err => { clearTimeout(timer); reject(err); },
    );
  });
}

// ── Column selections ────────────────────────────────────────────────────────
// These exclude large JSONB image arrays for fast list-view queries.
const PRODUCT_LIST_COLS =
  'id, title, description, price, country_pricing, countries, category, available, tags, featured, pinned, pin_position, rating, review_count, created_at, thumbnail';
const DOCUMENT_LIST_COLS =
  'id, title, description, price, available, category, pinned, pin_position, created_at, thumbnail';
const PICTURE_LIST_COLS =
  'id, title, description, price, media_type, available, tags, featured, pinned, pin_position, external_url, created_at, thumbnail';
const FORMAT_LIST_COLS =
  'id, title, description, price, file_type, available, tags, download_url, pinned, pin_position, created_at, thumbnail';

// ── Mappers ──────────────────────────────────────────────────────────────────
function mapProduct(row: Record<string, unknown>): Product {
  return {
    id:             row.id as string,
    title:          row.title as string,
    images:         (row.images as string[]) || [],
    thumbnail:      row.thumbnail ? (row.thumbnail as string) : null,
    description:    row.description as string,
    price:          Number(row.price),
    countryPricing: (row.country_pricing as Record<string, number>) || {},
    countries:      (row.countries as Country[]) || [],
    category:       row.category as Product['category'],
    available:      Boolean(row.available),
    tags:           (row.tags as string[]) || [],
    featured:       Boolean(row.featured),
    pinned:         Boolean(row.pinned),
    pinPosition:    row.pin_position != null ? Number(row.pin_position) : undefined,
    rating:         row.rating != null ? Number(row.rating) : undefined,
    reviewCount:    row.review_count != null ? Number(row.review_count) : undefined,
    createdAt:      row.created_at as string,
  };
}

function mapDocument(row: Record<string, unknown>): KitanDocument {
  return {
    id:            row.id as string,
    title:         row.title as string,
    description:   row.description as string,
    price:         Number(row.price),
    previewImages: (row.preview_images as string[]) || [],
    thumbnail:     row.thumbnail ? (row.thumbnail as string) : null,
    formFields:    (row.form_fields as KitanDocument['formFields']) || [],
    available:     Boolean(row.available),
    category:      row.category as string,
    pinned:        Boolean(row.pinned),
    pinPosition:   row.pin_position != null ? Number(row.pin_position) : undefined,
    createdAt:     row.created_at as string,
  };
}

function mapPicture(row: Record<string, unknown>): WorkingPicture {
  return {
    id:          row.id as string,
    title:       row.title as string,
    description: row.description as string,
    price:       Number(row.price),
    images:      (row.images as string[]) || [],
    thumbnail:   row.thumbnail ? (row.thumbnail as string) : null,
    mediaType:   row.media_type as WorkingPicture['mediaType'],
    available:   Boolean(row.available),
    tags:        (row.tags as string[]) || [],
    featured:    Boolean(row.featured),
    pinned:      Boolean(row.pinned),
    pinPosition: row.pin_position != null ? Number(row.pin_position) : undefined,
    externalUrl: row.external_url ? (row.external_url as string) : undefined,
    createdAt:   row.created_at as string,
  };
}

function mapFormat(row: Record<string, unknown>): Format {
  return {
    id:            row.id as string,
    title:         row.title as string,
    description:   row.description as string,
    price:         Number(row.price),
    previewImages: (row.preview_images as string[]) || [],
    thumbnail:     row.thumbnail ? (row.thumbnail as string) : null,
    fileType:      row.file_type as string,
    available:     Boolean(row.available),
    tags:          (row.tags as string[]) || [],
    downloadUrl:   row.download_url as string,
    pinned:        Boolean(row.pinned),
    pinPosition:   row.pin_position != null ? Number(row.pin_position) : undefined,
    createdAt:     row.created_at as string,
  };
}

/** Pinned-first sort: explicit pin_position → pinned flag → created_at desc */
function sortPinnedFirst<T extends { pinned?: boolean; pinPosition?: number; createdAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    const aPos = a.pinPosition ?? null;
    const bPos = b.pinPosition ?? null;
    if (aPos !== null && bPos !== null) return aPos - bPos;
    if (aPos !== null) return -1;
    if (bPos !== null) return 1;
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

// =================== PRODUCTS ===================
export const dbProducts = {
  /**
   * Fast list query — excludes images array, uses thumbnail. For user-facing pages.
   * Throws on error/timeout so stores can keep cached data and offer a retry;
   * never silently resolves to [] (that would mask outages as "no products").
   */
  async getList(): Promise<Product[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('products')
        .select(PRODUCT_LIST_COLS)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      'products.getList',
    );
    if (error) { console.error('products.getList:', error.message); throw new Error(error.message); }
    return sortPinnedFirst((data || []).map(row => mapProduct({ ...row, images: [] })));
  },

  /** Full row including all images. For detail pages and admin edit forms. */
  async getById(id: string): Promise<Product | null> {
    const { data, error } = await withTimeout(
      supabase.from('products').select('*').eq('id', id).single(),
      'products.getById',
    );
    if (error || !data) { console.error('products.getById:', error?.message); return null; }
    return mapProduct(data as Record<string, unknown>);
  },

  /** Full rows for admin list views (needs images for edit). */
  async getAll(): Promise<Product[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('products')
        .select('*')
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      'products.getAll',
    );
    if (error) { console.error('products.getAll:', error.message); return []; }
    return sortPinnedFirst((data || []).map(row => mapProduct(row as Record<string, unknown>)));
  },

  async upsert(product: Product): Promise<void> {
    const row = {
      id:              product.id,
      title:           product.title,
      images:          product.images,
      thumbnail:       product.images?.[0] || product.thumbnail || null,
      description:     product.description,
      price:           product.price,
      country_pricing: product.countryPricing,
      countries:       product.countries,
      category:        product.category,
      available:       product.available,
      tags:            product.tags,
      featured:        product.featured ?? false,
      pinned:          product.pinned ?? false,
      pin_position:    product.pinPosition ?? null,
      rating:          product.rating ?? null,
      review_count:    product.reviewCount ?? null,
    };
    const { error } = await supabase.from('products').upsert(row, { onConflict: 'id' });
    if (error) console.error('products.upsert:', error.message);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) console.error('products.delete:', error.message);
  },

  async togglePin(id: string, pinned: boolean): Promise<void> {
    const { error } = await supabase.from('products').update({ pinned }).eq('id', id);
    if (error) console.error('products.togglePin:', error.message);
  },

  async setPinPosition(id: string, pinPosition: number | null): Promise<void> {
    const { error } = await supabase.from('products').update({ pin_position: pinPosition }).eq('id', id);
    if (error) console.error('products.setPinPosition:', error.message);
  },
};

// =================== DOCUMENTS ===================
export const dbDocuments = {
  /** Fast list query — no preview_images, uses thumbnail. Throws so stores can retry/keep cache. */
  async getList(): Promise<KitanDocument[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('kitan_documents')
        .select(DOCUMENT_LIST_COLS)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      'documents.getList',
    );
    if (error) { console.error('documents.getList:', error.message); throw new Error(error.message); }
    return sortPinnedFirst((data || []).map(row => mapDocument({ ...row, preview_images: [], form_fields: [] })));
  },

  /** Full row including preview_images and form_fields. */
  async getById(id: string): Promise<KitanDocument | null> {
    const { data, error } = await withTimeout(
      supabase.from('kitan_documents').select('*').eq('id', id).single(),
      'documents.getById',
    );
    if (error || !data) { console.error('documents.getById:', error?.message); return null; }
    return mapDocument(data as Record<string, unknown>);
  },

  async getAll(): Promise<KitanDocument[]> {
    const { data, error } = await supabase
      .from('kitan_documents')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) { console.error('documents.getAll:', error.message); return []; }
    return sortPinnedFirst((data || []).map(row => mapDocument(row as Record<string, unknown>)));
  },

  async upsert(doc: KitanDocument): Promise<void> {
    const { error } = await supabase.from('kitan_documents').upsert({
      id:             doc.id,
      title:          doc.title,
      description:    doc.description,
      price:          doc.price,
      preview_images: doc.previewImages,
      thumbnail:      doc.previewImages?.[0] || doc.thumbnail || null,
      form_fields:    doc.formFields || [],
      available:      doc.available,
      category:       doc.category || 'General',
      pinned:         doc.pinned ?? false,
      pin_position:   doc.pinPosition ?? null,
    }, { onConflict: 'id' });
    if (error) console.error('documents.upsert:', error.message);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('kitan_documents').delete().eq('id', id);
    if (error) console.error('documents.delete:', error.message);
  },

  async togglePin(id: string, pinned: boolean): Promise<void> {
    const { error } = await supabase.from('kitan_documents').update({ pinned }).eq('id', id);
    if (error) console.error('documents.togglePin:', error.message);
  },
};

// =================== WORKING PICTURES ===================
export const dbPictures = {
  /** Fast list query — no images array, uses thumbnail. Throws so stores can retry/keep cache. */
  async getList(): Promise<WorkingPicture[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('working_pictures')
        .select(PICTURE_LIST_COLS)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      'pictures.getList',
    );
    if (error) { console.error('pictures.getList:', error.message); throw new Error(error.message); }
    return sortPinnedFirst((data || []).map(row => mapPicture({ ...row, images: [] })));
  },

  /** Full row including all images. */
  async getById(id: string): Promise<WorkingPicture | null> {
    const { data, error } = await withTimeout(
      supabase.from('working_pictures').select('*').eq('id', id).single(),
      'pictures.getById',
    );
    if (error || !data) { console.error('pictures.getById:', error?.message); return null; }
    return mapPicture(data as Record<string, unknown>);
  },

  async getAll(): Promise<WorkingPicture[]> {
    const { data, error } = await supabase
      .from('working_pictures')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) { console.error('pictures.getAll:', error.message); return []; }
    return sortPinnedFirst((data || []).map(row => mapPicture(row as Record<string, unknown>)));
  },

  async upsert(pic: WorkingPicture): Promise<void> {
    const { error } = await supabase.from('working_pictures').upsert({
      id:           pic.id,
      title:        pic.title,
      description:  pic.description,
      price:        pic.price,
      images:       pic.images,
      thumbnail:    pic.images?.[0] || pic.thumbnail || null,
      media_type:   pic.mediaType,
      available:    pic.available,
      tags:         pic.tags,
      featured:     pic.featured ?? false,
      pinned:       pic.pinned ?? false,
      pin_position: pic.pinPosition ?? null,
      external_url: pic.externalUrl || null,
    }, { onConflict: 'id' });
    if (error) console.error('pictures.upsert:', error.message);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('working_pictures').delete().eq('id', id);
    if (error) console.error('pictures.delete:', error.message);
  },

  async togglePin(id: string, pinned: boolean): Promise<void> {
    const { error } = await supabase.from('working_pictures').update({ pinned }).eq('id', id);
    if (error) console.error('pictures.togglePin:', error.message);
  },
};

// =================== FORMATS ===================
export const dbFormats = {
  /** Fast list query — no preview_images, uses thumbnail. Throws so stores can retry/keep cache. */
  async getList(): Promise<Format[]> {
    const { data, error } = await withTimeout(
      supabase
        .from('formats')
        .select(FORMAT_LIST_COLS)
        .order('pinned', { ascending: false })
        .order('created_at', { ascending: false }),
      'formats.getList',
    );
    if (error) { console.error('formats.getList:', error.message); throw new Error(error.message); }
    return sortPinnedFirst((data || []).map(row => mapFormat({ ...row, preview_images: [] })));
  },

  /** Full row including all preview images. */
  async getById(id: string): Promise<Format | null> {
    const { data, error } = await withTimeout(
      supabase.from('formats').select('*').eq('id', id).single(),
      'formats.getById',
    );
    if (error || !data) { console.error('formats.getById:', error?.message); return null; }
    return mapFormat(data as Record<string, unknown>);
  },

  async getAll(): Promise<Format[]> {
    const { data, error } = await supabase
      .from('formats')
      .select('*')
      .order('pinned', { ascending: false })
      .order('created_at', { ascending: false });
    if (error) { console.error('formats.getAll:', error.message); return []; }
    return sortPinnedFirst((data || []).map(row => mapFormat(row as Record<string, unknown>)));
  },

  async upsert(fmt: Format): Promise<void> {
    const { error } = await supabase.from('formats').upsert({
      id:             fmt.id,
      title:          fmt.title,
      description:    fmt.description,
      price:          fmt.price,
      preview_images: fmt.previewImages,
      thumbnail:      fmt.previewImages?.[0] || fmt.thumbnail || null,
      file_type:      fmt.fileType || null,
      available:      fmt.available,
      tags:           fmt.tags,
      download_url:   fmt.downloadUrl || '#',
      pinned:         fmt.pinned ?? false,
      pin_position:   fmt.pinPosition ?? null,
    }, { onConflict: 'id' });
    if (error) console.error('formats.upsert:', error.message);
  },

  async delete(id: string): Promise<void> {
    const { error } = await supabase.from('formats').delete().eq('id', id);
    if (error) console.error('formats.delete:', error.message);
  },

  async togglePin(id: string, pinned: boolean): Promise<void> {
    const { error } = await supabase.from('formats').update({ pinned }).eq('id', id);
    if (error) console.error('formats.togglePin:', error.message);
  },
};

// =================== EXCHANGE RATE ===================
export const dbExchangeRate = {
  async get(): Promise<number> {
    const { data, error } = await supabase.from('exchange_rate').select('rate').eq('id', 1).single();
    if (error) { console.error('exchange_rate.get:', error.message); return 1350; }
    return Number(data?.rate ?? 1350);
  },
  async set(rate: number): Promise<void> {
    const { error } = await supabase.from('exchange_rate').upsert({ id: 1, rate, updated_at: new Date().toISOString() });
    if (error) console.error('exchange_rate.set:', error.message);
  },
};

// =================== ORDER CONTENT ===================
export const dbOrderContent = {
  async get(productId: string, productType: OrderContentProductType): Promise<OrderContent | null> {
    const { data, error } = await supabase
      .from('order_content')
      .select('*')
      .eq('product_id', productId)
      .eq('product_type', productType)
      .single();
    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('order_content.get:', error.message);
      return null;
    }
    return {
      id: data.id, productId: data.product_id, productType: data.product_type,
      textContent: data.text_content, imageUrls: (data.image_urls as string[]) || [],
      createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },

  async upsert(content: Omit<OrderContent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<OrderContent | null> {
    const id = content.id || `oc_${content.productType}_${content.productId}`;
    const { data, error } = await supabase
      .from('order_content')
      .upsert({
        id, product_id: content.productId, product_type: content.productType,
        text_content: content.textContent, image_urls: content.imageUrls,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'product_id,product_type' })
      .select().single();
    if (error) { console.error('order_content.upsert:', error.message); return null; }
    return {
      id: data.id, productId: data.product_id, productType: data.product_type,
      textContent: data.text_content, imageUrls: data.image_urls || [],
      createdAt: data.created_at, updatedAt: data.updated_at,
    };
  },

  async uploadImage(file: File, productId: string): Promise<string | null> {
    const ext = file.name.split('.').pop() || 'jpg';
    const path = `${productId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error } = await supabase.storage
      .from('order-content')
      .upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) { console.error('order_content.uploadImage:', error.message); return null; }
    const { data } = supabase.storage.from('order-content').getPublicUrl(path);
    return data.publicUrl;
  },

  async deleteImage(url: string): Promise<void> {
    const marker = '/order-content/';
    const idx = url.indexOf(marker);
    if (idx === -1) return;
    const path = url.slice(idx + marker.length);
    await supabase.storage.from('order-content').remove([path]);
  },
};

// =================== PURCHASES ===================
export const dbPurchases = {
  async add(purchase: Omit<Purchase, 'id' | 'createdAt'>): Promise<Purchase | null> {
    const id = `pur_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { data, error } = await supabase.from('purchases').insert({
      id, product_id: purchase.productId, product_type: purchase.productType,
      app_user_id: purchase.appUserId, amount: purchase.amount, reference: purchase.reference,
    }).select().single();
    if (error) { console.error('purchases.add:', error.message); return null; }
    return {
      id: data.id, productId: data.product_id, productType: data.product_type,
      appUserId: data.app_user_id, amount: data.amount, reference: data.reference, createdAt: data.created_at,
    };
  },

  async hasPurchased(appUserId: string, productId: string, productType: PurchaseProductType): Promise<boolean> {
    const { data, error } = await supabase
      .from('purchases').select('id')
      .eq('app_user_id', appUserId).eq('product_id', productId).eq('product_type', productType).limit(1);
    if (error) { console.error('purchases.hasPurchased:', error.message); return false; }
    return (data?.length ?? 0) > 0;
  },

  async getUserPurchases(appUserId: string): Promise<Purchase[]> {
    const { data, error } = await supabase
      .from('purchases').select('*').eq('app_user_id', appUserId)
      .order('created_at', { ascending: false });
    if (error) { console.error('purchases.getUserPurchases:', error.message); return []; }
    return (data || []).map(row => ({
      id: row.id, productId: row.product_id, productType: row.product_type,
      appUserId: row.app_user_id, amount: row.amount, reference: row.reference, createdAt: row.created_at,
    }));
  },
};

// =================== PAYMENTS ===================
export const dbPayments = {
  async getAll(): Promise<Payment[]> {
    const { data, error } = await supabase.from('payments').select('*').order('created_at', { ascending: false });
    if (error) { console.error('payments.getAll:', error.message); return []; }
    return (data || []).map(row => ({
      id: row.id, txRef: row.tx_ref, flwTransactionId: row.flw_transaction_id,
      productId: row.product_id, productType: row.product_type, appUserId: row.app_user_id,
      amountNGN: Number(row.amount_ngn), currency: row.currency,
      customerEmail: row.customer_email, customerName: row.customer_name,
      paymentStatus: row.payment_status, verificationStatus: row.verification_status,
      metadata: row.metadata || {}, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  },
  async getByUser(appUserId: string): Promise<Payment[]> {
    const { data, error } = await supabase
      .from('payments').select('*').eq('app_user_id', appUserId).order('created_at', { ascending: false });
    if (error) { console.error('payments.getByUser:', error.message); return []; }
    return (data || []).map(row => ({
      id: row.id, txRef: row.tx_ref, flwTransactionId: row.flw_transaction_id,
      productId: row.product_id, productType: row.product_type, appUserId: row.app_user_id,
      amountNGN: Number(row.amount_ngn), currency: row.currency,
      customerEmail: row.customer_email, customerName: row.customer_name,
      paymentStatus: row.payment_status, verificationStatus: row.verification_status,
      metadata: row.metadata || {}, createdAt: row.created_at, updatedAt: row.updated_at,
    }));
  },
};

// =================== APP SETTINGS ===================
export const dbAppSettings = {
  async get(key: string): Promise<string | null> {
    const { data } = await supabase.from('app_settings').select('value').eq('key', key).single();
    return data?.value ?? null;
  },
  async set(key: string, value: string): Promise<void> {
    const { error } = await supabase.from('app_settings')
      .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
    if (error) console.error('app_settings.set:', error.message);
  },
};

// =================== WALLET EXPORT ===================
export const dbUserExport = {
  async getAllWalletBalances(): Promise<Record<string, number>> {
    const { data, error } = await supabase.from('wallets').select('app_user_id, balance');
    if (error) { console.error('walletExport:', error.message); return {}; }
    const map: Record<string, number> = {};
    (data || []).forEach(r => { map[r.app_user_id as string] = Number(r.balance); });
    return map;
  },
};

// =================== REGISTERED USERS (DB-backed) ===================
export interface RegisteredUserRow {
  id: string;
  email: string;
  username: string;
  role: string;
  registered_at: string;
  last_seen_at: string;
  account_status: string;
}

export const dbRegisteredUsers = {
  async getAll(): Promise<RegisteredUserRow[]> {
    const { data, error } = await supabase
      .from('registered_users').select('*').order('registered_at', { ascending: false });
    if (error) { console.error('registered_users.getAll:', error.message); return []; }
    return (data || []) as RegisteredUserRow[];
  },
};

// =================== ADMIN WALLET ADJUSTMENTS ===================
export interface AdminAdjustment {
  id: string;
  app_user_id: string;
  admin_name: string;
  adjustment_type: 'credit' | 'debit';
  amount: number;
  balance_before: number;
  balance_after: number;
  reason: string;
  created_at: string;
}

export const dbAdminAdjustments = {
  async getByUser(appUserId: string): Promise<AdminAdjustment[]> {
    const { data, error } = await supabase
      .from('admin_wallet_adjustments').select('*')
      .eq('app_user_id', appUserId).order('created_at', { ascending: false });
    if (error) { console.error('adminAdj.getByUser:', error.message); return []; }
    return (data || []) as AdminAdjustment[];
  },

  async applyAdjustment(params: {
    appUserId: string; adminName: string;
    type: 'credit' | 'debit'; amount: number; reason: string;
  }): Promise<{ newBalance: number }> {
    const { data: walletRow, error: wErr } = await supabase
      .from('wallets').select('balance').eq('app_user_id', params.appUserId).single();
    if (wErr || !walletRow) throw new Error('Wallet not found for this user');
    const balanceBefore = Number(walletRow.balance);
    const newBalance = params.type === 'credit' ? balanceBefore + params.amount : balanceBefore - params.amount;
    if (newBalance < 0) throw new Error('Debit would result in a negative balance');
    const { error: upErr } = await supabase.from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('app_user_id', params.appUserId);
    if (upErr) throw new Error(upErr.message);
    const txId = `wt_adj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from('wallet_transactions').insert({
      id: txId, app_user_id: params.appUserId,
      type: params.type === 'credit' ? 'topup' : 'deduction',
      amount: params.amount, balance_after: newBalance,
      description: `Admin adjustment (${params.type}): ${params.reason}`,
      reference: txId, status: 'completed',
    });
    const adjId = `adj_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from('admin_wallet_adjustments').insert({
      id: adjId, app_user_id: params.appUserId, admin_name: params.adminName,
      adjustment_type: params.type, amount: params.amount,
      balance_before: balanceBefore, balance_after: newBalance, reason: params.reason,
    });
    return { newBalance };
  },
};

// =================== WALLET ===================
export const dbWallet = {
  async getOrCreate(appUserId: string): Promise<Wallet> {
    const { data: existing } = await supabase.from('wallets').select('*').eq('app_user_id', appUserId).single();
    if (existing) return {
      id: existing.id, appUserId: existing.app_user_id, balance: Number(existing.balance),
      createdAt: existing.created_at, updatedAt: existing.updated_at,
    };
    const id = `wal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const { data: created, error } = await supabase.from('wallets')
      .insert({ id, app_user_id: appUserId, balance: 0 }).select().single();
    if (error) console.error('wallet.create:', error.message);
    return {
      id: created?.id ?? id, appUserId, balance: 0,
      createdAt: created?.created_at ?? new Date().toISOString(),
      updatedAt: created?.updated_at ?? new Date().toISOString(),
    };
  },

  async getBalance(appUserId: string): Promise<number> {
    const { data } = await supabase.from('wallets').select('balance').eq('app_user_id', appUserId).single();
    return data ? Number(data.balance) : 0;
  },

  async credit(appUserId: string, amount: number, description: string, reference: string): Promise<number> {
    await this.getOrCreate(appUserId);
    const current = await this.getBalance(appUserId);
    const newBalance = current + amount;
    const { error: wErr } = await supabase.from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('app_user_id', appUserId);
    if (wErr) throw new Error(wErr.message);
    const txId = `wt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from('wallet_transactions').insert({
      id: txId, app_user_id: appUserId, type: 'topup', amount,
      balance_after: newBalance, description, reference, status: 'completed',
    });
    return newBalance;
  },

  async deduct(
    appUserId: string, amount: number, description: string, reference: string,
    productId?: string, productType?: string,
  ): Promise<number> {
    const current = await this.getBalance(appUserId);
    if (current < amount) throw new Error(`Insufficient wallet balance. Balance: ₦${current.toLocaleString()}, required: ₦${amount.toLocaleString()}`);
    const newBalance = current - amount;
    const { error: wErr } = await supabase.from('wallets')
      .update({ balance: newBalance, updated_at: new Date().toISOString() })
      .eq('app_user_id', appUserId);
    if (wErr) throw new Error(wErr.message);
    const txId = `wt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await supabase.from('wallet_transactions').insert({
      id: txId, app_user_id: appUserId, type: 'deduction', amount,
      balance_after: newBalance, description, reference,
      product_id: productId || null, product_type: productType || null, status: 'completed',
    });
    return newBalance;
  },

  async getTransactions(appUserId: string): Promise<WalletTransaction[]> {
    const { data, error } = await supabase.from('wallet_transactions').select('*')
      .eq('app_user_id', appUserId).order('created_at', { ascending: false });
    if (error) { console.error('wallet.getTransactions:', error.message); return []; }
    return (data || []).map(row => ({
      id: row.id, appUserId: row.app_user_id, type: row.type, amount: Number(row.amount),
      balanceAfter: Number(row.balance_after), description: row.description, reference: row.reference,
      productId: row.product_id, productType: row.product_type, status: row.status, createdAt: row.created_at,
    }));
  },
};

// =================== VIRTUAL NUMBER ORDERS ===================
import type { VirtualNumberOrder } from '@/types';

export const dbVirtualOrders = {
  async getByUser(appUserId: string): Promise<VirtualNumberOrder[]> {
    const { data, error } = await supabase.from('virtual_number_orders').select('*')
      .eq('app_user_id', appUserId).order('created_at', { ascending: false });
    if (error) { console.error('virtual_orders.getByUser:', error.message); return []; }
    return (data || []).map(r => ({
      id: r.id, appUserId: r.app_user_id, service: r.service, country: r.country,
      heroSmsId: r.hero_sms_id, phoneNumber: r.phone_number,
      status: r.status as VirtualNumberOrder['status'],
      smsCode: r.sms_code ?? undefined, costNGN: Number(r.cost_ngn),
      costRub: Number(r.cost_rub), createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  },

  async getPendingByUser(appUserId: string): Promise<VirtualNumberOrder[]> {
    const { data, error } = await supabase.from('virtual_number_orders').select('*')
      .eq('app_user_id', appUserId).in('status', ['pending', 'waiting'])
      .order('created_at', { ascending: false });
    if (error) { console.error('virtual_orders.getPendingByUser:', error.message); return []; }
    return (data || []).map(r => ({
      id: r.id, appUserId: r.app_user_id, service: r.service, country: r.country,
      heroSmsId: r.hero_sms_id, phoneNumber: r.phone_number,
      status: r.status as VirtualNumberOrder['status'],
      smsCode: r.sms_code ?? undefined, costNGN: Number(r.cost_ngn),
      costRub: Number(r.cost_rub), createdAt: r.created_at, updatedAt: r.updated_at,
    }));
  },

  async updateStatus(id: string, status: VirtualNumberOrder['status'], smsCode?: string): Promise<void> {
    const { error } = await supabase.from('virtual_number_orders')
      .update({ status, sms_code: smsCode ?? null, updated_at: new Date().toISOString() })
      .eq('id', id);
    if (error) console.error('virtual_orders.updateStatus:', error.message);
  },
};

// =================== DOCUMENT SUBMISSIONS ===================
export const dbSubmissions = {
  async add(sub: Omit<DocumentSubmission, 'id' | 'createdAt'>): Promise<DocumentSubmission | null> {
    const id = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const enrichedFormData = { ...sub.formData, _appUserId: sub.userId };
    const { data, error } = await supabase.from('document_submissions').insert({
      id, document_id: sub.documentId, user_id: null,
      form_data: enrichedFormData, signature_data: sub.signatureData || null,
      image_data: sub.imageData || null, status: sub.status, order_id: sub.orderId || null,
    }).select().single();
    if (error) { console.error('submissions.add:', error.message); return null; }
    return {
      id: data.id, documentId: data.document_id, userId: data.user_id,
      formData: data.form_data, signatureData: data.signature_data,
      imageData: data.image_data, status: data.status,
      orderId: data.order_id, createdAt: data.created_at,
    };
  },

  async getAll(): Promise<DocumentSubmission[]> {
    const { data, error } = await supabase.from('document_submissions').select('*')
      .order('created_at', { ascending: false });
    if (error) { console.error('submissions.getAll:', error.message); return []; }
    return (data || []).map(row => ({
      id: row.id, documentId: row.document_id, userId: row.user_id,
      formData: row.form_data, signatureData: row.signature_data,
      imageData: row.image_data, status: row.status, orderId: row.order_id, createdAt: row.created_at,
    }));
  },
};
