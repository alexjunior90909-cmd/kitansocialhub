/**
 * SampleVideo — admin-configurable sample video preview.
 *
 * Performance: renders a lightweight thumbnail/placeholder first and mounts
 * the real player (iframe/<video>) only after the user clicks play — the full
 * video is never loaded or downloaded until requested.
 *
 * Supports YouTube (embedded), Vimeo (embedded) and direct video URLs
 * (mp4/webm/ogg — includes Cloudinary). No external redirects.
 */
import React, { memo, useMemo, useState } from 'react';
import { Play, X, VideoOff } from 'lucide-react';
import { cn } from '@/lib/utils';

type Source =
  | { kind: 'youtube'; id: string; thumb: string }
  | { kind: 'vimeo'; id: string }
  | { kind: 'file'; url: string };

function parseSource(url: string): Source | null {
  const t = url.trim();
  if (!t) return null;
  const yt = t.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{6,})/);
  if (yt) return { kind: 'youtube', id: yt[1], thumb: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` };
  const vm = t.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vm) return { kind: 'vimeo', id: vm[1] };
  return { kind: 'file', url: t };
}

interface Props {
  url: string | null;
  className?: string;
}

const SampleVideo: React.FC<Props> = ({ url, className }) => {
  const [playing, setPlaying] = useState(false);
  const source = useMemo(() => (url ? parseSource(url) : null), [url]);

  if (!source) {
    return (
      <div className={cn('relative rounded-3xl border border-kitan-border bg-kitan-card/60 backdrop-blur-md overflow-hidden flex flex-col items-center justify-center text-center p-10 aspect-video', className)}>
        <div className="w-16 h-16 rounded-2xl bg-kitan-bg/80 border border-kitan-border flex items-center justify-center mb-4">
          <VideoOff size={26} className="text-kitan-subtle" />
        </div>
        <p className="text-kitan-off-white font-semibold">Sample video coming soon</p>
        <p className="text-kitan-muted text-sm mt-1 max-w-sm">
          Our team is preparing a showcase presentation. Check back shortly — or create yours today.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('relative rounded-3xl border border-kitan-border overflow-hidden bg-kitan-bg aspect-video group', className)}>
      {playing ? (
        <>
          {source.kind === 'youtube' && (
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://www.youtube-nocookie.com/embed/${source.id}?autoplay=1&rel=0`}
              title="Consignment sample video"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          )}
          {source.kind === 'vimeo' && (
            <iframe
              className="absolute inset-0 w-full h-full"
              src={`https://player.vimeo.com/video/${source.id}?autoplay=1`}
              title="Consignment sample video"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
            />
          )}
          {source.kind === 'file' && (
            <video
              className="absolute inset-0 w-full h-full"
              src={source.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
            />
          )}
          <button
            onClick={() => setPlaying(false)}
            aria-label="Close player"
            className="absolute top-3 right-3 z-10 w-9 h-9 rounded-full bg-kitan-bg/80 border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-off-white transition-colors"
          >
            <X size={16} />
          </button>
        </>
      ) : (
        <button
          onClick={() => setPlaying(true)}
          className="absolute inset-0 w-full h-full flex items-end justify-center p-5 focus:outline-none"
          aria-label="Play sample video"
        >
          {source.kind === 'youtube' ? (
            <img
              src={source.thumb}
              alt="Sample video preview"
              loading="lazy"
              className="absolute inset-0 w-full h-full object-cover"
            />
          ) : (
            <div className="absolute inset-0 bg-gradient-to-br from-kitan-surface via-kitan-card to-kitan-bg" />
          )}
          <span className="absolute inset-0 bg-gradient-to-t from-kitan-bg/90 via-kitan-bg/30 to-transparent" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-18 h-18 lg:w-20 lg:h-20 rounded-full bg-kitan-teal/90 shadow-teal-glow flex items-center justify-center transition-transform duration-300 group-hover:scale-110">
            <Play size={30} className="text-white ml-1" fill="white" />
          </span>
          <span className="relative z-10 text-kitan-off-white text-sm font-semibold tracking-wide">
            Watch a Sample Presentation
          </span>
        </button>
      )}
    </div>
  );
};

export default memo(SampleVideo);
