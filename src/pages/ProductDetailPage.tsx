/**
 * ProductDetailPage — Fetches full product from DB (including all images).
 * Does not depend on the store list (which excludes images for performance).
 */
import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Heart, ShoppingCart, ArrowLeft, Globe, Star, Shield, Package, ChevronLeft, ChevronRight, Loader2, AlertCircle } from 'lucide-react';
import { CATEGORY_ICONS } from '@/constants';
import { useCartStore, useWishlistStore, useCountryStore, useExchangeRateStore } from '@/stores/useStore';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/db';
import OptimizedImage from '@/components/features/OptimizedImage';
import type { Product, Country } from '@/types';
import { formatPrice } from '@/lib/utils';
import { formatNGN } from '@/constants';
import ProductCard from '@/components/features/ProductCard';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const ProductDetailPage: React.FC = () => {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);

  const { addItem }                          = useCartStore();
  const { toggle, has }                      = useWishlistStore();
  const { selectedCountry, setShowSelector } = useCountryStore();
  const { rate }                             = useExchangeRateStore();

  const [product,  setProduct]  = useState<Product | null>(null);
  const [similar,  setSimilar]  = useState<Product[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState(false);

  // Fetch full product from DB by ID (with all images).
  // Hard timeout + terminal error state — a slow request can never spin forever.
  const fetchProduct = React.useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await withTimeout(
        supabase.from('products').select('*').eq('id', id).single(),
        'product detail',
      );
      if (!error && data) {
        const prod: Product = {
          id:             data.id,
          title:          data.title,
          images:         (data.images as string[]) || [],
          thumbnail:      data.thumbnail as string | null,
          description:    data.description,
          price:          Number(data.price),
          countryPricing: (data.country_pricing as Record<string, number>) || {},
          countries:      (data.countries as Country[]) || [],
          category:       data.category as Product['category'],
          available:      Boolean(data.available),
          tags:           (data.tags as string[]) || [],
          featured:       Boolean(data.featured),
          pinned:         Boolean(data.pinned),
          rating:         data.rating != null ? Number(data.rating) : undefined,
          reviewCount:    data.review_count != null ? Number(data.review_count) : undefined,
          createdAt:      data.created_at,
        };
        setProduct(prod);
        // Fetch similar products from same category (non-fatal on failure)
        try {
          const { data: simData } = await withTimeout(
            supabase
              .from('products')
              .select('id, title, thumbnail, description, price, country_pricing, countries, category, available, tags, featured, pinned, created_at')
              .eq('category', prod.category)
              .neq('id', id)
              .eq('available', true)
              .limit(4),
            'similar products',
          );
          if (simData) {
            setSimilar(simData.map((d: Record<string, unknown>) => ({
              id: d.id as string, title: d.title as string,
              images: (d.images as string[]) || [], thumbnail: d.thumbnail as string | null,
              description: d.description as string, price: Number(d.price),
              countryPricing: (d.country_pricing as Record<string, number>) || {},
              countries: (d.countries as Country[]) || [],
              category: d.category as Product['category'], available: Boolean(d.available),
              tags: (d.tags as string[]) || [], featured: Boolean(d.featured),
              pinned: Boolean(d.pinned), createdAt: d.created_at as string,
            })));
          }
        } catch (e) {
          console.error('similar products load:', e);
        }
      } else if (error) {
        setLoadError(true);
      }
    } catch (e) {
      console.error('ProductDetailPage load:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchProduct(); }, [fetchProduct]);
  // Reset gallery selection when navigating between products
  useEffect(() => { setSelectedImage(0); }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] gap-3">
        <Loader2 size={24} className="text-kitan-teal animate-spin" />
        <span className="text-kitan-muted">Loading…</span>
      </div>
    );
  }

  if (!product && loadError) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-kitan-off-white text-xl font-bold mb-2">Unable to load product</h2>
        <p className="text-kitan-muted text-sm mb-6">The request timed out or failed. Please try again.</p>
        <div className="flex items-center justify-center gap-3">
          <button onClick={fetchProduct} className="btn-primary">Retry</button>
          <button onClick={() => navigate('/gifts')} className="btn-secondary">Back to Gifts</button>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="text-center py-20">
        <AlertCircle size={48} className="text-red-400 mx-auto mb-4" />
        <h2 className="text-kitan-off-white text-xl font-bold mb-2">Product Not Found</h2>
        <button onClick={() => navigate('/gifts')} className="btn-primary mt-4">Back to Gifts</button>
      </div>
    );
  }

  const images     = product.images.length > 0 ? product.images : (product.thumbnail ? [product.thumbnail] : []);
  const price      = selectedCountry ? (product.countryPricing[selectedCountry] || product.price) : product.price;
  const isWishlisted = has(product.id);

  const handleAddToCart = () => {
    if (!selectedCountry) { setShowSelector(true); toast.info('Select destination country first'); return; }
    addItem({ product, quantity, country: selectedCountry });
    toast.success(`${product.title} added to cart!`);
  };

  const handleBuyNow = () => {
    if (!selectedCountry) { setShowSelector(true); toast.info('Select destination country first'); return; }
    addItem({ product, quantity, country: selectedCountry });
    navigate('/checkout');
  };

  return (
    <div className="space-y-10">
      <button onClick={() => navigate(-1)} className="btn-ghost flex items-center gap-2 text-sm -ml-2">
        <ArrowLeft size={16} /> Back to Gifts
      </button>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Image Gallery */}
        <div className="space-y-4">
          <div className="relative aspect-square rounded-3xl overflow-hidden bg-kitan-card border border-kitan-border group">
            <OptimizedImage
              src={images[selectedImage]}
              alt={product.title}
              className="w-full h-full"
              imgClassName="object-cover group-hover:scale-105 transition-transform duration-500"
              eager
              fallback={<div className="text-6xl">🎁</div>}
            />
            {images.length > 1 && (
              <>
                <button onClick={() => setSelectedImage((selectedImage - 1 + images.length) % images.length)} className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-kitan-bg/80 rounded-full flex items-center justify-center text-kitan-off-white hover:bg-kitan-teal/20 transition-all">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={() => setSelectedImage((selectedImage + 1) % images.length)} className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 bg-kitan-bg/80 rounded-full flex items-center justify-center text-kitan-off-white hover:bg-kitan-teal/20 transition-all">
                  <ChevronRight size={20} />
                </button>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-3">
              {images.map((img, i) => (
                <button key={i} onClick={() => setSelectedImage(i)} className={cn('w-20 h-20 rounded-xl overflow-hidden border-2 transition-all', i === selectedImage ? 'border-kitan-teal shadow-teal-glow' : 'border-kitan-border hover:border-kitan-teal/60')}>
                  <OptimizedImage src={img} alt="" className="w-full h-full" imgClassName="object-cover" fallback={<span className="text-kitan-subtle text-xs">{i + 1}</span>} />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="space-y-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="badge-teal">{CATEGORY_ICONS[product.category] || '🎁'} {product.category}</span>
              {product.featured && <span className="bg-amber-500/20 text-amber-400 border border-amber-400/30 px-3 py-1 rounded-full text-xs font-semibold">Featured</span>}
            </div>
            <h1 className="font-display text-2xl md:text-3xl font-bold text-kitan-off-white leading-tight mb-3">{product.title}</h1>
            {product.rating && (
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} size={16} className={i <= Math.round(product.rating!) ? 'text-amber-400' : 'text-kitan-border'} fill={i <= Math.round(product.rating!) ? '#F59E0B' : 'none'} />
                  ))}
                </div>
                <span className="text-kitan-muted text-sm">{product.rating} ({product.reviewCount} reviews)</span>
              </div>
            )}
          </div>

          <div className="card-kitan p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-kitan-subtle text-xs mb-1">Price{selectedCountry ? ` · ${selectedCountry}` : ''}</p>
                <p className="text-kitan-teal font-display font-bold text-3xl">{formatNGN(price, rate)}</p>
              </div>
              {!selectedCountry && (
                <button onClick={() => setShowSelector(true)} className="btn-secondary text-xs flex items-center gap-1">
                  <Globe size={13} /> Select Country
                </button>
              )}
            </div>
            {selectedCountry && (
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(product.countryPricing).map(([c, p]) => (
                  <span key={c} className={cn('text-xs px-2 py-1 rounded-lg border', c === selectedCountry ? 'border-kitan-teal bg-kitan-teal/10 text-kitan-teal' : 'border-kitan-border text-kitan-subtle')}>
                    {c}: ₦{p.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div>
            <p className="text-kitan-off-white text-sm font-medium mb-2">Quantity</p>
            <div className="flex items-center gap-3">
              <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-10 h-10 rounded-xl border border-kitan-border bg-kitan-card hover:border-kitan-teal flex items-center justify-center text-kitan-muted hover:text-kitan-teal transition-all text-xl font-semibold">−</button>
              <span className="text-kitan-off-white font-bold text-lg w-10 text-center">{quantity}</span>
              <button onClick={() => setQuantity(quantity + 1)} className="w-10 h-10 rounded-xl border border-kitan-border bg-kitan-card hover:border-kitan-teal flex items-center justify-center text-kitan-muted hover:text-kitan-teal transition-all text-xl font-semibold">+</button>
              <span className="text-kitan-muted text-sm ml-2">Total: <span className="text-kitan-teal font-bold">{formatNGN(price * quantity, rate)}</span></span>
            </div>
          </div>

          <div className="flex gap-3">
            <button onClick={handleBuyNow} className="btn-primary flex-1 flex items-center justify-center gap-2 py-4">
              <Package size={18} /> Buy Now
            </button>
            <button onClick={handleAddToCart} className="btn-secondary flex-1 flex items-center justify-center gap-2 py-4">
              <ShoppingCart size={18} /> Add to Cart
            </button>
            <button
              onClick={() => toggle(product.id)}
              className={cn('w-12 h-12 rounded-xl border flex items-center justify-center transition-all', isWishlisted ? 'border-red-500 bg-red-500/10 text-red-400' : 'border-kitan-border bg-kitan-card text-kitan-muted hover:border-red-400 hover:text-red-400')}
            >
              <Heart size={20} fill={isWishlisted ? 'currentColor' : 'none'} />
            </button>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {[
              { icon: Shield, text: 'Secure Payment' },
              { icon: Package, text: 'Instant Delivery After Payment' },
              { icon: Star, text: 'Quality Guaranteed' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex flex-col items-center gap-1 p-3 rounded-xl bg-kitan-bg border border-kitan-border text-center">
                <Icon size={16} className="text-kitan-teal" />
                <span className="text-kitan-muted text-xs">{text}</span>
              </div>
            ))}
          </div>

          <div className="card-kitan p-5">
            <h3 className="font-semibold text-kitan-off-white mb-3">Product Description</h3>
            <p className="text-kitan-muted text-sm leading-relaxed">{product.description}</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {product.tags.map(tag => (
                <span key={tag} className="text-xs bg-kitan-bg border border-kitan-border text-kitan-subtle px-2 py-1 rounded-lg">#{tag}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {similar.length > 0 && (
        <section>
          <h2 className="section-heading mb-6">You May Also Like</h2>
          <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {similar.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </section>
      )}
    </div>
  );
};

export default ProductDetailPage;
