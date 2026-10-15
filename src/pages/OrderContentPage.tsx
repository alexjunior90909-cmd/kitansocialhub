import React, { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle, Lock, ArrowLeft, Download, MessageCircle,
  ImageIcon, FileText, Loader2, ChevronLeft, ChevronRight, X,
  Copy, Check, DownloadCloud, AlertCircle, PackageOpen, ExternalLink
} from 'lucide-react';
import { useAuthStore, useWorkingPicturesStore, useFormatsStore } from '@/stores/useStore';
import { dbOrderContent, dbPurchases } from '@/lib/db';
import { supabase } from '@/lib/supabase';
import type { OrderContent, OrderContentProductType } from '@/types';
import { WHATSAPP_URL } from '@/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { FunctionsHttpError } from '@supabase/supabase-js';

// =================== DOWNLOAD ENGINE ===================
// Fetches an image as a Blob and triggers the native Save dialog.
// This is the ONLY method that works reliably on iOS Safari and Android Chrome
// for cross-origin URLs — the <a download> attribute is ignored by mobile browsers
// for cross-origin requests.
async function blobDownload(url: string, filename: string): Promise<void> {
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching ${filename}`);
  const blob = await response.blob();

  // Infer extension from MIME if filename has no ext
  const mime = blob.type; // e.g. "image/jpeg"
  let finalName = filename;
  if (!finalName.includes('.') && mime.startsWith('image/')) {
    const ext = mime.split('/')[1].replace('jpeg', 'jpg');
    finalName = `${finalName}.${ext}`;
  }

  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = finalName;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  // Small delay before cleanup so the browser has time to start the download
  setTimeout(() => {
    document.body.removeChild(anchor);
    URL.revokeObjectURL(objectUrl);
  }, 1000);
}

// =================== CLIPBOARD ENGINE ===================
// Full-fidelity copy: preserves every byte of text including line breaks,
// unicode, symbols, and special characters. Uses Clipboard API where available,
// falls back to execCommand for older iOS WebKit.
async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
    await navigator.clipboard.writeText(text);
    return;
  }
  // Legacy fallback (iOS ≤ 13, some Android WebViews)
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;white-space:pre;';
  document.body.appendChild(ta);
  ta.focus();
  ta.setSelectionRange(0, ta.value.length);
  const ok = document.execCommand('copy');
  document.body.removeChild(ta);
  if (!ok) throw new Error('execCommand copy failed');
}

// =================== LIGHTBOX ===================
const Lightbox: React.FC<{
  images: string[];
  initialIndex: number;
  productId: string;
  appUserId: string;
  onClose: () => void;
}> = ({ images, initialIndex, productId, appUserId, onClose }) => {
  const [current, setCurrent] = useState(initialIndex);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') setCurrent(i => (i + 1) % images.length);
      if (e.key === 'ArrowLeft') setCurrent(i => (i - 1 + images.length) % images.length);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [images.length, onClose]);

  const handleSingleDownload = async () => {
    setDownloading(true);
    try {
      // Call edge function for a purchase-verified signed URL
      const { data, error } = await supabase.functions.invoke('order-download', {
        body: { appUserId, productId, productType: undefined, imageIndex: current },
      });

      let errorMsg = '';
      if (error) {
        if (error instanceof FunctionsHttpError) {
          try { errorMsg = await error.context.text(); } catch { errorMsg = error.message; }
        } else {
          errorMsg = error.message;
        }
      }

      // Edge function returns signed URL → blob download
      if (!errorMsg && data?.signedUrl) {
        await blobDownload(data.signedUrl, data.filename || `image-${current + 1}.jpg`);
        toast.success('Image saved to your device');
      } else {
        // Fallback: try direct blob download from public URL
        console.warn('Signed URL unavailable, falling back to direct download:', errorMsg);
        const rawUrl = images[current];
        await blobDownload(rawUrl, `order-image-${current + 1}.jpg`);
        toast.success('Image saved to your device');
      }
    } catch (err) {
      console.error('Download error:', err);
      toast.error('Download failed. Try long-pressing the image to save.');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/97 flex flex-col items-center justify-center" onClick={onClose}>
      {/* Close */}
      <button
        onClick={onClose}
        className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
      >
        <X size={20} />
      </button>

      {/* Prev / Next */}
      {images.length > 1 && (
        <>
          <button
            onClick={e => { e.stopPropagation(); setCurrent(i => (i - 1 + images.length) % images.length); }}
            className="absolute left-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
          >
            <ChevronLeft size={22} />
          </button>
          <button
            onClick={e => { e.stopPropagation(); setCurrent(i => (i + 1) % images.length); }}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors z-10"
          >
            <ChevronRight size={22} />
          </button>
        </>
      )}

      {/* Image — natural dimensions, letterboxed */}
      <div
        className="flex flex-col items-center gap-4 max-w-[95vw] max-h-[85vh]"
        onClick={e => e.stopPropagation()}
      >
        <img
          src={images[current]}
          alt={`Order image ${current + 1} of ${images.length}`}
          className="max-w-full max-h-[72vh] object-contain rounded-xl select-none"
          style={{ imageRendering: 'auto' }}
          draggable={false}
        />

        {/* Counter + Download bar */}
        <div className="flex items-center gap-3 flex-wrap justify-center">
          <span className="text-white/50 text-sm">{current + 1} / {images.length}</span>
          <button
            onClick={handleSingleDownload}
            disabled={downloading}
            className="flex items-center gap-2 bg-kitan-teal hover:bg-kitan-teal-bright disabled:opacity-60 text-white text-sm font-semibold px-5 py-2.5 rounded-xl transition-colors min-w-[160px] justify-center"
          >
            {downloading
              ? <Loader2 size={15} className="animate-spin" />
              : <Download size={15} />}
            {downloading ? 'Saving...' : 'Save to Device'}
          </button>
        </div>
        <p className="text-white/30 text-xs">iOS: long-press image → Save · Android: tap Save button above</p>
      </div>
    </div>
  );
};

// =================== MAIN PAGE ===================
const OrderContentPage: React.FC = () => {
  const { type, productId } = useParams<{ type: string; productId: string }>();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { items: pictures } = useWorkingPicturesStore();
  const { formats } = useFormatsStore();

  const productType = type as OrderContentProductType;

  // Get external URL for working pictures
  const externalUrl = productType === 'working_picture'
    ? (pictures.find(p => p.id === productId)?.externalUrl || null)
    : null;

  const [loading, setLoading] = useState(true);
  const [accessGranted, setAccessGranted] = useState(false);
  const [content, setContent] = useState<OrderContent | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Per-image download state: index → 'idle' | 'loading' | 'done' | 'error'
  const [dlState, setDlState] = useState<Record<number, 'idle' | 'loading' | 'done' | 'error'>>({});
  const [downloadAllState, setDownloadAllState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [downloadAllProgress, setDownloadAllProgress] = useState({ done: 0, total: 0 });

  // Text copy state
  const [copyState, setCopyState] = useState<'idle' | 'copying' | 'done' | 'error'>('idle');
  const [copyUrlState, setCopyUrlState] = useState<'idle' | 'done'>('idle');

  // Resolve product info
  const product = productType === 'working_picture'
    ? pictures.find(p => p.id === productId)
    : formats.find(f => f.id === productId);
  const productTitle = product ? product.title : productId ?? '';
  const backPath = productType === 'working_picture' ? '/working-pictures' : '/formats';

  useEffect(() => {
    if (!user || !productId || !productType) { setLoading(false); return; }
    const init = async () => {
      setLoading(true);
      const hasPurchased = await dbPurchases.hasPurchased(user.id, productId, productType);
      if (!hasPurchased) { setAccessGranted(false); setLoading(false); return; }
      setAccessGranted(true);
      const oc = await dbOrderContent.get(productId, productType);
      setContent(oc);
      setLoading(false);
    };
    init();
  }, [user, productId, productType]);

  // ---- Single image download (purchase-verified signed URL → blob) ----
  const handleDownloadOne = useCallback(async (index: number) => {
    if (!content || !user || !productId) return;
    setDlState(prev => ({ ...prev, [index]: 'loading' }));

    try {
      const rawUrl = content.imageUrls[index];

      // Try edge function first (returns purchase-verified signed URL)
      let downloadUrl = rawUrl;
      let filename = `order-${productId.slice(-6)}-${index + 1}.jpg`;

      const { data, error } = await supabase.functions.invoke('order-download', {
        body: {
          appUserId: user.id,
          productId,
          productType,
          imageIndex: index,
        },
      });

      if (!error && data?.signedUrl) {
        downloadUrl = data.signedUrl;
        filename = data.filename || filename;
        console.log(`[download] Using signed URL for image ${index + 1}`);
      } else {
        // Log but fall back to public URL — purchase already verified on page load
        let errDetail = '';
        if (error instanceof FunctionsHttpError) {
          try { errDetail = await error.context.text(); } catch { errDetail = error.message; }
        } else if (error) {
          errDetail = error.message;
        }
        console.warn(`[download] Edge function unavailable (${errDetail}), using public URL`);
      }

      await blobDownload(downloadUrl, filename);
      setDlState(prev => ({ ...prev, [index]: 'done' }));
      toast.success(`Image ${index + 1} saved to your device`);
      setTimeout(() => setDlState(prev => ({ ...prev, [index]: 'idle' })), 3000);
    } catch (err) {
      console.error('[download] single image error:', err);
      setDlState(prev => ({ ...prev, [index]: 'error' }));
      toast.error('Download failed. Try long-pressing the image to save manually.');
      setTimeout(() => setDlState(prev => ({ ...prev, [index]: 'idle' })), 4000);
    }
  }, [content, user, productId, productType]);

  // ---- Download All — sequential blob downloads with progress counter ----
  // Sequential (not parallel) because browsers throttle parallel blob fetches on mobile.
  const handleDownloadAll = useCallback(async () => {
    if (!content || !user || !productId || downloadAllState === 'loading') return;
    const total = content.imageUrls.length;
    if (total === 0) return;

    setDownloadAllState('loading');
    setDownloadAllProgress({ done: 0, total });

    // Fetch all signed URLs in one edge function call (imageIndex = -1)
    let signedUrls: string[] | null = null;
    let filenames: string[] | null = null;

    try {
      const { data, error } = await supabase.functions.invoke('order-download', {
        body: { appUserId: user.id, productId, productType, imageIndex: -1 },
      });
      if (!error && data?.signedUrls) {
        signedUrls = data.signedUrls as string[];
        filenames = data.filenames as string[];
        console.log(`[download-all] Got ${signedUrls.length} signed URLs from edge function`);
      } else {
        let errDetail = '';
        if (error instanceof FunctionsHttpError) {
          try { errDetail = await error.context.text(); } catch { errDetail = error.message; }
        } else if (error) {
          errDetail = error.message;
        }
        console.warn('[download-all] Edge function error, using public URLs:', errDetail);
      }
    } catch (e) {
      console.warn('[download-all] Edge function threw:', e);
    }

    let successCount = 0;
    for (let i = 0; i < total; i++) {
      const url = signedUrls?.[i] ?? content.imageUrls[i];
      const name = filenames?.[i] ?? `order-${productId.slice(-6)}-${i + 1}.jpg`;
      try {
        // Small delay between downloads so the browser doesn't coalesce them into one
        if (i > 0) await new Promise(r => setTimeout(r, 600));
        await blobDownload(url, name);
        successCount++;
        setDownloadAllProgress({ done: i + 1, total });
      } catch (err) {
        console.error(`[download-all] Failed image ${i + 1}:`, err);
        toast.error(`Image ${i + 1} failed — try downloading it individually`);
      }
    }

    setDownloadAllState('done');
    if (successCount > 0) {
      toast.success(`${successCount} of ${total} image${total > 1 ? 's' : ''} saved to your device`);
    }
    setTimeout(() => {
      setDownloadAllState('idle');
      setDownloadAllProgress({ done: 0, total: 0 });
    }, 5000);
  }, [content, user, productId, productType, downloadAllState]);

  // ---- Copy external URL ----
  const handleCopyUrl = useCallback(async () => {
    if (!externalUrl) return;
    try {
      await copyToClipboard(externalUrl);
      setCopyUrlState('done');
      toast.success('Link copied to clipboard');
      setTimeout(() => setCopyUrlState('idle'), 3000);
    } catch {
      toast.error('Failed to copy link');
    }
  }, [externalUrl]);

  // ---- Copy full text content ----
  // Reads textContent directly from the already-fetched DB record.
  // The raw string is passed byte-for-byte to the clipboard — no truncation,
  // no trimming, preserving all line breaks, symbols, and unicode characters.
  const handleCopyText = useCallback(async () => {
    if (!content?.textContent) return;
    setCopyState('copying');
    try {
      await copyToClipboard(content.textContent);
      setCopyState('done');
      toast.success(`Copied ${content.textContent.length.toLocaleString()} characters to clipboard`);
      setTimeout(() => setCopyState('idle'), 3000);
    } catch (err) {
      console.error('[copy] clipboard error:', err);
      setCopyState('error');
      toast.error('Copy failed. Select the text manually and use copy.');
      setTimeout(() => setCopyState('idle'), 4000);
    }
  }, [content]);

  // ---- Loading ----
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 size={36} className="text-kitan-teal animate-spin" />
        <p className="text-kitan-muted text-sm">Verifying purchase access...</p>
      </div>
    );
  }

  // ---- Not logged in ----
  if (!user) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
          <Lock size={36} className="text-red-400" />
        </div>
        <h2 className="font-display text-xl font-bold text-kitan-off-white">Sign In Required</h2>
        <p className="text-kitan-muted">You must be logged in to access order content.</p>
        <button onClick={() => navigate('/login')} className="btn-primary w-full">Sign In</button>
      </div>
    );
  }

  // ---- Access denied ----
  if (!accessGranted) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
          <Lock size={36} className="text-amber-400" />
        </div>
        <h2 className="font-display text-xl font-bold text-kitan-off-white">Purchase Required</h2>
        <p className="text-kitan-muted leading-relaxed">
          You haven't purchased <span className="text-kitan-off-white font-semibold">{productTitle}</span> yet, or your purchase was made on a different account.
        </p>
        <div className="flex flex-col gap-3 mt-2">
          <a
            href={`${WHATSAPP_URL}?text=${encodeURIComponent('Hello, I purchased a product but cannot access my order content. Product: ' + productTitle)}`}
            target="_blank" rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-2xl bg-green-500 hover:bg-green-400 text-white font-bold transition-all"
          >
            <MessageCircle size={18} /> Contact Admin
          </a>
          <button onClick={() => navigate(backPath)} className="btn-secondary w-full">
            Back to {productType === 'working_picture' ? 'Working Pictures' : 'Formats'}
          </button>
        </div>
      </div>
    );
  }

  // ---- No uploaded content yet ----
  // If Admin URL (externalUrl) is set, skip this screen entirely — the URL IS the order.
  // Only show the "contact admin" prompt when there is truly nothing to deliver.
  const hasNoUploadedContent = !content || (content.imageUrls.length === 0 && !content.textContent?.trim());

  if (hasNoUploadedContent && !externalUrl) {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-kitan-teal/10 border border-kitan-teal/30 flex items-center justify-center mx-auto">
          <PackageOpen size={36} className="text-kitan-teal" />
        </div>
        <h2 className="font-display text-xl font-bold text-kitan-off-white">Purchase Confirmed!</h2>
        <div className="card-kitan p-5 text-left space-y-3">
          <p className="text-kitan-off-white font-semibold text-sm">{productTitle}</p>
          <p className="text-kitan-muted text-sm leading-relaxed">
            Contact admin on WhatsApp to receive your order. Reference your purchase when messaging.
          </p>
        </div>
        <a
          href={`${WHATSAPP_URL}?text=${encodeURIComponent('Hello, I just purchased "' + productTitle + '" — please send my order content.')}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-2xl bg-green-500 hover:bg-green-400 text-white font-bold transition-all"
        >
          <MessageCircle size={18} /> Message Admin on WhatsApp
        </a>
        <button onClick={() => navigate(backPath)} className="btn-secondary w-full">Browse More</button>
      </div>
    );
  }

  const hasImages = (content?.imageUrls.length ?? 0) > 0;
  const hasText = (content?.textContent?.trim().length ?? 0) > 0;

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-fade-in">

      {/* ---- Header ---- */}
      <div className="flex items-start gap-4">
        <button
          onClick={() => navigate(backPath)}
          className="flex items-center gap-2 text-kitan-muted hover:text-kitan-teal text-sm transition-colors flex-shrink-0 mt-1"
        >
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="badge-teal text-xs">
              {productType === 'working_picture' ? 'Working Pictures' : 'Formats'} Order
            </span>
            <span className="flex items-center gap-1 text-kitan-teal text-xs font-semibold">
              <CheckCircle size={12} /> Purchased
            </span>
          </div>
          <h1 className="font-display font-bold text-kitan-off-white text-xl mt-1 truncate">{productTitle}</h1>
        </div>
      </div>

      {/* ---- Access badge ---- */}
      <div className="flex items-center gap-3 p-4 rounded-2xl bg-kitan-teal/5 border border-kitan-teal/20">
        <CheckCircle size={20} className="text-kitan-teal flex-shrink-0" />
        <div>
          <p className="text-kitan-off-white text-sm font-semibold">Order Content Unlocked</p>
          <p className="text-kitan-muted text-xs">Exclusive to your account. Updates automatically when admin adds new content.</p>
        </div>
      </div>

      {/* =================== EXTERNAL URL — PRIMARY ORDER DELIVERY =================== */}
      {/* Source of truth: working_pictures.external_url in database, mapped via db.ts mapPicture().
          Rendered as the main delivered order item. Gated by purchase verification above.
          Only purchasers of this product can view or copy this URL. */}
      {externalUrl && (
        <div className="space-y-3">
          <h2 className="font-semibold text-kitan-off-white flex items-center gap-2">
            <ExternalLink size={18} className="text-kitan-teal" />
            Your Order — Access Link
          </h2>
          <div className="card-kitan p-6 space-y-4 border-kitan-teal/30">
            <div className="flex items-start gap-3 p-4 rounded-xl bg-kitan-teal/5 border border-kitan-teal/20">
              <CheckCircle size={18} className="text-kitan-teal flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-kitan-off-white text-sm font-semibold">Your access link is ready</p>
                <p className="text-kitan-muted text-xs mt-0.5">Click Open Link to access your order, or Copy Link to save it.</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-xl bg-kitan-bg border border-kitan-border">
              <ExternalLink size={13} className="text-kitan-teal flex-shrink-0" />
              <p className="text-kitan-teal text-xs font-mono flex-1 break-all select-all">{externalUrl}</p>
            </div>
            <div className="flex gap-3 flex-wrap">
              <a
                href={externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 btn-primary flex-1 justify-center text-sm py-3 min-w-[140px]"
              >
                <ExternalLink size={15} /> Open Link
              </a>
              <button
                onClick={handleCopyUrl}
                className={cn(
                  'flex items-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-all border flex-1 justify-center min-w-[140px]',
                  copyUrlState === 'done'
                    ? 'bg-green-500/10 text-green-400 border-green-500/30'
                    : 'bg-kitan-surface text-kitan-off-white border-kitan-border hover:border-kitan-teal hover:text-kitan-teal'
                )}
              >
                {copyUrlState === 'done' ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Link</>}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =================== IMAGES SECTION =================== */}
      {hasImages && (
        <div className="space-y-4">
          {/* Section header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-kitan-off-white flex items-center gap-2">
              <ImageIcon size={18} className="text-kitan-teal" />
              Your Files
              <span className="text-kitan-subtle text-sm font-normal">
                ({content.imageUrls.length} image{content.imageUrls.length !== 1 ? 's' : ''})
              </span>
            </h2>

            {/* Download All button */}
            <button
              onClick={handleDownloadAll}
              disabled={downloadAllState === 'loading'}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all min-w-[160px] justify-center',
                downloadAllState === 'loading'
                  ? 'bg-kitan-teal/20 text-kitan-teal border border-kitan-teal/30 cursor-not-allowed'
                  : downloadAllState === 'done'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                  : 'bg-kitan-teal text-white hover:bg-kitan-teal-bright shadow-teal-glow'
              )}
            >
              {downloadAllState === 'loading' ? (
                <>
                  <Loader2 size={15} className="animate-spin flex-shrink-0" />
                  {downloadAllProgress.total > 0
                    ? `${downloadAllProgress.done}/${downloadAllProgress.total} saving...`
                    : 'Preparing...'}
                </>
              ) : downloadAllState === 'done' ? (
                <><Check size={15} /> All Saved!</>
              ) : (
                <><DownloadCloud size={15} /> Download All {content.imageUrls.length > 1 ? `(${content.imageUrls.length})` : ''}</>
              )}
            </button>
          </div>

          {/* Mobile download hint */}
          <div className="flex items-start gap-2 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
            <AlertCircle size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
            <p className="text-amber-300/80 text-xs leading-relaxed">
              <span className="font-semibold">iOS Safari:</span> Tap an image → tap the download icon below it — or long-press the image → "Save to Photos". &nbsp;
              <span className="font-semibold">Android:</span> Use the "Save" button under each image.
            </p>
          </div>

          {/* Masonry image grid */}
          <div className="columns-1 sm:columns-2 lg:columns-3 gap-3 space-y-3">
            {content.imageUrls.map((url, i) => {
              const state = dlState[i] || 'idle';
              return (
                <div
                  key={i}
                  className="break-inside-avoid relative rounded-2xl overflow-hidden border border-kitan-border hover:border-kitan-teal/60 transition-all group"
                >
                  {/* Image — tap to open lightbox */}
                  <img
                    src={url}
                    alt={`Order image ${i + 1}`}
                    className="w-full h-auto object-contain bg-kitan-bg block cursor-pointer"
                    loading="lazy"
                    onClick={() => setLightboxIndex(i)}
                  />

                  {/* Counter badge */}
                  <div className="absolute top-2 left-2 bg-black/60 text-white/80 text-xs px-2 py-0.5 rounded-full">
                    {i + 1}/{content.imageUrls.length}
                  </div>

                  {/* Per-image download button (always visible on mobile) */}
                  <div className="flex items-center justify-between gap-2 p-2 bg-kitan-bg/90 border-t border-kitan-border/50">
                    <button
                      onClick={() => setLightboxIndex(i)}
                      className="flex-1 text-xs text-kitan-muted hover:text-kitan-off-white transition-colors text-left truncate"
                      title="Open full-size preview"
                    >
                      View full size
                    </button>
                    <button
                      onClick={() => handleDownloadOne(i)}
                      disabled={state === 'loading'}
                      title="Save to device"
                      className={cn(
                        'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex-shrink-0 min-w-[80px] justify-center',
                        state === 'loading'
                          ? 'bg-kitan-teal/20 text-kitan-teal cursor-not-allowed'
                          : state === 'done'
                          ? 'bg-green-500/15 text-green-400'
                          : state === 'error'
                          ? 'bg-red-500/15 text-red-400'
                          : 'bg-kitan-teal/15 text-kitan-teal hover:bg-kitan-teal hover:text-white'
                      )}
                    >
                      {state === 'loading' && <Loader2 size={12} className="animate-spin" />}
                      {state === 'done' && <Check size={12} />}
                      {state === 'error' && <AlertCircle size={12} />}
                      {state === 'idle' && <Download size={12} />}
                      {state === 'loading' ? 'Saving' : state === 'done' ? 'Saved!' : state === 'error' ? 'Retry' : 'Save'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* =================== TEXT CONTENT SECTION =================== */}
      {hasText && (
        <div className="space-y-3">
          {/* Section header with copy button */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-kitan-off-white flex items-center gap-2">
              <FileText size={18} className="text-kitan-teal" />
              Notes &amp; Instructions
              <span className="text-kitan-subtle text-sm font-normal">
                ({content.textContent.length.toLocaleString()} characters)
              </span>
            </h2>

            {/* Copy button */}
            <button
              onClick={handleCopyText}
              disabled={copyState === 'copying'}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all min-w-[130px] justify-center',
                copyState === 'done'
                  ? 'bg-green-500/10 text-green-400 border border-green-500/30'
                  : copyState === 'error'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                  : copyState === 'copying'
                  ? 'bg-kitan-teal/20 text-kitan-teal border border-kitan-teal/30 cursor-not-allowed'
                  : 'bg-kitan-surface text-kitan-off-white border border-kitan-border hover:border-kitan-teal hover:text-kitan-teal'
              )}
            >
              {copyState === 'done' ? (
                <><Check size={15} /> Copied!</>
              ) : copyState === 'error' ? (
                <><AlertCircle size={15} /> Failed</>
              ) : copyState === 'copying' ? (
                <><Loader2 size={15} className="animate-spin" /> Copying...</>
              ) : (
                <><Copy size={15} /> Copy All Text</>
              )}
            </button>
          </div>

          {/* Full text — raw DB value, all whitespace/formatting preserved */}
          <div className="card-kitan p-6 relative">
            {/* Selectable text block — user can also manually select + copy */}
            <pre
              className="whitespace-pre-wrap font-sans text-kitan-muted text-sm leading-relaxed break-words select-all"
              style={{ wordBreak: 'break-word', overflowWrap: 'anywhere' }}
            >
              {content?.textContent}
            </pre>
          </div>

          <p className="text-kitan-subtle text-xs">
            Click "Copy All Text" to copy the complete content, or select any portion manually.
          </p>
        </div>
      )}

      {/* ---- WhatsApp support ---- */}
      <div className="card-kitan p-5 flex flex-col sm:flex-row items-center gap-4">
        <div className="flex-1">
          <p className="text-kitan-off-white text-sm font-semibold">Need help with your order?</p>
          <p className="text-kitan-muted text-xs mt-0.5">Contact admin via WhatsApp for any issues.</p>
        </div>
        <a
          href={`${WHATSAPP_URL}?text=${encodeURIComponent('Hello, I need help with my order for: ' + productTitle)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center gap-2 bg-green-500 hover:bg-green-400 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors text-sm flex-shrink-0"
        >
          <MessageCircle size={16} /> WhatsApp Admin
        </a>
      </div>

      {/* ---- Lightbox ---- */}
      {lightboxIndex !== null && (
        <Lightbox
          images={content.imageUrls}
          initialIndex={lightboxIndex}
          productId={productId ?? ''}
          appUserId={user.id}
          onClose={() => setLightboxIndex(null)}
        />
      )}
    </div>
  );
};

export default OrderContentPage;
