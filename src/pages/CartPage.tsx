import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Trash2, Plus, Minus, ArrowRight } from 'lucide-react';
import { useCartStore } from '@/stores/useStore';
import { formatPrice } from '@/lib/utils';
import OptimizedImage from '@/components/features/OptimizedImage';

const CartPage: React.FC = () => {
  const { items, removeItem, updateQuantity, total } = useCartStore();
  const navigate = useNavigate();
  const cartTotal = total();

  if (items.length === 0) {
    return (
      <div className="text-center py-20 max-w-md mx-auto">
        <ShoppingCart size={56} className="text-kitan-subtle mx-auto mb-4 animate-float" />
        <h2 className="font-display text-2xl font-bold text-kitan-off-white mb-3">Your cart is empty</h2>
        <p className="text-kitan-muted mb-6">Browse our amazing gift catalog and add something special for your loved ones!</p>
        <button onClick={() => navigate('/gifts')} className="btn-primary flex items-center gap-2 mx-auto">
          Browse Gifts <ArrowRight size={16} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="section-heading">Shopping Cart</h1>
        <span className="badge-teal">{items.length} item{items.length > 1 ? 's' : ''}</span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-3">
          {items.map(item => {
            const price = item.product.countryPricing[item.country] || item.product.price;
            return (
              <div key={item.product.id} className="card-kitan p-4 flex gap-4">
                <OptimizedImage src={item.product.thumbnail || item.product.images[0]} alt={item.product.title} className="w-20 h-20 rounded-xl flex-shrink-0" imgClassName="object-cover" fallback={<ShoppingCart size={16} className="text-kitan-subtle opacity-40" />} />
                <div className="flex-1 min-w-0">
                  <p className="text-kitan-off-white font-semibold text-sm line-clamp-2">{item.product.title}</p>
                  <p className="text-kitan-subtle text-xs mt-0.5">{item.product.category} · {item.country}</p>
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <button onClick={() => updateQuantity(item.product.id, item.quantity - 1)} className="w-8 h-8 rounded-lg bg-kitan-bg border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-teal hover:border-kitan-teal transition-all">
                        <Minus size={14} />
                      </button>
                      <span className="text-kitan-off-white font-bold w-8 text-center">{item.quantity}</span>
                      <button onClick={() => updateQuantity(item.product.id, item.quantity + 1)} className="w-8 h-8 rounded-lg bg-kitan-bg border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-teal hover:border-kitan-teal transition-all">
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-kitan-teal font-bold">{formatPrice(price * item.quantity, item.country)}</span>
                      <button onClick={() => removeItem(item.product.id)} className="w-8 h-8 rounded-lg hover:bg-red-500/10 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="card-kitan p-5 h-fit sticky top-24 space-y-4">
          <h3 className="font-display font-bold text-kitan-off-white">Order Summary</h3>
          <div className="space-y-2">
            {items.map(item => {
              const price = item.product.countryPricing[item.country] || item.product.price;
              return (
                <div key={item.product.id} className="flex justify-between text-sm">
                  <span className="text-kitan-muted truncate max-w-[140px]">{item.product.title} ×{item.quantity}</span>
                  <span className="text-kitan-off-white flex-shrink-0 ml-2">{formatPrice(price * item.quantity, item.country)}</span>
                </div>
              );
            })}
          </div>
          <div className="border-t border-kitan-border pt-3 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-kitan-muted">Delivery</span>
              <span className="text-kitan-teal font-semibold">Included</span>
            </div>
            <div className="flex justify-between font-bold">
              <span className="text-kitan-off-white">Total</span>
              <span className="text-kitan-teal text-lg">{formatPrice(cartTotal, items[0]?.country)}</span>
            </div>
          </div>
          <button onClick={() => navigate('/checkout')} className="btn-primary w-full flex items-center justify-center gap-2">
            Proceed to Checkout <ArrowRight size={16} />
          </button>
          <button onClick={() => navigate('/gifts')} className="btn-ghost w-full text-sm text-center">Continue Shopping</button>
        </div>
      </div>
    </div>
  );
};

export default CartPage;
