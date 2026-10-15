import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import ProductCard from '@/components/features/ProductCard';
import { useWishlistStore, useProductsStore } from '@/stores/useStore';

const WishlistPage: React.FC = () => {
  const { items } = useWishlistStore();
  const { products } = useProductsStore();
  const navigate = useNavigate();
  const wishlistProducts = products.filter(p => items.includes(p.id));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="section-heading">My Wishlist</h1>
        <p className="text-kitan-muted text-sm mt-1">{wishlistProducts.length} saved item{wishlistProducts.length !== 1 ? 's' : ''}</p>
      </div>

      {wishlistProducts.length === 0 ? (
        <div className="card-kitan p-12 text-center">
          <Heart size={48} className="text-kitan-subtle mx-auto mb-4" />
          <p className="text-kitan-off-white font-semibold text-lg mb-2">Your wishlist is empty</p>
          <p className="text-kitan-muted text-sm mb-5">Browse gifts and tap the heart icon to save your favourites.</p>
          <button onClick={() => navigate('/gifts')} className="btn-primary">Browse Gifts</button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {wishlistProducts.map(p => <ProductCard key={p.id} product={p} />)}
        </div>
      )}
    </div>
  );
};

export default WishlistPage;
