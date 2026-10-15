/**
 * OptimizedImage — resilient, layout-stable image for all customer-facing media.
 *
 * Guarantees:
 * - The wrapper reserves its box (aspect-ratio) before the image arrives → no layout shift.
 * - loading state → shimmer; loaded → fade in; error → icon fallback (never an infinite spinner).
 * - `eager` for above-the-fold content, lazy (default) everywhere else.
 * - A broken or missing src can never leave a permanent loading state.
 */
import React, { memo, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  /** Chosen source (thumbnail preferred by callers). Null/undefined renders the fallback immediately. */
  src?: string | null;
  alt: string;
  /** Wrapper classes — controls layout (rounded corners, aspect ratio, bg). */
  className?: string;
  /** Img element classes — controls object-fit / scale-on-hover. */
  imgClassName?: string;
  /** Load eagerly (above-the-fold hero / first featured cards). */
  eager?: boolean;
  /** Icon or node shown while loading, on error, or when src is empty. */
  fallback?: React.ReactNode;
  /** Wrapper aspect ratio (e.g. '4/3'). Omit when the wrapper already has a fixed height. */
  aspect?: string;
}

const OptimizedImage: React.FC<Props> = ({
  src,
  alt,
  className,
  imgClassName,
  eager = false,
  fallback = null,
  aspect,
}) => {
  const [status, setStatus] = useState<'loading' | 'loaded' | 'error'>(() => (src ? 'loading' : 'error'));

  // A late-arriving or changed src resets the cycle; an empty src is an error, never a spinner.
  useEffect(() => {
    setStatus(src ? 'loading' : 'error');
  }, [src]);

  // Safety net: if onLoad never fires (some mobile edge cases), stop the shimmer after 8s.
  useEffect(() => {
    if (status !== 'loading') return;
    const t = window.setTimeout(() => {
      setStatus(s => (s === 'loading' ? 'error' : s));
    }, 8000);
    return () => window.clearTimeout(t);
  }, [status, src]);

  return (
    <div
      className={cn('relative overflow-hidden bg-kitan-bg', className)}
      style={aspect ? { aspectRatio: aspect } : undefined}
    >
      {status === 'loading' && (
        <div className="absolute inset-0 bg-kitan-card animate-pulse flex items-center justify-center" aria-hidden="true">
          {fallback}
        </div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex items-center justify-center" aria-hidden="true">
          {fallback}
        </div>
      )}
      {src && (
        <img
          src={src}
          alt={alt}
          loading={eager ? 'eager' : 'lazy'}
          decoding="async"
          draggable={false}
          onLoad={() => setStatus('loaded')}
          onError={() => setStatus('error')}
          className={cn(
            'w-full h-full',
            status === 'loaded' ? 'opacity-100' : 'opacity-0',
            'transition-opacity duration-300',
            imgClassName,
          )}
        />
      )}
    </div>
  );
};

export default memo(OptimizedImage);
