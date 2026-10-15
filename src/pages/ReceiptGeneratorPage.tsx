/**
 * ReceiptGeneratorPage — Dynamic receipt generator for crypto & payment apps.
 *
 * Features:
 * - Product grid with authentic brand logos/colors
 * - Dynamic form fields loaded from DB per product
 * - Wallet deduction before generation
 * - Live receipt preview with security watermarks
 * - PNG / PDF download via html2canvas
 * - Generation history stored in DB
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Search, Download, Eye, ArrowLeft, Loader2, AlertTriangle,
  CheckCircle, FileText, Clock, Shield, Lock, Zap, ChevronRight,
  RefreshCw, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore, useWalletStore } from '@/stores/useStore';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
interface ReceiptProduct {
  id: string;
  name: string;
  slug: string;
  brandColor: string;
  bgColor: string;
  enabled: boolean;
  sortOrder: number;
}

interface ReceiptField {
  id: string;
  productId: string;
  fieldType: string;
  label: string;
  placeholder: string;
  required: boolean;
  sortOrder: number;
  options: string[];
}

type FormData = Record<string, string>;

// ─────────────────────────────────────────────────────────────────────────────
// Brand logo SVG components — authentic representations
// ─────────────────────────────────────────────────────────────────────────────
const BrandLogo: React.FC<{ slug: string; size?: number }> = ({ slug, size = 48 }) => {
  const s = size;
  switch (slug) {
    case 'binance':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="50" fill="#000000"/>
          <path d="M50 20L60 30L50 40L40 30L50 20Z" fill="#F0B90B"/>
          <path d="M30 40L40 30L50 40L40 50L30 40Z" fill="#F0B90B"/>
          <path d="M60 30L70 40L60 50L50 40L60 30Z" fill="#F0B90B"/>
          <path d="M40 50L50 40L60 50L50 60L40 50Z" fill="#F0B90B"/>
          <path d="M30 40L40 50L30 60L20 50L30 40Z" fill="#F0B90B"/>
          <path d="M60 50L70 40L80 50L70 60L60 50Z" fill="#F0B90B"/>
          <path d="M40 60L50 50L60 60L50 70L40 60Z" fill="#F0B90B"/>
          <path d="M50 70L60 60L70 70L60 80L50 70Z" fill="#F0B90B"/>
          <path d="M30 60L40 70L30 80L20 70L30 60Z" fill="#F0B90B"/>
        </svg>
      );
    case 'cashapp':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#00D64F"/>
          <text x="50" y="62" textAnchor="middle" fill="white" fontSize="52" fontWeight="bold" fontFamily="Arial">$</text>
        </svg>
      );
    case 'coinbase':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#0052FF"/>
          <circle cx="50" cy="50" r="28" fill="white"/>
          <circle cx="50" cy="50" r="16" fill="#0052FF"/>
        </svg>
      );
    case 'trust':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#3375BB"/>
          <path d="M50 20L75 30V55C75 67 63 77 50 82C37 77 25 67 25 55V30L50 20Z" fill="white"/>
          <path d="M50 30L65 37V55C65 63 58 70 50 74C42 70 35 63 35 55V37L50 30Z" fill="#3375BB"/>
          <path d="M43 51L48 56L58 44" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      );
    case 'bybit':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#1A1A2E"/>
          <rect x="15" y="38" width="70" height="10" rx="2" fill="#F7A600"/>
          <text x="50" y="72" textAnchor="middle" fill="#F7A600" fontSize="18" fontWeight="800" fontFamily="Arial">BYBIT</text>
        </svg>
      );
    case 'bitcoin':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <circle cx="50" cy="50" r="50" fill="#F7931A"/>
          <text x="50" y="68" textAnchor="middle" fill="white" fontSize="56" fontWeight="bold" fontFamily="Arial">₿</text>
        </svg>
      );
    case 'okx':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#000000"/>
          <text x="50" y="62" textAnchor="middle" fill="white" fontSize="26" fontWeight="900" fontFamily="Arial">OKX</text>
        </svg>
      );
    case 'roqqu':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#5C2D91"/>
          <text x="50" y="62" textAnchor="middle" fill="white" fontSize="20" fontWeight="800" fontFamily="Arial">ROQQU</text>
        </svg>
      );
    case 'gcash':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#007DFF"/>
          <text x="50" y="56" textAnchor="middle" fill="white" fontSize="22" fontWeight="700" fontFamily="Arial">GCash</text>
        </svg>
      );
    case 'zelle':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#6D1ED4"/>
          <path d="M25 35H75L35 65H75" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
        </svg>
      );
    case 'paypal':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#003087"/>
          <path d="M35 25H58C68 25 74 31 72 42C70 53 62 59 52 59H44L41 75H30L35 25Z" fill="#009cde"/>
          <path d="M40 32H62C70 32 75 37 73 47C71 57 63 62 54 62H46L43 78H32L40 32Z" fill="white" opacity="0.3"/>
        </svg>
      );
    case 'venmo':
      return (
        <svg width={s} height={s} viewBox="0 0 100 100" fill="none">
          <rect width="100" height="100" rx="22" fill="#3D95CE"/>
          <path d="M30 28H50C50 28 65 45 58 72H45C51 52 42 40 35 28H30Z" fill="white"/>
          <path d="M55 28H70L58 72H44C50 52 42 40 35 28" fill="white" opacity="0.5"/>
        </svg>
      );
    default:
      return (
        <div className="rounded-2xl bg-kitan-surface border border-kitan-border flex items-center justify-center" style={{ width: s, height: s }}>
          <FileText size={s * 0.4} className="text-kitan-muted" />
        </div>
      );
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Receipt Preview Component
// ─────────────────────────────────────────────────────────────────────────────
const ReceiptPreview = React.forwardRef<HTMLDivElement, {
  product: ReceiptProduct;
  fields: ReceiptField[];
  formData: FormData;
  receiptId: string;
}>(({ product, fields, formData, receiptId }, ref) => {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  const txnId = formData['Transaction ID'] || formData['transaction_id'] ||
    `TXN${Math.random().toString(36).toUpperCase().slice(2, 12)}${Date.now().toString(36).toUpperCase()}`;

  return (
    <div
      ref={ref}
      style={{
        width: '420px',
        minHeight: '600px',
        background: '#ffffff',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '0px',
      }}
    >
      {/* Watermark pattern */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `repeating-linear-gradient(
          45deg,
          transparent,
          transparent 40px,
          rgba(0,0,0,0.012) 40px,
          rgba(0,0,0,0.012) 80px
        )`,
        pointerEvents: 'none',
        zIndex: 0,
      }}/>

      {/* Header band */}
      <div style={{
        background: product.bgColor,
        padding: '24px 28px 20px',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Security strip */}
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: '4px',
          background: 'repeating-linear-gradient(90deg, rgba(255,255,255,0.4) 0px, rgba(255,255,255,0.4) 8px, transparent 8px, transparent 16px)',
        }}/>

        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{
            width: '54px',
            height: '54px',
            borderRadius: '12px',
            overflow: 'hidden',
            flexShrink: 0,
            background: 'rgba(255,255,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <BrandLogo slug={product.slug} size={54} />
          </div>
          <div>
            <div style={{ color: '#ffffff', fontSize: '20px', fontWeight: 700, lineHeight: 1.2 }}>
              {product.name}
            </div>
            <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: '11px', marginTop: '2px', letterSpacing: '0.5px' }}>
              TRANSACTION RECEIPT
            </div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '9px', letterSpacing: '1px' }}>VERIFIED</div>
            <div style={{
              width: '22px', height: '22px', borderRadius: '50%',
              border: '2px solid rgba(255,255,255,0.5)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              marginLeft: 'auto', marginTop: '2px',
            }}>
              <span style={{ color: 'rgba(255,255,255,0.8)', fontSize: '12px' }}>✓</span>
            </div>
          </div>
        </div>

        {/* Status banner */}
        <div style={{
          marginTop: '16px',
          background: 'rgba(255,255,255,0.15)',
          borderRadius: '8px',
          padding: '8px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80', flexShrink: 0 }}/>
          <span style={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}>Transaction Successful</span>
          <span style={{ marginLeft: 'auto', color: 'rgba(255,255,255,0.7)', fontSize: '11px' }}>{dateStr}</span>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '0 28px', position: 'relative', zIndex: 1 }}>
        {/* Transaction ID bar */}
        <div style={{
          background: '#f8fafc',
          borderLeft: `4px solid ${product.brandColor}`,
          padding: '10px 14px',
          margin: '16px 0',
          borderRadius: '0 6px 6px 0',
        }}>
          <div style={{ fontSize: '9px', color: '#64748b', letterSpacing: '1px', fontWeight: 600 }}>
            TRANSACTION ID
          </div>
          <div style={{ fontSize: '12px', color: '#1e293b', fontWeight: 700, fontFamily: 'monospace', marginTop: '2px', letterSpacing: '0.5px' }}>
            {txnId}
          </div>
        </div>

        {/* Field rows */}
        {fields
          .filter(f => f.fieldType !== 'datetime' && f.label.toLowerCase() !== 'transaction id')
          .map((field, i) => {
          const val = formData[field.label] || formData[field.id] || '—';
          return (
            <div key={field.id} style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              padding: '10px 0',
              borderBottom: i < fields.length - 2 ? '1px solid #f1f5f9' : 'none',
              gap: '12px',
            }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500, flexShrink: 0 }}>
                {field.label}
              </span>
              <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 600, textAlign: 'right', wordBreak: 'break-all' }}>
                {field.fieldType === 'currency' && val !== '—'
                  ? `${formData['Currency'] || 'USD'} ${parseFloat(val || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                  : val}
              </span>
            </div>
          );
        })}

        {/* Date/time special row */}
        {fields.find(f => f.fieldType === 'datetime') && (
          <div style={{ padding: '10px 0', borderTop: '1px solid #f1f5f9' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Date</span>
              <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 600 }}>
                {formData['Date & Time'] || formData['date_time'] || dateStr}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '6px' }}>
              <span style={{ fontSize: '12px', color: '#64748b', fontWeight: 500 }}>Time</span>
              <span style={{ fontSize: '12px', color: '#1e293b', fontWeight: 600 }}>{timeStr} UTC</span>
            </div>
          </div>
        )}

        {/* Security features strip */}
        <div style={{
          marginTop: '20px',
          background: '#f8fafc',
          borderRadius: '8px',
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
        }}>
          <span style={{ fontSize: '9px', color: '#94a3b8', letterSpacing: '1px' }}>🔒</span>
          <span style={{ fontSize: '9px', color: '#94a3b8', letterSpacing: '0.5px' }}>
            SSL SECURED · SHA-256 · TLS 1.3 · ENCRYPTED END-TO-END
          </span>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        background: '#f8fafc',
        borderTop: '1px solid #e2e8f0',
        padding: '14px 28px',
        marginTop: '16px',
        position: 'relative',
        zIndex: 1,
      }}>
        {/* Microprint security line */}
        <div style={{
          fontSize: '6px',
          color: '#cbd5e1',
          letterSpacing: '1px',
          textAlign: 'center',
          marginBottom: '8px',
          fontFamily: 'monospace',
        }}>
          {Array(6).fill(`${product.name.toUpperCase()} AUTHORIZED TRANSACTION DOCUMENT `).join('')}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: '10px', color: '#94a3b8' }}>
            Generated: {dateStr} {timeStr}
          </div>
          <div style={{
            fontSize: '9px',
            color: '#94a3b8',
            background: 'white',
            border: '1px solid #e2e8f0',
            borderRadius: '4px',
            padding: '2px 6px',
            fontFamily: 'monospace',
          }}>
            {receiptId.slice(0, 12).toUpperCase()}
          </div>
        </div>
        {/* Barcode-like element */}
        <div style={{ display: 'flex', gap: '1px', marginTop: '8px', height: '20px', overflow: 'hidden' }}>
          {Array.from({ length: 60 }).map((_, i) => (
            <div key={i} style={{
              width: Math.random() > 0.5 ? '2px' : '1px',
              height: '100%',
              background: `rgba(0,0,0,${0.1 + Math.random() * 0.5})`,
              flexShrink: 0,
            }}/>
          ))}
        </div>
      </div>
    </div>
  );
});
ReceiptPreview.displayName = 'ReceiptPreview';

// ─────────────────────────────────────────────────────────────────────────────
// Field renderer
// ─────────────────────────────────────────────────────────────────────────────
const FieldInput: React.FC<{
  field: ReceiptField;
  value: string;
  onChange: (val: string) => void;
}> = ({ field, value, onChange }) => {
  const base = 'input-kitan text-sm';

  if (field.fieldType === 'dropdown' && field.options.length > 0) {
    return (
      <select className={base} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{field.placeholder || 'Select…'}</option>
        {field.fieldType === 'dropdown' && field.label.toLowerCase().includes('currency')
          ? ['USD', 'EUR', 'GBP', 'USDT', 'BTC', 'ETH', 'BNB', 'NGN'].map(c => (
              <option key={c} value={c}>{c}</option>
            ))
          : field.options.map(o => <option key={o} value={o}>{o}</option>)
        }
      </select>
    );
  }

  if (field.fieldType === 'dropdown') {
    // currency dropdown fallback
    return (
      <select className={base} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">Select currency</option>
        {['USD', 'EUR', 'GBP', 'USDT', 'BTC', 'ETH', 'BNB', 'NGN', 'AUD', 'CAD'].map(c => (
          <option key={c} value={c}>{c}</option>
        ))}
      </select>
    );
  }

  if (field.fieldType === 'datetime') {
    return (
      <input
        type="datetime-local"
        className={base}
        value={value}
        onChange={e => onChange(e.target.value)}
      />
    );
  }

  if (field.fieldType === 'date') {
    return <input type="date" className={base} value={value} onChange={e => onChange(e.target.value)} />;
  }

  if (field.fieldType === 'time') {
    return <input type="time" className={base} value={value} onChange={e => onChange(e.target.value)} />;
  }

  if (field.fieldType === 'currency' || field.fieldType === 'number') {
    return (
      <input type="number" step="0.01" min="0" className={base} placeholder={field.placeholder || '0.00'}
        value={value} onChange={e => onChange(e.target.value)} />
    );
  }

  if (field.fieldType === 'textarea') {
    return (
      <textarea className={cn(base, 'resize-none')} rows={3} placeholder={field.placeholder}
        value={value} onChange={e => onChange(e.target.value)} />
    );
  }

  return (
    <input type="text" className={base} placeholder={field.placeholder || field.label}
      value={value} onChange={e => onChange(e.target.value)} />
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
const ReceiptGeneratorPage: React.FC = () => {
  const navigate   = useNavigate();
  const { user }   = useAuthStore();
  const { wallet, loadWallet, refreshBalance } = useWalletStore();

  const [products,       setProducts]       = useState<ReceiptProduct[]>([]);
  const [fields,         setFields]         = useState<ReceiptField[]>([]);
  const [price,          setPrice]          = useState(2500);
  const [loading,        setLoading]        = useState(true);
  const [search,         setSearch]         = useState('');
  const [selectedProduct, setSelectedProduct] = useState<ReceiptProduct | null>(null);
  const [formData,       setFormData]       = useState<FormData>({});
  const [generating,     setGenerating]     = useState(false);
  const [generated,      setGenerated]      = useState(false);
  const [receiptId,      setReceiptId]      = useState('');
  const [downloading,    setDownloading]    = useState(false);
  const [step,           setStep]           = useState<'grid' | 'form' | 'preview'>('grid');
  const [fieldsLoading,  setFieldsLoading]  = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);

  // Load products + price on mount
  useEffect(() => {
    loadData();
    if (user) loadWallet(user.id);
  }, [user]);

  async function loadData() {
    setLoading(true);
    const [prodRes, settingsRes] = await Promise.all([
      supabase.from('receipt_products').select('*').eq('enabled', true).order('sort_order'),
      supabase.from('receipt_settings').select('price_ngn').eq('id', 1).single(),
    ]);
    if (prodRes.data) {
      setProducts(prodRes.data.map(r => ({
        id: r.id,
        name: r.name,
        slug: r.slug,
        brandColor: r.brand_color,
        bgColor: r.bg_color,
        enabled: r.enabled,
        sortOrder: r.sort_order,
      })));
    }
    if (settingsRes.data) setPrice(Number(settingsRes.data.price_ngn));
    setLoading(false);
  }

  async function loadFields(productId: string) {
    setFieldsLoading(true);
    const { data } = await supabase
      .from('receipt_fields')
      .select('*')
      .eq('product_id', productId)
      .order('sort_order');
    setFields((data || []).map(r => ({
      id: r.id,
      productId: r.product_id,
      fieldType: r.field_type,
      label: r.label,
      placeholder: r.placeholder || '',
      required: r.required,
      sortOrder: r.sort_order,
      options: (r.options as string[]) || [],
    })));
    setFieldsLoading(false);
  }

  function handleSelectProduct(product: ReceiptProduct) {
    setSelectedProduct(product);
    setFormData({});
    setGenerated(false);
    setReceiptId('');
    setStep('form');
    loadFields(product.id);
  }

  const filteredProducts = useMemo(() =>
    products.filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase())),
    [products, search],
  );

  // Check balance
  const canAfford = !wallet || wallet.balance >= price;

  async function handleGenerate() {
    if (!user) { navigate('/login'); return; }
    if (!selectedProduct) return;

    // Validate required fields
    const missing = fields.filter(f => f.required && !formData[f.label]?.trim());
    if (missing.length > 0) {
      toast.error(`Please fill in: ${missing.map(f => f.label).join(', ')}`);
      return;
    }

    const balance = wallet?.balance ?? 0;
    if (balance < price) {
      toast.error(`Insufficient funds. Need ${formatNGN(price)}, have ${formatNGN(balance)}.`);
      navigate(`/wallet?need=${price}`);
      return;
    }

    setGenerating(true);
    try {
      // Deduct wallet
      const { data: walletRow } = await supabase.from('wallets').select('balance').eq('app_user_id', user.id).single();
      const current = walletRow ? Number(walletRow.balance) : 0;
      const newBal  = current - price;
      await supabase.from('wallets').update({ balance: newBal, updated_at: new Date().toISOString() }).eq('app_user_id', user.id);

      const txId = `wt_rcpt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      await supabase.from('wallet_transactions').insert({
        id: txId, app_user_id: user.id, type: 'deduction', amount: price,
        balance_after: newBal, description: `Receipt Generator — ${selectedProduct.name}`,
        reference: `receipt_${Date.now()}`, status: 'completed',
      });

      // Save generation record
      const genId = `rcpt_${Date.now()}_${Math.random().toString(36).slice(2,7)}`;
      await supabase.from('receipt_generations').insert({
        id: genId, app_user_id: user.id, product_id: selectedProduct.id,
        product_name: selectedProduct.name, form_data: formData, amount_ngn: price,
      });

      setReceiptId(genId);
      await refreshBalance(user.id);
      setGenerated(true);
      setStep('preview');
      toast.success('Receipt generated! Download below.');
    } catch (e) {
      toast.error(`Generation failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setGenerating(false);
    }
  }

  async function handleDownloadPNG() {
    if (!previewRef.current) return;
    setDownloading(true);
    try {
      // Dynamic import of html2canvas
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(previewRef.current, {
        scale: 3,
        useCORS: true,
        backgroundColor: '#ffffff',
        logging: false,
      });
      const link = document.createElement('a');
      link.download = `${selectedProduct?.name ?? 'receipt'}_${receiptId.slice(0,10)}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      toast.success('Receipt downloaded as PNG!');
    } catch {
      toast.error('PNG download failed. Try again.');
    } finally {
      setDownloading(false);
    }
  }

  async function handleDownloadPDF() {
    if (!previewRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const { jsPDF } = await import('jspdf');
      const canvas = await html2canvas(previewRef.current, { scale: 3, useCORS: true, backgroundColor: '#ffffff', logging: false });
      const imgData = canvas.toDataURL('image/png');
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [420, canvas.height / 3] });
      pdf.addImage(imgData, 'PNG', 0, 0, 420, canvas.height / 3);
      pdf.save(`${selectedProduct?.name ?? 'receipt'}_${receiptId.slice(0,10)}.pdf`);
      toast.success('Receipt downloaded as PDF!');
    } catch {
      toast.error('PDF download failed. Try PNG instead.');
    } finally {
      setDownloading(false);
    }
  }

  // ── STEP: PRODUCT GRID ───────────────────────────────────────────────────
  if (step === 'grid') {
    return (
      <div className="space-y-6 pb-10 max-w-4xl mx-auto">
        {/* Hero */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-kitan-surface to-kitan-card border border-kitan-border p-8">
          <div className="hero-glow top-[-80px] right-[-80px] opacity-20" />
          <div className="relative z-10">
            <div className="badge-teal inline-flex items-center gap-2 mb-4">
              <FileText size={12} /> Receipt Generator
            </div>
            <h1 className="font-display text-3xl md:text-4xl font-bold text-kitan-off-white mb-3">
              Generate <span className="gradient-text">Receipts</span>
            </h1>
            <p className="text-kitan-muted max-w-xl leading-relaxed mb-4">
              Generate sample transaction receipts for Binance, Cash App, PayPal and more.
              Each generation costs <strong className="text-kitan-teal">{formatNGN(price)}</strong> from your wallet.
            </p>
            {user && wallet && (
              <div className="inline-flex items-center gap-2 bg-kitan-teal/10 border border-kitan-teal/20 rounded-xl px-4 py-2">
                <Zap size={14} className="text-kitan-teal" />
                <span className="text-sm text-kitan-off-white">
                  Balance: <span className="text-kitan-teal font-bold">{formatNGN(wallet.balance)}</span>
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" />
          <input
            type="text"
            placeholder="Search platforms (Binance, PayPal, Zelle…)"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-kitan pl-9 text-sm"
          />
        </div>

        {/* Product grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="card-kitan p-6 animate-pulse flex flex-col items-center gap-3">
                <div className="w-14 h-14 rounded-2xl bg-kitan-border/30" />
                <div className="h-3 w-20 bg-kitan-border/20 rounded" />
              </div>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="card-kitan p-16 text-center">
            <Search size={40} className="text-kitan-subtle mx-auto mb-3" />
            <p className="text-kitan-off-white font-semibold">No platforms found</p>
            <p className="text-kitan-muted text-sm mt-1">Try a different search term</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {filteredProducts.map(product => (
              <button
                key={product.id}
                onClick={() => handleSelectProduct(product)}
                className="card-kitan p-5 flex flex-col items-center gap-3 hover:border-kitan-teal/40 hover:bg-kitan-surface/80 active:scale-[0.97] transition-all group text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-kitan-teal/50"
              >
                <div className="transform group-hover:scale-105 transition-transform">
                  <BrandLogo slug={product.slug} size={56} />
                </div>
                <div>
                  <p className="text-kitan-off-white font-semibold text-sm">{product.name}</p>
                  <p className="text-kitan-subtle text-xs mt-0.5 flex items-center justify-center gap-1">
                    <ChevronRight size={10} /> Generate
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Price note */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-kitan-surface border border-kitan-border">
          <Shield size={15} className="text-kitan-teal flex-shrink-0 mt-0.5" />
          <p className="text-kitan-muted text-sm leading-relaxed">
            Each generated receipt costs <strong className="text-kitan-teal">{formatNGN(price)}</strong>.
            Receipts are for educational and sample purposes only. Funds are deducted from your wallet at the time of generation.
          </p>
        </div>
      </div>
    );
  }

  // ── STEP: FORM ───────────────────────────────────────────────────────────
  if (step === 'form' && selectedProduct) {
    return (
      <div className="max-w-lg mx-auto space-y-6 pb-10 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => setStep('grid')}
          className="flex items-center gap-2 text-kitan-muted hover:text-kitan-off-white text-sm font-medium transition-colors -ml-1"
        >
          <ArrowLeft size={15} /> Back to Products
        </button>

        {/* Product header */}
        <div className="card-kitan p-5 flex items-center gap-4">
          <BrandLogo slug={selectedProduct.slug} size={52} />
          <div>
            <h2 className="font-display font-bold text-kitan-off-white text-xl">{selectedProduct.name}</h2>
            <p className="text-kitan-muted text-sm mt-0.5">Fill in the transaction details below</p>
          </div>
          <div className="ml-auto text-right flex-shrink-0">
            <p className="text-kitan-teal font-bold text-sm">{formatNGN(price)}</p>
            <p className="text-kitan-subtle text-xs">per receipt</p>
          </div>
        </div>

        {/* Form */}
        <div className="card-kitan p-6 space-y-4">
          <h3 className="font-semibold text-kitan-off-white text-sm flex items-center gap-2">
            <FileText size={15} className="text-kitan-teal" />
            Transaction Details
          </h3>

          {fieldsLoading ? (
            <div className="flex items-center gap-3 py-4">
              <Loader2 size={16} className="text-kitan-teal animate-spin" />
              <span className="text-kitan-muted text-sm">Loading form…</span>
            </div>
          ) : fields.length === 0 ? (
            <p className="text-kitan-muted text-sm">No fields configured for this product.</p>
          ) : (
            fields.map(field => (
              <div key={field.id} className="space-y-1.5">
                <label className="text-kitan-muted text-xs font-semibold flex items-center gap-1">
                  {field.label}
                  {field.required && <span className="text-red-400">*</span>}
                </label>
                <FieldInput
                  field={field}
                  value={formData[field.label] || ''}
                  onChange={val => setFormData(prev => ({ ...prev, [field.label]: val }))}
                />
              </div>
            ))
          )}
        </div>

        {/* Balance check */}
        {wallet && !canAfford && (
          <div className="flex items-center gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/30">
            <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
            <div className="flex-1">
              <p className="text-red-300 font-semibold text-sm">Insufficient Balance</p>
              <p className="text-red-400/70 text-xs mt-0.5">
                Need <strong>{formatNGN(price - wallet.balance)}</strong> more.
              </p>
            </div>
            <button onClick={() => navigate(`/wallet?need=${price}`)} className="text-xs text-red-300 font-semibold underline hover:no-underline flex-shrink-0">
              Top Up
            </button>
          </div>
        )}

        {/* Generate CTA */}
        <button
          onClick={handleGenerate}
          disabled={generating || fieldsLoading || !canAfford || fields.length === 0}
          className="btn-primary w-full py-4 flex items-center justify-center gap-2 text-base font-bold disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {generating
            ? <><Loader2 size={18} className="animate-spin" /> Generating Receipt…</>
            : <><Zap size={18} /> Generate Receipt — {formatNGN(price)}</>}
        </button>

        <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-kitan-surface border border-kitan-border">
          <Lock size={13} className="text-kitan-teal flex-shrink-0 mt-0.5" />
          <p className="text-kitan-subtle text-xs leading-relaxed">
            {formatNGN(price)} will be deducted from your wallet. Generated receipts are sample documents for educational use only.
          </p>
        </div>
      </div>
    );
  }

  // ── STEP: PREVIEW ────────────────────────────────────────────────────────
  if (step === 'preview' && selectedProduct && generated) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 pb-10 animate-fade-in">
        {/* Back */}
        <button
          onClick={() => setStep('grid')}
          className="flex items-center gap-2 text-kitan-muted hover:text-kitan-off-white text-sm font-medium transition-colors -ml-1"
        >
          <ArrowLeft size={15} /> Generate Another
        </button>

        {/* Success banner */}
        <div className="flex items-center gap-3 p-4 rounded-2xl bg-green-500/10 border border-green-500/30">
          <CheckCircle size={18} className="text-green-400 flex-shrink-0" />
          <div>
            <p className="text-green-300 font-semibold text-sm">Receipt Generated Successfully!</p>
            <p className="text-green-400/70 text-xs mt-0.5">{formatNGN(price)} deducted from your wallet.</p>
          </div>
        </div>

        {/* Download buttons */}
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDownloadPNG}
            disabled={downloading}
            className="btn-primary flex items-center gap-2 text-sm flex-1 justify-center py-3"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Download PNG
          </button>
          <button
            onClick={handleDownloadPDF}
            disabled={downloading}
            className="btn-secondary flex items-center gap-2 text-sm flex-1 justify-center py-3"
          >
            {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
            Download PDF
          </button>
        </div>

        {/* Receipt preview */}
        <div className="card-kitan p-4 overflow-x-auto">
          <p className="text-kitan-muted text-xs mb-4 flex items-center gap-2">
            <Eye size={12} /> Receipt Preview
          </p>
          <div className="flex justify-center">
            <div className="shadow-2xl rounded-sm overflow-hidden" style={{ maxWidth: '420px', width: '100%' }}>
              <ReceiptPreview
                ref={previewRef}
                product={selectedProduct}
                fields={fields}
                formData={formData}
                receiptId={receiptId}
              />
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/5 border border-amber-500/20">
          <Shield size={14} className="text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-amber-400/80 text-xs leading-relaxed">
            This is a sample/educational receipt generated for demonstration purposes only.
            It does not represent a real transaction.
          </p>
        </div>
      </div>
    );
  }

  return null;
};

export default ReceiptGeneratorPage;
