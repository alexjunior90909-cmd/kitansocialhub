import React from 'react';
import { useNavigate } from 'react-router-dom';
import { X, ShoppingCart, Trash2, Plus, Minus } from 'lucide-react';
import { useCartStore, useExchangeRateStore } from '@/stores/useStore';
import { formatPrice } from '@/lib/utils';
import { formatNGN } from '@/constants';
import OptimizedImage from '@/components/features/OptimizedImage';

const CartSidebar: React.FC = () => {
  const { items, isOpen, closeCart, removeItem, updateQuantity, total } = useCartStore();
  const { rate } = useExchangeRateStore();
  const navigate = useNavigate();

  if (!isOpen) return null;

  const cartTotal = total();

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={closeCart} />
      <div className="relative w-full max-w-sm bg-kitan-surface border-l border-kitan-border flex flex-col animate-slide-in-right shadow-card-shadow">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-kitan-border">
          <div className="flex items-center gap-3">
            <ShoppingCart size={20} className="text-kitan-teal" />
            <h2 className="font-display font-bold text-kitan-off-white">Cart</h2>
            {items.length > 0 && (
              <span className="badge-teal">{items.length} item{items.length > 1 ? 's' : ''}</span>
            )}
          </div>
          <button onClick={closeCart} className="w-8 h-8 rounded-xl bg-kitan-card border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-off-white transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto scrollbar-hide p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-12">
              <div className="w-16 h-16 rounded-2xl bg-kitan-bg border border-kitan-border flex items-center justify-center mb-4">
                <ShoppingCart size={28} className="text-kitan-subtle" />
              </div>
              <p className="text-kitan-off-white font-semibold mb-2">Your cart is empty</p>
              <p className="text-kitan-muted text-sm">Browse our gift catalog and add something special!</p>
              <button
                onClick={() => { closeCart(); navigate('/gifts'); }}
                className="btn-primary text-sm mt-4"
              >
                Shop Gifts
              </button>
            </div>
          ) : (
            items.map(item => {
              const price = item.product.countryPricing[item.country] || item.product.price;
              return (
                <div key={item.product.id} className="card-kitan p-3 flex gap-3">
                  <OptimizedImage
                    src={item.product.thumbnail || item.product.images[0]}
                    alt={item.product.title}
                    className="w-16 h-16 rounded-xl flex-shrink-0"
                    imgClassName="object-cover"
                    fallback={<ShoppingCart size={16} className="text-kitan-subtle opacity-40" />}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-kitan-off-white text-sm font-semibold line-clamp-1">{item.product.title}</p>
                    <p className="text-kitan-subtle text-xs mt-0.5">{item.country}</p>
                    <div className="flex items-center justify-between mt-2">
                      <div>
                        <span className="text-kitan-teal font-bold text-sm block">{formatNGN(price * item.quantity, rate)}</span>
                        <span className="text-kitan-subtle text-xs">({formatPrice(price * item.quantity, item.country)})</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity - 1)}
                          className="w-6 h-6 rounded-lg bg-kitan-bg border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-teal hover:border-kitan-teal transition-all"
                        >
                          <Minus size={12} />
                        </button>
                        <span className="text-kitan-off-white text-sm w-5 text-center">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.product.id, item.quantity + 1)}
                          className="w-6 h-6 rounded-lg bg-kitan-bg border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-teal hover:border-kitan-teal transition-all"
                        >
                          <Plus size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => removeItem(item.product.id)}
                    className="self-start w-7 h-7 rounded-lg hover:bg-red-500/20 flex items-center justify-center text-kitan-subtle hover:text-red-400 transition-all"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-kitan-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-kitan-muted text-sm">Subtotal</span>
              <div className="text-right">
                <span className="text-kitan-off-white font-bold block">{formatNGN(cartTotal, rate)}</span>
                <span className="text-kitan-subtle text-xs">(${cartTotal.toFixed(2)})</span>
              </div>
            </div>
            <button
              onClick={() => { closeCart(); navigate('/checkout'); }}
              className="btn-primary w-full text-sm"
            >
              Proceed to Checkout
            </button>
            <button
              onClick={() => { closeCart(); navigate('/gifts'); }}
              className="btn-ghost w-full text-sm text-center"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default CartSidebar;
