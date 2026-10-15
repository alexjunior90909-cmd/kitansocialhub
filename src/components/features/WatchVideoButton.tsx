/**
 * WatchVideoButton — fetches the assigned tutorial video for a service key
 * and opens it in the VideoModal.
 *
 * Usage: <WatchVideoButton serviceKey="gifts" />
 *
 * Service keys:
 *   gifts | documents | working_pictures | formats | virtual_numbers |
 *   receipt_generator | account_boosting | website
 */
import React, { useState, useEffect } from 'react';
import { PlayCircle, Video } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import VideoModal from './VideoModal';
import { cn } from '@/lib/utils';

interface WatchVideoButtonProps {
  serviceKey: string;
  className?: string;
  compact?: boolean; // smaller pill style
}

const WatchVideoButton: React.FC<WatchVideoButtonProps> = ({ serviceKey, className, compact }) => {
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [title,    setTitle]    = useState('Tutorial Video');
  const [open,     setOpen]     = useState(false);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('tutorial_videos')
        .select('video_url, title')
        .eq('service_key', serviceKey)
        .single();
      if (data?.video_url) {
        setVideoUrl(data.video_url);
        setTitle(data.title || 'Tutorial Video');
      }
      setLoading(false);
    })();
  }, [serviceKey]);

  if (loading || !videoUrl) return null;

  if (compact) {
    return (
      <>
        <button
          onClick={() => setOpen(true)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all',
            'bg-kitan-teal/10 border border-kitan-teal/30 text-kitan-teal hover:bg-kitan-teal/20 hover:border-kitan-teal',
            className,
          )}
        >
          <PlayCircle size={13} />
          Watch Video
        </button>
        <VideoModal open={open} onClose={() => setOpen(false)} videoUrl={videoUrl} title={title} />
      </>
    );
  }

  return (
    <>
      {/* Bold featured banner */}
      <div
        className={cn(
          'relative overflow-hidden rounded-2xl border border-kitan-teal/30 p-4 flex items-center gap-4 cursor-pointer group transition-all hover:border-kitan-teal',
          className,
        )}
        style={{ background: 'linear-gradient(135deg, rgba(20,184,166,0.08) 0%, rgba(20,184,166,0.03) 100%)' }}
        onClick={() => setOpen(true)}
        role="button"
        tabIndex={0}
        onKeyDown={e => e.key === 'Enter' && setOpen(true)}
      >
        {/* Play icon */}
        <div className="w-12 h-12 rounded-2xl bg-kitan-teal/15 border border-kitan-teal/30 flex items-center justify-center flex-shrink-0 group-hover:bg-kitan-teal/25 group-hover:scale-105 transition-all">
          <PlayCircle size={24} className="text-kitan-teal" />
        </div>

        {/* Text */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-0.5">
            <span className="font-display font-bold text-kitan-off-white text-sm">Watch Tutorial Video</span>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-kitan-teal/20 text-kitan-teal border border-kitan-teal/30 uppercase tracking-wide">New</span>
          </div>
          <p className="text-kitan-muted text-xs leading-snug line-clamp-1">
            {title} — Learn how to use this service step by step
          </p>
        </div>

        {/* Arrow */}
        <div className="flex-shrink-0 w-8 h-8 rounded-xl bg-kitan-teal/10 border border-kitan-teal/20 flex items-center justify-center group-hover:bg-kitan-teal group-hover:border-kitan-teal transition-all">
          <Video size={14} className="text-kitan-teal group-hover:text-white transition-colors" />
        </div>

        {/* Glow */}
        <div className="absolute right-[-30px] top-1/2 -translate-y-1/2 w-24 h-24 rounded-full bg-kitan-teal/10 blur-2xl pointer-events-none" />
      </div>

      <VideoModal open={open} onClose={() => setOpen(false)} videoUrl={videoUrl} title={title} />
    </>
  );
};

export default WatchVideoButton;
