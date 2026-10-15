/**
 * useSubscriptionAccess — checks whether the current user's active subscription
 * grants access to a given service type.
 *
 * Returns:
 *   hasAccess  — true if subscription is active AND product type is included in the plan
 *   qtyLimit   — null = unlimited, number = max uses allowed
 *   subscription — the active subscription record (or null)
 *   loading    — initial fetch in progress
 *
 * Usage:
 *   const { hasAccess, qtyLimit } = useSubscriptionAccess('documents');
 */
import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useStore';

export interface SubscriptionAccess {
  hasAccess: boolean;
  qtyLimit: number | null;
  planName: string | null;
  expiresAt: string | null;
  loading: boolean;
}

// Cache to avoid repeated DB hits in the same session
const cache = new Map<string, { result: SubscriptionAccess; ts: number }>();
const CACHE_TTL_MS = 60_000; // 1 minute

export function useSubscriptionAccess(productType: string): SubscriptionAccess {
  const { user } = useAuthStore();
  const cacheKey = `${user?.id ?? 'anon'}::${productType}`;

  const [state, setState] = useState<SubscriptionAccess>({
    hasAccess: false,
    qtyLimit: null,
    planName: null,
    expiresAt: null,
    loading: true,
  });

  useEffect(() => {
    let cancelled = false;

    if (!user) {
      setState({ hasAccess: false, qtyLimit: null, planName: null, expiresAt: null, loading: false });
      return;
    }

    // Check cache
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      setState(cached.result);
      return;
    }

    (async () => {
      try {
        // 1. Get active subscription
        const { data: sub } = await supabase
          .from('user_subscriptions')
          .select('id, plan_id, plan_name, expires_at')
          .eq('app_user_id', user.id)
          .eq('status', 'active')
          .gt('expires_at', new Date().toISOString())
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (!sub) {
          const result: SubscriptionAccess = {
            hasAccess: false, qtyLimit: null, planName: null, expiresAt: null, loading: false,
          };
          cache.set(cacheKey, { result, ts: Date.now() });
          if (!cancelled) setState(result);
          return;
        }

        // 2. Check plan_products for this plan + product type
        // In the new system, all rows in plan_products ARE assigned (included by existence, not by a flag)
        const { data: pp } = await supabase
          .from('plan_products')
          .select('qty_limit')
          .eq('plan_id', sub.plan_id)
          .eq('product_type', productType)
          .limit(1);

        const hasRows = (pp?.length ?? 0) > 0;
        const result: SubscriptionAccess = {
          hasAccess: hasRows,
          qtyLimit:  hasRows ? (pp![0]?.qty_limit ?? null) : null,
          planName:  sub.plan_name,
          expiresAt: sub.expires_at,
          loading:   false,
        };
        cache.set(cacheKey, { result, ts: Date.now() });
        if (!cancelled) setState(result);
      } catch {
        if (!cancelled) setState(prev => ({ ...prev, loading: false }));
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, productType]);

  return state;
}

/** Invalidate the subscription access cache for a user (call after purchase). */
export function invalidateSubscriptionCache(userId: string) {
  for (const key of cache.keys()) {
    if (key.startsWith(`${userId}::`)) cache.delete(key);
  }
}
