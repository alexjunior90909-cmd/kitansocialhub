
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout, Search, ChevronRight, FileCheck, Grid2X2, List } from 'lucide-react';
import { useFormatsStore, usePageStateStore } from '@/stores/useStore';
import WatchVideoButton from '@/components/features/WatchVideoButton';
import OptimizedImage from '@/components/features/OptimizedImage';
import { ErrorState, StaleDataBanner } from '@/components/features/CollectionState';
import { formatNGN } from '@/constants';
import { cn } from '@/lib/utils';

const PAGE_KEY = 'formats';

// ── Skeleton card ──────────────────────────────────────────────────────────
const SkeletonCard: React.FC<{ list?: boolean }> = ({ list }) => (
  <div className={cn('card-kitan overflow-hidden animate-pulse', list && 'flex flex-row')}>
    <div className={cn('bg-kitan-border/30', list ? 'w-48 h-40 flex-shrink-0' : 'w-full h-48')} />
    <div className="p-5 space-y-3 flex-1">
      <div className="h-4 bg-kitan-border/30 rounded w-3/4" />
      <div className="h-3 bg-kitan-border/20 rounded w-full" />
      <div className="h-3 bg-kitan-border/20 rounded w-2/3" />
    </div>
  </div>
);

const FormatsPage: React.FC = () => {
  const { formats, loading, error, refreshFailed, loadFormats } = useFormatsStore();

  // Per-page data loading
  useEffect(() => { loadFormats(); }, [loadFormats]); // Corrected: Added loadFormats to dependency array
  const { getPageState, setPageState } = usePageStateStore();
  const navigate = useNavigate();

  const saved = getPageState(PAGE_KEY);
  const [search, setSearch] = useState(saved.search ?? '');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(saved.viewMode ?? 'grid');

  const persist = useCallback((update: Partial<typeof saved>) => {
    setPageState(PAGE_KEY, update);
  }, [setPageState]);

  const handleSearch = (val: string) => { setSearch(val); persist({ search: val }); };
  const handleViewMode = (mode: 'grid' | 'list') => { setViewMode(mode); persist({ viewMode: mode }); };

  const filtered = formats.filter(fmt =>
    fmt.available && (
      !search ||
      fmt.title.toLowerCase().includes(search.toLowerCase()) ||
      fmt.description.toLowerCase().includes(search.toLowerCase()) ||
      fmt.tags.some(t => t.toLowerCase().includes(search.toLowerCase()))
    )
  );

  return (
    <div className="space-y-8">
      {/* Tutorial Video */}
      <WatchVideoButton serviceKey="formats" />

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-kitan-surface to-kitan-card border border-kitan-border p-8">
        <div className="hero-glow bottom-[-100px] right-[-50px] opacity-20" />
        <div className="relative z-10">
          <div className="badge-teal inline-flex items-center gap-2 mb-4">
            <Layout size={12} /> Templates &amp; Formats
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-kitan-off-white mb-3">
            Work <span className="gradient-text">Formats &amp; Templates</span>
          </h1>
          <p className="text-kitan-muted max-w-xl leading-relaxed">
            Purchase professional templates, formats, and document bundles. CVs, visa letters, business plans, SOPs, and more.
          </p>
        </div>
      </div>

      {/* Search + View Toggle */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
          <input
            type="text"
            placeholder="Search templates, formats..."
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
          viewMode === 'grid' ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5' : 'flex flex-col gap-4'
        )}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} list={viewMode === 'list'} />
          ))}
        </div>
      )}

      {/* Refresh failure while cached formats are still shown */}
      {refreshFailed && !loading && formats.length > 0 && (
        <StaleDataBanner onRetry={() => loadFormats(true)} />
      )}

      {/* First-load failure — clear retry state instead of "no formats" */}
      {error && !loading && formats.length === 0 && (
        <ErrorState
          title="Unable to load formats right now"
          message="Check your connection and try again."
          onRetry={() => loadFormats(true)}
          icon={<Layout size={44} className="text-red-400" />}
        />
      )}

      {/* Empty state — only after load completes without error */}
      {!loading && !error && filtered.length === 0 && (
        <div className="card-kitan p-16 text-center">
          <Layout size={48} className="text-kitan-subtle mx-auto mb-4" />
          <p className="text-kitan-off-white font-semibold mb-2">No formats found</p>
          <p className="text-kitan-muted text-sm">Try a different search term</p>
        </div>
      )}

      {/* Grid / List */}
      {!loading && filtered.length > 0 && (
        <div className={cn(
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
            : 'flex flex-col gap-4'
        )}>
          {filtered.map(fmt => {
            if (viewMode === 'list') {
              return (
                <button
                  key={fmt.id}
                  onClick={() => navigate(`/formats/${fmt.id}`)}
                  className="card-kitan overflow-hidden text-left group hover:border-kitan-teal flex flex-row"
                >
                  <div className="relative w-40 sm:w-48 flex-shrink-0 bg-kitan-bg overflow-hidden">
                    <OptimizedImage
                      src={fmt.thumbnail || fmt.previewImages[0]}
                      alt={fmt.title}
                      className="w-full h-full min-h-[120px]"
                      imgClassName="object-contain group-hover:scale-105 transition-transform duration-500"
                      fallback={<FileCheck size={24} className="text-kitan-subtle opacity-30" />}
                    />
                    {fmt.fileType && (
                      <span className="absolute top-2 left-2 bg-kitan-bg/90 border border-kitan-border text-kitan-teal text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <FileCheck size={9} /> {fmt.fileType}
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex flex-col justify-between flex-1">
                    <div>
                      <div className="flex flex-wrap gap-1 mb-2">
                        {fmt.tags.slice(0, 2).map(tag => (
                          <span key={tag} className="text-xs bg-kitan-teal/10 text-kitan-teal border border-kitan-teal/20 px-2 py-0.5 rounded-full">{tag}</span>
                        ))}
                      </div>
                      <h3 className="font-display font-bold text-kitan-off-white text-sm leading-snug group-hover:text-kitan-teal transition-colors line-clamp-2 mb-1">
                        {fmt.title}
                      </h3>
                      <p className="text-kitan-muted text-xs line-clamp-2">{fmt.description}</p>
                    </div>
                    <div className="flex items-center justify-between mt-2">
                      {fmt.price > 0 && <p className="text-kitan-teal font-bold text-sm">{formatNGN(fmt.price)}</p>}
                      <span className="ml-auto flex items-center gap-1 text-kitan-teal text-xs font-semibold">
                        Get Template <ChevronRight size={13} />
                      </span>
                    </div>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={fmt.id}
                onClick={() => navigate(`/formats/${fmt.id}`)}
                className="card-kitan overflow-hidden text-left group hover:border-kitan-teal relative"
              >
                <div className="relative bg-kitan-bg overflow-hidden" style={{ height: '192px' }}>
                  <OptimizedImage
                    src={fmt.thumbnail || fmt.previewImages[0]}
                    alt={fmt.title}
                    className="w-full h-full"
                    imgClassName="object-contain group-hover:scale-105 transition-transform duration-500"
                    fallback={<FileCheck size={24} className="text-kitan-subtle opacity-30" />}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-kitan-bg/80 via-transparent to-transparent" />
                  {fmt.fileType && (
                    <span className="absolute top-3 left-3 bg-kitan-bg/90 border border-kitan-border text-kitan-teal text-xs font-bold px-3 py-1 rounded-full flex items-center gap-1">
                      <FileCheck size={10} /> {fmt.fileType}
                    </span>
                  )}
                </div>
                <div className="p-5 space-y-3">
                  <div className="flex flex-wrap gap-1">
                    {fmt.tags.slice(0, 3).map(tag => (
                      <span key={tag} className="text-xs bg-kitan-teal/10 text-kitan-teal border border-kitan-teal/20 px-2 py-0.5 rounded-full">{tag}</span>
                    ))}
                  </div>
                  <h3 className="font-display font-bold text-kitan-off-white text-base leading-snug group-hover:text-kitan-teal transition-colors line-clamp-2">
                    {fmt.title}
                  </h3>
                  <p className="text-kitan-muted text-sm line-clamp-2">{fmt.description}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-kitan-border">
                    {fmt.price > 0 && <p className="text-kitan-teal font-bold">{formatNGN(fmt.price)}</p>}
                    <span className="ml-auto flex items-center gap-1 text-kitan-teal text-sm font-semibold group-hover:gap-2 transition-all">
                      Get Template <ChevronRight size={16} />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default FormatsPage;
