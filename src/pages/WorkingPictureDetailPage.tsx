/**
 * WorkingPictureDetailPage — Fetches full item from DB (including all images).
 * Does not depend on the store list (which excludes images for performance).
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Camera, ArrowLeft, Zap, AlertCircle, Star, Shield, Wallet, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/db';
import { useAuthStore, useNotificationsStore, useExchangeRateStore, useGlobalWPPriceStore } from '@/stores/useStore';
import { dbWallet, dbPurchases } from '@/lib/db';
import OptimizedImage from '@/components/features/OptimizedImage';
import type { WorkingPicture } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNGN } from '@/constants';

const WorkingPictureDetailPage: React.FC = () => {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuthStore();
  const { addNotification } = useNotificationsStore();
  const { rate }   = useExchangeRateStore();
  const { globalWPPrice } = useGlobalWPPriceStore();

  const [item,        setItem]        = useState<WorkingPicture | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [purchasing,  setPurchasing]  = useState(false);

  // Fetch full item (with all images) from DB by ID.
  // Hard timeout + terminal error state — a slow request can never spin forever.
  const fetchItem = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await withTimeout(
        supabase.from('working_pictures').select('*').eq('id', id).single(),
        'working picture detail',
      );
      if (!error && data) {
        setItem({
          id:          data.id,
          title:       data.title,
          description: data.description,
          price:       Number(data.price),
          images:      (data.images as string[]) || [],
          thumbnail:   data.thumbnail as string | null,
          mediaType:   data.media_type as WorkingPicture['mediaType'],
          available:   Boolean(data.available),
          tags:        (data.tags as string[]) || [],
          featured:    Boolean(data.featured),
          pinned:      Boolean(data.pinned),
          externalUrl: data.external_url as string | undefined,
          createdAt:   data.created_at,
        });
      } else if (error) {
        setLoadError(true);
      }
    } catch (e) {
      console.error('WorkingPictureDetailPage load:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchItem(); }, [fetchItem]);
  useEffect(() => { setActiveImage(0); }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <Loader2 size={24} className="text-kitan-teal animate-spin" />
        <span className="text-kitan-muted">Loading…</span>
      </div>
    );
  }

  if (!item && loadError) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-2">Unable to load item</p>
        <p className="text-kitan-muted text-sm mb-6">The request timed out or failed. Please try again.</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={fetchItem} className="btn-primary">Retry</button>
          <button onClick={() => navigate('/working-pictures')} className="btn-secondary">Back</button>
        </div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-3">Item not found</p>
        <button onClick={() => navigate('/working-pictures')} className="btn-primary">Back</button>
      </div>
    );
  }

  const effectivePrice = item.price > 0 ? item.price : globalWPPrice;

  const handleBuyNow = async () => {
    if (!user) {
      toast.error('Please sign in to purchase');
      navigate('/login');
      return;
    }
    setPurchasing(true);
    try {
      const balance = await dbWallet.getBalance(user.id);
      if (balance < effectivePrice) {
        toast.error(`Insufficient wallet balance. You need ${formatNGN(effectivePrice)} but have ${formatNGN(balance)}.`);
        navigate(`/wallet?need=${effectivePrice}`);
        setPurchasing(false);
        return;
      }
      const ref = `wp_wal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await dbWallet.deduct(user.id, effectivePrice, `Purchase: ${item.title}`, ref, item.id, 'working_picture');
      await dbPurchases.add({ productId: item.id, productType: 'working_picture', appUserId: user.id, amount: effectivePrice, reference: ref });
      addNotification({ userId: user.id, title: 'Purchase Successful', message: `"${item.title}" purchased for ${formatNGN(effectivePrice)}`, type: 'order' });
      toast.success('Purchase successful! Redirecting to your order…');
      navigate(`/order-content/working_picture/${item.id}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Purchase failed. Please try again.';
      toast.error(msg);
      setPurchasing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <button onClick={() => navigate('/working-pictures')} className="flex items-center gap-2 text-kitan-muted hover:text-kitan-teal text-sm transition-colors">
        <ArrowLeft size={16} /> Back to Working Pictures
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Image Gallery */}
        <div className="space-y-4">
          <div className="card-kitan overflow-hidden rounded-2xl bg-kitan-bg">
            <OptimizedImage
              src={item.images[activeImage] || item.thumbnail}
              alt={item.title}
              className="w-full h-80"
              imgClassName="object-contain"
              eager
              fallback={<Camera size={48} className="text-kitan-subtle opacity-30" />}
            />
          </div>
          {item.images.length > 1 && (
            <div className="grid grid-cols-6 gap-2">
              {item.images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={cn('rounded-xl overflow-hidden border-2 transition-all aspect-square', activeImage === i ? 'border-kitan-teal shadow-teal-glow' : 'border-kitan-border hover:border-kitan-teal/50')}
                >
                  <OptimizedImage src={img} alt="" className="w-full h-full" imgClassName="object-cover" fallback={<span className="text-kitan-subtle text-xs">{i + 1}</span>} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          {item.featured && (
            <div className="badge-teal inline-flex items-center gap-1.5">
              <Star size={12} fill="currentColor" /> Featured Pack
            </div>
          )}
          <div>
            <h1 className="font-display font-bold text-kitan-off-white text-2xl mb-2">{item.title}</h1>
            <div className="flex flex-wrap gap-2 mb-4">
              {item.tags.map(tag => (
                <span key={tag} className="text-xs bg-kitan-teal/10 text-kitan-teal border border-kitan-teal/20 px-3 py-1 rounded-full">{tag}</span>
              ))}
            </div>
            <p className="text-kitan-muted leading-relaxed">{item.description}</p>
          </div>

          <div className="card-kitan p-5 space-y-4">
            <div>
              <p className="text-kitan-subtle text-xs mb-1">Pack Price</p>
              <p className="text-kitan-teal font-display font-bold text-3xl">{formatNGN(effectivePrice, rate)}</p>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <Wallet size={15} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-300/80 text-xs leading-relaxed">
                Payment is deducted from your wallet balance instantly. Top up your wallet first if needed.
              </p>
            </div>
            <button
              onClick={handleBuyNow}
              disabled={purchasing}
              className="btn-primary w-full py-4 flex items-center justify-center gap-2 text-base"
            >
              {purchasing ? (
                <><Loader2 size={18} className="animate-spin" /> Preparing Payment…</>
              ) : (
                <><Zap size={18} /> Buy Now — {formatNGN(effectivePrice, rate)}</>
              )}
            </button>
            {!user && (
              <p className="text-center text-kitan-muted text-xs">
                <button onClick={() => navigate('/login')} className="text-kitan-teal hover:underline">Sign in</button> to purchase
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Shield, text: 'Secure Payment', sub: 'Wallet-based checkout' },
              { icon: Zap, text: 'Instant Delivery', sub: 'Access unlocked after payment' },
            ].map(({ icon: Icon, text, sub }) => (
              <div key={text} className="card-kitan p-3 flex items-center gap-3">
                <Icon size={18} className="text-kitan-teal flex-shrink-0" />
                <div>
                  <p className="text-kitan-off-white text-xs font-semibold">{text}</p>
                  <p className="text-kitan-subtle text-xs">{sub}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkingPictureDetailPage;
