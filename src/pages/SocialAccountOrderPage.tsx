/**
 * SocialAccountOrderPage — Displays order details after a social account purchase.
 *
 * If admin has uploaded notes/account details for this product → show them.
 * If no details are set → show "Contact Support via WhatsApp" button.
 */
import React, { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle, ArrowLeft, Loader2, AlertCircle, MessageSquare,
  Users, ExternalLink, Shield, Copy, Check,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/useStore';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface SocialAccount {
  id: string;
  title: string;
  category: string;
  price: number;
  notes: string;
}

// WhatsApp support number — read from app_settings or fallback
const WHATSAPP_FALLBACK = '2349000000000';

const SocialAccountOrderPage: React.FC = () => {
  const { accountId }     = useParams<{ accountId: string }>();
  const [searchParams]    = useSearchParams();
  const ref               = searchParams.get('ref') || '';
  const navigate          = useNavigate();
  const { user }          = useAuthStore();

  const [account, setAccount] = useState<SocialAccount | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [whatsapp, setWhatsapp] = useState(WHATSAPP_FALLBACK);
  const [copied,   setCopied]   = useState(false);

  useEffect(() => {
    if (!accountId) { setNotFound(true); setLoading(false); return; }
    (async () => {
      const [acctRes, settingsRes] = await Promise.all([
        supabase.from('social_accounts').select('id, title, category, price, notes').eq('id', accountId).single(),
        supabase.from('app_settings').select('value').eq('key', 'whatsapp_number').single(),
      ]);
      if (acctRes.error || !acctRes.data) { setNotFound(true); }
      else { setAccount(acctRes.data as SocialAccount); }
      if (settingsRes.data?.value) setWhatsapp(settingsRes.data.value);
      setLoading(false);
    })();
  }, [accountId]);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <Loader2 size={24} className="text-kitan-teal animate-spin" />
        <span className="text-kitan-muted">Loading order details…</span>
      </div>
    );
  }

  // ── Not found ─────────────────────────────────────────────────────────────
  if (notFound || !account) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <p className="text-kitan-off-white font-semibold mb-3">Order details not found</p>
        <button onClick={() => navigate('/social-accounts')} className="btn-primary">
          Back to Accounts
        </button>
      </div>
    );
  }

  const hasNotes   = account.notes && account.notes.trim().length > 0;
  const waMessage  = encodeURIComponent(
    `Hi, I just purchased "${account.title}" (Ref: ${ref}) on KITAN Social Hub. Please assist me with my order.`
  );
  const waLink     = `https://wa.me/${whatsapp}?text=${waMessage}`;

  return (
    <div className="max-w-xl mx-auto space-y-6">
      {/* Back */}
      <button
        onClick={() => navigate('/social-accounts')}
        className="flex items-center gap-2 text-kitan-muted hover:text-kitan-teal text-sm transition-colors"
      >
        <ArrowLeft size={16} /> Back to Social Accounts
      </button>

      {/* Success header */}
      <div className="card-kitan p-6 text-center space-y-4">
        <div className="w-16 h-16 rounded-full bg-kitan-teal/10 border border-kitan-teal/30 flex items-center justify-center mx-auto">
          <CheckCircle size={32} className="text-kitan-teal" />
        </div>
        <div>
          <h1 className="font-display text-2xl font-bold text-kitan-off-white mb-1">
            Purchase Successful!
          </h1>
          <p className="text-kitan-muted text-sm">
            You've purchased <span className="text-kitan-off-white font-semibold">{account.title}</span>
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 text-kitan-subtle text-xs">
          <span>Order Ref:</span>
          <span className="font-mono text-kitan-muted">{ref}</span>
          <button
            onClick={() => handleCopy(ref)}
            className="p-1 rounded hover:bg-kitan-surface transition-colors"
            title="Copy reference"
          >
            {copied ? <Check size={12} className="text-kitan-teal" /> : <Copy size={12} />}
          </button>
        </div>
      </div>

      {/* Order details */}
      <div className="card-kitan p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-kitan-teal" />
          <h2 className="font-semibold text-kitan-off-white text-sm">Account Details</h2>
        </div>

        {hasNotes ? (
          /* ── Admin has added notes/credentials ── */
          <div className="space-y-3">
            <div className="bg-kitan-bg rounded-2xl border border-kitan-border p-4">
              <p className="text-kitan-subtle text-xs font-semibold uppercase tracking-wide mb-2">
                Access Information
              </p>
              <pre className="text-kitan-off-white text-sm leading-relaxed whitespace-pre-wrap font-mono break-words">
                {account.notes}
              </pre>
            </div>
            <button
              onClick={() => handleCopy(account.notes)}
              className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
            >
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Copied!' : 'Copy All Details'}
            </button>
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
              <Shield size={13} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-amber-400/80 text-xs leading-relaxed">
                Keep your account credentials safe. Do not share them with others.
                Change passwords after purchase for security.
              </p>
            </div>
          </div>
        ) : (
          /* ── No notes yet — show WhatsApp support ── */
          <div className="space-y-4 text-center py-4">
            <div className="w-14 h-14 rounded-2xl bg-green-500/10 border border-green-500/20 flex items-center justify-center mx-auto">
              <MessageSquare size={28} className="text-green-400" />
            </div>
            <div>
              <h3 className="font-semibold text-kitan-off-white mb-1">
                Contact Support for Your Order
              </h3>
              <p className="text-kitan-muted text-sm leading-relaxed">
                Your order has been received. Please contact our support team on WhatsApp
                with your order reference to receive your account details.
              </p>
            </div>
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2.5 w-full py-4 rounded-2xl bg-green-600 hover:bg-green-500 text-white font-bold text-base transition-all shadow-lg"
            >
              <MessageSquare size={20} />
              Contact Support via WhatsApp
              <ExternalLink size={16} />
            </a>
            <p className="text-kitan-subtle text-xs">
              Include your order reference: <span className="font-mono text-kitan-muted">{ref}</span>
            </p>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="card-kitan p-4 space-y-2">
        <p className="text-kitan-subtle text-xs font-semibold uppercase tracking-wide">Order Summary</p>
        <div className="flex justify-between text-sm">
          <span className="text-kitan-muted">Product</span>
          <span className="text-kitan-off-white font-medium">{account.title}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-kitan-muted">Category</span>
          <span className="text-kitan-off-white">{account.category}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-kitan-muted">Amount Paid</span>
          <span className="text-kitan-teal font-bold">
            ₦{account.price.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
          </span>
        </div>
        {user && (
          <div className="flex justify-between text-sm">
            <span className="text-kitan-muted">Account</span>
            <span className="text-kitan-off-white text-xs">{user.email}</span>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button onClick={() => navigate('/social-accounts')} className="btn-secondary flex-1">
          Browse More Accounts
        </button>
        <button onClick={() => navigate('/orders')} className="btn-ghost flex-1">
          Order History
        </button>
      </div>
    </div>
  );
};

export default SocialAccountOrderPage;
