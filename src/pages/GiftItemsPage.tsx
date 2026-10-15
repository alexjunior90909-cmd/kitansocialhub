
import React, { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Search, SlidersHorizontal, Grid2X2, List, ChevronDown, X, Gift } from 'lucide-react';
import ProductCard from '@/components/features/ProductCard';
import WatchVideoButton from '@/components/features/WatchVideoButton';
import { ErrorState, StaleDataBanner } from '@/components/features/CollectionState';
import { CATEGORIES, SORT_OPTIONS } from '@/constants';
import { useCountryStore, useProductsStore } from '@/stores/useStore';
import type { ProductCategory } from '@/types';
import { cn } from '@/lib/utils';

const GiftItemsPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(searchParams.get('search') || '');
  const [selectedCategory, setSelectedCategory] = useState<ProductCategory | ''>(
    (searchParams.get('category') as ProductCategory) || ''
  );
  const [sortBy, setSortBy] = useState('newest');
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const { selectedCountry, setShowSelector } = useCountryStore();
  const { products, loading, error, refreshFailed, loadProducts } = useProductsStore();

  // Per-page data loading
  useEffect(() => { loadProducts(); }, [loadProducts]); // Added loadProducts to dependency array

  // Show country selector when entering Gift Items without a country selected
  useEffect(() => {
    if (!selectedCountry) {
      setShowSelector(true);
    }
  }, [selectedCountry, setShowSelector]);

  const filteredProducts = useMemo(() => {
    let list = [...products];

    if (selectedCountry) {
      list = list.filter(p => p.countries.includes(selectedCountry));
    }

    if (selectedCategory) {
      list = list.filter(p => p.category === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(p =>
        p.title.toLowerCase().includes(q) ||
        p.category.toLowerCase().includes(q) ||
        p.tags.some(t => t.toLowerCase().includes(q))
      );
    }

    switch (sortBy) {
      case 'price-asc':
        list.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return (a.countryPricing[selectedCountry || 'US'] || a.price) - (b.countryPricing[selectedCountry || 'US'] || b.price);
        });
        break;
      case 'price-desc':
        list.sort((a, b) => {
          if (a.pinned && !b.pinned) return -1;
          if (!a.pinned && b.pinned) return 1;
          return (b.countryPricing[selectedCountry || 'US'] || b.price) - (a.countryPricing[selectedCountry || 'US'] || a.price);
        });
        break;
      case 'alpha-asc':
        list.sort((a, b) => { if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1; return a.title.localeCompare(b.title); });
        break;
      case 'alpha-desc':
        list.sort((a, b) => { if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1; return b.title.localeCompare(a.title); });
        break;
      case 'rating':
        list.sort((a, b) => { if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1; return (b.rating || 0) - (a.rating || 0); });
        break;
      case 'oldest':
        list.sort((a, b) => { if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1; return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(); });
        break;
      default: // newest
        list.sort((a, b) => { if (a.pinned && !b.pinned) return -1; if (!a.pinned && b.pinned) return 1; return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(); });
    }

    return list;
  }, [selectedCountry, selectedCategory, searchQuery, sortBy, products]);

  return (
    <div className="space-y-6">
      {/* Tutorial Video */}
      <WatchVideoButton serviceKey="gifts" />

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="section-heading">Gift Catalog</h1>
          <p className="text-kitan-muted text-sm mt-1">
            {filteredProducts.length} gift{filteredProducts.length !== 1 ? 's' : ''} available
            {selectedCountry && ` · ${selectedCountry}`}
          </p>
        </div>
        {!selectedCountry && (
          <button onClick={() => setShowSelector(true)} className="btn-primary text-sm flex items-center gap-2 flex-shrink-0">
            🌍 Select Country
          </button>
        )}
      </div>

      {/* Filters bar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
          <input
            type="text"
            placeholder="Search gifts..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="input-kitan pl-9 text-sm"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle hover:text-kitan-muted">
              <X size={14} />
            </button>
          )}
        </div>

        {/* Sort */}
        <div className="relative">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="input-kitan text-sm pr-8 cursor-pointer appearance-none min-w-[160px]"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-kitan-subtle pointer-events-none" />
        </div>

        {/* View toggle */}
        <div className="flex items-center bg-kitan-card border border-kitan-border rounded-xl overflow-hidden">
          <button
            onClick={() => setViewMode('grid')}
            className={cn('p-2.5 transition-colors', viewMode === 'grid' ? 'bg-kitan-teal text-white' : 'text-kitan-subtle hover:text-kitan-muted')}
          >
            <Grid2X2 size={16} />
          </button>
          <button
            onClick={() => setViewMode('list')}
            className={cn('p-2.5 transition-colors', viewMode === 'list' ? 'bg-kitan-teal text-white' : 'text-kitan-subtle hover:text-kitan-muted')}
          >
            <List size={16} />
          </button>
        </div>

        <button
          onClick={() => setShowFilters(!showFilters)}
          className={cn('btn-secondary text-sm flex items-center gap-2', showFilters && 'border-kitan-teal text-kitan-teal')}
        >
          <SlidersHorizontal size={15} />
          Filters
        </button>
      </div>

      {/* Category filter */}
      {showFilters && (
        <div className="card-kitan p-4 animate-fade-in">
          <p className="text-kitan-off-white text-sm font-semibold mb-3">Filter by Category</p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setSelectedCategory('')}
              className={cn('px-3 py-1.5 rounded-xl text-xs font-medium border transition-all', selectedCategory === '' ? 'bg-kitan-teal border-kitan-teal text-white' : 'bg-kitan-bg border-kitan-border text-kitan-muted hover:border-kitan-teal hover:text-kitan-teal')}
            >
              All
            </button>
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat === selectedCategory ? '' : cat)}
                className={cn('px-3 py-1.5 rounded-xl text-xs font-medium border transition-all', selectedCategory === cat ? 'bg-kitan-teal border-kitan-teal text-white' : 'bg-kitan-bg border-kitan-border text-kitan-muted hover:border-kitan-teal hover:text-kitan-teal')}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Active filters */}
      {(selectedCategory || searchQuery) && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-kitan-subtle text-xs">Active filters:</span>
          {selectedCategory && (
            <span className="badge-teal flex items-center gap-1">
              {selectedCategory}
              <button onClick={() => setSelectedCategory('')}><X size={10} /></button>
            </span>
          )}
          {searchQuery && (
            <span className="badge-teal flex items-center gap-1">
              "{searchQuery}"
              <button onClick={() => setSearchQuery('')}><X size={10} /></button>
            </span>
          )}
        </div>
      )}

      {/* Refresh failure while cached products are still shown */}
      {refreshFailed && filteredProducts.length > 0 && (
        <StaleDataBanner onRetry={() => loadProducts(true)} />
      )}

      {/* First-load failure — clear retry state instead of an empty page */}
      {error && !loading && filteredProducts.length === 0 && (
        <ErrorState
          title="Unable to load gifts right now"
          message="Check your connection and try again. Your previously viewed items will appear once we're back online."
          onRetry={() => loadProducts(true)}
          icon={<Gift size={44} className="text-red-400" />}
        />
      )}

      {/* Loading skeletons */}
      {loading && filteredProducts.length === 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card-kitan overflow-hidden animate-pulse">
              <div className="aspect-square bg-kitan-border/30" />
              <div className="p-4 space-y-2">
                <div className="h-3 bg-kitan-border/30 rounded w-1/3" />
                <div className="h-4 bg-kitan-border/30 rounded w-3/4" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Products Grid */}
      {!loading && !error && filteredProducts.length === 0 ? (
        <div className="text-center py-20">
          <div className="text-6xl mb-4">🎁</div>
          <h3 className="text-kitan-off-white font-semibold text-lg mb-2">No gifts found</h3>
          <p className="text-kitan-muted text-sm">Try adjusting your filters or search query</p>
          <button
            onClick={() => { setSearchQuery(''); setSelectedCategory(''); }}
            className="btn-primary text-sm mt-4"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className={cn(
          viewMode === 'grid'
            ? 'grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4'
            : 'flex flex-col gap-4'
        )}>
          {filteredProducts.map((product, i) => (
            <ProductCard
              key={product.id}
              product={product}
              eager={i < 4}
              className={viewMode === 'list' ? 'flex-row' : ''}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default GiftItemsPage;
