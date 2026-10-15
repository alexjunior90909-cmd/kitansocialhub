/**
 * PaymentFailedPage
 *
 * Dedicated page shown when any payment is:
 * - cancelled by user
 * - declined / failed
 * - abandoned
 * - could not be verified
 *
 * NO product access is granted. User must retry from scratch.
 */
import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { XCircle, Home, ShoppingBag, RefreshCw, MessageCircle } from 'lucide-react';
import { WHATSAPP_URL } from '@/constants';

const PaymentFailedPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const reason = searchParams.get('reason') ?? 'cancelled';
  const txRef = searchParams.get('tx_ref') ?? '';

  const isCancel = reason === 'cancelled';
  const isMismatch = reason === 'mismatch';

  const title = isCancel ? 'Payment Cancelled' : isMismatch ? 'Payment Verification Failed' : 'Payment Unsuccessful';
  const subtitle = isCancel
    ? 'You cancelled the payment. No charge was made.'
    : isMismatch
    ? 'The payment details could not be verified. If money was deducted, please contact admin.'
    : 'Your payment was declined or could not be processed. No charge was made.';

  return (
    <div className="max-w-md mx-auto text-center py-16 space-y-8 animate-fade-in">
      {/* Icon */}
      <div className="w-24 h-24 rounded-full bg-red-500/10 border-2 border-red-500/30 flex items-center justify-center mx-auto">
        <XCircle size={48} className="text-red-400" />
      </div>

      {/* Heading */}
      <div className="space-y-3">
        <h1 className="font-display text-2xl font-bold text-kitan-off-white">{title}</h1>
        <p className="text-kitan-muted leading-relaxed">{subtitle}</p>
        {txRef && (
          <p className="text-kitan-subtle text-xs font-mono">Ref: {txRef}</p>
        )}
      </div>

      {/* Info card */}
      <div className="card-kitan p-5 text-left space-y-3">
        <p className="text-kitan-off-white text-sm font-semibold">No Access Granted</p>
        <ul className="text-kitan-muted text-sm space-y-2">
          <li className="flex items-start gap-2">
            <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            Product has not been unlocked
          </li>
          <li className="flex items-start gap-2">
            <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            No downloads are available
          </li>
          <li className="flex items-start gap-2">
            <XCircle size={14} className="text-red-400 flex-shrink-0 mt-0.5" />
            Form submission has not been activated
          </li>
        </ul>
      </div>

      {/* Actions */}
      <div className="flex flex-col gap-3">
        <button
          onClick={() => navigate(-2)}
          className="btn-primary w-full py-4 flex items-center justify-center gap-2 text-base"
        >
          <RefreshCw size={18} />
          Try Again
        </button>

        <button
          onClick={() => navigate('/gifts')}
          className="btn-secondary w-full flex items-center justify-center gap-2"
        >
          <ShoppingBag size={16} />
          Browse Products
        </button>

        <button
          onClick={() => navigate('/')}
          className="btn-ghost w-full flex items-center justify-center gap-2"
        >
          <Home size={16} />
          Return Home
        </button>
      </div>

      {/* WhatsApp support — only if money may have been deducted */}
      {(isMismatch || reason === 'failed') && (
        <a
          href={`${WHATSAPP_URL}?text=${encodeURIComponent(
            `Hello, I had a payment issue. Ref: ${txRef}. Please help me resolve this.`
          )}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full py-3 px-6 rounded-2xl bg-green-500 hover:bg-green-400 text-white font-bold transition-all"
        >
          <MessageCircle size={16} />
          Contact Admin on WhatsApp
        </a>
      )}

      <p className="text-kitan-subtle text-xs">
        If you believe this is an error or money was deducted, please{' '}
        <a href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer" className="text-kitan-teal underline">
          contact admin
        </a>
        {' '}with your reference number.
      </p>
    </div>
  );
};

export default PaymentFailedPage;
