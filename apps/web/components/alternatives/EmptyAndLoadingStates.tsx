'use client';

import React from 'react';

export const SkeletonLoader: React.FC = () => {
  return (
    <div className="flex flex-col gap-4 animate-pulse" aria-label="Loading alternatives">
      {[1, 2, 3].map((i) => (
        <div
          key={`skel-${i}`}
          className="w-full bg-surface rounded-3xl p-5 sm:p-6 border border-border shadow-xs flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <div className="h-6 w-48 bg-surface-container rounded-full" />
            <div className="h-6 w-24 bg-surface-container rounded-lg" />
          </div>

          <div className="h-8 w-72 bg-surface-container rounded-xl" />

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="h-16 bg-surface-container-low rounded-xl" />
            <div className="h-16 bg-surface-container-low rounded-xl" />
            <div className="h-16 bg-surface-container-low rounded-xl" />
            <div className="h-16 bg-surface-container-low rounded-xl" />
          </div>

          <div className="flex justify-between items-center pt-2 border-t border-border">
            <div className="h-8 w-32 bg-surface-container rounded-xl" />
            <div className="h-8 w-40 bg-surface-container rounded-xl" />
          </div>
        </div>
      ))}
    </div>
  );
};

interface EmptyStateProps {
  onResetFilters: () => void;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ onResetFilters }) => {
  return (
    <div className="w-full bg-surface rounded-3xl p-10 sm:p-14 border border-border flex flex-col items-center justify-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-surface-container flex items-center justify-center text-text-secondary">
        <span className="material-symbols-outlined text-[28px]">search_off</span>
      </div>
      <h3 className="text-base font-bold text-text">No Matching Pathways Found</h3>
      <p className="text-xs text-text-secondary max-w-md leading-relaxed">
        None of the alternative journeys meet your active filter criteria (e.g. max duration, fare, or layover bounds).
      </p>
      <button
        type="button"
        onClick={onResetFilters}
        className="mt-2 px-4 py-2 rounded-xl bg-text text-bg text-xs font-semibold hover:opacity-90 transition-opacity"
      >
        Reset All Filters
      </button>
    </div>
  );
};

interface ErrorStateProps {
  message: string;
  onRetry: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message, onRetry }) => {
  return (
    <div className="w-full bg-surface rounded-3xl p-10 sm:p-14 border border-rose-500/30 flex flex-col items-center justify-center text-center gap-3">
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
        <span className="material-symbols-outlined text-[28px]">error</span>
      </div>
      <h3 className="text-base font-bold text-text">Unable to Load Alternative Journeys</h3>
      <p className="text-xs text-text-secondary max-w-md leading-relaxed">
        {message || 'The railway query service encountered a temporary error. Please verify station codes or try again.'}
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-2 px-4 py-2 rounded-xl bg-text text-bg text-xs font-semibold hover:opacity-90 transition-opacity flex items-center gap-1.5"
      >
        <span className="material-symbols-outlined text-[16px]">refresh</span>
        <span>Retry Search</span>
      </button>
    </div>
  );
};

interface ShareToastProps {
  message: string;
  onDismiss: () => void;
}

export const ShareToast: React.FC<ShareToastProps> = ({ message, onDismiss }) => {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl bg-text text-bg shadow-2xl border border-border/20 text-xs font-semibold animate-in fade-in slide-in-from-bottom-2"
    >
      <span className="material-symbols-outlined text-[18px] text-emerald-400">check_circle</span>
      <span>{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-2 text-bg/60 hover:text-bg"
        aria-label="Dismiss notification"
      >
        <span className="material-symbols-outlined text-[16px]">close</span>
      </button>
    </div>
  );
};
