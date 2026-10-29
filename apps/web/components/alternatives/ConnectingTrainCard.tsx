'use client';

import React from 'react';
import { ConnectingAlternative, ComparisonItem } from './types';
import { formatCurrency, formatDuration } from './dateUtils';

interface ConnectingTrainCardProps {
  connection: ConnectingAlternative;
  isCompared: boolean;
  onToggleCompare: (item: ComparisonItem) => void;
  onViewCoachSpecs: (trainNumber: string, trainName: string) => void;
  onShare: (name: string) => void;
}

export const ConnectingTrainCard: React.FC<ConnectingTrainCardProps> = ({
  connection,
  isCompared,
  onToggleCompare,
  onViewCoachSpecs,
  onShare,
}) => {
  const comparisonPayload: ComparisonItem = {
    id: `con-${connection.interchangeStation.code}-${connection.leg1.trainNumber}-${connection.leg2.trainNumber}`,
    name: `${connection.leg1.trainNumber} + ${connection.leg2.trainNumber} (via ${connection.interchangeStation.code})`,
    category: 'Connecting Journey',
    fare: connection.totalFare || 0,
    duration: connection.totalDurationFormatted || formatDuration(connection.totalDurationMinutes),
    durationMinutes: connection.totalDurationMinutes,
    transfers: connection.transfersCount || 1,
    status: connection.availabilityStatus || 'Verified Connection',
    routeSummary: `${connection.origin.code} → ${connection.interchangeStation.code} (Transfer ${connection.transferLayoverFormatted || formatDuration(connection.transferLayoverMinutes)}) → ${connection.destination.code}`,
    departureTime: connection.leg1.departureTime,
    arrivalTime: connection.leg2.arrivalTime,
    actionNote: `Book Leg 1 (${connection.leg1.trainNumber}) and Leg 2 (${connection.leg2.trainNumber}) separately on IRCTC. Interchange at ${connection.interchangeStation.code}.`,
  };

  const irctcBookingUrl = 'https://www.irctc.co.in/nget/train-search';

  return (
    <div className="w-full bg-surface rounded-3xl p-5 sm:p-6 border border-border shadow-sm flex flex-col gap-4 relative transition-all hover:border-text/30">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="px-3 py-1 rounded-full bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 font-bold text-xs uppercase tracking-wide flex items-center gap-1.5 border border-indigo-500/20">
            <span className="material-symbols-outlined text-[15px] text-indigo-600 dark:text-indigo-400">
              transfer_within_a_station
            </span>
            <span>Connecting Journey ({connection.transfersCount || 1} Interchange)</span>
          </span>

          <span className="px-2.5 py-0.5 rounded-full bg-surface-container font-mono text-xs font-bold text-text">
            Via {connection.interchangeStation.name} ({connection.interchangeStation.code})
          </span>

          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">
            Same Station Interchange
          </span>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
              {connection.availabilityStatus || 'Verified Connection'}
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

      {/* Composite Metrics Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <span className="text-xs text-text-secondary">Composite Journey:</span>
          <span className="text-sm font-bold text-text">
            {connection.totalDurationFormatted || formatDuration(connection.totalDurationMinutes)} Total Travel Time
          </span>
          <span className="text-xs text-text-tertiary">
            (Includes {connection.transferLayoverFormatted || formatDuration(connection.transferLayoverMinutes)} layover)
          </span>
        </div>

        <div className="text-left sm:text-right">
          <div className="text-xs text-text-secondary">Combined Fare (Leg 1 + Leg 2)</div>
          <div className="text-base sm:text-lg font-extrabold text-text">
            {formatCurrency(connection.totalFare)}
          </div>
        </div>
      </div>

      {/* Two Legs & Interchange Visual Strip */}
      <div className="grid grid-cols-1 md:grid-cols-11 gap-3 items-center">
        {/* Leg 1 */}
        <div className="md:col-span-5 p-4 rounded-2xl bg-surface-container-low border border-border flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Leg 1: {connection.leg1.trainNumber}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-surface-container font-mono text-text">
              {connection.leg1.durationFormatted || formatDuration(connection.leg1.durationMinutes)}
            </span>
          </div>
          <div className="text-xs font-bold text-text truncate">
            {connection.leg1.trainName}
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
            <div>
              <span className="font-mono font-bold text-text">{connection.leg1.departureTime}</span>
              <div className="text-[11px] text-text-secondary">{connection.leg1.from.code}</div>
            </div>
            <span className="material-symbols-outlined text-[14px] text-text-tertiary">
              arrow_forward
            </span>
            <div className="text-right">
              <span className="font-mono font-bold text-text">{connection.leg1.arrivalTime}</span>
              <div className="text-[11px] text-text-secondary">{connection.interchangeStation.code}</div>
            </div>
          </div>
        </div>

        {/* Layover Connector (Center column) */}
        <div className="md:col-span-1 flex flex-col items-center justify-center py-2 md:py-0">
          <div className="flex md:flex-col items-center gap-1">
            <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400">
              schedule
            </span>
            <span className="text-[10px] font-bold font-mono text-text bg-amber-500/10 px-1.5 py-0.5 rounded border border-amber-500/20 text-center whitespace-nowrap">
              {connection.transferLayoverFormatted || formatDuration(connection.transferLayoverMinutes)}
            </span>
            <span className="text-[9px] text-text-tertiary hidden md:block">Layover</span>
          </div>
        </div>

        {/* Leg 2 */}
        <div className="md:col-span-5 p-4 rounded-2xl bg-surface-container-low border border-border flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-text-secondary">
              Leg 2: {connection.leg2.trainNumber}
            </span>
            <span className="text-[10px] px-2 py-0.5 rounded bg-surface-container font-mono text-text">
              {connection.leg2.durationFormatted || formatDuration(connection.leg2.durationMinutes)}
            </span>
          </div>
          <div className="text-xs font-bold text-text truncate">
            {connection.leg2.trainName}
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-border/50">
            <div>
              <span className="font-mono font-bold text-text">{connection.leg2.departureTime}</span>
              <div className="text-[11px] text-text-secondary">{connection.interchangeStation.code}</div>
            </div>
            <span className="material-symbols-outlined text-[14px] text-text-tertiary">
              arrow_forward
            </span>
            <div className="text-right">
              <span className="font-mono font-bold text-text">{connection.leg2.arrivalTime}</span>
              <div className="text-[11px] text-text-secondary">{connection.leg2.to.code}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Safety Buffer Check */}
      <div className="flex items-center gap-2 text-xs text-text-secondary px-1">
        <span className="material-symbols-outlined text-[16px] text-emerald-600 dark:text-emerald-400">
          verified
        </span>
        <span>
          Comfortable buffer ({connection.transferLayoverFormatted || formatDuration(connection.transferLayoverMinutes)} layover exceeds Indian Railways 45-minute minimum interchange safety requirement)
        </span>
      </div>

      {/* Action CTAs */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pt-2 border-t border-border">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onViewCoachSpecs(connection.leg1.trainNumber, connection.leg1.trainName)}
            className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs font-semibold text-text flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">airline_seat_recline_extra</span>
            <span>Coach Specs</span>
          </button>
          <button
            type="button"
            onClick={() =>
              onShare(
                `Connecting Journey via ${connection.interchangeStation.code}: ${connection.leg1.trainNumber} + ${connection.leg2.trainNumber}`
              )
            }
            className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs font-semibold text-text flex items-center gap-1.5 transition-colors"
          >
            <span className="material-symbols-outlined text-[15px]">share</span>
            <span>Share</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <a
            href={irctcBookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-1.5 rounded-xl bg-surface-container hover:bg-surface-container-high border border-border text-xs font-semibold text-text flex items-center gap-1 transition-colors"
          >
            <span>Book Leg 1 ({connection.leg1.trainNumber})</span>
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          </a>
          <a
            href={irctcBookingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="px-3.5 py-1.5 rounded-xl bg-text text-bg hover:opacity-90 font-bold text-xs flex items-center gap-1 transition-all shadow-sm"
          >
            <span>Book Leg 2 ({connection.leg2.trainNumber})</span>
            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
          </a>
        </div>
      </div>
    </div>
  );
};
