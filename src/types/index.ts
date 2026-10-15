export type Country = 'US' | 'UK' | 'CA' | 'AU' | 'DE';

export type ProductCategory =
  | 'Artificial Flowering Plants'
  | 'Belts'
  | 'Bracelets'
  | 'Cakes'
  | 'Chocolate'
  | 'Customized Items'
  | 'Dress'
  | 'Dried Flowers'
  | 'Eye Glass'
  | 'Food & Beverages'
  | 'Fresh Flowers'
  | 'Greeting Cards'
  | 'Heels'
  | 'Hoodies'
  | 'Jewelry Set'
  | 'Mugs'
  | 'Necklaces'
  | 'Photo Storage Boxes'
  | 'Picture Frames'
  | 'Prepared Meals'
  | 'Rings'
  | 'Sandals'
  | 'Shoes'
  | 'Stuffed Animals'
  | 'Sunglasses'
  | 'Watches';

export interface Product {
  id: string;
  title: string;
  images: string[];
  thumbnail?: string | null;   // ← fast list-view thumbnail (first image)
  description: string;
  price: number;
  countryPricing: Partial<Record<Country, number>>;
  countries: Country[];
  category: ProductCategory;
  available: boolean;
  createdAt: string;
  tags: string[];
  featured?: boolean;
  pinned?: boolean;
  pinPosition?: number;
  rating?: number;
  reviewCount?: number;
}

export interface CartItem {
  product: Product;
  quantity: number;
  country: Country;
}

export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: 'admin' | 'user';
  referralCode: string;
  referredBy?: string;
  createdAt: string;
  avatar?: string;
  wishlist: string[];
  emailVerified: boolean;
}

export interface DeliveryInfo {
  contactEmail: string;
  contactPhone: string;
  country: string;
  fullName: string;
  address: string;
  apartment?: string;
  city: string;
  state: string;
  zipCode: string;
  recipientPhone: string;
}

export interface TrackingUpdate {
  id: string;
  status: string;
  message: string;
  timestamp: string;
  image?: string;
}

export type OrderStatus = 'pending' | 'confirmed' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface Order {
  id: string;
  userId: string;
  trackingCode: string;
  items: CartItem[];
  total: number;
  status: OrderStatus;
  deliveryInfo: DeliveryInfo;
  createdAt: string;
  trackingUpdates: TrackingUpdate[];
  country: Country;
}

export interface Transaction {
  id: string;
  userId: string;
  type: 'credit' | 'debit';
  amount: number;
  description: string;
  status: 'pending' | 'completed' | 'failed';
  createdAt: string;
  reference?: string;
}

export interface WishlistItem {
  productId: string;
  addedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  read: boolean;
  type: 'order' | 'wallet' | 'promo' | 'system';
  createdAt: string;
}

export interface Review {
  id: string;
  author: string;
  location: string;
  date: string;
  rating: number;
  text: string;
  avatar?: string;
}

// =================== DOCUMENT MODULE ===================
export type FormFieldType = 'text' | 'number' | 'dropdown' | 'date' | 'time' | 'signature' | 'image';

export interface FormFieldOption {
  label: string;
  value: string;
}

export interface DocumentFormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required: boolean;
  options?: FormFieldOption[];
}

export interface KitanDocument {
  id: string;
  title: string;
  description: string;
  price: number;
  previewImages: string[];
  thumbnail?: string | null;   // ← fast list-view thumbnail
  formFields: DocumentFormField[];
  available: boolean;
  createdAt: string;
  category?: string;
  pinned?: boolean;
  pinPosition?: number;
}

export interface DocumentSubmission {
  id: string;
  documentId: string;
  userId: string;
  formData: Record<string, string>;
  signatureData?: string;
  imageData?: Record<string, string>;
  status: 'pending' | 'processing' | 'completed';
  createdAt: string;
  orderId?: string;
}

// =================== WORKING PICTURES MODULE ===================
export interface WorkingPicture {
  id: string;
  title: string;
  description: string;
  price: number;
  images: string[];
  thumbnail?: string | null;   // ← fast list-view thumbnail
  mediaType: 'image' | 'video' | 'mixed';
  available: boolean;
  createdAt: string;
  tags: string[];
  featured?: boolean;
  pinned?: boolean;
  pinPosition?: number;
  externalUrl?: string;
}

// =================== FORMATS MODULE ===================
export interface Format {
  id: string;
  title: string;
  description: string;
  price: number;
  previewImages: string[];
  thumbnail?: string | null;   // ← fast list-view thumbnail
  fileType?: string;
  available: boolean;
  createdAt: string;
  tags: string[];
  downloadUrl?: string;
  pinned?: boolean;
  pinPosition?: number;
}

export interface CountryInfo {
  code: Country;
  name: string;
  flag: string;
  currency: string;
  symbol: string;
}

// =================== ORDER CONTENT ===================
export type OrderContentProductType = 'working_picture' | 'format';

/** Purchases additionally cover products without order content (e.g. website services). */
export type PurchaseProductType = OrderContentProductType | 'website';

export interface OrderContent {
  id: string;
  productId: string;
  productType: OrderContentProductType;
  textContent: string;
  imageUrls: string[];
  createdAt: string;
  updatedAt: string;
}

// =================== PAYMENTS ===================
export type PaymentStatus = 'pending' | 'successful' | 'failed' | 'cancelled';
export type VerificationStatus = 'unverified' | 'verified' | 'mismatch';

export interface Payment {
  id: string;
  txRef: string;
  flwTransactionId?: string;
  productId: string;
  productType: string;
  appUserId: string;
  amountNGN: number;
  currency: string;
  customerEmail: string;
  customerName: string;
  paymentStatus: PaymentStatus;
  verificationStatus: VerificationStatus;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

// =================== WALLET ===================
export type WalletTransactionType = 'topup' | 'deduction' | 'refund';

export interface WalletTransaction {
  id: string;
  appUserId: string;
  type: WalletTransactionType;
  amount: number;
  balanceAfter: number;
  description: string;
  reference: string;
  productId?: string;
  productType?: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
}

export interface Wallet {
  id: string;
  appUserId: string;
  balance: number;
  createdAt: string;
  updatedAt: string;
}

// =================== VIRTUAL NUMBERS (SMSPool) ===================
export interface VirtualNumberOrder {
  id: string;
  appUserId: string;
  service: string;
  country: string;
  heroSmsId: string;
  phoneNumber: string;
  status: 'pending' | 'waiting' | 'received' | 'completed' | 'cancelled' | 'expired';
  smsCode?: string;
  costNGN: number;
  costRub: number;
  createdAt: string;
  updatedAt: string;
}

export interface SMSPoolPackage {
  service: string;
  country: string;
  costUSD: number;
  costNGN: number;
}

// =================== PURCHASES ===================
export interface Purchase {
  id: string;
  productId: string;
  productType: PurchaseProductType;
  appUserId: string;
  amount: number;
  reference: string;
  createdAt: string;
}
