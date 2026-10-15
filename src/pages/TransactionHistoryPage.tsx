/**
 * TransactionHistoryPage — Payment History
 *
 * Shows all the user's Flutterwave payment records from the `payments` DB table.
 * Clicking a payment row navigates directly to the purchased product/order.
 *
 * NGN-only display. No USD conversion.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CreditCard, CheckCircle, Clock, XCircle, Search,
  ArrowRight, RefreshCw, ShoppingBag
} from 'lucide-react';
import { useAuthStore } from '@/stores/useStore';
import { dbPayments } from '@/lib/db';
import type { Payment } from '@/types';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

/** Build the navigation path for a payment's product type */
function getPaymentRedirectPath(payment: Payment): string | null {
  switch (payment.productType) {
    case 'working_picture':
      return `/order-content/working_picture/${payment.productId}`;
    case 'format':
      return `/order-content/format/${payment.productId}`;
    case 'document':
      return `/documents/${payment.productId}?paid=1`;
    case 'gift':
      return `/orders`;
    default:
      return null;
  }
}

function statusIcon(status: string) {
  if (status === 'successful') return <CheckCircle size={16} className="text-kitan-teal" />;
  if (status === 'pending') return <Clock size={16} className="text-amber-400" />;
  return <XCircle size={16} className="text-red-400" />;
}

function statusClass(status: string): string {
  if (status === 'successful') return 'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30';
  if (status === 'pending') return 'bg-amber-500/10 text-amber-400 border-amber-400/30';
  return 'bg-red-500/10 text-red-400 border-red-500/30';
}

function productTypeLabel(type: string): string {
  switch (type) {
    case 'working_picture': return 'Working Picture';
    case 'format': return 'Format / Template';
    case 'document': return 'Document';
    case 'gift': return 'Gift Order';
    default: return type;
  }
}

const TransactionHistoryPage: React.FC = () => {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'successful' | 'pending' | 'failed'>('all');
  const [search, setSearch] = useState('');

  const loadPayments = async () => {
    if (!user) return;
    setLoading(true);
    const data = await dbPayments.getByUser(user.id);
    setPayments(data);
    setLoading(false);
  };

  useEffect(() => {
    loadPayments();
  }, [user?.id]);

  if (!user) {
    return (
      <div className="text-center py-20">
        <CreditCard size={48} className="text-kitan-subtle mx-auto mb-4" />
        <p className="text-kitan-muted">Please sign in to view your payment history.</p>
      </div>
    );
  }

  const filtered = payments.filter(p => {
    const matchesFilter =
      filter === 'all' ? true :
      filter === 'failed' ? (p.paymentStatus === 'failed' || p.paymentStatus === 'cancelled') :
      p.paymentStatus === filter;
    const matchesSearch =
      !search ||
      p.txRef.toLowerCase().includes(search.toLowerCase()) ||
      productTypeLabel(p.productType).toLowerCase().includes(search.toLowerCase()) ||
      (p.flwTransactionId || '').includes(search);
    return matchesFilter && matchesSearch;
  });

  const totalPaid = payments
    .filter(p => p.paymentStatus === 'successful')
    .reduce((s, p) => s + p.amountNGN, 0);

  const handlePaymentClick = (payment: Payment) => {
    if (payment.paymentStatus !== 'successful') {
      toast.info('Only successful payments have accessible order content.');
      return;
    }
    const path = getPaymentRedirectPath(payment);
    if (path) {
      navigate(path);
    } else {
      toast.info('Order content not available for this payment type.');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="section-heading">Payment History</h1>
        <button
          onClick={loadPayments}
          disabled={loading}
          className="btn-secondary flex items-center gap-2 text-sm px-3 py-2"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        {[
          {
            label: 'Total Paid',
            value: `₦${totalPaid.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`,
            icon: CreditCard,
            color: 'text-kitan-teal',
          },
          {
            label: 'Successful',
            value: payments.filter(p => p.paymentStatus === 'successful').length,
            icon: CheckCircle,
            color: 'text-kitan-teal',
          },
          {
            label: 'Pending',
            value: payments.filter(p => p.paymentStatus === 'pending').length,
            icon: Clock,
            color: 'text-amber-400',
          },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="card-kitan p-4 text-center">
            <Icon size={20} className={cn(color, 'mx-auto mb-2')} />
            <p className={cn('font-bold text-xl', color)}>{value}</p>
            <p className="text-kitan-subtle text-xs">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
          <input
            type="text"
            placeholder="Search by ref or product type..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="input-kitan pl-9 text-sm"
          />
        </div>
        <div className="flex items-center bg-kitan-card border border-kitan-border rounded-xl overflow-hidden">
          {(['all', 'successful', 'pending', 'failed'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                'px-3 py-2.5 text-xs font-medium capitalize transition-colors',
                filter === f ? 'bg-kitan-teal text-white' : 'text-kitan-muted hover:text-kitan-off-white'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="card-kitan overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-12 gap-3">
            <div className="w-5 h-5 border-2 border-kitan-teal/30 border-t-kitan-teal rounded-full animate-spin" />
            <p className="text-kitan-muted text-sm">Loading payments...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard size={32} className="text-kitan-subtle mx-auto mb-3" />
            <p className="text-kitan-muted text-sm">
              {payments.length === 0 ? 'No payments yet — make your first purchase!' : 'No payments match your filter'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-kitan-border">
            {filtered.map(payment => {
              const isClickable = payment.paymentStatus === 'successful';
              const redirectPath = getPaymentRedirectPath(payment);
              return (
                <div
                  key={payment.id}
                  onClick={() => handlePaymentClick(payment)}
                  className={cn(
                    'flex items-center gap-4 p-4 transition-colors',
                    isClickable
                      ? 'hover:bg-kitan-bg/50 cursor-pointer group'
                      : 'opacity-80 cursor-default'
                  )}
                >
                  {/* Status icon */}
                  <div className={cn(
                    'w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0',
                    payment.paymentStatus === 'successful'
                      ? 'bg-kitan-teal/10'
                      : payment.paymentStatus === 'pending'
                      ? 'bg-amber-500/10'
                      : 'bg-red-500/10'
                  )}>
                    {statusIcon(payment.paymentStatus)}
                  </div>

                  {/* Details */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-kitan-off-white text-sm font-medium">
                        {productTypeLabel(payment.productType)}
                      </p>
                      <span className={cn(
                        'text-xs px-2 py-0.5 rounded-full border capitalize font-semibold',
                        statusClass(payment.paymentStatus)
                      )}>
                        {payment.paymentStatus}
                      </span>
                      {payment.verificationStatus === 'verified' && (
                        <span className="text-xs px-2 py-0.5 rounded-full border bg-green-500/10 text-green-400 border-green-500/30">
                          verified
                        </span>
                      )}
                    </div>
                    <p className="text-kitan-subtle text-xs font-mono mt-0.5 truncate">{payment.txRef}</p>
                    <p className="text-kitan-subtle text-xs">{formatDate(payment.createdAt)}</p>
                  </div>

                  {/* Amount + arrow */}
                  <div className="text-right flex-shrink-0 flex items-center gap-2">
                    <div>
                      <p className="text-kitan-teal font-bold text-sm">
                        ₦{payment.amountNGN.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                    {isClickable && redirectPath && (
                      <ArrowRight
                        size={16}
                        className="text-kitan-subtle group-hover:text-kitan-teal transition-colors flex-shrink-0"
                      />
                    )}
                    {isClickable && payment.productType === 'gift' && (
                      <ShoppingBag size={16} className="text-kitan-subtle group-hover:text-kitan-teal transition-colors flex-shrink-0" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {payments.length > 0 && (
        <p className="text-kitan-subtle text-xs text-center">
          Click any successful payment to view your order or access purchased content.
        </p>
      )}
    </div>
  );
};

export default TransactionHistoryPage;
