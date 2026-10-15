/**
 * PaymentReturnPage
 *
 * Handles Flutterwave's post-payment redirect.
 * URL: /payment/return?status=successful&tx_ref=KIT-WOR-...&transaction_id=12345
 *
 * Flow:
 *  1. Extract query params from URL
 *  2. Call flw-verify edge function with txRef + transactionId
 *  3. On success → redirect to product-specific page
 *  4. On failure → show error with support link
 */
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  CheckCircle, XCircle, Loader2, MessageCircle, ArrowRight, RefreshCw
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { WHATSAPP_URL } from '@/constants';
import { toast } from 'sonner';

type VerifyState = 'verifying' | 'success' | 'failed' | 'cancelled';

const PaymentReturnPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const status = searchParams.get('status') ?? '';         // FLW: 'successful' | 'failed' | 'cancelled'
  const txRef = searchParams.get('tx_ref') ?? '';
  const transactionId = searchParams.get('transaction_id') ?? '';

  const [state, setState] = useState<VerifyState>('verifying');
  const [message, setMessage] = useState('');
  const [redirectPath, setRedirectPath] = useState('');
  const [productType, setProductType] = useState('');
  const [countdown, setCountdown] = useState(5);

  const verify = useCallback(async () => {
    setState('verifying');

    // Immediate redirect for cancelled/failed — NEVER grant access
    if (status === 'cancelled' || status === 'failed') {
      navigate(`/payment/failed?reason=${status}&tx_ref=${encodeURIComponent(txRef)}`, { replace: true });
      return;
    }

    if (!txRef || !transactionId) {
      setState('failed');
      setMessage('Missing payment reference. Please contact support.');
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('flw-verify', {
        body: { txRef, transactionId },
      });

      let errorMsg = '';
      if (error) {
        if (error instanceof FunctionsHttpError) {
          try { errorMsg = await error.context.text(); } catch { errorMsg = error.message; }
        } else {
          errorMsg = error.message;
        }
      }

      if (errorMsg || !data?.success) {
        console.error('[payment-return] Verify failed:', errorMsg || data?.message);
        // Redirect to dedicated failed page — never grant access
        const reason = data?.reason || 'failed';
        navigate(`/payment/failed?reason=${reason}&tx_ref=${encodeURIComponent(txRef)}`, { replace: true });
        return;
      }

      // For document purchases: set sessionStorage flag so DocumentDetailPage
      // can unlock the form without relying on insecure URL parameters.
      if (data.productType === 'document' && data.productId) {
        sessionStorage.setItem('verifiedDocId', data.productId);
      }

      // Wallet top-up: balance has been credited server-side.
      // Redirect to /wallet?topup=success immediately.
      if (data.productType === 'wallet_topup') {
        navigate('/wallet?topup=success', { replace: true });
        return;
      }

      // Success
      setRedirectPath(data.redirectPath);
      setProductType(data.productType);
      setState('success');
      toast.success('Payment verified! Redirecting to your order...');
    } catch (err) {
      console.error('[payment-return] Unexpected error:', err);
      setState('failed');
      setMessage('An unexpected error occurred during verification.');
    }
  }, [txRef, transactionId, status]);

  useEffect(() => {
    verify();
  }, [verify]);

  // Auto-redirect countdown after success
  useEffect(() => {
    if (state !== 'success' || !redirectPath) return;
    if (countdown <= 0) {
      navigate(redirectPath, { replace: true });
      return;
    }
    const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [state, redirectPath, countdown, navigate]);

  // =================== VERIFYING ===================
  if (state === 'verifying') {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center gap-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-kitan-teal/10 border border-kitan-teal/20 flex items-center justify-center">
          <Loader2 size={36} className="text-kitan-teal animate-spin" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="font-display text-xl font-bold text-kitan-off-white">Verifying Payment</h2>
          <p className="text-kitan-muted text-sm">Confirming your transaction with Flutterwave...</p>
          <p className="text-kitan-subtle text-xs font-mono">Ref: {txRef || '—'}</p>
        </div>
        <div className="flex gap-1">
          {[0, 1, 2].map(i => (
            <div
              key={i}
              className="w-2 h-2 rounded-full bg-kitan-teal animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    );
  }

  // =================== SUCCESS ===================
  if (state === 'success') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-6 animate-fade-in">
        <div className="w-24 h-24 rounded-full bg-kitan-teal/10 border-2 border-kitan-teal flex items-center justify-center mx-auto shadow-teal-glow">
          <CheckCircle size={44} className="text-kitan-teal" />
        </div>

        <div className="space-y-2">
          <h2 className="font-display text-2xl font-bold text-kitan-off-white">Payment Successful!</h2>
          <p className="text-kitan-muted leading-relaxed">
            Your payment has been verified and your order is ready.
          </p>
          <p className="text-kitan-subtle text-xs font-mono">Ref: {txRef}</p>
        </div>

        <div className="card-kitan p-5 text-left space-y-3">
          <div className="flex items-center gap-3">
            <CheckCircle size={16} className="text-kitan-teal flex-shrink-0" />
            <span className="text-kitan-off-white text-sm">Payment verified with Flutterwave</span>
          </div>
          <div className="flex items-center gap-3">
            <CheckCircle size={16} className="text-kitan-teal flex-shrink-0" />
            <span className="text-kitan-off-white text-sm">Order access granted</span>
          </div>
          {(productType === 'working_picture' || productType === 'format') && (
            <div className="flex items-center gap-3">
              <CheckCircle size={16} className="text-kitan-teal flex-shrink-0" />
              <span className="text-kitan-off-white text-sm">Download access unlocked</span>
            </div>
          )}
          {productType === 'wallet_topup' && (
            <div className="flex items-center gap-3">
              <CheckCircle size={16} className="text-kitan-teal flex-shrink-0" />
              <span className="text-kitan-off-white text-sm">Wallet balance credited</span>
            </div>
          )}
        </div>

        <button
          onClick={() => navigate(redirectPath, { replace: true })}
          className="btn-primary w-full py-4 flex items-center justify-center gap-2 text-base"
        >
          <ArrowRight size={18} />
          View My Order
          <span className="ml-1 text-white/70 text-sm">({countdown}s)</span>
        </button>

        <a
          href={`${WHATSAPP_URL}?text=${encodeURIComponent('Hello, I just completed a payment. Ref: ' + txRef)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-2xl bg-green-500/10 border border-green-500/30 text-green-400 hover:bg-green-500/20 font-semibold text-sm transition-all"
        >
          <MessageCircle size={16} /> Message Admin on WhatsApp
        </a>
      </div>
    );
  }

  // =================== CANCELLED ===================
  if (state === 'cancelled') {
    return (
      <div className="max-w-md mx-auto text-center py-16 space-y-6 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mx-auto">
          <XCircle size={36} className="text-amber-400" />
        </div>
        <div className="space-y-2">
          <h2 className="font-display text-xl font-bold text-kitan-off-white">Payment Cancelled</h2>
          <p className="text-kitan-muted">{message}</p>
        </div>
        <div className="flex flex-col gap-3">
          <button onClick={() => navigate(-1)} className="btn-primary w-full">
            Try Again
          </button>
          <button onClick={() => navigate('/')} className="btn-secondary w-full">
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  // =================== FAILED ===================
  return (
    <div className="max-w-md mx-auto text-center py-16 space-y-6 animate-fade-in">
      <div className="w-20 h-20 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto">
        <XCircle size={36} className="text-red-400" />
      </div>
      <div className="space-y-2">
        <h2 className="font-display text-xl font-bold text-kitan-off-white">Verification Failed</h2>
        <p className="text-kitan-muted leading-relaxed text-sm">{message}</p>
        <p className="text-kitan-subtle text-xs font-mono">Ref: {txRef || 'N/A'}</p>
      </div>

      <div className="card-kitan p-4 text-left space-y-2">
        <p className="text-kitan-off-white text-sm font-semibold">What to do:</p>
        <ul className="text-kitan-muted text-xs space-y-1.5">
          <li>• If money was deducted, contact admin with your reference number</li>
          <li>• If no money was deducted, you can try again</li>
          <li>• Payments are auto-reconciled within 24 hours</li>
        </ul>
      </div>

      <div className="flex flex-col gap-3">
        <button
          onClick={verify}
          className="btn-primary w-full flex items-center justify-center gap-2"
        >
          <RefreshCw size={16} /> Retry Verification
        </button>
        <a
          href={`${WHATSAPP_URL}?text=${encodeURIComponent('Hello, my payment failed or could not be verified. Reference: ' + txRef + '. Transaction ID: ' + transactionId)}`}
          target="_blank" rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-2xl bg-green-500 hover:bg-green-400 text-white font-bold transition-all"
        >
          <MessageCircle size={16} /> Contact Admin on WhatsApp
        </a>
        <button onClick={() => navigate('/')} className="btn-secondary w-full">Back to Home</button>
      </div>
    </div>
  );
};

export default PaymentReturnPage;
