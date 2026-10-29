'use client';

import React from 'react';
import { formatDateIST } from './dateUtils';
import { StationInfo } from './types';

interface OriginalRequestBannerProps {
  origin: StationInfo;
  destination: StationInfo;
  date: string;
  travelClass: string;
  trainName?: string;
  trainNumber?: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export const OriginalRequestBanner: React.FC<OriginalRequestBannerProps> = ({
  origin,
  destination,
  date,
  travelClass,
  trainName = 'Direct Sector Express',
  trainNumber,
  onRefresh,
  isRefreshing,
}) => {
  return (
    <div className="w-full rounded-2xl bg-amber-500/10 border border-amber-500/30 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div className="flex items-start gap-3.5">
        <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
          <span className="material-symbols-outlined text-[24px]">info</span>
        </div>
        <div className="flex flex-col gap-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm sm:text-base text-text font-bold">
              Original Request: {trainNumber ? `${trainNumber} ${trainName}` : `${origin.name} → ${destination.name}`}
            </span>
            <span className="text-xs text-text-secondary">
              {origin.code} → {destination.code} · {formatDateIST(date)} · {travelClass === 'ALL' ? 'All Classes' : travelClass}
            </span>
            <span className="px-2.5 py-0.5 rounded-full bg-rose-500/10 text-rose-700 dark:text-rose-400 text-xs font-semibold border border-rose-500/20">
              Direct Berths Exhausted / High Waitlist
            </span>
          </div>
          <p className="text-xs sm:text-sm text-text-secondary max-w-4xl">
            Direct berths for your selected date are heavily waitlisted or unavailable.
            Below are 3 verified railway strategies: same-train prior station segment, alternative direct trains, and timed connection junctions.
          </p>
        </div>
      </div>

      {onRefresh && (
        <button
          type="button"
          onClick={onRefresh}
          disabled={isRefreshing}
          className="self-end md:self-center shrink-0 px-3.5 py-2 rounded-xl bg-surface hover:bg-surface-elevated border border-border text-xs font-semibold text-text flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[16px] ${isRefreshing ? 'animate-spin' : ''}`}>
            refresh
          </span>
          <span>Refresh Availability</span>
        </button>
      )}
    </div>
  );
};
