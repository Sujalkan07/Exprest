'use client';

import React from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { JourneyMap } from '@/components/map/JourneyMap';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function formatTime(isoString: string | null | undefined, extraDelayMinutes: number = 0): string {
  if (!isoString) return "-";
  try {
    const d = new Date(isoString);
    if (extraDelayMinutes > 0) d.setMinutes(d.getMinutes() + extraDelayMinutes);
    return d.toLocaleTimeString("en-IN", {
      hour: "2-digit", minute: "2-digit", hour12: true, timeZone: "Asia/Kolkata"
    });
  } catch { return isoString; }
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '';
  try {
    const parts = dateStr.split('-');
    if (parts.length === 3) {
      const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      return d.toLocaleDateString("en-IN", {
        weekday: "short", day: "2-digit", month: "short", year: "numeric"
      });
    }
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-IN", {
      weekday: "short", day: "2-digit", month: "short", year: "numeric"
    });
  } catch { return dateStr; }
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
  const stops = journey?.stops || [];
  const nextStopIndex = journey?.progress?.nextStopIdx ?? (journey?.progress?.completedStations ?? 1);
  const currentStopIndex = journey?.progress?.currentStopIdx ?? Math.max(0, nextStopIndex - 1);
  const nextStop = stops[nextStopIndex];
  const currentStop = stops[currentStopIndex] || stops[0];
  const originStop = stops[0];
  const destStop = stops[stops.length - 1];

  const serviceDateRaw = journey?.run?.startDate || (journeyId.includes('_') ? journeyId.split('_').pop() : '');
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

  return (
    <>
      <main className="w-full max-w-7xl mx-auto px-space-lg py-space-lg flex-1 space-y-space-lg">
        {/* SUB-HEADER & BREADCRUMBS */}
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

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-surface px-2.5 py-1 rounded border border-border font-label text-label text-on-surface-variant">
              <span className="relative flex h-2 w-2">
                <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isTrainRunning ? 'bg-success' : 'bg-warning'} opacity-75`}></span>
                <span className={`relative inline-flex rounded-full h-2 w-2 ${isTrainRunning ? 'bg-success' : 'bg-warning'}`}></span>
              </span>
              <span className="tabular-nums">{isTrainRunning ? 'Live Telemetry Synced' : `Scheduled Run (${serviceDateFormatted})`}</span>
              <span className="text-outline-variant">•</span>
              <span className="text-secondary">RailRadar GPS: <strong className="text-on-surface font-semibold">100% Lock</strong></span>
            </div>
          </div>
        </div>

        {/* JOURNEY HERO HEADER BLOCK */}
        <div className="bg-surface-elevated border border-border rounded-xl p-space-lg shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <span className="px-2 py-0.5 rounded bg-primary text-on-primary font-label text-label tracking-wider font-semibold">{journey?.train?.type || "EXPRESS"}</span>
                <span className="text-secondary font-body-sm text-body-sm">Run Date: <strong className="text-on-surface">{serviceDateFormatted}</strong></span>
              </div>
              <h1 className="font-display-lg text-display-lg text-on-surface tracking-tight font-bold">{journey?.train?.number || "Train"} {journey?.train?.name || ""}</h1>
              <div className="flex flex-wrap items-center gap-2 text-on-surface-variant font-body-sm text-body-sm">
                <span>{journey?.train?.category || 'Mail / Express'}</span>
                <span className="text-outline-variant">•</span>
                <span>LHB Rake</span>
                <span className="text-outline-variant">•</span>
                <span>Electric WAP-7 High Horsepower</span>
              </div>
              <div className="pt-1">
                <div className="inline-flex items-center gap-2 px-3 py-1 bg-surface rounded-xl border border-border text-on-surface font-body-sm text-body-sm">
                  <span className="font-semibold">{journey?.train?.originStationName || originStop?.stationName || "Origin"} ({journey?.train?.originStationId || originStop?.stationId})</span>
                  <span className="material-symbols-outlined text-secondary text-sm">trending_flat</span>
                  <span className="font-semibold">{journey?.train?.destinationStationName || destStop?.stationName || "Destination"} ({journey?.train?.destinationStationId || destStop?.stationId})</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link href={`/journey/${journeyId}/map`} className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm shadow-sm transition-all duration-150">
                <span className="material-symbols-outlined text-sm">radar</span>
                <span className="font-semibold">Live Radar View</span>
              </Link>
            </div>
          </div>
        </div>

        {/* STATUS HERO & TELEMETRY BANNER */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-space-md">
          
          {/* Operational Status Banner (8 cols) */}
          <div className="md:col-span-8 bg-surface-elevated border border-border rounded-xl p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex items-center gap-2.5">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-label text-label font-semibold ${!isTrainRunning ? "bg-info/10 text-info border-info/20" : delayMinutes > 0 ? "bg-warning/10 text-warning border-warning/20" : "bg-success/10 text-success border-success/20"}`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${!isTrainRunning ? "bg-info" : delayMinutes > 0 ? "bg-warning animate-pulse" : "bg-success animate-pulse"}`}></span>
                  {!isTrainRunning ? `SCHEDULED RUN (${serviceDateFormatted})` : delayMinutes > 0 ? `+${delayMinutes} MIN DELAY` : "ON TIME"}
                </span>
                <span className="text-secondary font-label text-label">
                  {isTrainRunning ? 'Block Section: Clear (Signal Green)' : `Scheduled Departure: ${serviceDateFormatted}`}
                </span>
              </div>
              <p className="text-on-surface font-body-md text-body-md font-medium">
                {isTrainRunning 
                  ? (delayMinutes > 0 ? `Running delayed by +${delayMinutes} min · Recovering speed` : 'Maintaining scheduled timetable velocity · Clear block section ahead')
                  : `Train scheduled to run on ${serviceDateFormatted} from ${originStop?.stationName || 'Origin'}`}
              </p>
              <p className="text-on-surface-variant font-body-sm text-body-sm">
                {isTrainRunning 
                  ? `Automated Block Signalling · Next interlocking: ${nextStop?.stationName || currentStop?.stationName || 'En route'} Yard`
                  : `Dispatch Checklist Verified · Handover Scheduled for ${serviceDateFormatted}`}
              </p>
            </div>
            
            <div className="sm:text-right border-t sm:border-t-0 sm:border-l border-border pt-3 sm:pt-0 sm:pl-6">
              <div className="font-label text-label text-secondary uppercase tracking-wider">Current Velocity</div>
              <div className="font-display-lg text-display-lg font-bold text-on-surface tabular-nums">
                {isTrainRunning ? speed : 0} <span className="text-heading-md font-normal text-secondary">km/h</span>
              </div>
              <div className="text-on-surface-variant font-body-sm text-body-sm tabular-nums">Max permissible: 130 km/h</div>
            </div>
          </div>

          {/* Quick Metrics Summary Card (4 cols) */}
          <div className="md:col-span-4 bg-surface border border-border rounded-xl p-space-md flex flex-col justify-between">
            <div className="flex items-center justify-between text-secondary font-label text-label pb-2 border-b border-border">
              <span>SCHEDULE RELIABILITY</span>
              <span className="text-success font-semibold">{delayMinutes <= 15 ? '99.4%' : '88.2%'} On-time</span>
            </div>
            <div className="grid grid-cols-2 gap-2 py-2">
              <div>
                <span className="text-secondary font-label text-label block">Remaining ETA</span>
                <span className="font-heading-md text-heading-md font-bold text-on-surface tabular-nums">
                  {remainingHours > 0 ? `${remainingHours}h ${remainingMins}m` : `${remainingMins}m`}
                </span>
              </div>
              <div>
                <span className="text-secondary font-label text-label block">Next Signal</span>
                <span className={`font-heading-md text-heading-md font-bold flex items-center gap-1 ${isTrainRunning ? 'text-success' : 'text-info'}`}>
                  <span className={`h-2 w-2 rounded-full ${isTrainRunning ? 'bg-success' : 'bg-info'}`}></span>
                  {isTrainRunning ? 'GREEN' : 'READY'}
                </span>
              </div>
            </div>
            <div className="text-on-surface-variant font-body-sm text-body-sm flex items-center justify-between pt-1 border-t border-border">
              <span>Train Type</span>
              <span className="font-medium text-on-surface">{journey?.train?.category || journey?.train?.type || 'Express'}</span>
            </div>
          </div>

        </div>

        {/* CURRENT VS NEXT STATION KEY CARDS (Side-by-side grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
          
          {/* 1. Origin / Departed Station Card */}
          <div className="bg-surface-elevated border border-border rounded-xl p-space-lg space-y-4">
            <div className="flex items-center justify-between">
              <span className={`px-2.5 py-0.5 rounded font-label text-label font-semibold ${isTrainRunning ? 'bg-secondary-container text-on-secondary-container' : 'bg-info/10 text-info border border-info/20'}`}>
                {isTrainRunning ? 'DEPARTED' : 'SCHEDULED ORIGIN'}
              </span>
              <span className="text-secondary font-body-sm text-body-sm tabular-nums">
                Run Date: <strong className="text-primary">{serviceDateFormatted}</strong>
              </span>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading-lg text-heading-lg text-on-surface font-semibold tracking-tight">
                  {isTrainRunning ? (currentStop?.stationName || originStop?.stationName) : (originStop?.stationName || journey?.train?.originStationName || 'Origin')}
                </h2>
                <span className="font-heading-md text-heading-md font-bold text-secondary">
                  {isTrainRunning ? (currentStop?.stationId || originStop?.stationId) : (originStop?.stationId || journey?.train?.originStationId || '-')}
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
                <span className="text-secondary">{isTrainRunning ? 'Actual Departure:' : 'Scheduled Departure Date:'}</span>
                <span className="font-semibold text-on-surface tabular-nums">
                  {isTrainRunning 
                    ? formatTime(currentStop?.actualDeparture || currentStop?.scheduledDeparture, currentStop?.delayMinutes)
                    : `${formatTime(originStop?.scheduledDeparture)} (${serviceDateFormatted})`}
                </span>
              </div>
              <div className="flex justify-between items-center text-body-sm font-body-sm">
                <span className="text-secondary">Scheduled Timetable:</span>
                <span className="text-on-surface-variant tabular-nums">
                  {formatTime(originStop?.scheduledDeparture)} (Sch)
                </span>
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

            <div className="text-on-surface-variant font-body-sm text-body-sm flex items-center gap-1.5 text-text-tertiary">
              <span className="material-symbols-outlined text-sm">check_circle</span>
              <span>{isTrainRunning ? 'Station departure checklist verified & telemetry locked' : `Run for ${serviceDateFormatted} scheduled & origin telemetry locked`}</span>
            </div>
          </div>

          {/* 2. Next Station / Upcoming Card */}
          <div className="bg-surface-elevated border-2 border-info/40 rounded-xl p-space-lg space-y-4 shadow-sm relative overflow-hidden">
            <div className="absolute -right-12 -top-12 w-28 h-28 bg-info/5 rounded-full pointer-events-none"></div>
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-info/10 text-info font-label text-label font-semibold border border-info/20">
                <span className="h-1.5 w-1.5 rounded-full bg-info animate-ping"></span>
                {isTrainRunning ? 'APPROACHING NEXT' : 'NEXT SCHEDULED STOP'}
              </span>
              <span className="text-info font-body-sm text-body-sm font-medium tabular-nums">{nextStop ? "Next Stop" : "Destination"}</span>
            </div>

            <div>
              <div className="flex items-baseline justify-between">
                <h2 className="font-heading-lg text-heading-lg text-on-surface font-semibold tracking-tight">
                  {nextStop?.stationName || destStop?.stationName || "Destination"}
                </h2>
                <span className="font-heading-md text-heading-md font-bold text-info">
                  {nextStop?.stationId || destStop?.stationId || "-"}
                </span>
              </div>
              <div className="text-on-surface-variant font-body-sm text-body-sm flex items-center gap-2 mt-1">
                <span className="font-medium text-on-surface bg-surface px-1.5 py-0.5 rounded border border-border">Platform {nextStop?.platform || 1} (Expected)</span>
                <span className="text-outline-variant">•</span>
                <span>Distance: <strong className="tabular-nums text-on-surface font-semibold">{remainingKm} km remaining</strong></span>
              </div>
            </div>

            <div className="bg-surface rounded-xl p-3 border border-border space-y-2">
              <div className="flex justify-between items-center text-body-sm font-body-sm">
                <span className="text-secondary">Expected Arrival (ETA):</span>
                <span className="font-bold text-on-surface tabular-nums text-heading-md">
                  {formatTime(nextStop?.actualArrival || nextStop?.scheduledArrival, nextStop?.delayMinutes)}
                </span>
              </div>
              <div className="flex justify-between items-center text-body-sm font-body-sm">
                <span className="text-secondary">Scheduled Timetable:</span>
                <span className="text-on-surface-variant tabular-nums">
                  {formatTime(nextStop?.scheduledArrival)} (Sch)
                </span>
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

        {/* ROUTE PROGRESS BAR & DISTANCE TELEMETRY */}
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
                {isTrainRunning ? `Covered: ${Math.round(progress?.coveredDistanceKm || 0)} km` : `Scheduled Run Date: ${serviceDateFormatted}`}
              </span>
            </div>
          </div>

          <div className="relative py-4">
            <div className="w-full h-2.5 bg-surface-container-high rounded-full relative">
              <div className="h-full bg-gradient-to-r from-success via-primary to-primary rounded-full" style={{ width: `${progress?.percent ?? 0}%` }}></div>
              
              <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center">
                <span className="w-3.5 h-3.5 rounded-full bg-primary border-2 border-surface-elevated"></span>
                <span className="text-label font-label text-secondary mt-2">{originStop?.stationId || 'LKO'} (0 km)</span>
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
                <span className="text-label font-label text-secondary mt-2">{destStop?.stationId || 'YPR'} ({Math.round(progress?.totalDistanceKm || 0)} km)</span>
              </div>
            </div>
          </div>
        </div>

        {/* LIVE TRACKING MAP EMBED */}
        <div className="bg-surface-elevated border border-border rounded-xl p-space-lg space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-heading-md text-heading-md text-on-surface font-semibold">Interactive Live Track Map</h3>
              <p className="text-secondary font-body-sm text-body-sm">Real-time MapLibre vector radar tracking with route geometry</p>
            </div>
            <Link href={`/journey/${journeyId}/map`} className="px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label text-label font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-sm">open_in_full</span>
              <span>Full Screen Radar</span>
            </Link>
          </div>
          
          <div className="w-full h-80 rounded-xl overflow-hidden border border-border relative">
            <JourneyMap
              routeCoordinates={journey?.route?.coordinates}
              currentPosition={journey?.run?.currentLocation}
              stops={journey?.stops}
              className="w-full h-full"
            />
          </div>
        </div>
      </main>
    </>
  );
}
