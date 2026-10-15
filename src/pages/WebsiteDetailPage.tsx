/**
 * WebsiteDetailPage — individual website product detail view.
 * Reached from WebsitePage or MyPlanPage subscription library.
 */
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Globe, ArrowLeft, CheckCircle, Crown, Wallet, Zap, HeadphonesIcon,
  AlertCircle, Loader2, Tag,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/db';
import { useAuthStore } from '@/stores/useStore';
import { dbWallet, dbPurchases } from '@/lib/db';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNGN } from '@/constants';
import OptimizedImage from '@/components/features/OptimizedImage';

interface WebsiteProduct {
  id: string;
  title: string;
  description: string;
  price_ngn: number;
  preview_images: string[];
  features: string[];
  tags: string[];
  available: boolean;
  is_premium: boolean;
}

const WebsiteDetailPage: React.FC = () => {
  const { id }       = useParams<{ id: string }>();
  const navigate     = useNavigate();
  const { user }     = useAuthStore();

  const [product,    setProduct]    = useState<WebsiteProduct | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [activeImg,  setActiveImg]  = useState(0);

  const fetchProduct = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('website_products')
          .select('*')
          .eq('id', id)
          .single(),
        'website product detail',
      );
      if (error) throw new Error(error.message);
      setProduct(data || null);
    } catch (e) {
      console.error('WebsiteDetailPage load:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);
  useEffect(() => { setActiveImg(0); }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <Loader2 size={24} className="text-kitan-teal animate-spin" />
        <span className="text-kitan-muted">Loading…</span>
      </div>
    );
  }

  if (!product && loadError) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-2">Unable to load package</p>
        <p className="text-kitan-muted text-sm mb-6">The request timed out or failed. Please try again.</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={fetchProduct} className="btn-primary">Retry</button>
          <button onClick={() => navigate('/website')} className="btn-secondary">Back to Websites</button>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-3">Product not found</p>
        <button onClick={() => navigate('/website')} className="btn-primary">Back to Websites</button>
      </div>
    );
  }

  const handleBuyNow = async () => {
    if (!user) { toast.error('Please sign in to purchase'); navigate('/login'); return; }
    setPurchasing(true);
    try {
      const balance = await dbWallet.getBalance(user.id);
      if (balance < product.price_ngn) {
        toast.error(`Insufficient balance — need ${formatNGN(product.price_ngn)}, have ${formatNGN(balance)}`);
        navigate(`/wallet?need=${product.price_ngn}`);
        setPurchasing(false);
        return;
      }
      const ref = `ws_wal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await dbWallet.deduct(user.id, product.price_ngn, `Purchase: ${product.title}`, ref, product.id, 'website');
      await dbPurchases.add({ productId: product.id, productType: 'website', appUserId: user.id, amount: product.price_ngn, reference: ref });
      toast.success('Purchase successful! Contact support to get started.');
      navigate('/support');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Purchase failed');
      setPurchasing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-10">
      <button onClick={() => navigate('/website')} className="flex items-center gap-2 text-kitan-muted hover:text-kitan-teal text-sm transition-colors">
        <ArrowLeft size={16} /> Back to Website Services
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Images */}
        <div className="space-y-4">
          {product.preview_images.length > 0 ? (
            <>
              <div className="card-kitan overflow-hidden rounded-2xl" style={{ height: '280px' }}>
                <OptimizedImage
                  src={product.preview_images[activeImg]}
                  alt={product.title}
                  className="w-full h-full"
                  imgClassName="object-cover"
                  eager
                  fallback={<Globe size={40} className="text-indigo-400/40" />}
                />
              </div>
              {product.preview_images.length > 1 && (
                <div className="grid grid-cols-5 gap-2">
                  {product.preview_images.map((img, i) => (
                    <button key={i} onClick={() => setActiveImg(i)} className={cn('rounded-xl overflow-hidden border-2 transition-all aspect-square', activeImg === i ? 'border-kitan-teal' : 'border-kitan-border')}>
                      <OptimizedImage src={img} alt="" className="w-full h-full" imgClassName="object-cover" fallback={<span className="text-kitan-subtle text-xs">{i + 1}</span>} />
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="h-64 rounded-2xl bg-gradient-to-br from-indigo-500/10 to-kitan-bg border border-kitan-border flex items-center justify-center">
              <Globe size={56} className="text-indigo-400/30" />
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-5">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {product.is_premium && (
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                  <Crown size={10} /> Premium
                </span>
              )}
            </div>
            <h1 className="font-display font-bold text-kitan-off-white text-2xl mb-2">{product.title}</h1>
            {product.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mb-3">
                {product.tags.map(tag => (
                  <span key={tag} className="flex items-center gap-1 text-xs bg-kitan-surface border border-kitan-border text-kitan-subtle px-2 py-0.5 rounded-full">
                    <Tag size={9} /> {tag}
                  </span>
                ))}
              </div>
            )}
            <p className="text-kitan-muted leading-relaxed">{product.description}</p>
          </div>

          {product.features.length > 0 && (
            <div className="card-kitan p-5 space-y-3">
              <p className="text-kitan-off-white text-sm font-semibold">What's Included</p>
              <ul className="space-y-2">
                {product.features.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <CheckCircle size={14} className="text-kitan-teal flex-shrink-0 mt-0.5" />
                    <span className="text-kitan-muted">{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card-kitan p-5 space-y-4">
            <div>
              <p className="text-kitan-subtle text-xs mb-1">Package Price</p>
              <p className="text-indigo-300 font-display font-bold text-3xl">{formatNGN(product.price_ngn)}</p>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <Wallet size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-300/80 text-xs leading-relaxed">Deducted from wallet balance. After purchase, contact support to get started on your website.</p>
            </div>
            <button onClick={handleBuyNow} disabled={purchasing} className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2" style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              {purchasing ? <><Loader2 size={18} className="animate-spin" /> Processing…</> : <><Zap size={18} /> Get Started — {formatNGN(product.price_ngn)}</>}
            </button>
            <button onClick={() => navigate('/support')} className="btn-secondary w-full flex items-center justify-center gap-2 text-sm">
              <HeadphonesIcon size={15} /> Ask a Question First
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WebsiteDetailPage;
