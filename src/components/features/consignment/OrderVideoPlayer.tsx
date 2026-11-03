/**
 * OrderVideoPlayer — plays a delivered consignment video inline.
 *
 * Privacy: videos live in a PRIVATE bucket; a short-lived signed URL is
 * fetched only when the user presses Play (nothing is preloaded — no network
 * video bytes move until requested). Fullscreen + download are provided.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Play, Download, Maximize2, X, Loader2, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getVideoSignedUrl } from '@/lib/consignment';

interface Props {
  storagePath: string;
  className?: string;
}

const OrderVideoPlayer: React.FC<Props> = ({ storagePath, className }) => {
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Signed URL fetched lazily on Play — never on mount.
  useEffect(() => {
    if (!loading) return;
    let cancelled = false;
    getVideoSignedUrl(storagePath)
      .then(url => { if (!cancelled) { setSignedUrl(url); setError(null); } })
      .catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : 'Could not load video'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [loading, storagePath]);

  const play = () => {
    if (signedUrl) { videoRef.current?.play().catch(() => undefined); return; }
    setLoading(true);
  };

  const fullscreen = () => {
    const v = videoRef.current;
    if (v?.requestFullscreen) void v.requestFullscreen().catch(() => undefined);
  };

  if (error) {
    return (
      <div className={cn('rounded-2xl border border-red-500/30 bg-red-500/5 p-6 text-center', className)}>
        <AlertCircle size={24} className="text-red-400 mx-auto mb-2" />
        <p className="text-kitan-off-white text-sm font-semibold">Video link expired</p>
        <p className="text-kitan-muted text-xs mt-1">{error}</p>
        <button onClick={() => { setError(null); setLoading(true); }} className="btn-secondary text-xs mt-3">Retry</button>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-2xl border border-kitan-border overflow-hidden bg-kitan-bg aspect-video', className)}>
      {signedUrl ? (
        <>
          <video
            ref={videoRef}
            src={signedUrl}
            controls
            playsInline
            preload="metadata"
            className="absolute inset-0 w-full h-full"
          />
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <button
              onClick={fullscreen}
              title="Fullscreen"
              className="w-9 h-9 rounded-full bg-kitan-bg/80 border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-off-white transition-colors"
            >
              <Maximize2 size={15} />
            </button>
            <a
              href={signedUrl}
              download="consignment-video.mp4"
              title="Download video"
              className="w-9 h-9 rounded-full bg-kitan-bg/80 border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-off-white transition-colors"
            >
              <Download size={15} />
            </a>
          </div>
        </>
      ) : (
        <button
          onClick={play}
          disabled={loading}
          className="absolute inset-0 w-full h-full flex flex-col items-center justify-center gap-3 bg-gradient-to-br from-kitan-surface via-kitan-card to-kitan-bg group"
        >
          <span className="absolute inset-0 bg-gradient-to-t from-kitan-bg/60 to-transparent" />
          <span className="relative w-16 h-16 rounded-full bg-kitan-teal/90 shadow-teal-glow flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
            {loading
              ? <Loader2 size={26} className="text-white animate-spin" />
              : <Play size={26} className="text-white ml-1" fill="white" />}
          </span>
          <span className="relative text-kitan-off-white text-sm font-semibold">
            {loading ? 'Preparing your video…' : 'Play Video'}
          </span>
          <span className="relative text-kitan-subtle text-xs">Your finished consignment presentation</span>
        </button>
      )}
    </div>
  );
};

export default OrderVideoPlayer;
