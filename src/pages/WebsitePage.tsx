/**
 * WebsitePage — Website creation & development services.
 * Premium service. Admin manages products via AdminDashboard.
 */
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Globe, Star, Zap, ChevronRight, Tag, Crown, HeadphonesIcon, Search, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { withTimeout } from '@/lib/db';
import WatchVideoButton from '@/components/features/WatchVideoButton';
import OptimizedImage from '@/components/features/OptimizedImage';
import { ErrorState } from '@/components/features/CollectionState';
import { cn } from '@/lib/utils';
import { formatNGN } from '@/constants';

interface WebsiteProduct {
  id: string;
  title: string;
  description: string;
  price_ngn: number;
  preview_images: string[];
  features: string[];
  available: boolean;
  tags: string[];
  is_premium: boolean;
  pinned: boolean;
  pin_position: number | null;
}

const WebsitePage: React.FC = () => {
  const navigate = useNavigate();
  const [products, setProducts]   = useState<WebsiteProduct[]>([]);
  const [loading,  setLoading]    = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [search,   setSearch]     = useState('');

  const fetchProducts = React.useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const { data, error } = await withTimeout(
        supabase
          .from('website_products')
          .select('*')
          .eq('available', true)
          .order('pin_position', { ascending: true, nullsFirst: false }),
        'website products',
      );
      if (error) throw new Error(error.message);
      setProducts(data || []);
    } catch (e) {
      console.error('WebsitePage load:', e);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchProducts(); }, [fetchProducts]);

  const filtered = products.filter(p =>
    !search ||
    p.title.toLowerCase().includes(search.toLowerCase()) ||
    p.description.toLowerCase().includes(search.toLowerCase()) ||
    p.tags.some((t: string) => t.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6 pb-10">

      {/* Tutorial Video */}
      <WatchVideoButton serviceKey="website" />

      {/* Contact Notice */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500 p-4"
        style={{ background: 'rgba(245,158,11,0.06)' }}>
        <div className="flex items-start gap-3">
          <span className="text-amber-400 text-2xl flex-shrink-0 leading-none">💬</span>
          <p className="text-amber-300 font-black uppercase tracking-wide text-sm leading-snug">
            If the website you want is not listed, kindly contact Support to get started.
          </p>
        </div>
      </div>

      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl border border-kitan-border p-8"
        style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(15,23,42,0) 100%)' }}>
        <div className="absolute top-[-60px] right-[-60px] w-[280px] h-[280px] rounded-full opacity-15"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
        <div className="relative z-10">
          <div className="flex items-center gap-3 mb-4">
            <div className="badge-teal inline-flex items-center gap-2">
              <Globe size={12} /> Website Services
            </div>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
              <Crown size={11} /> Premium
            </span>
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-kitan-off-white mb-3">
            Professional <span className="gradient-text">Website Services</span>
          </h1>
          <p className="text-kitan-muted max-w-xl leading-relaxed mb-4">
            Get a professionally designed website built for your business, brand, or personal portfolio. Browse our available packages or contact support for a custom solution.
          </p>
          <div className="flex flex-wrap gap-3">
            {[
              { icon: Zap,        text: 'Fast Delivery' },
              { icon: Star,       text: 'Premium Quality' },
              { icon: CheckCircle,text: 'Wallet Checkout' },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 bg-kitan-surface border border-kitan-border rounded-xl px-3 py-1.5">
                <Icon size={13} className="text-kitan-teal" />
                <span className="text-kitan-muted text-xs">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
        <input
          type="text"
          placeholder="Search website packages…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="input-kitan pl-10 text-sm"
        />
      </div>

      {/* Loading */}
      {loading && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card-kitan p-6 animate-pulse space-y-3">
              <div className="h-40 bg-kitan-border/20 rounded-xl" />
              <div className="h-5 bg-kitan-border/20 rounded w-3/4" />
              <div className="h-3 bg-kitan-border/15 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Load failure — clear retry state */}
      {loadError && !loading && (
        <ErrorState
          title="Unable to load website packages right now"
          message="Check your connection and try again."
          onRetry={fetchProducts}
          icon={<Globe size={44} className="text-red-400" />}
        />
      )}

      {/* Empty */}
      {!loading && !loadError && filtered.length === 0 && (
        <div className="card-kitan p-16 text-center">
          <Globe size={48} className="text-kitan-subtle mx-auto mb-4" />
          <p className="text-kitan-off-white font-semibold mb-2">
            {search ? 'No packages match your search' : 'No website packages available yet'}
          </p>
          <p className="text-kitan-muted text-sm mb-4">Contact support to request a custom website.</p>
          <button onClick={() => navigate('/support')} className="btn-primary flex items-center gap-2 mx-auto">
            <HeadphonesIcon size={16} /> Contact Support
          </button>
        </div>
      )}

      {/* Products Grid */}
      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {filtered.map(product => (
            <div
              key={product.id}
              className={cn(
                'card-kitan overflow-hidden group hover:border-indigo-500/60 cursor-pointer transition-all',
                product.pinned && 'border-amber-500/30 bg-amber-500/3',
              )}
              onClick={() => navigate(`/website/${product.id}`)}
            >
              {/* Image */}
              {product.preview_images[0] ? (
                <div className="relative h-48 overflow-hidden bg-kitan-bg">
                  <OptimizedImage
                    src={product.preview_images[0]}
                    alt={product.title}
                    className="w-full h-full"
                    imgClassName="object-cover group-hover:scale-105 transition-transform duration-500"
                    fallback={<Globe size={40} className="text-indigo-400/40" />}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-kitan-bg/60 via-transparent to-transparent" />
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/80 text-white">
                    <Crown size={10} /> Premium
                  </span>
                </div>
              ) : (
                <div className="h-48 bg-gradient-to-br from-indigo-500/10 to-kitan-bg flex items-center justify-center">
                  <Globe size={40} className="text-indigo-400/40" />
                  <span className="absolute top-3 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-500/80 text-white">
                    <Crown size={10} /> Premium
                  </span>
                </div>
              )}

              {/* Content */}
              <div className="p-5 space-y-3">
                <div>
                  <h3 className="font-display font-bold text-kitan-off-white text-base group-hover:text-indigo-300 transition-colors line-clamp-2">{product.title}</h3>
                  <p className="text-kitan-muted text-sm line-clamp-2 mt-1 leading-relaxed">{product.description}</p>
                </div>

                {/* Features list */}
                {product.features.length > 0 && (
                  <ul className="space-y-1">
                    {product.features.slice(0, 3).map((f: string, i: number) => (
                      <li key={i} className="flex items-center gap-2 text-xs text-kitan-muted">
                        <CheckCircle size={11} className="text-kitan-teal flex-shrink-0" />
                        {f}
                      </li>
                    ))}
                    {product.features.length > 3 && (
                      <li className="text-xs text-kitan-subtle">+{product.features.length - 3} more features</li>
                    )}
                  </ul>
                )}

                {/* Tags */}
                {product.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {product.tags.slice(0, 3).map((tag: string) => (
                      <span key={tag} className="flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full bg-kitan-surface border border-kitan-border text-kitan-subtle">
                        <Tag size={9} /> {tag}
                      </span>
                    ))}
                  </div>
                )}

                {/* Price + CTA */}
                <div className="flex items-center justify-between pt-2 border-t border-kitan-border">
                  <p className="font-display font-bold text-indigo-300 text-lg">{formatNGN(product.price_ngn)}</p>
                  <span className="flex items-center gap-1 text-indigo-400 text-sm font-semibold group-hover:gap-2 transition-all">
                    Get Started <ChevronRight size={15} />
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Support banner */}
      <div className="relative overflow-hidden rounded-3xl border border-indigo-500/20 p-6"
        style={{ background: 'rgba(99,102,241,0.05)' }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <p className="font-display font-bold text-kitan-off-white text-base mb-1">Need something custom?</p>
            <p className="text-kitan-muted text-sm">Our team can build any website you need. Contact support to discuss your project.</p>
          </div>
          <button
            onClick={() => navigate('/support')}
            className="btn-secondary flex items-center gap-2 flex-shrink-0 border-indigo-500/30 text-indigo-300 hover:text-indigo-200 hover:border-indigo-400"
          >
            <HeadphonesIcon size={16} /> Contact Support
          </button>
        </div>
      </div>

    </div>
  );
};

export default WebsitePage;
