/**
 * DocumentDetailPage — New purchase flow.
 *
 * Workflow:
 *   1. User views document (title, description, preview images, price)
 *   2. Clicks "Get Access" → calls kitan-doc-credit Edge Function (server-side)
 *   3. Edge Function: idempotency check → wallet deduction → KitanLab API credit grant
 *   4. On success: redirect user to https://kitanlabs.store
 *   5. On error: show error, wallet automatically refunded by Edge Function
 *
 * No form fields. No admin messaging. No manual steps.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  FileText, ArrowLeft, AlertCircle, Loader2, ExternalLink,
  Zap, Shield, Wallet, CheckCircle, Tag, Crown,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/db';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { useAuthStore, useWalletStore } from '@/stores/useStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import OptimizedImage from '@/components/features/OptimizedImage';

const formatNGN = (n: number) =>
  `₦${n.toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

interface DocInfo {
  id: string;
  title: string;
  description: string;
  price: number;
  previewImages: string[];
  thumbnail: string | null;
  available: boolean;
  category: string;
}

const DocumentDetailPage: React.FC = () => {
  const { id }            = useParams<{ id: string }>();
  const navigate          = useNavigate();
  const { user }          = useAuthStore();
  const { wallet, loadWallet, refreshBalance } = useWalletStore();

  const [doc,          setDoc]          = useState<DocInfo | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState(false);
  const [purchasing,   setPurchasing]   = useState(false);
  const [success,      setSuccess]      = useState(false);
  const [activeImage,  setActiveImage]  = useState(0);

  // Fetch full document from DB (including preview images).
  // Hard timeout + terminal error state — a slow request can never spin forever.
  const fetchDoc = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('kitan_documents')
          .select('id, title, description, price, preview_images, thumbnail, available, category')
          .eq('id', id)
          .single(),
        'document detail',
      );
      if (!error && data) {
        setDoc({
          id:            data.id,
          title:         data.title,
          description:   data.description,
          price:         Number(data.price),
          previewImages: (data.preview_images as string[]) || [],
          thumbnail:     data.thumbnail as string | null,
          available:     Boolean(data.available),
          category:      data.category as string,
        });
      } else if (error) {
        setLoadError(true);
      }
    } catch (e) {
      console.error('DocumentDetailPage load:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchDoc(); }, [fetchDoc]);
  useEffect(() => { setActiveImage(0); }, [id]);

  // Load wallet balance if user is logged in
  useEffect(() => {
    if (user && !wallet) loadWallet(user.id);
  }, [user]);

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <Loader2 size={24} className="text-kitan-teal animate-spin" />
        <span className="text-kitan-muted">Loading…</span>
      </div>
    );
  }

  // ── Load failure (timeout / network) ──────────────────────────────────────
  if (!doc && loadError) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-2">Unable to load document</p>
        <p className="text-kitan-muted text-sm mb-6">The request timed out or failed. Please try again.</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={fetchDoc} className="btn-primary">Retry</button>
          <button onClick={() => navigate('/documents')} className="btn-secondary">Back to Documents</button>
        </div>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (!doc) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-3">Document not found</p>
        <button onClick={() => navigate('/documents')} className="btn-primary">Back to Documents</button>
      </div>
    );
  }

  const images       = doc.previewImages;
  const displayImage = images[activeImage] || doc.thumbnail;
  const balance      = wallet?.balance ?? 0;
  const canAfford    = balance >= doc.price;

  // ── Purchase handler ──────────────────────────────────────────────────────
  const handleGetAccess = async () => {
    if (!user) { navigate('/login'); return; }
    if (!canAfford) {
      toast.error(`Insufficient balance — need ${formatNGN(doc.price)}, have ${formatNGN(balance)}`);
      navigate(`/wallet?need=${doc.price}`);
      return;
    }

    setPurchasing(true);

    const purchaseRef = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const { data, error } = await supabase.functions.invoke('kitan-doc-credit', {
        body: {
          appUserId:   user.id,
          documentId:  doc.id,
          userEmail:   user.email,
          purchaseRef,
        },
      });

      if (error) {
        let msg = error.message;
        if (error instanceof FunctionsHttpError) {
          try {
            const text   = await error.context?.text();
            const parsed = text ? JSON.parse(text) : null;
            msg          = parsed?.error || text || msg;
          } catch { /* ignore */ }
        }
        toast.error(msg || 'Purchase failed. Please try again.');
        setPurchasing(false);
        return;
      }

      if (data?.success) {
        await refreshBalance(user.id);
        setSuccess(true);
        toast.success('Access granted! Opening KitanLab in new tab…');
      }
    } catch (e) {
      console.error('[doc-credit] unexpected error:', e);
      toast.error('An unexpected error occurred. Please try again.');
    }

    setPurchasing(false);
  };

  // ── Success state ─────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-kitan-teal/10 border border-kitan-teal/30 flex items-center justify-center mx-auto">
          <CheckCircle size={40} className="text-kitan-teal" />
        </div>
        <div>
          <h2 className="font-display text-2xl font-bold text-kitan-off-white mb-2">Access Granted!</h2>
          <p className="text-kitan-muted leading-relaxed">
            Your generation credit has been added to your KitanLab account. Click below to open KitanLab and start creating.
          </p>
        </div>
        <a
          href="https://kitanlabs.store"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-primary w-full flex items-center justify-center gap-2 py-4 text-base"
        >
          <ExternalLink size={18} /> Open KitanLab
        </a>
        <button onClick={() => navigate('/documents')} className="btn-secondary w-full">
          Back to Documents
        </button>
        <div className="flex items-start gap-2.5 p-3 rounded-xl bg-kitan-surface border border-kitan-border text-left">
          <Shield size={14} className="text-kitan-teal flex-shrink-0 mt-0.5" />
          <p className="text-kitan-muted text-xs leading-relaxed">
            Your credit is permanently linked to your KitanLab account ({user?.email}). You can open KitanLab any time — it does not expire.
          </p>
        </div>
      </div>
    );
  }

  // ── Main detail view ──────────────────────────────────────────────────────
  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <button
        onClick={() => navigate('/documents')}
        className="flex items-center gap-2 text-kitan-muted hover:text-kitan-teal text-sm transition-colors"
      >
        <ArrowLeft size={16} /> Back to Documents
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── Left: Preview images ── */}
        <div className="space-y-4">
          <div className="card-kitan overflow-hidden rounded-2xl bg-kitan-bg" style={{ minHeight: '240px' }}>
            <OptimizedImage
              src={displayImage}
              alt={doc.title}
              className="w-full h-64 lg:h-72"
              imgClassName="object-contain"
              eager
              fallback={<FileText size={44} className="text-kitan-subtle opacity-30" />}
            />
          </div>
          {images.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {images.map((img, i) => (
                <button
                  key={i}
                  onClick={() => setActiveImage(i)}
                  className={cn(
                    'w-14 h-14 rounded-xl overflow-hidden border-2 transition-all flex-shrink-0',
                    activeImage === i ? 'border-kitan-teal shadow-teal-glow' : 'border-kitan-border hover:border-kitan-teal/50'
                  )}
                >
                  <OptimizedImage src={img} alt="" className="w-full h-full" imgClassName="object-cover" fallback={<span className="text-kitan-subtle text-xs">{i + 1}</span>} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: Details + Purchase ── */}
        <div className="space-y-6">
          {/* Title + category */}
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {doc.category && (
                <span className="badge-teal flex items-center gap-1 text-xs">
                  <Tag size={10} /> {doc.category}
                </span>
              )}
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                <Crown size={10} /> KitanLab Access
              </span>
            </div>
            <h1 className="font-display font-bold text-kitan-off-white text-2xl mb-3 leading-snug">
              {doc.title}
            </h1>
            <p className="text-kitan-muted leading-relaxed">{doc.description}</p>
          </div>

          {/* What you get */}
          <div className="card-kitan p-5 space-y-3">
            <p className="text-kitan-off-white text-sm font-semibold">What you get</p>
            {[
              '1 generation credit on KitanLab',
              'Immediate access after purchase',
              'Credit linked to your email account',
              'No expiry — use whenever you need',
            ].map(item => (
              <div key={item} className="flex items-center gap-2.5">
                <CheckCircle size={14} className="text-kitan-teal flex-shrink-0" />
                <span className="text-kitan-muted text-sm">{item}</span>
              </div>
            ))}
          </div>

          {/* Price + purchase */}
          <div className="card-kitan p-5 space-y-4">
            <div>
              <p className="text-kitan-subtle text-xs mb-1">Access Price</p>
              <p className="text-kitan-teal font-display font-bold text-3xl">{formatNGN(doc.price)}</p>
            </div>

            {/* Wallet balance info */}
            {user && (
              <div className={cn(
                'flex items-center justify-between p-3 rounded-xl border',
                canAfford
                  ? 'bg-kitan-teal/5 border-kitan-teal/20'
                  : 'bg-red-500/5 border-red-500/20'
              )}>
                <div className="flex items-center gap-2">
                  <Wallet size={14} className={canAfford ? 'text-kitan-teal' : 'text-red-400'} />
                  <span className="text-kitan-muted text-sm">Wallet Balance</span>
                </div>
                <span className={cn('font-bold text-sm', canAfford ? 'text-kitan-teal' : 'text-red-400')}>
                  {formatNGN(balance)}
                </span>
              </div>
            )}

            {!canAfford && user && (
              <p className="text-red-400 text-xs">
                You need {formatNGN(doc.price - balance)} more. <button onClick={() => navigate('/wallet')} className="underline">Top up wallet</button>
              </p>
            )}

            <button
              onClick={handleGetAccess}
              disabled={purchasing}
              className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2"
            >
              {purchasing ? (
                <><Loader2 size={18} className="animate-spin" /> Processing…</>
              ) : !user ? (
                <><Zap size={18} /> Sign In to Get Access</>
              ) : !canAfford ? (
                <><Wallet size={18} /> Top Up & Get Access</>
              ) : (
                <><Zap size={18} /> Get Access — {formatNGN(doc.price)}</>
              )}
            </button>

            {!user && (
              <p className="text-center text-kitan-muted text-xs">
                <button onClick={() => navigate('/login')} className="text-kitan-teal hover:underline">Sign in</button> to purchase
              </p>
            )}
          </div>

          {/* Trust badges */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: Shield, text: 'Wallet Deduction', sub: 'Secure, instant checkout' },
              { icon: Zap, text: 'Instant Credit', sub: 'Available on KitanLab immediately' },
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

export default DocumentDetailPage;
