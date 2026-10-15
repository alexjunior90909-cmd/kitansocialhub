/**
 * CollectionState — shared failure UI for customer-facing collections.
 *
 * ErrorState: replaces the page body when a first load fails.
 * StaleDataBanner: shown above still-visible cached data when a background
 * revalidation failed — the user keeps their content and can refresh manually.
 */
import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

export const ErrorState: React.FC<{
  title?: string;
  message?: string;
  onRetry: () => void;
  icon?: React.ReactNode;
}> = ({ title = 'Unable to load right now', message = 'Something went wrong while loading. Please check your connection and try again.', onRetry, icon }) => (
  <div className="card-kitan p-12 text-center">
    <div className="mb-4 flex justify-center">
      {icon ?? <AlertCircle size={44} className="text-red-400" />}
    </div>
    <p className="text-kitan-off-white font-semibold mb-1">{title}</p>
    <p className="text-kitan-muted text-sm mb-5 max-w-sm mx-auto">{message}</p>
    <button onClick={onRetry} className="btn-primary inline-flex items-center gap-2 text-sm">
      <RefreshCw size={14} /> Retry
    </button>
  </div>
);

export const StaleDataBanner: React.FC<{ onRetry: () => void }> = ({ onRetry }) => (
  <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-2.5">
    <p className="text-amber-300/90 text-xs">
      Couldn't refresh just now — showing saved content.
    </p>
    <button
      onClick={onRetry}
      className="text-amber-300 text-xs font-semibold inline-flex items-center gap-1.5 hover:text-amber-200 transition-colors"
    >
      <RefreshCw size={12} /> Retry
    </button>
  </div>
);
