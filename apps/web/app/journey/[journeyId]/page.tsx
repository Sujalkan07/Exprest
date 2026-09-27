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
  const nextStopIndex = journey?.progress?.nextStopIdx ?? (journey?.progress?.completedStations ?? 1);
  const currentStopIndex = journey?.progress?.currentStopIdx ?? Math.max(0, nextStopIndex - 1);
  const nextStop = journey?.stops?.[nextStopIndex];
  const currentStop = journey?.stops?.[currentStopIndex];

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
<a className="text-on-surface-variant hover:text-primary flex items-center gap-1 transition-colors" href="#">
<span className="material-symbols-outlined text-sm" data-icon="arrow_back">arrow_back</span>
<span>Back to live search</span>
</a>
<span className="text-outline-variant">/</span>
<span className="text-secondary font-medium">Network Overview</span>
<span className="text-outline-variant">/</span>
<span className="text-on-surface font-semibold">Southern Central Corridor</span>
</div>
{/* Data freshness indicator */}
<div className="flex items-center gap-3">
<div className="flex items-center gap-2 bg-surface px-2.5 py-1 rounded border border-border font-label text-label text-on-surface-variant">
<span className="relative flex h-2 w-2">
<span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
<span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
</span>
<span className="tabular-nums">Updated 18 sec ago</span>
<span className="text-outline-variant">•</span>
<span className="text-secondary">GPS Telemetry sync: <strong className="text-on-surface font-semibold">100% lock</strong></span>
</div>
</div>
</div>
{/* JOURNEY HERO HEADER BLOCK */}
<div className="bg-surface-elevated border border-border rounded-xl p-space-lg shadow-sm">
<div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
{/* Left: Train Identity Block */}
<div className="space-y-2">
<div className="flex items-center gap-3">
<span className="px-2 py-0.5 rounded bg-primary text-on-primary font-label text-label tracking-wider font-semibold">{journey?.train?.type || "EXPRESS"}</span>
<span className="text-secondary font-body-sm text-body-sm">Rake #LHB-2024-WAP7</span>
</div>
<h1 className="font-display-lg text-display-lg text-on-surface tracking-tight font-bold">{journey?.train?.number || "Train"} {journey?.train?.name || ""}</h1>
<div className="flex flex-wrap items-center gap-2 text-on-surface-variant font-body-sm text-body-sm">
<span>Superfast Special AC</span>
<span className="text-outline-variant">•</span>
<span>LHB Rake</span>
<span className="text-outline-variant">•</span>
<span>Electric WAP-7 High Horsepower</span>
</div>
<div className="pt-1">
<div className="inline-flex items-center gap-2 px-3 py-1 bg-surface rounded-xl border border-border text-on-surface font-body-sm text-body-sm">
<span className="font-semibold">{journey?.train?.originStationName || "Origin"}</span>
<span className="material-symbols-outlined text-secondary text-sm" data-icon="trending_flat">trending_flat</span>
<span className="font-semibold">{journey?.train?.destinationStationName || "Destination"}</span>
</div>
</div>
</div>
{/* Right: Action Buttons Group */}
<div className="flex flex-wrap items-center gap-2.5">
<button className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface hover:bg-secondary-container border border-border text-on-surface font-body-sm text-body-sm transition-all duration-150">
<span className="material-symbols-outlined text-warning" data-icon="star" data-weight="fill" style={{ "fontVariationSettings": "'FILL' 1" }}>star</span>
<span className="font-medium">Favorited</span>
</button>
<button className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-surface hover:bg-secondary-container border border-border text-on-surface font-body-sm text-body-sm transition-all duration-150">
<span className="material-symbols-outlined text-secondary" data-icon="share">share</span>
<span className="font-medium">Share Journey</span>
</button>
<button className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary hover:bg-primary-container text-on-primary font-body-sm text-body-sm shadow-sm transition-all duration-150">
<span className="material-symbols-outlined text-sm" data-icon="radar">radar</span>
<span className="font-semibold">Live Radar View</span>
</button>
</div>
</div>
</div>
{/* STATUS HERO & TELEMETRY BANNER */}
<div className="grid grid-cols-1 md:grid-cols-12 gap-space-md">
{/* Operational Status Banner (8 cols) */}
<div className="md:col-span-8 bg-surface-elevated border border-border rounded-xl p-space-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
<div className="space-y-1.5">
<div className="flex items-center gap-2.5">
<span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded border font-label text-label font-semibold ${journey?.run?.delayMinutes > 0 ? "bg-warning/10 text-warning border-warning/20" : "bg-success/10 text-success border-success/20"}`}>
<span className={`h-1.5 w-1.5 rounded-full ${journey?.run?.delayMinutes > 0 ? "bg-warning animate-pulse" : "bg-success animate-pulse"}`}></span>
              {journey?.run?.delayMinutes > 0 ? `+${journey?.run?.delayMinutes} MIN DELAY` : "ON TIME"}
            </span>
<span className="text-secondary font-label text-label">Block Section: Clear (Signal Green)</span>
</div>
<p className="text-on-surface font-body-md text-body-md font-medium">Maintaining scheduled timetable velocity · Clear block section ahead</p>
<p className="text-on-surface-variant font-body-sm text-body-sm">Automated Block Signalling · Next interlocking: Warangal Yard Section 'B'</p>
</div>
<div className="sm:text-right border-t sm:border-t-0 sm:border-l border-border pt-3 sm:pt-0 sm:pl-6">
<div className="font-label text-label text-secondary uppercase tracking-wider">Current Velocity</div>
<div className="font-display-lg text-display-lg font-bold text-on-surface tabular-nums">{Math.round(journey?.livePosition?.speedKph || 0)} <span className="text-heading-md font-normal text-secondary">km/h</span></div>
<div className="text-on-surface-variant font-body-sm text-body-sm tabular-nums">Max permissible: 130 km/h</div>
</div>
</div>
{/* Quick Metrics Summary Card (4 cols) */}
<div className="md:col-span-4 bg-surface border border-border rounded-xl p-space-md flex flex-col justify-between">
<div className="flex items-center justify-between text-secondary font-label text-label pb-2 border-b border-border">
<span>SCHEDULE RELIABILITY</span>
<span className="text-success font-semibold">99.4% On-time</span>
</div>
<div className="grid grid-cols-2 gap-2 py-2">
<div>
<span className="text-secondary font-label text-label block">Remaining ETA</span>
<span className="font-heading-md text-heading-md font-bold text-on-surface tabular-nums">2h 45m</span>
</div>
<div>
<span className="text-secondary font-label text-label block">Next Signal</span>
<span className="text-success font-heading-md text-heading-md font-bold flex items-center gap-1">
<span className="h-2 w-2 rounded-full bg-success"></span> GREEN
            </span>
</div>
</div>
<div className="text-on-surface-variant font-body-sm text-body-sm flex items-center justify-between pt-1 border-t border-border">
<span>Train Type</span>
<span className="font-medium text-on-surface">Rajdhani AC Premium</span>
</div>
</div>
</div>
{/* CURRENT VS NEXT STATION KEY CARDS (Side-by-side grid) */}
<div className="grid grid-cols-1 md:grid-cols-2 gap-space-lg">
{/* 1. Current / Last Departed Station Card */}
<div className="bg-surface-elevated border border-border rounded-xl p-space-lg space-y-4">
<div className="flex items-center justify-between">
<span className="px-2.5 py-0.5 rounded bg-secondary-container text-on-secondary-container font-label text-label font-semibold">
            DEPARTED
          </span>
<span className="text-secondary font-body-sm text-body-sm tabular-nums">Halt: 10 mins (Completed)</span>
</div>
<div>
<div className="flex items-baseline justify-between">
<h2 className="font-heading-lg text-heading-lg text-on-surface font-semibold tracking-tight">{currentStop?.stationName || "Unknown"}</h2>
<span className="font-heading-md text-heading-md font-bold text-secondary">{currentStop?.stationId || "-"}</span>
</div>
<div className="text-on-surface-variant font-body-sm text-body-sm flex items-center gap-2 mt-1">
<span className="font-medium text-on-surface">Platform 1</span>
<span className="text-outline-variant">•</span>
<span>Speed on clearing: <strong className="tabular-nums text-on-surface">42 km/h</strong></span>
</div>
</div>
<div className="bg-surface rounded-xl p-3 border border-border space-y-2">
<div className="flex justify-between items-center text-body-sm font-body-sm">
<span className="text-secondary">Actual Departure:</span>
<span className="font-semibold text-on-surface tabular-nums">{formatTime(currentStop?.actualDeparture || currentStop?.scheduledDeparture, !currentStop?.actualDeparture ? (currentStop?.delayMinutes || journey?.run?.delayMinutes || 0) : 0)}</span>
</div>
<div className="flex justify-between items-center text-body-sm font-body-sm">
<span className="text-secondary">Scheduled Timetable:</span>
<span className="text-on-surface-variant tabular-nums">{formatTime(currentStop?.scheduledDeparture)} (Sch)</span>
</div>
<div className="flex justify-between items-center text-body-sm font-body-sm">
<span className="text-secondary">Yard Handover:</span>
<span className="text-success font-medium">{currentStop?.stationId || "-"} Yard Clearing OK</span>
</div>
</div>
<div className="text-on-surface-variant font-body-sm text-body-sm flex items-center gap-1.5 text-text-tertiary">
<span className="material-symbols-outlined text-sm" data-icon="check_circle">check_circle</span>
<span>Station departure checklist verified &amp; telemetry locked</span>
</div>
</div>
{/* 2. Next Station / Upcoming Card (Highlighted focus) */}
<div className="bg-surface-elevated border-2 border-info/40 rounded-xl p-space-lg space-y-4 shadow-sm relative overflow-hidden">
<div className="absolute -right-12 -top-12 w-28 h-28 bg-info/5 rounded-full pointer-events-none"></div>
<div className="flex items-center justify-between">
<span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded bg-info/10 text-info font-label text-label font-semibold border border-info/20">
<span className="h-1.5 w-1.5 rounded-full bg-info animate-ping"></span>
            APPROACHING NEXT
          </span>
<span className="text-info font-body-sm text-body-sm font-medium tabular-nums">{nextStop ? "Next Stop" : "Reached"}</span>
</div>
<div>
<div className="flex items-baseline justify-between">
<h2 className="font-heading-lg text-heading-lg text-on-surface font-semibold tracking-tight">{nextStop?.stationName || currentStop?.stationName || "Unknown"}</h2>
<span className="font-heading-md text-heading-md font-bold text-info">{nextStop?.stationId || currentStop?.stationId || "-"}</span>
</div>
<div className="text-on-surface-variant font-body-sm text-body-sm flex items-center gap-2 mt-1">
<span className="font-medium text-on-surface bg-surface px-1.5 py-0.5 rounded border border-border">Platform 2 (Expected)</span>
<span className="text-outline-variant">•</span>
<span>Distance: <strong className="tabular-nums text-on-surface font-semibold">142 km remaining</strong></span>
</div>
</div>
<div className="bg-surface rounded-xl p-3 border border-border space-y-2">
<div className="flex justify-between items-center text-body-sm font-body-sm">
<span className="text-secondary">Expected Arrival (ETA):</span>
<span className="font-bold text-on-surface tabular-nums text-heading-md">{formatTime(nextStop?.actualArrival || nextStop?.scheduledArrival, !nextStop?.actualArrival ? (nextStop?.delayMinutes || journey?.run?.delayMinutes || 0) : 0)}</span>
</div>
<div className="flex justify-between items-center text-body-sm font-body-sm">
<span className="text-secondary">Scheduled Timetable:</span>
<span className="text-on-surface-variant tabular-nums">{formatTime(nextStop?.scheduledArrival)} (Sch)</span>
</div>
<div className="flex justify-between items-center text-body-sm font-body-sm">
<span className="text-secondary">Intermediate Crossing:</span>
<span className="text-on-surface font-medium">Dornakal Jn passing at 11:58 AM</span>
</div>
</div>
<div className="text-info font-body-sm text-body-sm flex items-center gap-1.5">
<span className="material-symbols-outlined text-sm" data-icon="route">route</span>
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
<span className="text-secondary font-body-sm text-body-sm tabular-nums">Elapsed: 5h 30m / Total: 8h 15m</span>
</div>
</div>
{/* Linear Route Progress Track Visual */}
<div className="relative py-4">
{/* Background Track */}
<div className="w-full h-2.5 bg-surface-container-high rounded-full relative">
{/* Filled Gradient Progress (70%) */}
<div className="h-full bg-gradient-to-r from-success via-primary to-primary rounded-full" style={{ width: `${progress?.percent ?? 0}%` }}></div>
{/* Station Waypoint Notches */}
<div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center">
<span className="w-3.5 h-3.5 rounded-full bg-primary border-2 border-surface-elevated"></span>
<span className="text-label font-label text-secondary mt-2">SC (0 km)</span>
</div>
<div className="absolute left-[35%] top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center">
<span className="w-2.5 h-2.5 rounded-full bg-primary border-2 border-surface-elevated"></span>
<span className="text-label font-label text-secondary mt-2">{currentStop?.stationId || "-"} (205 km)</span>
</div>
{/* Active Train Indicator (At 70%) */}
<div style={{ left: `${progress?.percent ?? 0}%` }} className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center z-10">
<div className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center shadow-md animate-bounce ring-4 ring-primary/20">
<span className="material-symbols-outlined text-xs" data-icon="train">train</span>
</div>
<span className="text-label font-label text-primary font-bold mt-1 bg-surface px-1.5 py-0.5 rounded border border-border tabular-nums">{Math.round(progress?.coveredDistanceKm || 0)} km</span>
</div>
<div className="absolute left-[85%] top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center">
<span className="w-2.5 h-2.5 rounded-full bg-outline-variant border-2 border-surface-elevated"></span>
<span className="text-label font-label text-secondary mt-2">{nextStop?.stationId || currentStop?.stationId || "-"} (500 km)</span>
</div>
<div className="absolute left-full top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center">
<span className="w-3.5 h-3.5 rounded-full bg-outline-variant border-2 border-surface-elevated"></span>
<span className="text-label font-label text-secondary mt-2">NZM ({Math.round(progress?.totalDistanceKm || 0)} km)</span>
</div>
</div>
</div>
{/* Tabular Numerical Stats Line */}
<div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-4 border-t border-border">
<div className="p-2 bg-surface rounded-xl border border-border">
<span className="text-secondary font-label text-label block uppercase">Distance Covered</span>
<span className="font-heading-md text-heading-md font-semibold text-on-surface tabular-nums">{Math.round(progress?.coveredDistanceKm || 0)} km</span>
<span className="text-text-tertiary font-label text-label block">{progress?.percent ?? 0}% of total run</span>
</div>
<div className="p-2 bg-surface rounded-xl border border-border">
<span className="text-secondary font-label text-label block uppercase">Distance Remaining</span>
<span className="font-heading-md text-heading-md font-semibold text-on-surface tabular-nums">{Math.round(progress?.remainingDistanceKm || 0)} km</span>
<span className="text-text-tertiary font-label text-label block">Final stretch to destination</span>
</div>
<div className="p-2 bg-surface rounded-xl border border-border">
<span className="text-secondary font-label text-label block uppercase">Total Route Distance</span>
<span className="font-heading-md text-heading-md font-semibold text-on-surface tabular-nums">{Math.round(progress?.totalDistanceKm || 0)} km</span>
<span className="text-text-tertiary font-label text-label block">Broad Gauge Dual Track</span>
</div>
<div className="p-2 bg-surface rounded-xl border border-border">
<span className="text-secondary font-label text-label block uppercase">Elapsed vs ETA</span>
<span className="font-heading-md text-heading-md font-semibold text-on-surface tabular-nums">5h 30m <span className="text-secondary text-body-sm font-normal">/ 8h 15m</span></span>
<span className="text-success font-label text-label block">Running on scheduled slot</span>
</div>
</div>
</div>
{/* DUAL COLUMN: CARRIAGE COMPOSITION & DARK RADAR TEASER */}
<div className="grid grid-cols-1 lg:grid-cols-12 gap-space-lg items-stretch">
{/* Coach Composition Indicator Strip (5 cols) */}
<div className="lg:col-span-5 bg-surface-elevated border border-border rounded-xl p-space-md flex flex-col justify-between space-y-4">
<div>
<div className="flex items-center justify-between">
<h4 className="font-heading-md text-heading-md text-on-surface font-semibold">Coach Composition</h4>
<span className="font-label text-label text-secondary uppercase">22 Coaches LHB</span>
</div>
<p className="text-secondary font-body-sm text-body-sm mt-0.5">Physical orientation: Engine leading towards Hazrat Nizamuddin</p>
</div>
{/* Coach Formation Blocks */}
<div className="overflow-x-auto pb-2">
<div className="flex items-center gap-1.5 min-w-[480px]">
{/* Engine */}
<div className="px-2.5 py-3 rounded bg-primary text-on-primary text-center font-label text-label font-bold flex flex-col items-center justify-center">
<span className="material-symbols-outlined text-xs" data-icon="electric_bolt">electric_bolt</span>
<span>ENG</span>
</div>
{/* EOG */}
<div className="px-2 py-3 rounded bg-secondary-container text-on-secondary-fixed text-center font-label text-label">
<span>EOG</span>
</div>
{/* H1 */}
<div className="px-2 py-3 rounded bg-surface border border-border text-on-surface text-center font-label text-label">
<span className="font-bold">H1</span>
<span className="block text-[9px] text-secondary">1AC</span>
</div>
{/* A1-A3 */}
<div className="px-2 py-3 rounded bg-surface border border-border text-on-surface text-center font-label text-label">
<span className="font-bold">A1</span>
<span className="block text-[9px] text-secondary">2AC</span>
</div>
<div className="px-2 py-3 rounded bg-surface border border-border text-on-surface text-center font-label text-label">
<span className="font-bold">A2</span>
<span className="block text-[9px] text-secondary">2AC</span>
</div>
{/* Pantry PC */}
<div className="px-2 py-3 rounded bg-surface-container-high border border-border text-on-surface text-center font-label text-label">
<span className="font-bold">PC</span>
<span className="block text-[9px] text-secondary">Pantry</span>
</div>
{/* B1-B5 */}
<div className="px-2 py-3 rounded bg-surface border border-border text-on-surface text-center font-label text-label">
<span className="font-bold">B1</span>
<span className="block text-[9px] text-secondary">3AC</span>
</div>
<div className="px-2 py-3 rounded bg-surface border border-border text-on-surface text-center font-label text-label">
<span className="font-bold">B2</span>
<span className="block text-[9px] text-secondary">3AC</span>
</div>
<div className="px-2 py-3 rounded bg-surface border border-border text-on-surface text-center font-label text-label">
<span className="font-bold">B3</span>
<span className="block text-[9px] text-secondary">3AC</span>
</div>
<div className="px-2 py-3 rounded bg-secondary-container text-on-secondary-fixed text-center font-label text-label">
<span>EOG</span>
</div>
</div>
</div>
<div className="text-on-surface-variant font-body-sm text-body-sm flex items-center justify-between pt-2 border-t border-border">
<span className="text-secondary">Catering Facility:</span>
<span className="text-on-surface font-medium">Standard IRCTC Meals Included</span>
</div>
</div>

{/* Map Widget (7 cols) */}
<div className="lg:col-span-7 bg-[#111214] text-white rounded-xl p-space-md flex flex-col shadow-md relative overflow-hidden border border-border h-[400px]">
  <div className="flex items-center justify-between z-10 mb-2 relative pointer-events-none">
    <div className="flex items-center gap-2">
      <span className="h-2.5 w-2.5 rounded-full bg-success animate-ping"></span>
      <h4 className="font-heading-md text-heading-md font-semibold text-white tracking-tight">Operational Live Radar View</h4>
    </div>
  </div>
  <div className="flex-1 w-full rounded-lg overflow-hidden border border-white/10 relative z-0">
    <JourneyMap
      routeCoordinates={journey?.route?.coordinates}
      currentPosition={journey?.livePosition}
      stops={journey?.stops}
      className="w-full h-full"
    />
  </div>
</div>
</div>
</main>

      
      {/* RUNNING STATUS / TIMETABLE CHART */}
      <div className="w-full max-w-7xl mx-auto px-space-lg pb-space-lg">
        <div className="bg-surface-elevated border border-border rounded-xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-surface-container-lowest">
            <h3 className="font-heading-md text-heading-md text-on-surface font-bold">Complete Running Status</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-surface-container-lowest border-b border-border text-label font-label text-secondary uppercase">
                  <th className="p-4 font-semibold">Station</th>
                  <th className="p-4 font-semibold">Arr. Time</th>
                  <th className="p-4 font-semibold">Dep. Time</th>
                  <th className="p-4 font-semibold">Halt</th>
                  <th className="p-4 font-semibold">Dist (km)</th>
                  <th className="p-4 font-semibold">Status</th>
                </tr>
              </thead>
              <tbody className="font-body-sm text-body-sm">
                {journey?.stops?.map((stop: any, idx: number) => {
                  // status comes directly from RailRadar: 'departed' | 'at-station' | 'upcoming'
                  const isDeparted = stop.status === 'departed';
                  const isAtStation = stop.status === 'at-station';
                  const isUpcoming = stop.status === 'upcoming' || !stop.status;
                  const isLast = idx === journey.stops.length - 1;
                  
                  // Actual arrival: use API value; if delayed, add delay to scheduled
                  const displayArrival = stop.actualArrival || stop.scheduledArrival;
                  const displayDeparture = stop.actualDeparture || stop.scheduledDeparture;
                  
                  return (
                    <tr key={idx} className={`border-b border-border ${isAtStation ? 'bg-primary/5' : ''} hover:bg-surface-container-lowest transition-colors`}>
                      <td className="p-4">
                        <div className="font-semibold text-on-surface">{stop.stationName}</div>
                        <div className="text-secondary text-xs">{stop.stationId}</div>
                        {stop.platform && <div className="text-secondary text-xs">Pf. {stop.platform}</div>}
                      </td>
                      <td className="p-4">
                        {idx === 0 ? (
                          <span className="text-secondary text-xs">Origin</span>
                        ) : (
                          <>
                            <div className={`font-medium ${stop.actualArrival ? 'text-on-surface' : 'text-secondary'}`}>
                              {formatTime(displayArrival, stop.delayMinutes > 0 && !stop.actualArrival ? stop.delayMinutes : 0)}
                            </div>
                            {stop.delayMinutes > 0 && (
                              <div className="text-warning text-[10px] font-bold">+{stop.delayMinutes}m late</div>
                            )}
                            {stop.actualArrival && <div className="text-success text-[10px]">Sch: {formatTime(stop.scheduledArrival)}</div>}
                          </>
                        )}
                      </td>
                      <td className="p-4">
                        {isLast ? (
                          <span className="text-secondary text-xs">Terminus</span>
                        ) : (
                          <div className={`font-medium ${stop.actualDeparture ? 'text-on-surface' : 'text-secondary'}`}>
                            {formatTime(displayDeparture, stop.delayMinutes > 0 && !stop.actualDeparture ? stop.delayMinutes : 0)}
                          </div>
                        )}
                      </td>
                      <td className="p-4 text-on-surface-variant">
                        {stop.haltMinutes > 0 ? `${stop.haltMinutes}m` : (
                          stop.scheduledArrival && stop.scheduledDeparture ? 
                            `${Math.round((new Date(stop.scheduledDeparture).getTime() - new Date(stop.scheduledArrival).getTime()) / 60000)}m` : '-'
                        )}
                      </td>
                      <td className="p-4 text-on-surface-variant">
                        {Math.round(stop.distanceKm || 0)}
                      </td>
                      <td className="p-4">
                        {isDeparted ? (
                          <span className="inline-flex items-center gap-1 text-success text-xs font-semibold">
                            <span className="material-symbols-outlined text-[14px]">check_circle</span> {isLast ? 'Arrived' : 'Departed'}
                          </span>
                        ) : isAtStation ? (
                          <span className="inline-flex items-center gap-1 text-info text-xs font-semibold">
                            <span className="w-1.5 h-1.5 bg-info rounded-full animate-ping inline-block"></span> At Station
                          </span>
                        ) : (
                          <span className="text-secondary text-xs font-semibold">Upcoming</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
