/**
 * constants/index.ts
 *
 * Static app constants only.
 * All products, documents, working pictures, formats, and exchange rate
 * are stored exclusively in the OnSpace Cloud database and managed
 * via the Admin Dashboard. No hardcoded product/content data here.
 */
import type { CountryInfo, Review, ProductCategory } from '@/types';

export const COUNTRIES: CountryInfo[] = [
  { code: 'US', name: 'United States', flag: '🇺🇸', currency: 'USD', symbol: '$' },
  { code: 'UK', name: 'United Kingdom', flag: '🇬🇧', currency: 'GBP', symbol: '£' },
  { code: 'CA', name: 'Canada', flag: '🇨🇦', currency: 'CAD', symbol: 'C$' },
  { code: 'AU', name: 'Australia', flag: '🇦🇺', currency: 'AUD', symbol: 'A$' },
  { code: 'DE', name: 'Germany', flag: '🇩🇪', currency: 'EUR', symbol: '€' },
];

export const CATEGORIES: ProductCategory[] = [
  'Artificial Flowering Plants', 'Belts', 'Bracelets', 'Cakes', 'Chocolate',
  'Customized Items', 'Dress', 'Dried Flowers', 'Eye Glass', 'Food & Beverages',
  'Fresh Flowers', 'Greeting Cards', 'Heels', 'Hoodies', 'Jewelry Set',
  'Mugs', 'Necklaces', 'Photo Storage Boxes', 'Picture Frames', 'Prepared Meals',
  'Rings', 'Sandals', 'Shoes', 'Stuffed Animals', 'Sunglasses', 'Watches',
];

export const WHATSAPP_NUMBER = '9157385932';
export const WHATSAPP_URL = `https://wa.me/${WHATSAPP_NUMBER}`;

export const REVIEWS: Review[] = [
  {
    id: 'r1',
    author: 'Ahmed Ogundare',
    location: 'Ilorin',
    date: 'February 19, 2026',
    rating: 5,
    text: 'I wanted to send gift to a friend in USA and I was skeptical if I should trust them or not and they ended up delivering well, thanks so much Giftly.',
  },
  {
    id: 'r2',
    author: 'Joseph',
    location: 'Port Harcourt',
    date: 'November 29, 2025',
    rating: 4,
    text: 'What I like about them is they respond instantly and kept me updated throughout the step till the order was delivered, their service is top notch. I highly recommend them.',
  },
  {
    id: 'r3',
    author: 'Cynthia',
    location: 'Lagos',
    date: 'March 6, 2026',
    rating: 3,
    text: "They're very trustworthy and deliver more than you expect, I used them to send a cake to my boyfriend in UK on his birthday and they delivered, I was so happy.",
  },
];

export const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest First' },
  { value: 'oldest', label: 'Oldest First' },
  { value: 'price-asc', label: 'Price: Low to High' },
  { value: 'price-desc', label: 'Price: High to Low' },
  { value: 'alpha-asc', label: 'A → Z' },
  { value: 'alpha-desc', label: 'Z → A' },
  { value: 'rating', label: 'Top Rated' },
];

/** Default USD → NGN exchange rate (overridden by database value) */
export const DEFAULT_EXCHANGE_RATE = 1350;

/** Format a Naira (NGN) amount — prices are stored natively in NGN, no conversion needed */
export function formatNGN(ngn: number, _rate?: number): string {
  return `₦${ngn.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}


export const generateTrackingCode = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = 'KSH';
  for (let i = 0; i < 17; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
};

export const CATEGORY_ICONS: Record<string, string> = {
  'Fresh Flowers': '🌹',
  'Artificial Flowering Plants': '🌸',
  'Dried Flowers': '🌾',
  'Cakes': '🎂',
  'Chocolate': '🍫',
  'Jewelry Set': '💎',
  'Necklaces': '📿',
  'Bracelets': '💠',
  'Rings': '💍',
  'Watches': '⌚',
  'Dress': '👗',
  'Hoodies': '🧥',
  'Shoes': '👟',
  'Heels': '👠',
  'Sandals': '👡',
  'Belts': '🪢',
  'Sunglasses': '🕶️',
  'Eye Glass': '👓',
  'Stuffed Animals': '🧸',
  'Mugs': '☕',
  'Greeting Cards': '💌',
  'Picture Frames': '🖼️',
  'Photo Storage Boxes': '📦',
  'Customized Items': '🎁',
  'Food & Beverages': '🍱',
  'Prepared Meals': '🍽️',
};
