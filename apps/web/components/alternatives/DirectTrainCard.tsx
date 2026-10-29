'use client';

import React from 'react';
import { DirectTrainAlternative, ComparisonItem } from './types';
import { formatCurrency, formatDuration } from './dateUtils';

interface DirectTrainCardProps {
  train: DirectTrainAlternative;
  isCompared: boolean;
  onToggleCompare: (item: ComparisonItem) => void;
  onViewCoachSpecs: (trainNumber: string, trainName: string) => void;
  onShare: (name: string) => void;
}

export const DirectTrainCard: React.FC<DirectTrainCardProps> = ({
  train,
  isCompared,
  onToggleCompare,
  onViewCoachSpecs,
  onShare,
}) => {
  const comparisonPayload: ComparisonItem = {
    id: `dt-${train.trainNumber}`,
    name: `${train.trainNumber} ${train.trainName}`,
    category: 'Alternative Direct Train',
    fare: train.fare || 0,
    duration: train.durationFormatted || formatDuration(train.durationMinutes),
    durationMinutes: train.durationMinutes,
    transfers: 0,
    status: train.availabilityStatus || 'Check PRS Live',
    routeSummary: `${train.origin.code} → ${train.destination.code} (Direct)`,
    departureTime: train.departureTime,
    arrivalTime: train.arrivalTime,
    actionNote: 'Direct booking available on IRCTC. Verify current seat quota.',
  };

  const irctcBookingUrl = 'https://www.irctc.co.in/nget/train-search';

  return (
    <div className="w-full bg-surface rounded-3xl p-5 sm:p-6 border border-border shadow-sm flex flex-col gap-4 relative transition-all hover:border-text/30">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-surface-container text-text font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 border border-border">
            <span className="material-symbols-outlined text-[15px] text-text-secondary">
              train
            </span>
            <span>Alternative Direct Train</span>
          </span>
          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-surface-container text-text-secondary uppercase">
            {train.trainType || 'Express'}
          </span>
          {train.isFaster && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 uppercase">
              Faster Service
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-blue-500" />
            <span className="text-xs font-semibold text-blue-700 dark:text-blue-400">
              {train.availabilityStatus || 'Check PRS Live'}
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

      {/* Train Info & Schedule Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h3 className="text-base sm:text-lg font-bold text-text">
            {train.trainNumber} {train.trainName}
          </h3>
          <p className="text-xs text-text-secondary mt-1">
            {train.scheduledServiceText || 'Daily Scheduled Service'} · Distance: {train.distanceKm} km
          </p>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-xs text-text-secondary">Indicative Base Fare</div>
          <div className="text-base sm:text-lg font-extrabold text-text">
            {formatCurrency(train.fare)}
          </div>
        </div>
      </div>

      {/* Journey Timeline */}
      <div className="p-4 rounded-2xl bg-surface-container-low border border-border flex items-center justify-between gap-4">
        {/* Origin Departure */}
        <div className="flex flex-col">
          <span className="text-base sm:text-xl font-bold font-mono text-text">
            {train.departureTime}
          </span>
          <span className="text-xs font-bold text-text mt-0.5">
            {train.origin.code}
          </span>
          <span className="text-[11px] text-text-secondary truncate max-w-[140px]">
            {train.origin.name}
          </span>
        </div>

        {/* Duration Track */}
        <div className="flex-1 flex flex-col items-center px-2">
          <span className="text-[11px] font-semibold text-text-secondary mb-1">
            {train.durationFormatted || formatDuration(train.durationMinutes)}
          </span>
          <div className="w-full flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-border" />
            <div className="flex-1 h-0.5 bg-border relative">
              <span className="material-symbols-outlined absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[14px] text-text-secondary">
                train
              </span>
            </div>
            <span className="w-1.5 h-1.5 rounded-full bg-border" />
          </div>
          <span className="text-[10px] text-text-tertiary mt-1">
            {train.totalHaltsBetween ? `${train.totalHaltsBetween} halts` : 'Direct Scheduled Run'}
          </span>
        </div>

        {/* Destination Arrival */}
        <div className="flex flex-col text-right">
          <span className="text-base sm:text-xl font-bold font-mono text-text">
            {train.arrivalTime}
          </span>
          <span className="text-xs font-bold text-text mt-0.5">
            {train.destination.code}
          </span>
          <span className="text-[11px] text-text-secondary truncate max-w-[140px]">
            {train.destination.name}
          </span>
        </div>
      </div>

      {/* Action CTAs */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewCoachSpecs(train.trainNumber, train.trainName)}
            className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs font-semibold text-text flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">airline_seat_recline_extra</span>
            <span>Coach Specs</span>
          </button>
          <button
            type="button"
            onClick={() => onShare(train.trainName)}
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
          <span>Book on IRCTC ({train.origin.code} → {train.destination.code})</span>
          <span className="material-symbols-outlined text-[15px]">open_in_new</span>
        </a>
      </div>
    </div>
  );
};
