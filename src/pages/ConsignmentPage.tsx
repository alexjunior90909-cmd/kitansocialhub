/**
 * ConsignmentPage — public Consignment Video service.
 *
 * Landing: hero + admin-configurable sample video (lazy player) + CTA.
 * Form: receiver/sender details, asset cards, optional optimized image upload.
 * Payment: single server-side atomic RPC (price from DB, wallet validated and
 * debited atomically, duplicate-safe). Static content renders immediately;
 * only settings (price/video) are fetched (session-cached).
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Clapperboard, Sparkles, ArrowRight, CheckCircle2, AlertCircle, Loader2,
  Upload, User, MapPin, Send, Banknote, NotebookPen, ImagePlus, Trash2,
  MessageCircle, Wallet, RefreshCw, Package,
} from 'lucide-react';
import { useAuthStore, useWalletStore } from '@/stores/useStore';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import SampleVideo from '@/components/features/consignment/SampleVideo';
import AssetSelector from '@/components/features/consignment/AssetSelector';
import {
  getConsignmentSettings, payConsignment, uploadReceiverImage, getOwnSubmission,
  type ConsignmentSettings, type ConsignmentSubmission,
} from '@/lib/consignment';

const WHATSAPP_URL = 'https://wa.me/message/BBF2QJWLCFJHL1';

type Phase = 'landing' | 'form' | 'confirm' | 'success';

interface FormState {
  receiverName: string;
  receiverAddress: string;
  senderName: string;
  amount: string;
  note: string;
  imageFile: File | null;
}

const EMPTY_FORM: FormState = { receiverName: '', receiverAddress: '', senderName: '', amount: '', note: '', imageFile: null };

const ConsignmentPage: React.FC = () => {
  const { user } = useAuthStore();
  const { wallet, loadWallet } = useWalletStore();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const refParam = searchParams.get('ref');

  const [phase, setPhase] = useState<Phase>('landing');
  const [settings, setSettings] = useState<ConsignmentSettings | null>(null);
  const [settingsError, setSettingsError] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [assets, setAssets] = useState<string[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [result, setResult] = useState<{ requestId: string; price: number; createdAt: string } | null>(null);
  const [refLookup, setRefLookup] = useState<ConsignmentSubmission | null>(null);
  const [reference] = useState(() => `csg_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`);
  const formRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Settings: single session-cached fetch (static content shows immediately)
  const loadSettings = useCallback(async (force = false) => {
    setSettingsError(false);
    const s = await getConsignmentSettings(force);
    if (s.price === null && s.sampleVideoUrl === null) setSettingsError(true);
    setSettings(s);
  }, []);
  useEffect(() => { loadSettings(); }, [loadSettings]);

  useEffect(() => {
    if (user) loadWallet(user.id);
  }, [user, loadWallet]);

  // ?ref= → show the user's own request status (single-row lookup)
  useEffect(() => {
    if (!refParam || !user) return;
    getOwnSubmission(user.id, refParam).then(setRefLookup);
  }, [refParam, user]);

  const startCreation = () => {
    setPhase('form');
    requestAnimationFrame(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const set = (k: keyof FormState, v: string) => {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: '' }));
  };

  const pickImage = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (!file) return;
    if (file.size > 25 * 1024 * 1024) { toast.error('Image must be under 25MB'); return; }
    if (!file.type.startsWith('image/')) { toast.error('Please choose an image file'); return; }
    setForm(f => ({ ...f, imageFile: file }));
    setImagePreview(URL.createObjectURL(file));
    setErrors(er => ({ ...er, image: '' }));
  };

  const clearImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImagePreview(null);
    setForm(f => ({ ...f, imageFile: null }));
  };

  const validate = (): boolean => {
    const e: Record<string, string> = {};
    if (!form.receiverName.trim()) e.receiverName = 'Receiver name is required';
    if (!form.receiverAddress.trim()) e.receiverAddress = 'Receiver address is required';
    if (!form.senderName.trim()) e.senderName = 'Sender name is required';
    if (!form.amount.trim()) e.amount = 'Amount is required';
    if (assets.length === 0) e.assets = 'Select at least one asset to feature';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const proceedToPayment = () => {
    if (!user) { toast.info('Please sign in to continue'); navigate('/login'); return; }
    if (!validate()) return;
    if (settings?.price == null) {
      toast.error('Pricing is not available yet. Please try again or contact support.');
      loadSettings(true);
      return;
    }
    setPhase('confirm');
    formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const submitPayment = async () => {
    if (!user || submitting) return;
    setSubmitting(true);
    try {
      let imageUrl: string | null = null;
      if (form.imageFile) {
        setImageUploading(true);
        imageUrl = await uploadReceiverImage(form.imageFile, user.id);
        setImageUploading(false);
      }
      const res = await payConsignment({
        appUserId: user.id,
        userName: user.name,
        userEmail: user.email,
        reference,
        receiverName: form.receiverName.trim(),
        receiverAddress: form.receiverAddress.trim(),
        senderName: form.senderName.trim(),
        amount: form.amount.trim(),
        note: form.note.trim() || null,
        receiverImageUrl: imageUrl,
        assets,
      });
      if (res.error) {
        if (res.error === 'INSUFFICIENT_BALANCE') {
          toast.error(`Insufficient wallet balance — need ${formatNGN(res.required ?? settings?.price ?? 0)}, have ${formatNGN(res.balance ?? 0)}.`);
          navigate(`/wallet?need=${res.required ?? settings?.price ?? 0}`);
        } else {
          toast.error(res.message || 'Payment failed. Please try again.');
        }
        setPhase('form');
        return;
      }
      setResult({ requestId: res.requestId ?? '', price: res.price ?? settings?.price ?? 0, createdAt: new Date().toISOString() });
      setPhase('success');
      loadWallet(user.id);
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Something went wrong');
      setPhase('form');
    } finally {
      setImageUploading(false);
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    clearImage();
    setForm(EMPTY_FORM);
    setAssets([]);
    setErrors({});
    setResult(null);
    setPhase('landing');
  };

  const priceLabel = useMemo(() => (settings?.price != null ? formatNGN(settings.price) : null), [settings?.price]);

  return (
    <div className="space-y-10 pb-10 max-w-5xl mx-auto">

      {refLookup && (
        <div className="card-kitan p-4 flex items-center gap-3 border-kitan-teal/30">
          <CheckCircle2 size={18} className="text-kitan-teal flex-shrink-0" />
          <div className="min-w-0">
            <p className="text-kitan-off-white text-sm font-semibold truncate">Request {refLookup.id}</p>
            <p className="text-kitan-muted text-xs">
              Paid {formatNGN(refLookup.paymentAmount)} · Status: <span className="capitalize text-kitan-teal">{refLookup.processingStatus}</span>
            </p>
          </div>
        </div>
      )}

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden rounded-3xl border border-kitan-border p-8 md:p-12">
        <div className="absolute inset-0 bg-gradient-to-br from-kitan-teal/15 via-kitan-surface/80 to-kitan-bg" />
        <div className="absolute top-[-120px] right-[-80px] w-[380px] h-[380px] rounded-full opacity-20"
          style={{ background: 'radial-gradient(circle, #14b8a6 0%, transparent 70%)' }} />
        <div className="relative z-10">
          <div className="badge-teal inline-flex items-center gap-2 mb-5">
            <Sparkles size={12} /> Premium Presentation Service
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-bold text-kitan-off-white leading-tight mb-4">
            Consignment Video
            <span className="gradient-text block">Your Assets. Professionally Presented.</span>
          </h1>
          <p className="text-kitan-muted max-w-2xl leading-relaxed mb-8">
            Give your consignment presentation a premium touch with professionally crafted video showcases
            featuring luxury assets, precious metals, jewellery, vehicles, cash and other valuable items —
            a polished experience designed to communicate value, elegance and professionalism.
          </p>
          <div className="flex flex-wrap items-center gap-4">
            <button onClick={startCreation} className="btn-primary flex items-center gap-2 text-base px-7 py-3.5">
              <Clapperboard size={18} /> Create Your Video
            </button>
            <button
              onClick={() => user ? navigate('/consignment/orders') : navigate('/login')}
              className="btn-secondary flex items-center gap-2 text-sm"
            >
              <Package size={15} /> My Orders
            </button>
            {priceLabel && (
              <span className="text-kitan-muted text-sm">
                Flat rate <span className="text-kitan-teal font-bold text-base">{priceLabel}</span> from your wallet
              </span>
            )}
          </div>
        </div>
      </section>

      {/* ── SAMPLE VIDEO ─────────────────────────────────────────────────── */}
      <section>
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h2 className="section-heading">See It In Action</h2>
          {settingsError && (
            <button onClick={() => loadSettings(true)} className="btn-ghost text-xs flex items-center gap-1.5">
              <RefreshCw size={12} /> Retry
            </button>
          )}
        </div>
        {settings === null ? (
          <div className="rounded-3xl border border-kitan-border bg-kitan-card/40 animate-pulse aspect-video" />
        ) : (
          <SampleVideo url={settings.sampleVideoUrl} />
        )}
      </section>

      {/* ── FORM / CONFIRM / SUCCESS ──────────────────────────────────────── */}
      <div ref={formRef} className="scroll-mt-24">
        {(phase === 'form' || phase === 'confirm') && (
          <section className="card-kitan p-6 md:p-8 space-y-7">
            <div>
              <h2 className="font-display text-xl md:text-2xl font-bold text-kitan-off-white">Create Your Video</h2>
              <p className="text-kitan-muted text-sm mt-1">Tell us who the presentation is for and select the assets to feature.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {([
                { key: 'receiverName', label: 'Receiver Name', icon: User, placeholder: 'e.g. Sarah Mitchell', required: true, set: 'receiverName' },
                { key: 'senderName', label: 'Sender Name', icon: Send, placeholder: 'Your name', required: true, set: 'senderName' },
              ] as const).map(({ key, label, icon: Icon, placeholder, required }) => (
                <div key={key}>
                  <label className="text-kitan-muted text-sm mb-1.5 block">{label}{required && <span className="text-kitan-teal"> *</span>}</label>
                  <div className="relative">
                    <Icon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                    <input
                      className={cn('input-kitan pl-9', errors[key] && 'border-red-500')}
                      placeholder={placeholder}
                      value={form[key]}
                      onChange={e => set(key, e.target.value)}
                      disabled={phase === 'confirm'}
                    />
                  </div>
                  {errors[key] && <p className="text-red-400 text-xs mt-1">{errors[key]}</p>}
                </div>
              ))}
              <div className="sm:col-span-2">
                <label className="text-kitan-muted text-sm mb-1.5 block">Receiver Address<span className="text-kitan-teal"> *</span></label>
                <div className="relative">
                  <MapPin size={15} className="absolute left-3 top-3 text-kitan-subtle" />
                  <textarea
                    rows={2}
                    className={cn('input-kitan pl-9 resize-none', errors.receiverAddress && 'border-red-500')}
                    placeholder="Full delivery address"
                    value={form.receiverAddress}
                    onChange={e => set('receiverAddress', e.target.value)}
                    disabled={phase === 'confirm'}
                  />
                </div>
                {errors.receiverAddress && <p className="text-red-400 text-xs mt-1">{errors.receiverAddress}</p>}
              </div>
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">Amount<span className="text-kitan-teal"> *</span></label>
                <div className="relative">
                  <Banknote size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                  <input
                    className={cn('input-kitan pl-9', errors.amount && 'border-red-500')}
                    placeholder="Amount to display (e.g. $250,000)"
                    value={form.amount}
                    onChange={e => set('amount', e.target.value)}
                    disabled={phase === 'confirm'}
                  />
                </div>
                {errors.amount && <p className="text-red-400 text-xs mt-1">{errors.amount}</p>}
              </div>
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">Additional Note</label>
                <div className="relative">
                  <NotebookPen size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
                  <input
                    className="input-kitan pl-9"
                    placeholder="Optional instructions"
                    value={form.note}
                    onChange={e => set('note', e.target.value)}
                    disabled={phase === 'confirm'}
                  />
                </div>
              </div>
            </div>

            {/* Receiver image */}
            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Receiver Image <span className="text-kitan-subtle text-xs">(optional — shown in the presentation)</span></label>
              {imagePreview ? (
                <div className="flex items-start gap-4">
                  <img src={imagePreview} alt="Receiver preview" className="w-24 h-24 rounded-2xl object-cover border border-kitan-border" />
                  <button type="button" onClick={clearImage} disabled={phase === 'confirm'} className="btn-secondary text-xs flex items-center gap-1.5 mt-1">
                    <Trash2 size={12} /> Remove
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={phase === 'confirm'}
                  className="w-full h-20 rounded-2xl border-2 border-dashed border-kitan-border hover:border-kitan-teal bg-kitan-bg/30 flex items-center justify-center gap-2 text-kitan-muted hover:text-kitan-teal transition-all"
                >
                  <ImagePlus size={18} /> <span className="text-sm">Upload receiver image (optional)</span>
                </button>
              )}
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={pickImage} />
            </div>

            {/* Assets */}
            <div>
              <label className="text-kitan-muted text-sm mb-2 block">Assets to Feature<span className="text-kitan-teal"> *</span></label>
              <AssetSelector selected={assets} onChange={phase === 'confirm' ? () => undefined : setAssets} />              {errors.assets && <p className="text-red-400 text-xs mt-2">{errors.assets}</p>}
            </div>

            {phase === 'form' ? (
              <div className="flex flex-col gap-3">
                <button onClick={proceedToPayment} className="btn-primary flex items-center justify-center gap-2 py-3.5">
                  Proceed to Payment <ArrowRight size={16} />
                </button>
                <p className="text-center text-kitan-subtle text-xs">
                  Have a special consignment request?{' '}
                  <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-kitan-teal hover:text-kitan-teal-bright font-semibold">
                    Contact our team directly on WhatsApp
                  </a>
                </p>
              </div>
            ) : (
              /* Confirm panel */
              <div className="rounded-2xl border border-kitan-teal/30 bg-kitan-teal/5 p-5 space-y-4">
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-kitan-subtle text-xs uppercase tracking-wide">Amount Payable</p>
                    <p className="text-kitan-teal font-display font-bold text-3xl">{priceLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-kitan-subtle text-xs">Wallet balance</p>
                    <p className={cn('font-bold', (wallet?.balance ?? 0) >= (settings?.price ?? 0) ? 'text-kitan-off-white' : 'text-red-400')}>
                      {formatNGN(wallet?.balance ?? 0)}
                    </p>
                  </div>
                </div>
                <p className="text-kitan-muted text-xs">
                  Charged once from your KITAN wallet. A unique request ID will be generated for tracking.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button onClick={submitPayment} disabled={submitting || imageUploading} className="btn-primary flex items-center gap-2 flex-1 min-w-[180px] justify-center py-3.5">
                    {submitting || imageUploading
                      ? <><Loader2 size={16} className="animate-spin" /> {imageUploading ? 'Uploading image…' : 'Processing payment…'}</>
                      : <><Wallet size={16} /> Confirm & Pay {priceLabel}</>}
                  </button>
                  <button onClick={() => setPhase('form')} disabled={submitting} className="btn-secondary text-sm">Back to Edit</button>
                </div>
              </div>
            )}
          </section>
        )}

        {phase === 'success' && result && (
          <section className="card-kitan p-8 md:p-10 text-center space-y-5 border-kitan-teal/40">
            <div className="w-16 h-16 rounded-2xl bg-kitan-teal/15 border border-kitan-teal/30 flex items-center justify-center mx-auto">
              <CheckCircle2 size={30} className="text-kitan-teal" />
            </div>
            <div>
              <h2 className="font-display text-2xl font-bold text-kitan-off-white">Your Consignment Order Has Been Received!</h2>
              <p className="text-kitan-muted text-sm mt-3 max-w-xl mx-auto leading-relaxed">
                Thank you for choosing KitanSocialHub. Your order has been successfully received and is now being
                processed by our team.
              </p>
              <p className="text-kitan-muted text-sm mt-2 max-w-xl mx-auto leading-relaxed">
                Please allow up to 24 hours for your video to be prepared and uploaded.
              </p>
              <p className="text-kitan-muted text-sm mt-2 max-w-xl mx-auto leading-relaxed">
                You can return to your account anytime to check your order status and watch your completed video.
              </p>
            </div>

            <div className="rounded-2xl border border-kitan-border bg-kitan-bg/50 p-5 grid grid-cols-2 gap-4 text-left max-w-md mx-auto">
              {[
                { label: 'Order Reference', value: result.requestId, mono: true },
                { label: 'Payment', value: `${formatNGN(result.price)} · Wallet`, ok: true },
                { label: 'Submitted', value: new Date(result.createdAt).toLocaleString() },
                { label: 'Status', value: 'Order Received' },
              ].map(({ label, value, mono, ok }) => (
                <div key={label}>
                  <p className="text-kitan-subtle text-[10px] uppercase tracking-wide">{label}</p>
                  <p className={cn('text-sm break-all', mono ? 'font-mono text-kitan-teal select-all' : ok ? 'text-kitan-teal font-semibold' : 'text-kitan-off-white')}>{value}</p>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap gap-3 justify-center items-center">
              <button onClick={() => navigate('/consignment/orders')} className="btn-primary text-sm flex items-center gap-2">
                <Wallet size={15} /> View My Order
              </button>
              <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn-secondary text-sm flex items-center gap-2">
                <MessageCircle size={15} /> WhatsApp Support
              </a>
            </div>
          </section>
        )}
      </div>

      {/* WhatsApp strip */}
      <section className="rounded-3xl border border-kitan-border bg-kitan-card/50 backdrop-blur-md p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <span className="w-11 h-11 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center flex-shrink-0">
            <MessageCircle size={20} className="text-green-400" />
          </span>
          <p className="text-kitan-muted text-sm max-w-md">
            Have a special consignment request? Contact our team directly on WhatsApp — custom assets,
            bespoke presentations and tailored packages.
          </p>
        </div>
        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="btn-primary text-sm flex items-center gap-2 flex-shrink-0">
          <MessageCircle size={16} /> Chat on WhatsApp
        </a>
      </section>
    </div>
  );
};

export default ConsignmentPage;
