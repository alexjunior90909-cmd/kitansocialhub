
/**
 * useAppData — Global data loader for Layout.
 *
 * SCOPE: Only loads truly global configuration that every page needs.
 * - Exchange rate  → used for NGN pricing across all services
 * - Global WP price → used in Working Pictures pricing
 *
 * Per-page data (products, documents, pictures, formats) is loaded
 * by each individual page component so unrelated pages don't pay the
 * cost of loading data they don't use.
 */
import { useEffect } from 'react';
import { useExchangeRateStore, useGlobalWPPriceStore } from '@/stores/useStore';

export function useAppData() {
  const { loadRate, loaded: rateLoaded }     = useExchangeRateStore();
  const { loadGlobalWPPrice, loaded: wpLoaded } = useGlobalWPPriceStore();

  useEffect(() => {
    if (!rateLoaded)  loadRate();
    if (!wpLoaded)    loadGlobalWPPrice();
  }, [loadRate, loadGlobalWPPrice, rateLoaded, wpLoaded]);
}
