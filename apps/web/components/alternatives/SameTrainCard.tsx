'use client';

import React from 'react';
import { SameTrainAlternative, ComparisonItem } from './types';
import { formatCurrency, formatDuration } from './dateUtils';

interface SameTrainCardProps {
  alternative: SameTrainAlternative;
  isCompared: boolean;
  onToggleCompare: (item: ComparisonItem) => void;
  onViewCoachSpecs: (trainNumber: string, trainName: string) => void;
  onShare: (name: string) => void;
}

export const SameTrainCard: React.FC<SameTrainCardProps> = ({
  alternative,
  isCompared,
  onToggleCompare,
  onViewCoachSpecs,
  onShare,
}) => {
  const comparisonPayload: ComparisonItem = {
    id: `st-${alternative.trainNumber}-${alternative.ticketedOrigin.code}`,
    name: `${alternative.trainNumber} ${alternative.trainName} (via ${alternative.ticketedOrigin.code})`,
    category: 'Same Train Alternative',
    fare: alternative.fare != null ? alternative.fare : 'Fare Unavailable',
    duration:
      alternative.totalJourneyMinutes > 0
        ? `${formatDuration(alternative.totalJourneyMinutes)} (from ${alternative.intendedBoarding.code})`
        : 'Schedule Pending',
    durationMinutes: alternative.totalJourneyMinutes || 0,
    transfers: 0,
    status: alternative.availabilityStatus || 'Check IRCTC',
    routeSummary: `${alternative.ticketedOrigin.code} → [Board at ${alternative.intendedBoarding.code}] → ${alternative.ticketedDestination.code}`,
    departureTime: alternative.departureTimeBoarding,
    arrivalTime: alternative.arrivalTimeDestination,
    actionNote: 'Change boarding station on IRCTC to match intended boarding station before chart prep.',
  };

  const irctcBookingUrl = 'https://www.irctc.co.in/nget/train-search';

  return (
    <div className="w-full bg-surface rounded-3xl p-5 sm:p-6 border border-amber-500/40 shadow-sm flex flex-col gap-4 relative transition-all hover:border-amber-500/60">
      {/* Card Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-800 dark:text-amber-300 font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 border border-amber-500/30">
            <span className="material-symbols-outlined text-[15px] text-amber-600 dark:text-amber-400">
              alt_route
            </span>
            <span>Same Train, Alternative Segment</span>
          </span>
          <span className="text-xs text-text-secondary hidden sm:inline">
            Serving prior terminal on train schedule
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span
              className={`w-2 h-2 rounded-full ${
                alternative.availabilityCategory === 'AVAILABLE'
                  ? 'bg-emerald-500'
                  : alternative.availabilityCategory === 'RAC'
                  ? 'bg-amber-500'
                  : alternative.availabilityCategory === 'WAITLISTED'
                  ? 'bg-rose-500'
                  : 'bg-text-tertiary'
              }`}
            />
            <span className="text-xs font-semibold text-text-secondary">
              {alternative.availabilityStatus || 'Check IRCTC'}
            </span>
          </div>

          {/* Compare Checkbox */}
          <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer bg-surface-container px-2.5 py-1 rounded-lg hover:bg-surface-container-high transition-colors select-none">
            <input
              type="checkbox"
              checked={isCompared}
              onChange={() => onToggleCompare(comparisonPayload)}
              className="rounded border-border text-text focus:ring-text"
            />
            <span>{isCompared ? 'Comparing' : '+ Compare'}</span>
          </label>
        </div>
      </div>

      {/* Train Info Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base sm:text-lg font-bold text-text">
              {alternative.trainNumber} {alternative.trainName}
            </h3>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-container text-text-secondary uppercase">
              {alternative.travelClass || '3A'}
            </span>
          </div>
          <p className="text-xs text-text-secondary mt-0.5">
            Runs from {alternative.ticketedOrigin.name} ({alternative.ticketedOrigin.code}) to {alternative.ticketedDestination.name} ({alternative.ticketedDestination.code})
          </p>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-xs text-text-secondary">Effective Ticket Fare</div>
          <div className="text-base sm:text-lg font-extrabold text-text">
            {alternative.fare != null ? (
              <>
                {formatCurrency(alternative.fare)}
                {alternative.fareType === 'ESTIMATED' && (
                  <span className="text-[10px] font-semibold text-text-secondary uppercase ml-1 px-1.5 py-0.5 rounded bg-surface-container">
                    Est.
                  </span>
                )}
                {alternative.fareDifference != null && alternative.fareDifference > 0 && (
                  <span className="text-xs font-normal text-text-secondary ml-1">
                    (+{formatCurrency(alternative.fareDifference)} GN diff)
                  </span>
                )}
              </>
            ) : (
              <span className="text-xs font-semibold text-text-secondary">Fare Unavailable</span>
            )}
          </div>
        </div>
      </div>

      {/* Route Schematic Visualization Strip */}
      <div className="p-4 rounded-2xl bg-surface-container-low border border-border flex flex-col gap-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-text-secondary flex items-center justify-between">
          <span>Route Boarding Topology</span>
          <span className="text-amber-700 dark:text-amber-400 font-semibold lowercase text-xs">
            0 interchanges (same seat/coach throughout)
          </span>
        </div>

        {/* Stepper / Track Schematic */}
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 relative pt-1">
          {/* Station 1: Ticketed Origin */}
          <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-surface border border-border">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
              <span className="font-mono font-bold text-xs text-text">
                {alternative.ticketedOrigin.code}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-700 dark:text-amber-400 font-medium">
                Paper Origin
              </span>
            </div>
            <div className="text-xs font-semibold text-text truncate">
              {alternative.ticketedOrigin.name}
            </div>
            <div className="text-[11px] text-text-secondary">
              Dep: {alternative.departureTimeTicketed}
            </div>
          </div>

          {/* Station 2: Intended Boarding Station */}
          <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-surface border-2 border-emerald-500/50">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
              <span className="font-mono font-bold text-xs text-text">
                {alternative.intendedBoarding.code}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold">
                Board Here
              </span>
            </div>
            <div className="text-xs font-bold text-text truncate">
              {alternative.intendedBoarding.name}
            </div>
            <div className="text-[11px] text-text-secondary">
              Dep: {alternative.departureTimeBoarding}
            </div>
          </div>

          {/* Station 3: Intermediate Route */}
          <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-surface border border-border">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-text-tertiary" />
              <span className="text-xs font-semibold text-text">Intermediate Sector</span>
            </div>
            <div className="text-xs text-text-secondary truncate">
              Central Railway Corridor
            </div>
            <div className="text-[11px] text-text-secondary">
              Non-stop seat retention
            </div>
          </div>

          {/* Station 4: Final Terminal */}
          <div className="flex flex-col gap-1 p-2.5 rounded-xl bg-surface border border-border">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-text" />
              <span className="font-mono font-bold text-xs text-text">
                {alternative.ticketedDestination.code}
              </span>
              <span className="text-[10px] px-1.5 py-0.2 rounded bg-surface-container-high text-text font-medium">
                Terminal
              </span>
            </div>
            <div className="text-xs font-semibold text-text truncate">
              {alternative.ticketedDestination.name}
            </div>
            <div className="text-[11px] text-text-secondary">
              Arr: {alternative.arrivalTimeDestination}
            </div>
          </div>
        </div>
      </div>

      {/* Comparison Metrics Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="p-2.5 rounded-xl bg-surface-container-low border border-border flex flex-col">
          <span className="text-[10px] font-semibold text-text-secondary uppercase">
            Boarding Station
          </span>
          <span className="text-xs font-bold text-text mt-0.5">
            Board at {alternative.intendedBoarding.code}
          </span>
          <span className="text-[10px] text-text-secondary mt-0.5">Valid via Rule 142</span>
        </div>

        <div className="p-2.5 rounded-xl bg-surface-container-low border border-border flex flex-col">
          <span className="text-[10px] font-semibold text-text-secondary uppercase">
            Paper Delta
          </span>
          <span className="text-xs font-bold text-text mt-0.5">
            {alternative.additionalDistanceKm != null ? `+${alternative.additionalDistanceKm} km` : 'Pending'}
          </span>
          <span className="text-[10px] text-text-secondary mt-0.5">
            Paper Origin Buffer
          </span>
        </div>

        <div className="p-2.5 rounded-xl bg-surface-container-low border border-border flex flex-col">
          <span className="text-[10px] font-semibold text-text-secondary uppercase">
            Fare Difference
          </span>
          <span className="text-xs font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
            {alternative.fareDifference != null ? `+${formatCurrency(alternative.fareDifference)}` : '—'}
          </span>
          <span className="text-[10px] text-text-secondary mt-0.5">Unlocks General Quota</span>
        </div>

        <div className="p-2.5 rounded-xl bg-surface-container-low border border-border flex flex-col">
          <span className="text-[10px] font-semibold text-text-secondary uppercase">
            Travel Duration
          </span>
          <span className="text-xs font-bold text-text mt-0.5">
            {alternative.totalJourneyMinutes > 0
              ? formatDuration(alternative.totalJourneyMinutes)
              : 'Schedule Pending'}
          </span>
          <span className="text-[10px] text-text-secondary mt-0.5">From intended boarding</span>
        </div>
      </div>

      {/* Crucial Regulatory Advisory */}
      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
        <span className="material-symbols-outlined text-[20px] text-amber-700 dark:text-amber-400 shrink-0 mt-0.5">
          policy
        </span>
        <div className="flex flex-col gap-1 text-xs">
          <span className="font-bold text-text">
            Mandatory IRCTC Procedure (Commercial Rule 142)
          </span>
          <p className="text-text-secondary text-[11px] leading-relaxed">
            {alternative.boardingRuleNotice || alternative.advisoryText}
          </p>
        </div>
      </div>

      {/* Action CTAs */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewCoachSpecs(alternative.trainNumber, alternative.trainName)}
            className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs font-semibold text-text flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">airline_seat_recline_extra</span>
            <span>Coach Specs</span>
          </button>
          <button
            type="button"
            onClick={() => onShare(alternative.trainName)}
            className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs font-semibold text-text flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">share</span>
            <span>Share</span>
          </button>
        </div>

        <a
          href={irctcBookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="px-4 py-2 rounded-xl bg-text text-bg hover:opacity-90 font-bold text-xs flex items-center gap-1.5 transition-all shadow-sm"
        >
          <span>Book on IRCTC ({alternative.ticketedOrigin.code} → {alternative.ticketedDestination.code})</span>
          <span className="material-symbols-outlined text-[15px]">open_in_new</span>
        </a>
      </div>
    </div>
  );
};
