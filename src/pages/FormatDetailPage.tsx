/**
 * FormatDetailPage — Fetches full format from DB (including all preview images).
 * Does not depend on the store list (which excludes preview_images for performance).
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout, ArrowLeft, Download, Zap, AlertCircle, Shield, FileCheck, ChevronRight, Wallet, Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/db';
import { useAuthStore, useNotificationsStore, useExchangeRateStore } from '@/stores/useStore';
import { dbWallet, dbPurchases } from '@/lib/db';
import type { Format } from '@/types';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { formatNGN } from '@/constants';
import OptimizedImage from '@/components/features/OptimizedImage';

const FormatDetailPage: React.FC = () => {
  const { id }   = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { addNotification } = useNotificationsStore();
  const { rate } = useExchangeRateStore();

  const [fmt,         setFmt]         = useState<Format | null>(null);
  const [related,     setRelated]     = useState<Format[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [loadError,   setLoadError]   = useState(false);
  const [activeImage, setActiveImage] = useState(0);
  const [purchasing,  setPurchasing]  = useState(false);

  // Fetch full format from DB by ID (includes preview_images).
  // Hard timeout + terminal error state — a slow request can never spin forever.
  const fetchFormat = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const [fmtRes, relRes] = await Promise.all([
        withTimeout(supabase.from('formats').select('*').eq('id', id).single(), 'format detail'),
        withTimeout(
          supabase.from('formats').select('id, title, price, thumbnail, preview_images, created_at').neq('id', id).eq('available', true).limit(3),
          'related formats',
        ).catch(() => ({ data: null, error: null })),
      ]);
      if (!fmtRes.error && fmtRes.data) {
        const d = fmtRes.data;
        setFmt({
          id: d.id, title: d.title, description: d.description, price: Number(d.price),
          previewImages: (d.preview_images as string[]) || [],
          thumbnail: d.thumbnail as string | null,
          fileType: d.file_type as string, available: Boolean(d.available),
          tags: (d.tags as string[]) || [], downloadUrl: d.download_url as string,
          pinned: Boolean(d.pinned), createdAt: d.created_at,
        });
      } else if (fmtRes.error) {
        setLoadError(true);
      }
      if (!relRes.error && relRes.data) {
        setRelated(relRes.data.map((d: Record<string, unknown>) => ({
          id: d.id as string, title: d.title as string, price: Number(d.price),
          previewImages: (d.preview_images as string[]) || [],
          thumbnail: d.thumbnail as string | null,
          description: '', fileType: '', available: true, tags: [], createdAt: d.created_at as string,
        })));
      }
    } catch (e) {
      console.error('FormatDetailPage load:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchFormat(); }, [fetchFormat]);
  useEffect(() => { setActiveImage(0); }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <Loader2 size={24} className="text-kitan-teal animate-spin" />
        <span className="text-kitan-muted">Loading…</span>
      </div>
    );
  }

  if (!fmt && loadError) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-2">Unable to load format</p>
        <p className="text-kitan-muted text-sm mb-6">The request timed out or failed. Please try again.</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={fetchFormat} className="btn-primary">Retry</button>
          <button onClick={() => navigate('/formats')} className="btn-secondary">Back to Formats</button>
        </div>
      </div>
    );
  }

  if (!fmt) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-3">Format not found</p>
        <button onClick={() => navigate('/formats')} className="btn-primary">Back to Formats</button>
      </div>
    );
  }

  const displayImages = fmt.previewImages.length > 0 ? fmt.previewImages : (fmt.thumbnail ? [fmt.thumbnail] : []);

  const handleBuyNow = async () => {
    if (!user) { toast.error('Please sign in to purchase'); navigate('/login'); return; }
    setPurchasing(true);
    try {
      const balance = await dbWallet.getBalance(user.id);
      if (balance < fmt.price) {
        toast.error(`Insufficient wallet balance. You need ${formatNGN(fmt.price)} but have ${formatNGN(balance)}.`);
        navigate(`/wallet?need=${fmt.price}`);
        setPurchasing(false);
        return;
      }
      const ref = `fmt_wal_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await dbWallet.deduct(user.id, fmt.price, `Purchase: ${fmt.title}`, ref, fmt.id, 'format');
      await dbPurchases.add({ productId: fmt.id, productType: 'format', appUserId: user.id, amount: fmt.price, reference: ref });
      addNotification({ userId: user.id, title: 'Purchase Successful', message: `"${fmt.title}" purchased for ${formatNGN(fmt.price)}`, type: 'order' });
      toast.success('Purchase successful! Redirecting to your order…');
      navigate(`/order-content/format/${fmt.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Purchase failed. Please try again.');
      setPurchasing(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <button onClick={() => navigate('/formats')} className="flex items-center gap-2 text-kitan-muted hover:text-kitan-teal text-sm transition-colors">
        <ArrowLeft size={16} /> Back to Formats
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Image Gallery */}
        <div className="space-y-4">
          <div className="card-kitan overflow-hidden rounded-2xl bg-kitan-bg">
            <OptimizedImage
              src={displayImages[activeImage]}
              alt={fmt.title}
              className="w-full h-72"
              imgClassName="object-cover"
              eager
              fallback={<Layout size={48} className="text-kitan-subtle opacity-30" />}
            />
          </div>
          {displayImages.length > 1 && (
            <div className="flex gap-2">
              {displayImages.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={cn('w-16 h-16 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0', activeImage === i ? 'border-kitan-teal shadow-teal-glow' : 'border-kitan-border hover:border-kitan-teal/50')}
                >
                  <OptimizedImage src={img} alt="" className="w-full h-full" imgClassName="object-cover" fallback={<span className="text-kitan-subtle text-xs">{i + 1}</span>} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Details */}
        <div className="space-y-6">
          <div>
            <div className="flex flex-wrap gap-2 mb-3">
              {fmt.fileType && (
                <span className="bg-kitan-teal/10 text-kitan-teal border border-kitan-teal/30 px-3 py-1 rounded-full text-xs font-bold flex items-center gap-1">
                  <FileCheck size={11} /> {fmt.fileType}
                </span>
              )}
              {fmt.tags.map(tag => (
                <span key={tag} className="text-xs bg-kitan-surface text-kitan-muted border border-kitan-border px-2 py-1 rounded-full">{tag}</span>
              ))}
            </div>
            <h1 className="font-display font-bold text-kitan-off-white text-2xl mb-3">{fmt.title}</h1>
            <p className="text-kitan-muted leading-relaxed">{fmt.description}</p>
          </div>

          <div className="card-kitan p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-kitan-subtle text-xs mb-1">Template Price</p>
                <p className="text-kitan-teal font-display font-bold text-3xl">{formatNGN(fmt.price, rate)}</p>
              </div>
              <div className="text-right">
                <p className="text-kitan-subtle text-xs mb-1">Delivered As</p>
                <p className="text-kitan-off-white font-semibold text-sm">{fmt.fileType || 'Digital File'}</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-blue-500/5 border border-blue-500/20">
              <Wallet size={15} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-300/80 text-xs leading-relaxed">
                Payment is deducted from your wallet balance instantly.
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
                <><Download size={18} /> Buy Now — {formatNGN(fmt.price, rate)}</>
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
              { icon: Zap, text: 'Instant Delivery', sub: 'Access unlocked after purchase' },
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

      {related.length > 0 && (
        <div className="space-y-4">
          <h2 className="font-display font-bold text-kitan-off-white text-xl">More Templates</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {related.map(rf => {
              const thumb = rf.previewImages[0] || rf.thumbnail;
              return (
                <button
                  key={rf.id}
                  onClick={() => { navigate(`/formats/${rf.id}`); window.scrollTo(0, 0); }}
                  className="card-kitan overflow-hidden text-left group hover:border-kitan-teal"
                >
                  <OptimizedImage
                    src={thumb}
                    alt={rf.title}
                    className="w-full h-36"
                    imgClassName="object-cover group-hover:scale-105 transition-transform duration-300"
                    fallback={<Layout size={24} className="text-kitan-subtle opacity-30" />}
                  />
                  <div className="p-4">
                    <h3 className="text-kitan-off-white text-sm font-semibold line-clamp-2 group-hover:text-kitan-teal transition-colors">{rf.title}</h3>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-kitan-teal font-bold">{formatNGN(rf.price, rate)}</p>
                      <ChevronRight size={14} className="text-kitan-subtle group-hover:text-kitan-teal transition-colors" />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default FormatDetailPage;
