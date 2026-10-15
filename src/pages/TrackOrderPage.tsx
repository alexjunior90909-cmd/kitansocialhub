import React, { useState } from 'react';
import { Package, Search, CheckCircle, Clock, Truck, Home, AlertCircle, MapPin } from 'lucide-react';
import { useOrdersStore } from '@/stores/useStore';
import type { Order } from '@/types';
import { formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import OptimizedImage from '@/components/features/OptimizedImage';

const statusSteps = [
  { key: 'pending', label: 'Order Received', icon: Clock },
  { key: 'confirmed', label: 'Confirmed', icon: CheckCircle },
  { key: 'processing', label: 'Processing', icon: Package },
  { key: 'shipped', label: 'Shipped', icon: Truck },
  { key: 'delivered', label: 'Delivered', icon: Home },
];

const statusOrder = ['pending', 'confirmed', 'processing', 'shipped', 'delivered'];

const TrackOrderPage: React.FC = () => {
  const [trackingCode, setTrackingCode] = useState('');
  const [email, setEmail] = useState('');
  const [order, setOrder] = useState<Order | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const { getOrder } = useOrdersStore();

  const handleTrack = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSearching(true);
    setNotFound(false);
    await new Promise(r => setTimeout(r, 1000));
    const found = getOrder(trackingCode.trim().toUpperCase(), email.trim());
    setOrder(found);
    setNotFound(!found);
    setIsSearching(false);
  };

  const currentStatusIndex = order ? statusOrder.indexOf(order.status) : -1;

  return (
    <div className="space-y-8 max-w-2xl mx-auto">
      <div>
        <h1 className="section-heading">Track Your Order</h1>
        <p className="text-kitan-muted text-sm mt-1">Enter your tracking code and email to see the latest delivery status</p>
      </div>

      {/* Search Form */}
      <div className="card-kitan p-6">
        <form onSubmit={handleTrack} className="space-y-4">
          <div>
            <label className="text-kitan-muted text-sm mb-1.5 block">Tracking Code</label>
            <input
              type="text"
              className="input-kitan font-mono uppercase tracking-wider"
              placeholder="KSH1A2B3C4D5E6F7G8H9I"
              value={trackingCode}
              onChange={e => setTrackingCode(e.target.value.toUpperCase())}
              maxLength={20}
              required
            />
          </div>
          <div>
            <label className="text-kitan-muted text-sm mb-1.5 block">Recipient Email</label>
            <input
              type="email"
              className="input-kitan"
              placeholder="recipient@email.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={isSearching} className="btn-primary w-full flex items-center justify-center gap-2 py-3.5">
            {isSearching ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                <Search size={18} />
                Track Order
              </>
            )}
          </button>
        </form>
      </div>

      {/* Not Found */}
      {notFound && (
        <div className="card-kitan p-6 flex items-start gap-4 border-red-500/30 animate-fade-in">
          <AlertCircle size={24} className="text-red-400 flex-shrink-0" />
          <div>
            <p className="text-red-300 font-semibold">Order Not Found</p>
            <p className="text-kitan-muted text-sm mt-1">Check your tracking code and email. If you continue to have issues, contact support via WhatsApp.</p>
            <a href="https://wa.me/9157385932" target="_blank" rel="noopener noreferrer" className="btn-primary text-sm mt-3 inline-flex items-center gap-2">
              Contact Support
            </a>
          </div>
        </div>
      )}

      {/* Order Found */}
      {order && (
        <div className="space-y-5 animate-fade-in">
          {/* Order Info */}
          <div className="card-kitan p-6">
            <div className="flex items-start justify-between mb-4">
              <div>
                <p className="text-kitan-subtle text-xs mb-1">Tracking Code</p>
                <p className="font-mono font-bold text-kitan-teal text-sm tracking-wider">{order.trackingCode}</p>
              </div>
              <span className={cn('px-3 py-1 rounded-full text-xs font-semibold border', {
                'bg-kitan-teal/10 text-kitan-teal border-kitan-teal/30': order.status === 'delivered',
                'bg-blue-500/10 text-blue-400 border-blue-400/30': order.status === 'shipped',
                'bg-amber-500/10 text-amber-400 border-amber-400/30': ['processing', 'confirmed'].includes(order.status),
                'bg-kitan-card text-kitan-muted border-kitan-border': order.status === 'pending',
              })}>
                {order.status.charAt(0).toUpperCase() + order.status.slice(1)}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-kitan-subtle text-xs mb-0.5">Recipient</p>
                <p className="text-kitan-off-white font-medium">{order.deliveryInfo.fullName}</p>
              </div>
              <div>
                <p className="text-kitan-subtle text-xs mb-0.5">Destination</p>
                <p className="text-kitan-off-white font-medium">{order.deliveryInfo.city}, {order.deliveryInfo.country}</p>
              </div>
              <div>
                <p className="text-kitan-subtle text-xs mb-0.5">Order Date</p>
                <p className="text-kitan-off-white font-medium">{formatDate(order.createdAt)}</p>
              </div>
              <div>
                <p className="text-kitan-subtle text-xs mb-0.5">Total</p>
                <p className="text-kitan-teal font-bold">${order.total.toFixed(2)}</p>
              </div>
            </div>
          </div>

          {/* Progress Steps */}
          <div className="card-kitan p-6">
            <h3 className="font-semibold text-kitan-off-white mb-5">Delivery Progress</h3>
            <div className="space-y-0">
              {statusSteps.map((step, index) => {
                const isDone = index <= currentStatusIndex;
                const isCurrent = index === currentStatusIndex;
                const Icon = step.icon;
                return (
                  <div key={step.key} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={cn('w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all', isDone ? 'bg-kitan-teal border-kitan-teal shadow-teal-glow' : 'bg-kitan-bg border-kitan-border')}>
                        <Icon size={18} className={isDone ? 'text-white' : 'text-kitan-subtle'} />
                      </div>
                      {index < statusSteps.length - 1 && (
                        <div className={cn('w-0.5 h-8 mt-1', isDone && index < currentStatusIndex ? 'bg-kitan-teal' : 'bg-kitan-border')} />
                      )}
                    </div>
                    <div className={cn('pb-8', index === statusSteps.length - 1 && 'pb-0', 'pt-2 flex-1')}>
                      <p className={cn('font-semibold text-sm', isDone ? 'text-kitan-off-white' : 'text-kitan-subtle')}>
                        {step.label}
                        {isCurrent && <span className="ml-2 badge-teal text-xs">Current</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Tracking Updates */}
          {order.trackingUpdates.length > 0 && (
            <div className="card-kitan p-6">
              <h3 className="font-semibold text-kitan-off-white mb-4 flex items-center gap-2">
                <MapPin size={16} className="text-kitan-teal" />
                Tracking Updates
              </h3>
              <div className="space-y-4">
                {[...order.trackingUpdates].reverse().map(update => (
                  <div key={update.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-3 h-3 rounded-full bg-kitan-teal mt-1 shadow-teal-glow flex-shrink-0" />
                      <div className="w-0.5 flex-1 bg-kitan-border mt-1 last:hidden" />
                    </div>
                    <div className="flex-1 pb-4">
                      <p className="text-kitan-off-white text-sm font-semibold">{update.status}</p>
                      <p className="text-kitan-muted text-sm mt-1">{update.message}</p>
                      {update.image && (
                        <img src={update.image} alt="Tracking" className="mt-2 rounded-xl max-h-40 object-cover" />
                      )}
                      <p className="text-kitan-subtle text-xs mt-1.5">{formatDate(update.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          <div className="card-kitan p-5">
            <h3 className="font-semibold text-kitan-off-white mb-3">Items in Order</h3>
            <div className="space-y-3">
              {order.items.map(item => (
                <div key={item.product.id} className="flex gap-3">
                  <OptimizedImage src={item.product.thumbnail || item.product.images[0]} alt="" className="w-12 h-12 rounded-xl flex-shrink-0" imgClassName="object-cover" fallback={<Package size={14} className="text-kitan-subtle opacity-40" />} />
                  <div>
                    <p className="text-kitan-off-white text-sm font-medium">{item.product.title}</p>
                    <p className="text-kitan-subtle text-xs">Qty: {item.quantity} · {item.country}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Support link */}
      <div className="text-center">
        <p className="text-kitan-subtle text-sm mb-3">Need help with your order?</p>
        <a
          href="https://wa.me/9157385932"
          target="_blank"
          rel="noopener noreferrer"
          className="btn-secondary text-sm inline-flex items-center gap-2"
        >
          Contact Support on WhatsApp
        </a>
      </div>
    </div>
  );
};

export default TrackOrderPage;
