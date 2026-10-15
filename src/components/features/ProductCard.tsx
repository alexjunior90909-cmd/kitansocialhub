import React, { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, ShoppingCart, Star, Gift } from 'lucide-react';
import type { Product } from '@/types';
import { useCartStore, useWishlistStore, useCountryStore } from '@/stores/useStore';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import OptimizedImage from '@/components/features/OptimizedImage';

interface Props {
  product: Product;
  className?: string;
  /** Above-the-fold cards load eagerly; everything else lazy-loads. */
  eager?: boolean;
}

const ProductCard: React.FC<Props> = ({ product, className, eager = false }) => {
  const navigate = useNavigate();
  const { addItem } = useCartStore();
  const { toggle, has } = useWishlistStore();
  const { selectedCountry, setShowSelector } = useCountryStore();

  const price = selectedCountry
    ? (product.countryPricing[selectedCountry] || product.price)
    : product.price;
  const isWishlisted = has(product.id);

  const handleAddToCart = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedCountry) {
      setShowSelector(true);
      toast.info('Please select a destination country first');
      return;
    }
    addItem({ product, quantity: 1, country: selectedCountry });
    toast.success(`${product.title} added to cart!`);
  };

  const handleWishlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggle(product.id);
    toast.success(isWishlisted ? 'Removed from wishlist' : 'Added to wishlist!');
  };

  return (
    <div
      onClick={() => navigate(`/gifts/${product.id}`)}
      className={cn(
        'card-kitan group cursor-pointer overflow-hidden animate-fade-in',
        className
      )}
    >
      {/* Image — stable reserved area, thumbnail-first, never an infinite spinner */}
      <div className="relative aspect-square bg-kitan-bg">
        <OptimizedImage
          src={product.thumbnail || product.images[0]}
          alt={product.title}
          className="w-full h-full"
          imgClassName="object-cover group-hover:scale-105 transition-transform duration-500"
          eager={eager}
          fallback={<Gift size={28} className="text-kitan-subtle opacity-40" />}
        />
        {/* Overlay on hover */}
        <div className="absolute inset-0 bg-kitan-bg/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-center justify-center">
          <button
            onClick={handleAddToCart}
            className="btn-primary text-sm px-4 py-2 translate-y-4 group-hover:translate-y-0 transition-transform duration-300"
          >
            <ShoppingCart size={16} className="inline mr-2" />
            Add to Cart
          </button>
        </div>
        {/* Featured badge */}
        {product.featured && (
          <span className="absolute top-3 left-3 badge-teal text-xs">Featured</span>
        )}
        {!product.available && (
          <div className="absolute inset-0 bg-kitan-bg/70 flex items-center justify-center">
            <span className="text-kitan-muted font-semibold text-sm">Out of Stock</span>
          </div>
        )}
        {/* Wishlist */}
        <button
          onClick={handleWishlist}
          className={cn(
            'absolute top-3 right-3 w-8 h-8 rounded-full flex items-center justify-center transition-all',
            isWishlisted
              ? 'bg-red-500 text-white'
              : 'bg-kitan-bg/80 text-kitan-muted hover:bg-red-500/20 hover:text-red-400'
          )}
        >
          <Heart size={15} fill={isWishlisted ? 'currentColor' : 'none'} />
        </button>
      </div>

      {/* Info */}
      <div className="p-4">
        <p className="text-kitan-subtle text-xs mb-1">{product.category}</p>
        <h3 className="text-kitan-off-white font-semibold text-sm leading-snug mb-2 line-clamp-2 group-hover:text-kitan-teal transition-colors">
          {product.title}
        </h3>
        <div className="flex items-center gap-1 mb-3">
          {product.rating && (
            <>
              <Star size={12} fill="#F59E0B" className="text-amber-400" />
              <span className="text-amber-400 text-xs font-semibold">{product.rating}</span>
              <span className="text-kitan-subtle text-xs">({product.reviewCount})</span>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {product.countries.slice(0, 3).map(c => (
            <span key={c} className="text-xs text-kitan-subtle bg-kitan-bg border border-kitan-border rounded px-1.5 py-0.5">
              {c}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

export default memo(ProductCard);
