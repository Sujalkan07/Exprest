'use client';

import React from 'react';
import { FilterOptions } from './types';
import { formatCurrency } from './dateUtils';

interface AlternativesFilterSidebarProps {
  filters: FilterOptions;
  onChange: (filters: FilterOptions) => void;
  onReset: () => void;
  hasActiveFilters: boolean;
}

export const AlternativesFilterSidebar: React.FC<AlternativesFilterSidebarProps> = ({
  filters,
  onChange,
  onReset,
  hasActiveFilters,
}) => {
  const updateFilter = <K extends keyof FilterOptions>(key: K, value: FilterOptions[K]) => {
    onChange({
      ...filters,
      [key]: value,
    });
  };

  const layoverHours = Math.floor(filters.maxLayoverMinutes / 60);
  const layoverMinutes = filters.maxLayoverMinutes % 60;
  const layoverDisplay = `${layoverHours}h ${layoverMinutes ? `${layoverMinutes}m` : '00m'}`;

  const durationHours = Math.floor(filters.maxDurationMinutes / 60);

  return (
    <aside aria-label="Journey Filters" className="flex flex-col gap-4">
      <div className="w-full bg-surface rounded-2xl p-4 border border-border shadow-xs flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[18px] text-text">tune</span>
            <span className="text-sm font-bold text-text">Interactive Filters</span>
          </div>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold text-text hover:underline transition-colors"
            >
              Reset All
            </button>
          )}
        </div>

        {/* Prior Serving Station Booking Option Notice */}
        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-start gap-2.5">
          <input
            id="includeEarlierStopFilter"
            type="checkbox"
            checked={filters.includeEarlierStop}
            onChange={(e) => updateFilter('includeEarlierStop', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-border text-amber-600 focus:ring-amber-500"
          />
          <label htmlFor="includeEarlierStopFilter" className="cursor-pointer select-none text-xs">
            <div className="font-bold text-text flex items-center gap-1">
              <span>Prior Serving Stations</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-800 dark:text-amber-300 font-medium">
                High Success
              </span>
            </div>
            <p className="text-[11px] text-text-secondary mt-0.5 leading-relaxed">
              Book from originating terminal to unlock General Quota seats, boarding legally at your intended station.
            </p>
          </label>
        </div>

        {/* Max Transfer Wait Time */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="layoverRange" className="font-semibold text-text-secondary">
              Max Transfer Layover
            </label>
            <span className="font-bold font-mono text-text bg-surface-container px-2 py-0.5 rounded text-[11px]">
              {layoverDisplay}
            </span>
          </div>
          <input
            id="layoverRange"
            type="range"
            min={45}
            max={480}
            step={15}
            value={filters.maxLayoverMinutes}
            onChange={(e) => updateFilter('maxLayoverMinutes', parseInt(e.target.value, 10))}
            className="w-full accent-text cursor-pointer h-1.5 bg-surface-container rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-text-tertiary">
            <span>45m (Min Buffer)</span>
            <span>8h (Max Layover)</span>
          </div>
        </div>

        {/* Max Duration */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="durationRange" className="font-semibold text-text-secondary">
              Max Total Duration
            </label>
            <span className="font-bold font-mono text-text bg-surface-container px-2 py-0.5 rounded text-[11px]">
              &lt; {durationHours} hrs
            </span>
          </div>
          <input
            id="durationRange"
            type="range"
            min={720}
            max={3600}
            step={60}
            value={filters.maxDurationMinutes}
            onChange={(e) => updateFilter('maxDurationMinutes', parseInt(e.target.value, 10))}
            className="w-full accent-text cursor-pointer h-1.5 bg-surface-container rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-text-tertiary">
            <span>12h</span>
            <span>60h</span>
          </div>
        </div>

        {/* Max Fare Budget */}
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="fareRange" className="font-semibold text-text-secondary">
              Max Fare Budget
            </label>
            <span className="font-bold font-mono text-text bg-surface-container px-2 py-0.5 rounded text-[11px]">
              {formatCurrency(filters.maxFare)}
            </span>
          </div>
          <input
            id="fareRange"
            type="range"
            min={500}
            max={8000}
            step={100}
            value={filters.maxFare}
            onChange={(e) => updateFilter('maxFare', parseInt(e.target.value, 10))}
            className="w-full accent-text cursor-pointer h-1.5 bg-surface-container rounded-lg"
          />
          <div className="flex justify-between text-[10px] text-text-tertiary">
            <span>₹500</span>
            <span>₹8,000</span>
          </div>
        </div>

        {/* Quick Toggles */}
        <div className="pt-2 border-t border-border flex flex-col gap-2.5">
          <span className="text-[11px] font-bold uppercase tracking-wider text-text-tertiary">
            Preferences
          </span>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.directOnly}
              onChange={(e) => updateFilter('directOnly', e.target.checked)}
              className="h-4 w-4 rounded border-border text-text focus:ring-text"
            />
            <span className="text-xs text-text font-medium">Direct Trains Only</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.availableOnly}
              onChange={(e) => updateFilter('availableOnly', e.target.checked)}
              className="h-4 w-4 rounded border-border text-text focus:ring-text"
            />
            <span className="text-xs text-text font-medium">Available / High Quota Only</span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={filters.sameStationOnly}
              onChange={(e) => updateFilter('sameStationOnly', e.target.checked)}
              className="h-4 w-4 rounded border-border text-text focus:ring-text"
            />
            <span className="text-xs text-text font-medium">Same-Station Transfers Only</span>
          </label>
        </div>
      </div>

      {/* Technical Clarification & Regulatory Advisory */}
      <div className="w-full bg-surface rounded-2xl p-4 border border-border shadow-xs flex flex-col gap-3 text-xs">
        <div className="flex items-center gap-1.5 text-text font-bold">
          <span className="material-symbols-outlined text-[17px] text-text">gavel</span>
          <span>Authentic Quota Logic</span>
        </div>
        <p className="text-[11px] text-text-secondary leading-relaxed">
          CRIS PRS divides train capacity into station-pair quotas. Origin-to-Destination journeys have large General Quotas (GN), whereas intermediate stations share smaller Pooled Quotas (PQWL / RLWL).
        </p>

        <div className="pt-2 border-t border-border">
          <div className="font-semibold text-text text-[11px] mb-1">Railway Rule 142:</div>
          <p className="text-[10px] text-text-secondary leading-relaxed">
            You can book from an earlier originating terminal and change your boarding point on IRCTC up to 4 hours before scheduled departure without forfeiture.
          </p>
        </div>
      </div>
    </aside>
  );
};
