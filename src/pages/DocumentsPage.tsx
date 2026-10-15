
import React, { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Search, Tag, ChevronRight, Grid2X2, List } from 'lucide-react';
import { useDocumentsStore, usePageStateStore } from '@/stores/useStore';
import WatchVideoButton from '@/components/features/WatchVideoButton';
import OptimizedImage from '@/components/features/OptimizedImage';
import { ErrorState, StaleDataBanner } from '@/components/features/CollectionState';
import { cn } from '@/lib/utils';

const PAGE_KEY = 'documents';

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

const DocumentsPage: React.FC = () => {
  const { documents, loading, error, refreshFailed, loadDocuments } = useDocumentsStore();

  // Per-page data loading
  useEffect(() => { loadDocuments(); }, [loadDocuments]); // Fixed: Added loadDocuments to dependency array
  const { getPageState, setPageState } = usePageStateStore();
  const navigate = useNavigate();

  const saved = getPageState(PAGE_KEY);
  const [search, setSearch] = useState(saved.search ?? '');
  const [category, setCategory] = useState(saved.category ?? 'All');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(saved.viewMode ?? 'grid');

  const persist = useCallback((update: Partial<typeof saved>) => {
    setPageState(PAGE_KEY, update);
  }, [setPageState]);

  const handleSearch = (val: string) => { setSearch(val); persist({ search: val }); };
  const handleCategory = (cat: string) => { setCategory(cat); persist({ category: cat }); };
  const handleViewMode = (mode: 'grid' | 'list') => { setViewMode(mode); persist({ viewMode: mode }); };

  const categories = ['All', ...Array.from(new Set(documents.map(d => d.category || 'General')))];

  const filtered = documents.filter(doc => {
    const matchSearch = !search || doc.title.toLowerCase().includes(search.toLowerCase()) || doc.description.toLowerCase().includes(search.toLowerCase());
    const matchCat = category === 'All' || (doc.category || 'General') === category;
    return matchSearch && matchCat && doc.available;
  });

  return (
    <div className="space-y-6">
      {/* Tutorial Video */}
      <WatchVideoButton serviceKey="documents" />

      {/* Prominent notice */}
      <div className="relative overflow-hidden rounded-2xl border-2 border-red-500 bg-red-500/10 p-4 md:p-5">
        <div className="flex items-start gap-3">
          <span className="text-red-400 text-2xl flex-shrink-0 leading-none mt-0.5">⚠️</span>
          <p className="text-red-400 font-black uppercase tracking-wide text-sm md:text-base leading-snug">
            NOTE: IF YOU CAN'T FIND THE DOCUMENT YOU WANT, SEND US A DM TO GET STARTED AND DESCRIBE WHAT YOU WANT.
          </p>
        </div>
      </div>

      {/* Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-kitan-surface to-kitan-card border border-kitan-border p-8">
        <div className="hero-glow top-[-100px] right-[-100px] opacity-30" />
        <div className="relative z-10">
          <div className="badge-teal inline-flex items-center gap-2 mb-4">
            <FileText size={12} /> Document Services
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-bold text-kitan-off-white mb-3">
            Generate Custom <span className="gradient-text">Documents</span>
          </h1>
          <p className="text-kitan-muted max-w-xl leading-relaxed">
            Purchase professionally prepared custom documents — work permits, visa letters, PR applications, and more.
          </p>
        </div>
      </div>

      {/* Filters + View Toggle */}
      <div className="flex flex-wrap gap-3 items-center">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-kitan-subtle" />
          <input
            type="text"
            placeholder="Search documents..."
            value={search}
            onChange={e => handleSearch(e.target.value)}
            className="input-kitan pl-10 text-sm"
          />
        </div>
        {/* View toggle */}
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
        {/* Category filters */}
        <div className="flex flex-wrap gap-2 w-full">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => handleCategory(cat)}
              className={cn(
                'px-4 py-2 rounded-xl text-sm font-medium transition-all border',
                category === cat
                  ? 'bg-kitan-teal text-white border-kitan-teal shadow-teal-glow'
                  : 'bg-kitan-card border-kitan-border text-kitan-muted hover:border-kitan-teal hover:text-kitan-off-white'
              )}
            >
              {cat}
            </button>
          ))}
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

      {/* Refresh failure while cached documents are still shown */}
      {refreshFailed && !loading && documents.length > 0 && (
        <StaleDataBanner onRetry={() => loadDocuments(true)} />
      )}

      {/* First-load failure — clear retry state instead of "no documents" */}
      {error && !loading && documents.length === 0 && (
        <ErrorState
          title="Unable to load documents right now"
          message="Check your connection and try again."
          onRetry={() => loadDocuments(true)}
          icon={<FileText size={44} className="text-red-400" />}
        />
      )}

      {/* Empty state — only after load completes without error */}
      {!loading && !error && filtered.length === 0 && (
        <div className="card-kitan p-16 text-center">
          <FileText size={48} className="text-kitan-subtle mx-auto mb-4" />
          <p className="text-kitan-off-white font-semibold mb-2">No documents found</p>
          <p className="text-kitan-muted text-sm">Try adjusting your search or filters, or send us a DM to request a custom document</p>
        </div>
      )}

      {/* Grid / List */}
      {!loading && filtered.length > 0 && (
        <div className={cn(
          viewMode === 'grid'
            ? 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5'
            : 'flex flex-col gap-4'
        )}>
          {filtered.map(doc => {
            if (viewMode === 'list') {
              return (
                <button
                  key={doc.id}
                  onClick={() => navigate(`/documents/${doc.id}`)}
                  className="card-kitan overflow-hidden text-left group hover:border-kitan-teal flex flex-row"
                >
                  <div className="relative w-40 sm:w-48 flex-shrink-0 bg-kitan-bg overflow-hidden">
                    <OptimizedImage
                      src={doc.thumbnail || doc.previewImages[0]}
                      alt={doc.title}
                      className="w-full h-full min-h-[120px]"
                      imgClassName="object-contain group-hover:scale-105 transition-transform duration-500"
                      fallback={<FileText size={24} className="text-kitan-subtle opacity-30" />}
                    />
                    {doc.category && (
                      <span className="absolute top-2 left-2 bg-kitan-teal/90 text-white text-xs font-semibold px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Tag size={9} /> {doc.category}
                      </span>
                    )}
                  </div>
                  <div className="p-4 flex flex-col justify-between flex-1">
                    <div>
                      <h3 className="font-display font-bold text-kitan-off-white text-sm leading-snug group-hover:text-kitan-teal transition-colors line-clamp-2 mb-1">
                        {doc.title}
                      </h3>
                      <p className="text-kitan-muted text-xs line-clamp-2 leading-relaxed">{doc.description}</p>
                    </div>
                    <span className="flex items-center gap-1 text-kitan-teal text-xs font-semibold mt-2">
                      Get Access <ChevronRight size={13} />
                    </span>
                  </div>
                </button>
              );
            }

            return (
              <button
                key={doc.id}
                onClick={() => navigate(`/documents/${doc.id}`)}
                className="card-kitan overflow-hidden text-left group hover:border-kitan-teal relative"
              >
                <div className="relative bg-kitan-bg overflow-hidden" style={{ height: '192px' }}>
                  <OptimizedImage
                    src={doc.thumbnail || doc.previewImages[0]}
                    alt={doc.title}
                    className="w-full h-full"
                    imgClassName="object-contain group-hover:scale-105 transition-transform duration-500"
                    fallback={<FileText size={24} className="text-kitan-subtle opacity-30" />}
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-kitan-bg/80 via-transparent to-transparent" />
                  {doc.category && (
                    <span className="absolute text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1 top-3 left-3 bg-kitan-teal/90">
                      <Tag size={10} /> {doc.category}
                    </span>
                  )}

                </div>
                <div className="p-5 space-y-3">
                  <h3 className="font-display font-bold text-kitan-off-white text-base leading-snug group-hover:text-kitan-teal transition-colors line-clamp-2">
                    {doc.title}
                  </h3>
                  <p className="text-kitan-muted text-sm line-clamp-2 leading-relaxed">{doc.description}</p>
                  <div className="flex items-center justify-between pt-2 border-t border-kitan-border">
                    <p className="text-kitan-teal font-bold text-sm">{doc.price > 0 ? `₦${doc.price.toLocaleString('en-NG', { maximumFractionDigits: 0 })}` : ''}</p>
                    <span className="flex items-center gap-1 text-kitan-teal text-sm font-semibold group-hover:gap-2 transition-all">
                      Get Access <ChevronRight size={16} />
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

export default DocumentsPage;
