/**
 * VideoModal — plays a tutorial video in a fullscreen overlay.
 * Supports YouTube, Vimeo, and direct MP4 URLs.
 */
import React, { useEffect, useRef } from 'react';
import { X, PlayCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VideoModalProps {
  open: boolean;
  onClose: () => void;
  videoUrl: string;
  title?: string;
}

function getEmbedUrl(url: string): { type: 'youtube' | 'vimeo' | 'mp4'; src: string } {
  if (!url) return { type: 'mp4', src: '' };

  // YouTube
  const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
  if (ytMatch) {
    return { type: 'youtube', src: `https://www.youtube.com/embed/${ytMatch[1]}?autoplay=1&rel=0&modestbranding=1` };
  }

  // Vimeo
  const vmMatch = url.match(/vimeo\.com\/(\d+)/);
  if (vmMatch) {
    return { type: 'vimeo', src: `https://player.vimeo.com/video/${vmMatch[1]}?autoplay=1` };
  }

  // Fallback — direct video file
  return { type: 'mp4', src: url };
}

const VideoModal: React.FC<VideoModalProps> = ({ open, onClose, videoUrl, title }) => {
  const videoRef = useRef<HTMLVideoElement>(null);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    if (open) document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Lock body scroll
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!open) return null;

  const { type, src } = getEmbedUrl(videoUrl);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.85)', backdropFilter: 'blur(6px)' }}
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-4xl bg-kitan-surface rounded-3xl overflow-hidden border border-kitan-border shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-kitan-border">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-xl bg-kitan-teal/15 border border-kitan-teal/30 flex items-center justify-center">
              <PlayCircle size={16} className="text-kitan-teal" />
            </div>
            <div>
              <p className="text-kitan-off-white text-sm font-semibold">{title || 'Tutorial Video'}</p>
              <p className="text-kitan-subtle text-xs">Watch how it works</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-xl bg-kitan-card border border-kitan-border flex items-center justify-center text-kitan-muted hover:text-kitan-off-white hover:border-kitan-teal transition-all"
          >
            <X size={16} />
          </button>
        </div>

        {/* Video */}
        <div className="relative w-full" style={{ paddingBottom: '56.25%' }}>
          {type === 'mp4' ? (
            <video
              ref={videoRef}
              src={src}
              controls
              autoPlay
              className="absolute inset-0 w-full h-full bg-black"
            />
          ) : (
            <iframe
              src={src}
              className="absolute inset-0 w-full h-full"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              title={title || 'Tutorial Video'}
            />
          )}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-kitan-border">
          <p className="text-kitan-subtle text-xs text-center">Press <kbd className="font-mono bg-kitan-card border border-kitan-border px-1.5 py-0.5 rounded text-xs">Esc</kbd> or click outside to close</p>
        </div>
      </div>
    </div>
  );
};

export default VideoModal;
