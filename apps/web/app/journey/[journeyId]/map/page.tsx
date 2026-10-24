'use client';

import React, { useRef, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { JourneyMap, JourneyMapRef } from '@/components/map/JourneyMap';
import Link from 'next/link';

import { API_BASE } from '@/lib/api';

function formatTime(isoString: string | null | undefined, extraDelayMinutes: number = 0): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (extraDelayMinutes > 0) d.setMinutes(d.getMinutes() + extraDelayMinutes);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });
  } catch { return isoString; }
}

function getETA(isoString: string | null | undefined, delayMinutes: number = 0): string {
  if (!isoString) return '—';
  try {
    const target = new Date(isoString);
    if (delayMinutes > 0) target.setMinutes(target.getMinutes() + delayMinutes);
    const now = new Date();
    const diffMs = target.getTime() - now.getTime();
    if (diffMs <= 0) return 'Now';
    const diffMins = Math.round(diffMs / 60000);
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours > 0) return `${hours}h ${mins}m`;
    return `${mins}m`;
  } catch { return '—'; }
}

export default function ImmersiveMapPage() {
  const params = useParams();
  const journeyId = params.journeyId as string;
  const mapRef = useRef<JourneyMapRef>(null);
  const [followTrain, setFollowTrain] = useState(true);

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

  // Use the new index-based stop derivation from the API
  const currentStopIdx = journey?.progress?.currentStopIdx ?? 0;
  const nextStopIdx = journey?.progress?.nextStopIdx ?? 1;
  const currentStop = journey?.stops?.[currentStopIdx];
  const nextStop = journey?.stops?.[nextStopIdx];
  const originStop = journey?.stops?.[0];

  const delayMinutes = journey?.run?.delayMinutes ?? 0;
  const speedKph = Math.round(journey?.livePosition?.speedKph || 0);
  const runStatus = journey?.run?.status || 'not-started';
  const isLive = journey?.run?.isLive || false;

  // Calculate elapsed time
  const depTime = journey?.stops?.[0]?.scheduledDeparture;
  const elapsedText = (() => {
    if (!depTime) return '—';
    const dep = new Date(depTime);
    const now = new Date();
    const diff = Math.max(0, Math.round((now.getTime() - dep.getTime()) / 60000));
    const h = Math.floor(diff / 60), m = diff % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  })();

  const totalDist = progress?.totalDistanceKm || 0;
  const coveredDist = progress?.coveredDistanceKm || 0;
  const remainingDist = Math.round(progress?.remainingDistanceKm || 0);
  const pct = progress?.percent || 0;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen text-text-secondary text-sm animate-pulse bg-[#0d1117] w-full">
        Loading live radar data…
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500 text-sm bg-[#0d1117] w-full">
        Could not load map. Check the train number and try again.
      </div>
    );
  }

  return (
    <div className="bg-[#0d1117] min-h-screen text-white antialiased overflow-hidden select-none font-body-md text-body-md flex flex-col">

      {/* ===== TOP NAV ===== */}
      <header className="bg-surface-elevated text-primary border-b border-border shadow-sm flex justify-between items-center w-full px-space-lg h-14 z-50 relative select-none flex-shrink-0">
        <div className="flex items-center space-x-space-md">
          <div className="flex items-center space-x-2">
            <span className="material-symbols-outlined text-primary text-[22px]">train</span>
            <span className="font-heading-lg text-heading-lg tracking-tight font-bold text-primary">Exprest</span>
          </div>
          <div className="hidden lg:flex items-center space-x-1.5 px-2.5 py-1 bg-surface rounded-full border border-border">
            <span className="w-2 h-2 rounded-full bg-success animate-pulse"></span>
            <span className="font-label text-label text-secondary tracking-normal">
              {isLive ? 'Live · 100% freshness' : 'Scheduled Data'}
            </span>
          </div>
          <div className="h-4 w-px bg-border hidden md:block"></div>
          <div className="hidden md:flex items-center space-x-2 px-2.5 py-1 bg-surface-container-low hover:bg-surface-container rounded-lg border border-border cursor-pointer transition-colors duration-150">
            <span className="font-label text-label px-1.5 py-0.5 bg-primary text-on-primary rounded font-semibold">{journey?.train?.number}</span>
            <span className="font-body-sm text-body-sm font-medium text-on-surface">{journey?.train?.name}</span>
            <span className="material-symbols-outlined text-secondary text-[16px]">expand_more</span>
          </div>
        </div>
        <nav className="hidden md:flex items-center space-x-space-lg h-full">
          <a className="text-primary font-semibold border-b-2 border-primary pb-1 flex items-center space-x-1.5 h-full pt-1" href="#live-map">
            <span className="material-symbols-outlined text-[18px]">radar</span>
            <span className="font-body-sm text-body-sm">Live Map</span>
          </a>
          <Link className="text-secondary hover:text-primary transition-colors flex items-center space-x-1.5 h-full pt-1" href={`/journey/${journeyId}`}>
            <span className="material-symbols-outlined text-[18px]">schedule</span>
            <span className="font-body-sm text-body-sm">Overview</span>
          </Link>
        </nav>
        <div className="flex items-center space-x-2 md:space-x-3">
          <div className="hidden xl:flex items-center space-x-1.5 px-2 py-1 bg-surface rounded border border-border">
            <span className="material-symbols-outlined text-success text-[15px]">satellite_alt</span>
            <span className="font-label text-label text-on-surface-variant font-medium">{isLive ? 'Live Telemetry' : 'Timetable View'}</span>
          </div>
          <Link href="/" className="hidden sm:inline-flex items-center space-x-1 px-3 py-1.5 border border-border rounded-lg font-body-sm text-body-sm font-medium hover:bg-surface transition-all duration-150 active:scale-95 text-on-surface">
            <span className="material-symbols-outlined text-[16px]">swap_horiz</span>
            <span>Switch Train</span>
          </Link>
          <button className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-primary text-on-primary rounded-lg font-body-sm text-body-sm font-medium hover:opacity-90 transition-all duration-150 active:scale-95 shadow-sm">
            <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`}></span>
            <span>{runStatus === 'not-started' ? 'Not Started' : runStatus === 'completed' ? 'Completed' : 'Live'}</span>
          </button>
        </div>
      </header>

      {/* ===== MAIN CONTENT: Left Sidebar + Map ===== */}
      <main className="flex flex-1 overflow-hidden">

        {/* ===== LEFT SIDEBAR (Stitch design) ===== */}
        <aside className="w-[340px] flex-shrink-0 bg-surface-elevated border-r border-border flex flex-col overflow-y-auto z-10">
          <div className="p-4 flex-1">

            {/* Train header */}
            <div className="flex items-start justify-between mb-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="uppercase text-secondary border border-border rounded font-label text-label font-semibold tracking-wider px-1.5 py-0.5">
                    {journey?.train?.type || 'EXPRESS'}
                  </span>
                  <span className="font-label text-label text-secondary font-medium">Daily Service</span>
                </div>
                <h2 className="font-heading-md text-heading-md font-bold text-on-surface leading-tight">
                  {journey?.train?.number} {journey?.train?.name}
                </h2>
                <p className="font-body-sm text-body-sm text-secondary mt-0.5 font-medium">
                  {journey?.train?.originStationName} ({journey?.train?.originStationId}) → {journey?.train?.destinationStationName} ({journey?.train?.destinationStationId})
                </p>
              </div>
              {/* Delay/On-time badge */}
              <div className={`inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-full border flex-shrink-0 ml-2 ${
                delayMinutes > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-emerald-50 border-emerald-200 text-success'
              }`}>
                <span className={`w-2 h-2 rounded-full ${delayMinutes > 0 ? 'bg-amber-400' : 'bg-success'}`}></span>
                <span className="font-label text-label font-bold tracking-tight">
                  {delayMinutes > 0 ? `+${delayMinutes} MIN` : 'ON TIME'}
                </span>
              </div>
            </div>

            <div className="h-px bg-border my-3"></div>

            {/* Station Journey Halts */}
            <div className="space-y-3.5">
              {/* Just Departed / Current Station */}
              <div className="flex items-start space-x-3">
                <div className="flex flex-col items-center mt-1">
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-success bg-white flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-success"></div>
                  </div>
                  <div className="w-0.5 h-9 bg-border mt-1"></div>
                </div>
                <div className="flex-1 -mt-0.5">
                  <div className="flex justify-between items-baseline">
                    <span className="font-label text-label text-secondary uppercase font-semibold">
                      {currentStop?.status === 'at-station' ? 'At Station' : 'Just Departed'}
                    </span>
                    <span className="font-label text-label text-secondary font-medium tabular-nums">
                      {formatTime(currentStop?.actualDeparture || currentStop?.scheduledDeparture)}
                      {currentStop?.platform ? ` (PF ${currentStop.platform})` : ''}
                    </span>
                  </div>
                  <p className="font-body-md text-body-md font-bold text-on-surface">
                    {currentStop?.stationName} ({currentStop?.stationId})
                  </p>
                  {delayMinutes > 0 && (
                    <p className="text-amber-600 font-label text-label font-semibold mt-0.5">
                      +{delayMinutes} min delay
                    </p>
                  )}
                </div>
              </div>

              {/* Approaching Next */}
              {nextStop && (
                <div className="flex items-start space-x-3">
                  <div className="flex flex-col items-center mt-0.5">
                    <div className="w-3.5 h-3.5 rounded-full border-2 border-primary bg-primary flex items-center justify-center ring-2 ring-neutral-200 animate-pulse">
                      <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                    </div>
                  </div>
                  <div className="flex-1 -mt-1">
                    <div className="flex justify-between items-baseline">
                      <span className="font-label text-label text-info font-bold uppercase">
                        Approaching Next · In {getETA(nextStop?.scheduledArrival, delayMinutes)}
                      </span>
                      <span className="font-label text-label font-bold text-primary tabular-nums">
                        {formatTime(nextStop?.actualArrival || nextStop?.scheduledArrival, !nextStop?.actualArrival ? delayMinutes : 0)} Exp
                      </span>
                    </div>
                    <p className="font-body-md text-body-md font-bold text-on-surface">
                      {nextStop?.stationName} ({nextStop?.stationId})
                    </p>
                    <div className="flex items-center space-x-2 mt-1 text-secondary font-body-sm text-body-sm">
                      {nextStop?.platform && (
                        <span className="inline-flex items-center space-x-1">
                          <span className="material-symbols-outlined text-[14px]">pin_drop</span>
                          <span>Platform {nextStop.platform} Expected</span>
                        </span>
                      )}
                      {nextStop?.platform && <span>·</span>}
                      <span className="tabular-nums font-medium text-on-surface">{remainingDist} km remaining</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="h-px bg-border my-3"></div>

            {/* Progress Bar */}
            <div>
              <div className="flex justify-between text-secondary font-body-sm text-body-sm mb-1.5">
                <span className="tabular-nums"><strong className="text-on-surface font-semibold">{Math.round(coveredDist)} km</strong> covered</span>
                <span className="tabular-nums text-text-tertiary">{remainingDist} km to halt</span>
                <span className="tabular-nums"><strong className="text-on-surface font-semibold">{Math.round(totalDist)} km</strong> total</span>
              </div>
              <div className="w-full h-2.5 bg-surface-container rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500"
                  style={{ width: `${pct}%` }}
                ></div>
              </div>
              <div className="flex justify-between items-center mt-1.5 text-secondary font-label text-label">
                <span>Elapsed: {elapsedText}</span>
                <span className={`font-semibold ${delayMinutes === 0 ? 'text-success' : 'text-amber-500'}`}>
                  {delayMinutes === 0 ? 'Track Pace: Optimal' : `+${delayMinutes}m behind`}
                </span>
                <span>{pct}% done</span>
              </div>
            </div>

            {/* Speed & Section Status */}
            <div className="grid grid-cols-2 gap-2 mt-4 p-2.5 bg-surface rounded-xl border border-border">
              <div>
                <span className="font-label text-label text-secondary uppercase block">Current Velocity</span>
                <span className="font-heading-md text-heading-md font-bold text-on-surface tabular-nums">
                  {isLive ? speedKph : 0} <span className="font-body-sm text-body-sm text-secondary font-normal">km/h</span>
                </span>
              </div>
              <div>
                <span className="font-label text-label text-secondary uppercase block">Speed Limit</span>
                <span className="font-heading-md text-heading-md font-bold text-secondary tabular-nums">
                  130 <span className="font-body-sm text-body-sm text-secondary font-normal">km/h (MPS)</span>
                </span>
              </div>
              <div className="col-span-2 pt-1 border-t border-border flex items-center justify-between">
                <span className="font-label text-label text-secondary">Tracking Status</span>
                <span className={`inline-flex items-center space-x-1.5 font-label text-label font-bold ${isLive ? 'text-success' : 'text-secondary'}`}>
                  <span className={`w-2 h-2 rounded-full ${isLive ? 'bg-success animate-pulse' : 'bg-slate-400'}`}></span>
                  <span>{isLive ? 'Live GPS Tracking' : 'Timetable View'}</span>
                </span>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-4 flex items-center space-x-2">
              <button
                onClick={() => { setFollowTrain(true); mapRef.current?.recenter(); }}
                className={`flex-1 py-2 px-2.5 rounded-lg font-body-sm text-body-sm font-medium transition-colors flex items-center justify-center space-x-1 active:scale-95 ${
                  followTrain ? 'bg-primary text-on-primary hover:opacity-90' : 'border border-border text-on-surface hover:bg-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">my_location</span>
                <span>Follow Train</span>
              </button>
              <button
                onClick={() => { setFollowTrain(false); mapRef.current?.fitRoute(); }}
                className="py-2 px-2.5 border border-border rounded-lg font-body-sm text-body-sm font-medium hover:bg-surface transition-colors flex items-center justify-center space-x-1 active:scale-95 text-on-surface"
              >
                <span className="material-symbols-outlined text-[16px]">fit_screen</span>
                <span>Fit Route</span>
              </button>
              <button className="py-2 px-2.5 border border-border rounded-lg font-body-sm text-body-sm font-medium hover:bg-surface transition-colors flex items-center justify-center active:scale-95 text-on-surface">
                <span className="material-symbols-outlined text-[16px]">share</span>
              </button>
            </div>
          </div>

          {/* Stops minilist at bottom of sidebar */}
          <div className="border-t border-border">
            <div className="px-4 py-2 bg-surface-container-lowest flex items-center justify-between">
              <span className="font-label text-label text-secondary uppercase font-semibold">Upcoming Halts</span>
              <Link href={`/journey/${journeyId}`} className="font-label text-label text-primary hover:underline">View All</Link>
            </div>
            <div className="overflow-y-auto max-h-48">
              {journey?.stops?.slice(nextStopIdx, nextStopIdx + 5).map((stop: any, i: number) => (
                <div key={stop.stationId} className="flex items-center justify-between px-4 py-2 border-b border-border/50 hover:bg-surface-container-lowest transition-colors">
                  <div className="flex items-center space-x-2">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${i === 0 ? 'bg-primary animate-pulse' : 'bg-border'}`}></div>
                    <div>
                      <div className="font-body-sm text-body-sm font-semibold text-on-surface">{stop.stationName}</div>
                      <div className="font-label text-label text-secondary">{stop.stationId}</div>
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="font-body-sm text-body-sm font-semibold text-on-surface tabular-nums">
                      {formatTime(stop.actualArrival || stop.scheduledArrival, !stop.actualArrival ? delayMinutes : 0)}
                    </div>
                    {stop.delayMinutes > 0 && (
                      <div className="font-label text-label text-amber-500 font-bold">+{stop.delayMinutes}m</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        {/* ===== MAP AREA ===== */}
        <div className="flex-1 relative">
          {/* Map Controls (top-right overlay) */}
          <div className="absolute top-4 right-4 z-20 flex flex-col space-y-2">
            <button
              onClick={() => { setFollowTrain(true); mapRef.current?.recenter(); }}
              className={`px-3 py-2 rounded-xl font-body-sm text-body-sm font-semibold shadow-lg transition-all active:scale-95 flex items-center space-x-1.5 ${
                followTrain
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-elevated text-on-surface border border-border hover:bg-surface'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>Follow Train</span>
              <span className="material-symbols-outlined text-[16px]">my_location</span>
            </button>
            <div className="bg-surface-elevated/90 backdrop-blur-sm border border-border rounded-xl shadow-lg p-1 flex flex-col space-y-1">
              <button onClick={() => mapRef.current?.fitRoute()} className="p-2 hover:bg-surface rounded-lg transition-colors text-on-surface" title="Fit Route">
                <span className="material-symbols-outlined text-[20px]">add</span>
              </button>
              <button className="p-2 hover:bg-surface rounded-lg transition-colors text-on-surface" title="Zoom Out">
                <span className="material-symbols-outlined text-[20px]">remove</span>
              </button>
              <div className="h-px bg-border"></div>
              <button className="p-2 hover:bg-surface rounded-lg transition-colors text-on-surface" title="Layers">
                <span className="material-symbols-outlined text-[20px]">layers</span>
              </button>
              <button onClick={() => mapRef.current?.resetNorth()} className="p-2 hover:bg-surface rounded-lg transition-colors text-on-surface" title="North Up">
                <span className="material-symbols-outlined text-[20px]">explore</span>
              </button>
            </div>
          </div>

          {/* Map Layer Controls */}
          <div className="absolute bottom-24 right-4 z-20 bg-surface-elevated/90 backdrop-blur-sm border border-border rounded-xl shadow-lg p-3 space-y-1.5">
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-primary rounded" />
              <span className="font-label text-label text-on-surface">Track Signals</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" defaultChecked className="accent-primary rounded" />
              <span className="font-label text-label text-on-surface">Speed Zones</span>
            </label>
            <label className="flex items-center space-x-2 cursor-pointer">
              <input type="checkbox" className="accent-primary rounded" />
              <span className="font-label text-label text-on-surface">Elevation Profile</span>
            </label>
          </div>

          {/* The actual MapLibre map */}
          <JourneyMap
            ref={mapRef}
            routeCoordinates={journey?.route?.coordinates}
            currentPosition={journey?.livePosition}
            stops={journey?.stops}
            className="w-full h-full"
          />
        </div>
      </main>

      {/* ===== BOTTOM TELEMETRY BAR ===== */}
      <footer className="bg-[#0f1923]/95 backdrop-blur-sm border-t border-[#1e2d3d] shadow-[0_-4px_20px_rgba(0,0,0,0.4)] px-space-lg py-3 flex items-center justify-between text-[#e2e8f0] flex-shrink-0 z-10">

        {/* Journey Corridor & Status */}
        <div className="flex items-center space-x-space-md border-r border-[#2d3748] pr-space-lg">
          <div className="flex items-center space-x-2.5">
            <div className="relative flex items-center justify-center">
              <span className={`w-3.5 h-3.5 rounded-full ${isLive ? (delayMinutes > 0 ? 'bg-amber-400' : 'bg-[#10b981]') : 'bg-slate-500'}`}></span>
              {isLive && <span className="absolute w-5 h-5 rounded-full border border-[#10b981]/60 animate-ping"></span>}
            </div>
            <div>
              <div className="flex items-center space-x-1.5">
                <span className="font-label text-label uppercase text-[#94a3b8] font-bold">Status</span>
                <span className={`px-1.5 rounded font-label text-label font-bold ${isLive ? (delayMinutes > 0 ? 'bg-amber-400/20 text-amber-400' : 'bg-[#10b981]/20 text-[#34d399]') : 'bg-slate-700 text-slate-300'}`}>
                  {isLive ? (delayMinutes > 0 ? `DELAYED (+${delayMinutes}m)` : 'ON TIME') : runStatus.toUpperCase().replace(/_/g, ' ')}
                </span>
              </div>
              <p className="font-body-sm text-body-sm text-white font-medium">
                {currentStop?.stationId || originStop?.stationId || 'Origin'} → {nextStop?.stationId || 'Destination'}
              </p>
            </div>
          </div>
          <div className="hidden md:block">
            <span className="font-label text-label uppercase text-[#94a3b8] block">Next Station</span>
            <p className="font-body-sm text-body-sm text-white font-medium">
              {nextStop?.stationName || '—'} ({nextStop?.stationId || '—'})
            </p>
          </div>
        </div>

        {/* Real-time telemetry */}
        <div className="hidden lg:flex items-center space-x-space-lg px-space-md">
          <div>
            <span className="font-label text-label uppercase text-[#94a3b8] block">Track Gauge</span>
            <div className="flex items-center space-x-1 text-white font-body-sm text-body-sm font-semibold">
              <span className="material-symbols-outlined text-[15px] text-[#38bdf8]">linear_scale</span>
              <span>1,676 mm (Broad)</span>
            </div>
          </div>
          <div>
            <span className="font-label text-label uppercase text-[#94a3b8] block">Route Total</span>
            <div className="flex items-center space-x-1 text-white font-body-sm text-body-sm font-semibold">
              <span className="material-symbols-outlined text-[15px] text-amber-400">route</span>
              <span>{Math.round(totalDist)} km</span>
            </div>
          </div>
          <div>
            <span className="font-label text-label uppercase text-[#94a3b8] block">Train Type</span>
            <span className="text-white font-body-sm text-body-sm font-semibold">{journey?.train?.category || journey?.train?.type || 'Express'}</span>
          </div>
          <div>
            <span className="font-label text-label uppercase text-[#94a3b8] block">Live Speed</span>
            <span className="text-white font-body-sm text-body-sm font-semibold tabular-nums">{isLive ? `${speedKph} km/h` : '—'}</span>
          </div>
          <div>
            <span className="font-label text-label uppercase text-[#94a3b8] block">Delay</span>
            <span className={`font-body-sm text-body-sm font-semibold tabular-nums ${delayMinutes > 0 ? 'text-amber-400' : 'text-[#10b981]'}`}>
              {delayMinutes > 0 ? `+${delayMinutes} min` : 'On Time'}
            </span>
          </div>
        </div>

        {/* Pinned trains */}
        <div className="flex items-center space-x-2 border-l border-[#2d3748] pl-space-lg">
          <span className="font-label text-label uppercase text-[#94a3b8] hidden sm:inline font-semibold">Pinned:</span>
          <div className="px-2.5 py-1.5 rounded-lg bg-[#1f2937] border border-[#374151] text-left flex items-center space-x-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <div>
              <div className="text-[10px] font-bold text-[#94a3b8] leading-none">{journey?.train?.number}</div>
              <div className="text-[12px] font-semibold text-white leading-tight max-w-[80px] truncate">{journey?.train?.name?.split(' ').slice(0, 2).join(' ')}</div>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
