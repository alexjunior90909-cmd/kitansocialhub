import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import type { Country, CountryInfo } from "@/types";
import { COUNTRIES } from "@/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getCountryInfo(code: Country): CountryInfo {
  return COUNTRIES.find(c => c.code === code) || COUNTRIES[0];
}

export function formatPrice(amount: number, country?: Country): string {
  const info = country ? getCountryInfo(country) : null;
  const symbol = info?.symbol || '$';
  return `${symbol}${amount.toFixed(2)}`;
}

export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

export function truncate(str: string, length: number): string {
  if (str.length <= length) return str;
  return str.slice(0, length) + '...';
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

export function getStorageItem<T>(key: string, fallback: T): T {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch {
    return fallback;
  }
}

export function setStorageItem<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    console.error('Failed to save to localStorage');
  }
}

export function removeStorageItem(key: string): void {
  localStorage.removeItem(key);
}

export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export function calculateCartTotal(items: { product: { price: number; countryPricing: Record<string, number> }; quantity: number; country: string }[]): number {
  return items.reduce((total, item) => {
    const price = item.product.countryPricing[item.country] || item.product.price;
    return total + price * item.quantity;
  }, 0);
}

export function getStarArray(rating: number): ('full' | 'half' | 'empty')[] {
  const stars: ('full' | 'half' | 'empty')[] = [];
  for (let i = 1; i <= 5; i++) {
    if (rating >= i) stars.push('full');
    else if (rating >= i - 0.5) stars.push('half');
    else stars.push('empty');
  }
  return stars;
}
