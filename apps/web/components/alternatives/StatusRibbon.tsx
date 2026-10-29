'use client';

import React from 'react';
import Link from 'next/link';

interface StatusRibbonProps {
  sourceType?: 'live' | 'mock' | 'fallback';
  lastUpdated?: string;
}

export const StatusRibbon: React.FC<StatusRibbonProps> = ({
  sourceType = 'live',
  lastUpdated,
}) => {
  return (
    <div className="w-full bg-surface-container-low/80 border-b border-border py-2 px-4 sm:px-6">
      <div className="max-w-[1440px] mx-auto flex flex-wrap items-center justify-between gap-3 text-xs">
        {/* Breadcrumb Navigation */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-text-secondary">
          <Link href="/" className="hover:text-text transition-colors">
            Home
          </Link>
          <span className="text-border">/</span>
          <span className="text-text-secondary">Journey Planner</span>
          <span className="text-border">/</span>
          <span className="text-text font-semibold">Alternative Journeys</span>
        </nav>

        {/* Live RailRadar Data Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 font-medium text-[11px]">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>
              {sourceType === 'live'
                ? 'RailRadar Live Sync · Timetable & Topology Active'
                : 'Verified Static Schedule Baseline'}
            </span>
          </div>
          <span className="text-text-tertiary text-[11px] hidden sm:inline">
            Sync: {lastUpdated ? new Date(lastUpdated).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit' }) : 'Live IST'}
          </span>
        </div>
      </div>
    </div>
  );
};
