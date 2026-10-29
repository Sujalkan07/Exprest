'use client';

import React from 'react';
import { ComparisonItem } from './types';

interface ComparisonTrayProps {
  items: ComparisonItem[];
  onOpenMatrix: () => void;
  onClear: () => void;
}

export const ComparisonTray: React.FC<ComparisonTrayProps> = ({
  items,
  onOpenMatrix,
  onClear,
}) => {
  if (items.length === 0) return null;

  return (
    <aside
      aria-label="Journey Comparison Tray"
      className="fixed bottom-6 right-6 z-40 flex items-center gap-3 px-4 py-3 rounded-2xl bg-text text-bg shadow-2xl border border-border/20 backdrop-blur-md transition-all animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="flex items-center gap-2.5">
        <span className="w-2.5 h-2.5 rounded-full bg-amber-400 animate-pulse" />
        <div className="flex flex-col">
          <span className="text-xs font-bold">
            Comparing {items.length} Pathway{items.length > 1 ? 's' : ''}
          </span>
          <span className="text-[11px] opacity-80 max-w-[200px] sm:max-w-[260px] truncate">
            {items.map((i) => i.name).join(' vs ')}
          </span>
        </div>
      </div>

      <div className="h-6 w-px bg-bg/20 mx-1" />

      <button
        type="button"
        onClick={onOpenMatrix}
        className="px-3 py-1.5 rounded-lg bg-bg/20 hover:bg-bg/30 text-bg text-xs font-semibold transition-colors"
      >
        View Matrix
      </button>

      <button
        type="button"
        onClick={onClear}
        aria-label="Clear Selection"
        title="Clear Comparison"
        className="text-bg/70 hover:text-bg transition-colors"
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </aside>
  );
};
