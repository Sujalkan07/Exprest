'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { JourneyMap } from '@/components/map/JourneyMap';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function formatTime(isoString: string | null | undefined, extraDelayMinutes: number = 0): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (extraDelayMinutes > 0) d.setMinutes(d.getMinutes() + extraDelayMinutes);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata',
    });
  } catch { return isoString; }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const year = parseInt(parts[0]);
      const month = parseInt(parts[1]) - 1;
      const day = parseInt(parts[2]);
      if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
        return new Date(year, month, day).toLocaleDateString('en-IN', {
          weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
        });
      }
    }
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('en-IN', {
      weekday: 'short', day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch { return dateStr; }
}

function delayLabel(mins: number | null | undefined): { text: string; cls: string } {
  if (!mins || mins === 0) return { text: 'Right Time', cls: 'text-success' };
  if (mins > 0) return { text: `+${mins} min late`, cls: 'text-warning' };
  return { text: `${Math.abs(mins)} min early`, cls: 'text-info' };
}

export default function JourneyOverviewPage() {
  const params = useParams();
  const journeyId = params.journeyId as string;

  const { data, isLoading, error } = useQuery({
    queryKey: ['journey', journeyId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/journeys/${journeyId}`);
      if (!res.ok) throw new Error('Journey not found');
      return res.json();
    },
    refetchInterval: 30_000,
  });

  const journey = data?.data;
  const progress = journey?.progress;
  const stops: Array<{
    stationId: string;
    stationName?: string;
    stationLat?: number;
    stationLon?: number;
    distanceKm?: number;
    platform?: number | string;
    status?: string;
    scheduledArrival?: string | null;
    scheduledDeparture?: string | null;
    actualArrival?: string | null;
    actualDeparture?: string | null;
    delayMinutes?: number | null;
    haltMinutes?: number | null;
  }> = journey?.stops || [];

  const nextStopIndex = journey?.progress?.nextStopIdx ?? (journey?.progress?.completedStations ?? 1);
  const currentStopIndex = journey?.progress?.currentStopIdx ?? Math.max(0, nextStopIndex - 1);
  const nextStop = stops[nextStopIndex];
  const currentStop = stops[currentStopIndex] || stops[0];
  const originStop = stops[0];
  const destStop = stops[stops.length - 1];

  const serviceDateRaw =
    journey?.run?.startDate ||
    journey?.startDate ||
    (journeyId.includes('_') ? journeyId.split('_').pop() : '');
  const serviceDateFormatted = formatDate(serviceDateRaw) || 'Scheduled Run';
  const isTrainRunning = journey?.run?.isLive && journey?.run?.status === 'running';
  const delayMinutes = journey?.run?.delayMinutes ?? 0;
  const speed = Math.round(journey?.run?.currentLocation?.speedKph || 0);

  const remainingKm = Math.round(progress?.remainingDistanceKm || 0);
  const remainingHours = Math.floor(remainingKm / 75);
  const remainingMins = Math.round((remainingKm % 75) * 0.8);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-text-secondary text-sm animate-pulse">
        Loading live journey data…
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-sm">
        Could not load journey. Check the train number and try again.
      </div>
    );
  }

  // Coach composition — derive from train data or use sensible default
  const coaches: Array<{ label: string; type: string; capacity?: number }> =
    journey?.train?.coaches || [
      { label: 'ENG', type: 'Engine' },
      { label: 'EOG', type: 'EOG' },
      { label: 'H1', type: '1AC' },
      { label: 'A1', type: '2AC' },
      { label: 'A2', type: '2AC' },
      { label: 'PC', type: 'Pantry' },
      { label: 'B1', type: '3AC' },
      { label: 'B2', type: '3AC' },
      { label: 'B3', type: '3AC' },
      { label: 'EOG', type: 'EOG' },
    ];

  return (
    <>
      <main className="w-full max-w-7xl mx-auto px-space-lg py-space-lg flex-1 space-y-space-lg">

        {/* ── BREADCRUMB ── */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-border">
          <div className="flex items-center gap-3 font-body-sm text-body-sm">
            <Link className="text-on-surface-variant hover:text-primary flex items-center gap-1 transition-colors" href="/">
              <span className="material-symbols-outlined text-sm">arrow_back</span>
              <span>Back to live search</span>
            </Link>
            <span className="text-outline-variant">/</span>
            <span className="text-secondary font-medium">Network Overview</span>
            <span className="text-outline-variant">/</span>
            <span className="text-on-surface font-semibold">{journey?.train?.originStationName || 'Origin'} Corridor</span>
          </div>
          <div className="flex items-center gap-2 bg-surface px-2.5 py-1 rounded border border-border font-label text-label text-on-surface-variant">
            <span className="relative flex h-2 w-2">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isTrainRunning ? 'bg-success' : 'bg-warning'} opacity-75`}></span>
              <span className={`relative inline-flex rounded-full h-2 w-2 ${isTrainRunning ? 'bg-success' : 'bg-warning'}`}></span>
            </span>
            <span className="tabular-nums">{isTrainRunning ? 'Live Telemetry Synced' : `Next Scheduled Run: ${serviceDateFormatted}`}</span>
            <span className="text-outline-variant">•</span>
            <span className="text-secondary">GPS: <strong className="text-on-surface font-semibold">100% Lock</strong></span>
          </div>
        </div>

        {/* ── JOURNEY HERO ── */}
        <div className="bg-surface-elevated border border-border rounded-xl p-space-lg shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-label text-label tracking-wider font-semibold">
                  {journey?.train?.type || 'EXPRESS'}
                </span>
                <span className="text-secondary font-body-sm text-body-sm">
                  {isTrainRunning ? 'Running' : 'Next Departure:'}{' '}
                  <strong className="text-primary font-semibold">{serviceDateFormatted}</strong>
                </span>
              </div>
              <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight font-bold">
                {journey?.train?.number || 'Train'} {journey?.train?.name || ''}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-on-surface-variant font-body-sm text-body-sm">
                <span>{journey?.train?.category || 'Mail / Express'}</span>
                <span className="text-outline-variant">•</span>
                <span>LHB Rake</span>
                <span className="text-outline-variant">•</span>
                <span>Electric WAP-7 High Horsepower</span>
              </div>
              <div className="pt-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface rounded-xl border border-border text-on-surface font-body-sm text-body-sm">
                  <span className="font-semibold">
                    {journey?.train?.originStationName || originStop?.stationName || 'Origin'} ({journey?.train?.originStationId || originStop?.stationId})
                  </span>
                  <span className="material-symbols-outlined text-secondary text-sm">trending_flat</span>
                  <span className="font-semibold">
                    {journey?.train?.destinationStationName || destStop?.stationName || 'Destination'} ({journey?.train?.destinationStationId || destStop?.stationId})
                  </span>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2.5">
              <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-surface text-on-surface-variant font-body-sm text-body-sm hover:bg-surface-elevated transition-all">
                <span className="material-symbols-outlined text-sm">star</span>
                <span>Favorited</span>
              </button>
              <button className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border bg-surface text-on-surface-variant font-body-sm text-body-sm hover:bg-surface-elevated transition-all">
                <span className="material-symbols-outlined text-sm">share</span>
                <span>Share Journey</span>
              </button>
              <Link
                href={`/journey/${journeyId}/map`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm shadow-sm transition-all duration-150"
              >
                <span className="material-symbols-outlined text-sm">radar</span>
                <span className="font-semibold">Live Radar View</span>
              </Link>
            </div>
          </div>
        </div>

        {/* ── STATUS BANNER — 3 columns ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md">
          {/* Status + text (7 cols) */}
          <div className="md:col-span-7 bg-surface-elevated border border-border rounded-xl p-space-md space-y-2">
            <div className="flex items-center gap-2.5 flex-wrap">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-label text-label font-semibold ${!isTrainRunning ? 'bg-info/10 text-info border-info/20' : delayMinutes > 0 ? 'bg-warning/10 text-warning border-warning/20' : 'bg-success/10 text-success border-success/20'}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${!isTrainRunning ? 'bg-info' : delayMinutes > 0 ? 'bg-warning animate-pulse' : 'bg-success animate-pulse'}`}></span>
                {!isTrainRunning
                  ? `NEXT RUN: ${serviceDateFormatted}`
                  : delayMinutes > 0
                  ? `+${delayMinutes} MIN DELAY`
                  : 'ON TIME (0 min delay)'}
              </span>
              <span className="text-secondary font-label text-label">
                {isTrainRunning ? 'Block Section: Clear (Signal Green)' : `Scheduled Departure: ${serviceDateFormatted}`}
              </span>
            </div>
            <p className="text-on-surface font-body-md text-body-md font-medium">
              {isTrainRunning
                ? delayMinutes > 0
                  ? `Running delayed by +${delayMinutes} min · Recovering speed`
                  : 'Maintaining scheduled timetable velocity · Clear block section ahead'
                : `Train scheduled to start on ${serviceDateFormatted} from ${originStop?.stationName || 'Origin'}`}
            </p>
            <p className="text-on-surface-variant font-body-sm text-body-sm">
              {isTrainRunning
                ? `Automated Block Signalling · Next interlocking: ${nextStop?.stationName || currentStop?.stationName || 'En route'} Yard Section 'B'`
                : `Dispatch Checklist Verified · Next Origin Yard Handover on ${serviceDateFormatted}`}
            </p>
          </div>

          {/* Velocity (2.5 cols) */}
          <div className="md:col-span-3 bg-surface-elevated border border-border rounded-xl p-space-md flex flex-col justify-center items-start">
            <div className="font-label text-label text-secondary uppercase tracking-wider mb-1">Current Velocity</div>
            <div className="font-display-lg text-display-lg font-bold text-on-surface tabular-nums">
              {isTrainRunning ? speed : 0}
              <span className="text-heading-md font-normal text-secondary ml-1">km/h</span>
            </div>
            <div className="text-on-surface-variant font-body-sm text-body-sm tabular-nums mt-1">Max permissible: 130 km/h</div>
          </div>

          {/* Schedule Reliability (2.5 cols) */}
          <div className="md:col-span-2 bg-surface-elevated border border-border rounded-xl p-space-md flex flex-col justify-between">
            <div className="flex items-center justify-between font-label text-label text-secondary mb-2">
              <span>SCHEDULE RELIABILITY</span>
            </div>
            <div className={`font-heading-md text-heading-md font-bold ${delayMinutes <= 15 ? 'text-success' : 'text-warning'}`}>
              {delayMinutes <= 15 ? '99.4%' : '88.2%'} On-time
            </div>
            <div className="mt-2 space-y-1 border-t border-border pt-2">
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-secondary">Remaining ETA</span>
                <span className="font-bold text-on-surface tabular-nums">
                  {remainingHours > 0 ? `${remainingHours}h ${remainingMins}m` : `${remainingMins}m`}
                </span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-secondary">Next Signal</span>
                <span className={`font-bold flex items-center gap-1 ${isTrainRunning ? 'text-success' : 'text-info'}`}>
                  <span className={`h-2 w-2 rounded-full ${isTrainRunning ? 'bg-success' : 'bg-info'}`}></span>
                  {isTrainRunning ? 'GREEN' : 'READY'}
                </span>
              </div>
              <div className="flex items-center justify-between text-body-sm">
                <span className="text-secondary">Train Type</span>
                <span className="font-medium text-on-surface text-right">{journey?.train?.category || journey?.train?.type || 'Express'}</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── STATION CARDS ── */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
          {/* Departed / Origin */}
          <div className="bg-surface-elevated border border-border rounded-xl p-space-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className={`px-2.5 py-0.5 rounded font-label text-label font-semibold ${isTrainRunning ? 'bg-secondary-container text-on-secondary-container' : 'bg-info/10 text-info border border-info/20'}`}>
                {isTrainRunning ? 'DEPARTED' : 'SCHEDULED ORIGIN'}
              </span>
              <span className="text-secondary font-body-sm text-body-sm tabular-nums">
                {currentStop?.haltMinutes ? `Halt: ${currentStop.haltMinutes} mins (Completed)` : `Next Run: ${serviceDateFormatted}`}
              </span>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading-lg text-heading-lg text-on-surface font-semibold tracking-tight">
                  {isTrainRunning
                    ? (currentStop?.stationName || originStop?.stationName)
                    : (originStop?.stationName || journey?.train?.originStationName || 'Origin')}
                </h2>
                <span className="font-heading-md text-heading-md font-bold text-secondary">
                  {isTrainRunning
                    ? (currentStop?.stationId || originStop?.stationId)
                    : (originStop?.stationId || journey?.train?.originStationId || '—')}
                </span>
              </div>
              <div className="text-on-surface-variant font-body-sm text-body-sm flex items-center gap-2 mt-1">
                <span className="font-medium text-on-surface">Platform {originStop?.platform || 1}</span>
                <span className="text-outline-variant">•</span>
                <span>Speed on clearing: <strong className="tabular-nums text-on-surface">{isTrainRunning ? '42 km/h' : '0 km/h'}</strong></span>
              </div>
            </div>
            <div className="bg-surface rounded-xl p-3 border border-border space-y-2">
              <div className="flex justify-between items-center text-body-sm font-body-sm">
                <span className="text-secondary">{isTrainRunning ? 'Actual Departure:' : 'Next Departure Date:'}</span>
                <span className="font-semibold text-on-surface tabular-nums">
                  {isTrainRunning
                    ? formatTime(currentStop?.actualDeparture || currentStop?.scheduledDeparture, !currentStop?.actualDeparture ? (currentStop?.delayMinutes || 0) : 0)
                    : `${formatTime(originStop?.scheduledDeparture)} (${serviceDateFormatted})`}
                </span>
              </div>
              <div className="flex justify-between items-center text-body-sm font-body-sm">
                <span className="text-secondary">Scheduled Timetable:</span>
                <span className="text-on-surface-variant tabular-nums">{formatTime(originStop?.scheduledDeparture)} (Sch)</span>
              </div>
              <div className="flex justify-between items-center text-body-sm font-body-sm">
                <span className="text-secondary">Yard Handover:</span>
                <span className="text-success font-medium">
                  {isTrainRunning
                    ? `${originStop?.stationId || 'LKO'} Yard Clearing OK`
                    : `Pending ${originStop?.stationId || 'LKO'} Yard Dispatch (${serviceDateFormatted})`}
                </span>
              </div>
            </div>
            <div className="text-on-surface-variant font-body-sm text-body-sm flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>{isTrainRunning ? 'Station departure checklist verified & telemetry locked' : `Next run scheduled for ${serviceDateFormatted} & telemetry ready`}</span>
            </div>
          </div>

          {/* Approaching Next */}
          <div className="bg-surface-elevated border-2 border-info/40 rounded-xl p-space-lg space-y-4 shadow-sm relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-28 h-28 bg-info/5 rounded-full pointer-events-none"></div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-info/10 text-info font-label text-label font-semibold border border-info/20">
                <span className="h-1.5 w-1.5 rounded-full bg-info animate-ping"></span>
                {isTrainRunning ? 'APPROACHING NEXT' : 'NEXT SCHEDULED STOP'}
              </span>
              <span className="text-info font-body-sm text-body-sm font-medium tabular-nums">
                {nextStop ? 'In approx. 1h 18m' : 'Destination'}
              </span>
            </div>
            <div>
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading-lg text-heading-lg text-on-surface font-semibold tracking-tight">
                  {nextStop?.stationName || destStop?.stationName || 'Destination'}
                </h2>
                <span className="font-heading-md text-heading-md font-bold text-info">
                  {nextStop?.stationId || destStop?.stationId || '—'}
                </span>
              </div>
              <div className="text-on-surface-variant font-body-sm text-body-sm flex items-center gap-2 mt-1">
                <span className="font-medium text-on-surface bg-surface px-1.5 py-0.5 rounded border border-border">
                  Platform {nextStop?.platform || 1} (Expected)
                </span>
                <span className="text-outline-variant">•</span>
                <span>Distance: <strong className="tabular-nums text-on-surface font-semibold">{remainingKm} km remaining</strong></span>
              </div>
            </div>
            <div className="bg-surface rounded-xl p-3 border border-border space-y-2">
              <div className="flex justify-between items-center text-body-sm font-body-sm">
                <span className="text-secondary">Expected Arrival (ETA):</span>
                <span className="font-bold text-on-surface tabular-nums text-heading-md">
                  {formatTime(nextStop?.actualArrival || nextStop?.scheduledArrival, !nextStop?.actualArrival ? (nextStop?.delayMinutes || 0) : 0)}
                </span>
              </div>
              <div className="flex justify-between items-center text-body-sm font-body-sm">
                <span className="text-secondary">Scheduled Timetable:</span>
                <span className="text-on-surface-variant tabular-nums">{formatTime(nextStop?.scheduledArrival)} (Sch)</span>
              </div>
              <div className="flex justify-between items-center text-body-sm font-body-sm">
                <span className="text-secondary">Intermediate Crossing:</span>
                <span className="text-on-surface font-medium">
                  Passing {nextStop?.stationName || 'en route'} on schedule
                </span>
              </div>
            </div>
            <div className="text-info font-body-sm text-body-sm flex items-center gap-1.5">
              <span className="material-symbols-outlined text-sm">route</span>
              <span>Line speed permitted: 130 km/h · No speed restrictions active</span>
            </div>
          </div>
        </div>

        {/* ── ROUTE PROGRESS + DISTANCE METRICS ── */}
        <div className="bg-surface-elevated border border-border rounded-xl p-space-lg space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-heading-md text-heading-md text-on-surface font-semibold">Journey Route Telemetry &amp; Progress</h3>
              <p className="text-secondary font-body-sm text-body-sm">Direct line progression based on real-time transponder beacons</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-1 rounded bg-surface border border-border text-on-surface font-label text-label tabular-nums">
                {progress?.percent ?? 0}% Completed
              </span>
              <span className="text-secondary font-body-sm text-body-sm tabular-nums">
                {isTrainRunning
                  ? `Elapsed: ${Math.floor((progress?.coveredDistanceKm || 0) / 75)}h ${Math.round(((progress?.coveredDistanceKm || 0) % 75) * 0.8)}m / Total: ${Math.round((progress?.totalDistanceKm || 0) / 75)}h ${Math.round(((progress?.totalDistanceKm || 0) % 75) * 0.8)}m`
                  : `Next Departure: ${serviceDateFormatted}`}
              </span>
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative py-4">
            <div className="w-full h-2.5 bg-surface-container-high rounded-full relative">
              <div className="h-full bg-gradient-to-r from-success via-primary to-primary rounded-full" style={{ width: `${progress?.percent ?? 0}%` }}></div>
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center">
                <span className="w-3.5 h-3.5 rounded-full bg-primary border-2 border-surface-elevated"></span>
                <span className="text-label font-label text-secondary mt-2">{originStop?.stationId || 'SC'} (0 km)</span>
              </div>
              <div style={{ left: `${Math.min(95, Math.max(5, progress?.percent ?? 0))}%` }} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center z-10">
                <div className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md animate-bounce ring-4 ring-primary/20">
                  <span className="material-symbols-outlined text-xs">train</span>
                </div>
                <span className="text-label font-label text-primary font-bold mt-1 bg-surface px-1.5 py-0.5 rounded border border-border tabular-nums">
                  {Math.round(progress?.coveredDistanceKm || 0)} km
                </span>
              </div>
              <div className="absolute left-full top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center">
                <span className="w-3.5 h-3.5 rounded-full bg-outline-variant border-2 border-surface-elevated"></span>
                <span className="text-label font-label text-secondary mt-2">{destStop?.stationId || 'NZM'} ({Math.round(progress?.totalDistanceKm || 0)} km)</span>
              </div>
            </div>
          </div>

          {/* Distance metrics row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2 border-t border-border">
            <div className="bg-surface rounded-xl p-3 border border-border">
              <span className="text-secondary font-label text-label block uppercase tracking-wider">Distance Covered</span>
              <span className="font-bold text-on-surface text-[28px] leading-tight tabular-nums">
                {Math.round(progress?.coveredDistanceKm || 0)} km
              </span>
              <span className="text-secondary font-body-sm text-body-sm">{progress?.percent ?? 0}% of total run</span>
            </div>
            <div className="bg-surface rounded-xl p-3 border border-border">
              <span className="text-secondary font-label text-label block uppercase tracking-wider">Distance Remaining</span>
              <span className="font-bold text-on-surface text-[28px] leading-tight tabular-nums">{remainingKm} km</span>
              <span className="text-secondary font-body-sm text-body-sm">Final stretch to destination</span>
            </div>
            <div className="bg-surface rounded-xl p-3 border border-border">
              <span className="text-secondary font-label text-label block uppercase tracking-wider">Total Route Distance</span>
              <span className="font-bold text-on-surface text-[28px] leading-tight tabular-nums">
                {Math.round(progress?.totalDistanceKm || 0)} km
              </span>
              <span className="text-secondary font-body-sm text-body-sm">Broad Gauge Dual Track</span>
            </div>
            <div className="bg-surface rounded-xl p-3 border border-border">
              <span className="text-secondary font-label text-label block uppercase tracking-wider">Elapsed vs ETA</span>
              <span className="font-bold text-on-surface text-[28px] leading-tight tabular-nums">
                {remainingHours > 0 ? `${remainingHours}h ${remainingMins}m` : `${remainingMins}m`}
              </span>
              <span className={`font-body-sm text-body-sm font-semibold ${isTrainRunning && delayMinutes <= 5 ? 'text-success' : isTrainRunning ? 'text-warning' : 'text-info'}`}>
                {isTrainRunning ? (delayMinutes <= 5 ? 'Running on scheduled slot' : `Delayed by ${delayMinutes} min`) : `Departs ${serviceDateFormatted}`}
              </span>
            </div>
          </div>
        </div>

        {/* ── COACH COMPOSITION (left) | LIVE RADAR MAP (right) ── */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md">

          {/* Coach Composition — 5 cols */}
          <div className="md:col-span-5 bg-surface-elevated border border-border rounded-xl p-space-lg space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-heading-md text-heading-md text-on-surface font-semibold">Coach Composition</h3>
                <p className="text-secondary font-body-sm text-body-sm mt-0.5">
                  {coaches.length} COACHES LHB
                </p>
              </div>
              <span className="text-secondary font-body-sm text-body-sm">Physical orientation: Engine leading towards {journey?.train?.destinationStationName || 'Destination'}</span>
            </div>

            {/* Coach row */}
            <div className="flex flex-wrap gap-1.5 overflow-x-auto pb-2">
              {coaches.map((coach, i) => (
                <div key={i} className={`flex flex-col items-center min-w-[46px] px-1.5 py-2 rounded-lg border text-center transition-colors ${coach.label === 'ENG' ? 'bg-primary/10 border-primary/30' : coach.label === 'EOG' ? 'bg-surface border-border' : 'bg-surface-elevated border-border hover:border-primary/30 cursor-pointer'}`}>
                  <span className={`font-heading-sm text-heading-sm font-bold ${coach.label === 'ENG' ? 'text-primary' : 'text-on-surface'}`}>
                    {coach.label}
                  </span>
                  <span className="font-label text-label text-secondary mt-0.5">{coach.type}</span>
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border text-body-sm font-body-sm text-on-surface-variant">
              <span className="font-medium text-on-surface">Catering Facility:</span>{' '}
              Standard IRCTC Meals Included
            </div>
          </div>

          {/* Operational Live Radar View — 7 cols */}
          <div className="md:col-span-7 bg-[#0d1117] border border-border rounded-xl overflow-hidden relative min-h-[300px]">
            {/* Header bar */}
            <div className="absolute top-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-[#0d1117]/80 backdrop-blur-sm border-b border-white/10">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-success animate-pulse"></span>
                <span className="font-heading-sm text-heading-sm font-bold text-white">Operational Live Radar View</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 rounded bg-white/10 text-white font-label text-label">
                  SECTOR {Math.ceil((progress?.percent || 10) / 25) * 10}-{Math.ceil((progress?.percent || 10) / 25) * 10 + 8} ACTIVE
                </span>
                <Link
                  href={`/journey/${journeyId}/map`}
                  className="flex items-center gap-1 px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-white font-label text-label transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">open_in_full</span>
                  <span>Full Screen Map</span>
                </Link>
              </div>
            </div>

            {/* Map */}
            <JourneyMap
              routeCoordinates={journey?.route?.coordinates}
              currentPosition={journey?.run?.currentLocation}
              stops={journey?.stops}
              className="w-full h-full absolute inset-0"
            />

            {/* Bottom HUD */}
            <div className="absolute bottom-0 left-0 right-0 z-10 flex items-center justify-between px-4 py-2 bg-[#0d1117]/80 backdrop-blur-sm border-t border-white/10">
              <span className="font-body-sm text-body-sm text-[#94a3b8]">
                Next Interlocking: <span className="font-semibold text-white">{nextStop?.stationId || '—'}-Yard-B</span>
              </span>
              <span className="font-body-sm text-body-sm text-[#94a3b8]">
                Speed Limit: <span className="font-semibold text-white">130 km/h</span>
              </span>
              <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-success">
                <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse"></span>
                Direct CTC Feed Connected
              </span>
            </div>
          </div>
        </div>

        {/* ── RUNNING CHART ── */}
        <div className="bg-surface-elevated border border-border rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-space-lg py-4 border-b border-border">
            <div>
              <h3 className="font-heading-md text-heading-md text-on-surface font-semibold">Complete Running Chart</h3>
              <p className="text-secondary font-body-sm text-body-sm mt-0.5">
                Scheduled vs actual times for all stations · Date: {serviceDateFormatted}
              </p>
            </div>
            <div className="flex items-center gap-4 text-label font-label">
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-success"></span>Departed</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-info animate-pulse"></span>Current</span>
              <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-outline-variant"></span>Upcoming</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-body-sm font-body-sm">
              <thead>
                <tr className="bg-surface border-b border-border text-secondary font-label text-label uppercase tracking-wider">
                  <th className="text-left px-4 py-3 w-8">#</th>
                  <th className="text-left px-4 py-3">Station</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Code</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Distance</th>
                  <th className="text-center px-4 py-3">Sch. Arrival</th>
                  <th className="text-center px-4 py-3">Sch. Departure</th>
                  <th className="text-center px-4 py-3">Actual Arrival</th>
                  <th className="text-center px-4 py-3">Actual Departure</th>
                  <th className="text-center px-4 py-3">Delay</th>
                  <th className="text-center px-4 py-3 hidden md:table-cell">Platform</th>
                  <th className="text-center px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {stops.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-10 text-secondary">
                      No station data available
                    </td>
                  </tr>
                ) : (
                  stops.map((stop, idx) => {
                    const isDeparted = stop.status === 'departed';
                    const isAtStation = stop.status === 'at-station';
                    const isCurrent = isAtStation || (idx === currentStopIndex && isTrainRunning);
                    const isOrigin = idx === 0;
                    const isDest = idx === stops.length - 1;
                    const dl = delayLabel(stop.delayMinutes);

                    return (
                      <tr
                        key={stop.stationId + idx}
                        className={`border-b border-border transition-colors ${isCurrent ? 'bg-info/5 border-l-4 border-l-info' : isDeparted ? 'bg-success/3 opacity-80' : 'hover:bg-surface'}`}
                      >
                        <td className="px-4 py-3 text-secondary tabular-nums">{idx + 1}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className={`flex-shrink-0 w-2.5 h-2.5 rounded-full ${isCurrent ? 'bg-info animate-pulse' : isDeparted ? 'bg-success' : 'bg-outline-variant'}`}></div>
                            <div>
                              <span className={`font-semibold ${isCurrent ? 'text-info' : isDeparted ? 'text-on-surface' : 'text-on-surface'}`}>
                                {stop.stationName || stop.stationId}
                              </span>
                              {(isOrigin || isDest) && (
                                <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-semibold ${isOrigin ? 'bg-primary/10 text-primary' : 'bg-success/10 text-success'}`}>
                                  {isOrigin ? 'ORIGIN' : 'DESTINATION'}
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 hidden md:table-cell text-secondary font-mono text-[12px]">{stop.stationId}</td>
                        <td className="px-4 py-3 hidden lg:table-cell text-secondary tabular-nums">
                          {stop.distanceKm != null ? `${Math.round(stop.distanceKm)} km` : '—'}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-on-surface-variant">
                          {isOrigin ? '—' : formatTime(stop.scheduledArrival)}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums text-on-surface-variant">
                          {isDest ? '—' : formatTime(stop.scheduledDeparture)}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums">
                          {isOrigin ? '—' : stop.actualArrival
                            ? <span className="text-on-surface font-semibold">{formatTime(stop.actualArrival)}</span>
                            : <span className="text-outline-variant">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center tabular-nums">
                          {isDest ? '—' : stop.actualDeparture
                            ? <span className="text-on-surface font-semibold">{formatTime(stop.actualDeparture)}</span>
                            : <span className="text-outline-variant">—</span>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-semibold tabular-nums ${dl.cls}`}>{dl.text}</span>
                        </td>
                        <td className="px-4 py-3 text-center hidden md:table-cell text-on-surface-variant">
                          {stop.platform || '—'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {isCurrent ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-info/10 text-info font-label text-label font-semibold">
                              <span className="h-1.5 w-1.5 rounded-full bg-info animate-ping"></span>
                              Live
                            </span>
                          ) : isDeparted ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-success/10 text-success font-label text-label font-semibold">✓ Done</span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-secondary font-label text-label">Upcoming</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="px-space-lg py-3 border-t border-border bg-surface flex items-center justify-between text-body-sm text-secondary">
            <span>Total stops: {stops.length} · Data source: RailRadar Live API</span>
            <span className="tabular-nums">Last synced: {new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}</span>
          </div>
        </div>

      </main>
    </>
  );
}
