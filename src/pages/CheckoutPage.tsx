import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Package, CheckCircle, ArrowLeft, Info, Wallet, ArrowRight, Loader2 } from 'lucide-react';
import { useCartStore, useAuthStore, useOrdersStore, useNotificationsStore, useWalletStore } from '@/stores/useStore';
import { formatPrice } from '@/lib/utils';
import { formatNGN } from '@/constants';
import type { DeliveryInfo } from '@/types';
import { toast } from 'sonner';
import { COUNTRIES } from '@/constants';
import { dbWallet } from '@/lib/db';
import { cn } from '@/lib/utils';
import OptimizedImage from '@/components/features/OptimizedImage';

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, total, clearCart } = useCartStore();
  const { user } = useAuthStore();
  const { placeOrder } = useOrdersStore();
  const { addNotification } = useNotificationsStore();
  const { wallet, loadWallet } = useWalletStore();
  const [isProcessing, setIsProcessing] = useState(false);
  const [orderPlaced, setOrderPlaced] = useState<{ trackingCode: string; id: string } | null>(null);

  useEffect(() => {
    if (user) loadWallet(user.id);
  }, [user]);

  const walletBalance = wallet?.balance ?? 0;

  const [delivery, setDelivery] = useState<DeliveryInfo>({
    contactEmail: user?.email || '',
    contactPhone: '',
    country: '',
    fullName: '',
    address: '',
    apartment: '',
    city: '',
    state: '',
    zipCode: '',
    recipientPhone: '',
  });

  const cartTotal = total();
  const selectedCountry = items[0]?.country;

  if (items.length === 0 && !orderPlaced) {
    return (
      <div className="text-center py-20">
        <Package size={48} className="text-kitan-subtle mx-auto mb-4" />
        <h2 className="text-kitan-off-white text-xl font-bold mb-2">Your cart is empty</h2>
        <button onClick={() => navigate('/gifts')} className="btn-primary mt-4">Shop Gifts</button>
      </div>
    );
  }

  if (orderPlaced) {
    return (
      <div className="max-w-lg mx-auto text-center py-10 animate-fade-in">
        <div className="w-20 h-20 rounded-full bg-kitan-teal/10 border-2 border-kitan-teal flex items-center justify-center mx-auto mb-6 shadow-teal-glow">
          <CheckCircle size={40} className="text-kitan-teal" />
        </div>
        <h1 className="font-display text-2xl font-bold text-kitan-off-white mb-2">Order Confirmed! 🎉</h1>
        <p className="text-kitan-muted mb-6">Your gift is on its way. Track it using your tracking code below.</p>
        <div className="card-kitan p-6 mb-6">
          <p className="text-kitan-subtle text-sm mb-1">Your Tracking Code</p>
          <p className="font-display font-bold text-kitan-teal text-xl tracking-widest break-all">{orderPlaced.trackingCode}</p>
          <p className="text-kitan-subtle text-xs mt-2">Save this code to track your order</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => navigate('/track')} className="btn-primary flex-1">Track Order</button>
          <button onClick={() => navigate('/orders')} className="btn-secondary flex-1">Order History</button>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) { navigate('/login'); return; }

    const required = ['contactEmail', 'contactPhone', 'country', 'fullName', 'address', 'city', 'state', 'zipCode', 'recipientPhone'];
    for (const field of required) {
      if (!delivery[field as keyof DeliveryInfo]) {
        toast.error(`Please fill in ${field.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
        return;
      }
    }

    setIsProcessing(true);

    // ---- WALLET PAYMENT (only method) ----
    if (walletBalance < cartTotal) {
      toast.error(`Insufficient wallet balance. You have ${formatNGN(walletBalance)} but need ${formatNGN(cartTotal)}.`);
      setIsProcessing(false);
      navigate(`/wallet?need=${cartTotal}`);
      return;
    }

    try {
      const ref = `wal_ord_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await dbWallet.deduct(
        user.id,
        cartTotal,
        `Gift order — ${items.map(i => i.product.title).join(', ').slice(0, 80)}`,
        ref,
        'cart',
        'gift',
      );

      const order = placeOrder({
        userId: user.id,
        items,
        total: cartTotal,
        status: 'confirmed',
        deliveryInfo: delivery,
        country: selectedCountry,
      });

      addNotification({
        userId: user.id,
        title: 'Order Placed!',
        message: `Your gift order ${order.trackingCode} was paid from your wallet.`,
        type: 'order',
      });

      clearCart();
      setOrderPlaced({ trackingCode: order.trackingCode, id: order.id });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Payment failed. Please try again.';
      toast.error(msg);
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <button onClick={() => navigate(-1)} className="btn-ghost flex items-center gap-2 text-sm -ml-2">
        <ArrowLeft size={16} /> Back
      </button>
      <h1 className="section-heading">Checkout</h1>

      <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
        <Info size={18} className="text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-amber-300 text-sm">
          <span className="font-semibold">Important:</span> Please provide the <strong>recipient's</strong> delivery information, not your own.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <form onSubmit={handleSubmit} className="lg:col-span-2 space-y-5">
          <div className="card-kitan p-6 space-y-5">
            <h2 className="font-display font-bold text-kitan-off-white text-lg">Recipient's Delivery Details</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">Contact Email *</label>
                <input type="email" required className="input-kitan" value={delivery.contactEmail} onChange={e => setDelivery({ ...delivery, contactEmail: e.target.value })} placeholder="recipient@email.com" />
              </div>
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">Contact Phone *</label>
                <input type="tel" required className="input-kitan" value={delivery.contactPhone} onChange={e => setDelivery({ ...delivery, contactPhone: e.target.value })} placeholder="+1 234 567 8901" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">Full Name *</label>
                <input type="text" required className="input-kitan" value={delivery.fullName} onChange={e => setDelivery({ ...delivery, fullName: e.target.value })} placeholder="Recipient full name" />
              </div>
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">Country/Region *</label>
                <select required className="input-kitan" value={delivery.country} onChange={e => setDelivery({ ...delivery, country: e.target.value })}>
                  <option value="">Select country</option>
                  {COUNTRIES.map(c => <option key={c.code} value={c.name}>{c.flag} {c.name}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Street Address *</label>
              <input type="text" required className="input-kitan" value={delivery.address} onChange={e => setDelivery({ ...delivery, address: e.target.value })} placeholder="123 Main Street" />
            </div>
            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Apartment/Suite (optional)</label>
              <input type="text" className="input-kitan" value={delivery.apartment} onChange={e => setDelivery({ ...delivery, apartment: e.target.value })} placeholder="Apt 4B, Suite 100" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">City *</label>
                <input type="text" required className="input-kitan" value={delivery.city} onChange={e => setDelivery({ ...delivery, city: e.target.value })} placeholder="New York" />
              </div>
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">State *</label>
                <input type="text" required className="input-kitan" value={delivery.state} onChange={e => setDelivery({ ...delivery, state: e.target.value })} placeholder="NY" />
              </div>
              <div>
                <label className="text-kitan-muted text-sm mb-1.5 block">Zip Code *</label>
                <input type="text" required className="input-kitan" value={delivery.zipCode} onChange={e => setDelivery({ ...delivery, zipCode: e.target.value })} placeholder="10001" />
              </div>
            </div>
            <div>
              <label className="text-kitan-muted text-sm mb-1.5 block">Recipient Phone *</label>
              <input type="tel" required className="input-kitan" value={delivery.recipientPhone} onChange={e => setDelivery({ ...delivery, recipientPhone: e.target.value })} placeholder="+1 234 567 8901" />
            </div>
          </div>

          <div className="card-kitan p-6 space-y-4">
            <h2 className="font-display font-bold text-kitan-off-white text-lg">Payment</h2>
            <div className="flex items-center gap-4 p-4 rounded-2xl border-2 border-kitan-teal bg-kitan-teal/5">
              <div className="w-10 h-10 rounded-xl bg-kitan-teal flex items-center justify-center flex-shrink-0">
                <Wallet size={18} className="text-white" />
              </div>
              <div className="flex-1">
                <p className="text-kitan-off-white font-semibold text-sm">Pay with Wallet</p>
                <p className="text-kitan-muted text-xs mt-0.5">
                  Balance: <span className={cn('font-bold', walletBalance >= cartTotal ? 'text-green-400' : 'text-red-400')}>{formatNGN(walletBalance)}</span>
                  {walletBalance < cartTotal && <span className="text-amber-400 ml-2">— insufficient, top up first</span>}
                </p>
              </div>
              <CheckCircle size={18} className="text-kitan-teal flex-shrink-0" />
            </div>
            {walletBalance < cartTotal && (
              <button
                type="button"
                onClick={() => navigate(`/wallet?need=${cartTotal}`)}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 text-sm font-semibold hover:bg-amber-500/20 transition-all"
              >
                <Wallet size={15} /> Top Up Wallet — need {formatNGN(cartTotal - walletBalance)} more <ArrowRight size={15} />
              </button>
            )}
          </div>

          <button type="submit" disabled={isProcessing || walletBalance < cartTotal} className="btn-primary w-full py-4 text-base flex items-center justify-center gap-2 disabled:opacity-50">
            {isProcessing ? (
              <><Loader2 size={18} className="animate-spin" /> Processing...</>
            ) : (
              <><Wallet size={18} /> Pay {formatNGN(cartTotal)} from Wallet</>
            )}
          </button>
        </form>

        <div className="space-y-4">
          <div className="card-kitan p-5 sticky top-24">
            <h3 className="font-display font-bold text-kitan-off-white mb-4">Order Summary</h3>
            <div className="space-y-3 mb-4">
              {items.map(item => {
                const price = item.product.countryPricing[item.country] || item.product.price;
                return (
                  <div key={item.product.id} className="flex gap-3">
                    <OptimizedImage src={item.product.thumbnail || item.product.images[0]} alt="" className="w-12 h-12 rounded-xl flex-shrink-0" imgClassName="object-cover" fallback={<Package size={14} className="text-kitan-subtle opacity-40" />} />
                    <div className="flex-1 min-w-0">
                      <p className="text-kitan-off-white text-xs font-medium line-clamp-1">{item.product.title}</p>
                      <p className="text-kitan-subtle text-xs">× {item.quantity}</p>
                    </div>
                    <p className="text-kitan-teal text-sm font-bold flex-shrink-0">{formatPrice(price * item.quantity, item.country)}</p>
                  </div>
                );
              })}
            </div>
            <div className="border-t border-kitan-border pt-3 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-kitan-muted">Delivery</span>
                <span className="text-kitan-teal font-semibold">Included</span>
              </div>
              <div className="flex justify-between font-bold border-t border-kitan-border pt-2">
                <span className="text-kitan-off-white">Total</span>
                <span className="text-kitan-teal text-lg">{formatNGN(cartTotal)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
