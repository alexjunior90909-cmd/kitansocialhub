
import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Camera, Search, Star, ChevronLeft, ChevronRight, Grid2X2, List } from 'lucide-react';
import { useWorkingPicturesStore, useGlobalWPPriceStore, usePageStateStore } from '@/stores/useStore';

import WatchVideoButton from '@/components/features/WatchVideoButton';
import OptimizedImage from '@/components/features/OptimizedImage';
import { ErrorState, StaleDataBanner } from '@/components/features/CollectionState';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;
const PAGE_KEY = 'working-pictures';

// ── Skeleton card ──────────────────────────────────────────────────────────
const SkeletonCard: React.FC<{ list?: boolean }> = ({ list }) => (
  <div className={cn('card-kitan overflow-hidden animate-pulse', list && 'flex flex-row')}>
    <div className={cn('bg-kitan-border/30', list ? 'w-48 h-36 flex-shrink-0' : 'w-full aspect-[4/3]')} />
    <div className="p-4 space-y-2 flex-1">
      <div className="h-4 bg-kitan-border/30 rounded w-3/4" />
      <div className="h-3 bg-kitan-border/20 rounded w-full" />
      <div className="h-3 bg-kitan-border/20 rounded w-2/3" />
      <div className="h-8 bg-kitan-border/20 rounded mt-3" />
    </div>
  </div>
);

const WorkingPicturesPage: React.FC = () => {
  const { items, loading, error, refreshFailed, loadItems } = useWorkingPicturesStore();
  const { globalWPPrice, loadGlobalWPPrice } = useGlobalWPPriceStore();

  // Per-page data loading — only loads what this page needs
  useEffect(() => { loadItems(); loadGlobalWPPrice(); }, []); 
  const { getPageState, setPageState } = usePageStateStore();
  const navigate = useNavigate();

  const saved = getPageState(PAGE_KEY);
  const [search, setSearch] = useState(saved.search ?? '');
  const [page, setPage] = useState(saved.page ?? 1);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(saved.viewMode ?? 'grid');

  // Persist state on every change
  const persist = useCallback((update: Partial<typeof saved>) => {
    setPageState(PAGE_KEY, update);
  }, [setPageState]);

  const handleSearch = (val: string) => {
    setSearch(val);
    setPage(1);
    persist({ search: val, page: 1 });
  };

  const handlePage = (newPage: number) => {
    setPage(newPage);
    persist({ page: newPage });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleViewMode = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    persist({ viewMode: mode });
  };

  const filtered = items.filter(item =>
    item.available && (
      !search ||
      item.title.toLowerCase().includes(search.toLowerCase()) ||
      item.description.toLowerCase().includes(search.toLowerCase()) ||
      item.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    )
  );

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePageVal = Math.min(page, totalPages);
  const startIdx = (safePageVal - 1) * PAGE_SIZE;
  const paginated = filtered.slice(startIdx, startIdx + PAGE_SIZE);

  const getEffectivePrice = (price: number) =>
    price > 0 ? price : globalWPPrice > 0 ? globalWPPrice : 0;

  return (
    <div className="space-y-6">
      {/* Tutorial Video */}
      <WatchVideoButton serviceKey="working_pictures" />

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-kitan-surface to-kitan-card border border-kitan-border p-8">
        <div className="hero-glow top-[-100px] left-[-50px] opacity-20" />
        <div className="relative z-10">
          <div className="badge-teal inline-flex items-center gap-2 mb-4">
            <Camera size={12} /> Working Pictures &amp; Videos
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-kitan-off-white mb-3">
            Professional <span className="gradient-text">Working Pictures</span>
          </h1>
          <p className="text-kitan-muted max-w-xl leading-relaxed">
            Purchase authentic-looking professional photos and videos set in real work environments. Perfect for LinkedIn, profiles, and applications.
          </p>
        </div>
      </div>

      {/* Search + View Toggle row */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
          <input
            type="text"
            placeholder="Search by environment, country, profession..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="input-kitan pl-10 text-sm"
          />
        </div>
        {/* View mode toggle */}
        <div className="flex items-center bg-kitan-card border border-kitan-border rounded-xl overflow-hidden flex-shrink-0">
          <button
            onClick={() => handleViewMode('grid')}
            title="Grid View"
            className={cn('p-2.5 transition-colors', viewMode === 'grid' ? 'bg-kitan-teal text-white' : 'text-kitan-subtle hover:text-kitan-muted')}
          >
            <Grid2X2 size={16} />
          </button>
          <button
            onClick={() => handleViewMode('list')}
            title="List View"
            className={cn('p-2.5 transition-colors', viewMode === 'list' ? 'bg-kitan-teal text-white' : 'text-kitan-subtle hover:text-kitan-muted')}
          >
            <List size={16} />
          </button>
        </div>
      </div>

      {/* Loading skeletons */}
      {loading && (
        <div className={cn(
          viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'
        )}>
          {Array.from({ length: 8 }).map((_, i) => (
            <SkeletonCard key={i} list={viewMode === 'list'} />
          ))}
        </div>
      )}

      {/* Refresh failure while cached items are still shown */}
      {refreshFailed && !loading && items.length > 0 && (
        <StaleDataBanner onRetry={() => loadItems(true)} />
      )}

      {/* First-load failure — clear retry state instead of "no items" */}
      {error && !loading && items.length === 0 && (
        <ErrorState
          title="Unable to load working pictures right now"
          message="Check your connection and try again."
          onRetry={() => loadItems(true)}
          icon={<Camera size={44} className="text-red-400" />}
        />
      )}

      {/* Empty state — only shown after load completes without error */}
      {!loading && !error && filtered.length === 0 && (
        <div className="card-kitan p-16 text-center">
          <Camera size={48} className="text-kitan-subtle mx-auto mb-4" />
          <p className="text-kitan-off-white font-semibold mb-2">No items found</p>
          <p className="text-kitan-muted text-sm">Try a different search term</p>
        </div>
      )}

      {/* Grid / List */}
      {!loading && filtered.length > 0 && (
        <>
          <div className={cn(
            viewMode === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-4'
          )}>
            {paginated.map(item => {
              const effectivePrice = getEffectivePrice(item.price);

              if (viewMode === 'list') {
                // ── List view: horizontal card ──────────────────────────
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(`/working-pictures/${item.id}`)}
                    className="card-kitan overflow-hidden text-left group hover:border-kitan-teal flex flex-row"
                  >
                    <div className="w-40 sm:w-48 flex-shrink-0 overflow-hidden bg-kitan-bg">
                      <OptimizedImage
                        src={item.thumbnail || item.images[0]}
                        alt={item.title}
                        className="w-full h-full min-h-[120px]"
                        imgClassName="object-contain group-hover:scale-[1.02] transition-transform duration-500"
                        fallback={<Camera size={24} className="text-kitan-subtle opacity-30" />}
                      />
                    </div>
                    <div className="p-4 flex flex-col justify-between flex-1 gap-3">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          {item.featured && (
                            <span className="flex items-center gap-1 bg-amber-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                              <Star size={9} fill="white" /> Featured
                            </span>
                          )}
                        </div>
                        <h3 className="font-display font-bold text-kitan-off-white text-sm uppercase tracking-wide leading-snug group-hover:text-kitan-teal transition-colors line-clamp-2">
                          {item.title}
                        </h3>
                        {item.description && (
                          <p className="text-kitan-muted text-xs leading-relaxed line-clamp-2 mt-1">{item.description}</p>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        {effectivePrice > 0 && (
                          <p className="text-kitan-teal font-bold text-sm">{formatNGN(effectivePrice)}</p>
                        )}
                        <span className="ml-auto text-xs font-bold text-kitan-teal group-hover:text-kitan-teal-bright transition-colors">
                          View →
                        </span>
                      </div>
                    </div>
                  </button>
                );
              }

              // ── Grid view ──────────────────────────────────────────────
              return (
                <button
                  key={item.id}
                  onClick={() => navigate(`/working-pictures/${item.id}`)}
                  className="card-kitan overflow-hidden text-left group hover:border-kitan-teal relative transition-all"
                >
                  {/* Primary image — object-contain preserves full image, no cropping */}
                  <div className="w-full overflow-hidden rounded-t-2xl bg-kitan-bg flex items-center justify-center">
                    <OptimizedImage
                      src={item.thumbnail || item.images[0]}
                      alt={item.title}
                      className="w-full min-h-[160px]"
                      imgClassName="object-contain group-hover:scale-[1.02] transition-transform duration-500"
                      fallback={<Camera size={32} className="text-kitan-subtle opacity-30" />}
                    />
                  </div>

                  {/* Badges */}
                  {item.featured && (
                    <div className="absolute top-2 left-2 z-10">
                      <span className="flex items-center gap-1 bg-amber-500/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full shadow">
                        <Star size={9} fill="white" /> Featured
                      </span>
                    </div>
                  )}

                  <div className="p-4 space-y-2">
                    <h3 className="font-display font-bold text-kitan-off-white text-sm uppercase tracking-wide leading-snug group-hover:text-kitan-teal transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-kitan-muted text-xs leading-relaxed line-clamp-3">{item.description}</p>
                    )}
                    {effectivePrice > 0 && (
                      <p className="text-kitan-teal font-bold text-sm">{formatNGN(effectivePrice)}</p>
                    )}
                    <button
                      onClick={e => { e.stopPropagation(); navigate(`/working-pictures/${item.id}`); }}
                      className="w-full py-2.5 rounded-xl bg-kitan-teal hover:bg-kitan-teal-bright text-white text-sm font-bold transition-all shadow-teal-glow"
                    >
                      Buy Pictures
                    </button>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between pt-2">
            <p className="text-kitan-muted text-sm">
              Page {safePageVal} of {totalPages} · {filtered.length} items
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={() => handlePage(Math.max(1, safePageVal - 1))}
                disabled={safePageVal === 1}
                className={cn(
                  'flex items-center gap-1.5 px-5 py-2 rounded-xl font-semibold text-sm transition-all border',
                  safePageVal === 1
                    ? 'opacity-40 cursor-not-allowed bg-kitan-surface border-kitan-border text-kitan-muted'
                    : 'bg-kitan-teal text-white border-kitan-teal hover:bg-kitan-teal-bright shadow-teal-glow'
                )}
              >
                <ChevronLeft size={16} /> Prev
              </button>
              <button
                onClick={() => handlePage(Math.min(totalPages, safePageVal + 1))}
                disabled={safePageVal === totalPages}
                className={cn(
                  'flex items-center gap-1.5 px-5 py-2 rounded-xl font-semibold text-sm transition-all border',
                  safePageVal === totalPages
                    ? 'opacity-40 cursor-not-allowed bg-kitan-surface border-kitan-border text-kitan-muted'
                    : 'bg-kitan-teal text-white border-kitan-teal hover:bg-kitan-teal-bright shadow-teal-glow'
                )}
              >
                Next <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default WorkingPicturesPage;
