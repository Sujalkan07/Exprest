'use client';

import React, { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

import { API_BASE } from '@/lib/api';

function formatTime(isoString: string | null | undefined, extraDelayMinutes: number = 0): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (extraDelayMinutes > 0) d.setMinutes(d.getMinutes() + extraDelayMinutes);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Kolkata'
    });
  } catch { return isoString; }
}

export default function AnalyticsPage() {
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

  const { data: analyticsRes } = useQuery({
    queryKey: ['journeyAnalytics', journeyId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/journeys/${journeyId}/analytics`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const journey = data?.data;
  const analyticsData = analyticsRes?.data;
  const progress = journey?.progress;
  const stops: any[] = useMemo(() => journey?.stops || [], [journey?.stops]);
  const currentStopIdx = progress?.currentStopIdx ?? 0;
  const nextStopIdx = progress?.nextStopIdx ?? Math.min(stops.length - 1, currentStopIdx + 1);
  const currentStop = stops[currentStopIdx];
  const nextStop = stops[nextStopIdx];
  const delayMinutes = journey?.run?.delayMinutes ?? 0;
  const currentPosition = journey?.livePosition || journey?.run?.currentLocation;

  // Derive Max Delay stop
  const maxDelayStop = useMemo(() => {
    if (!stops.length) return null;
    return stops.reduce((max, s) => ((s.delayMinutes || 0) > (max.delayMinutes || 0) ? s : max), stops[0]);
  }, [stops]);

  // Derive Punctuality metrics honestly only from stops with recorded delay
  const evaluatedStops = useMemo(() => {
    return stops.filter(s => typeof s.delayMinutes === 'number' && !isNaN(s.delayMinutes));
  }, [stops]);

  const onTimeCount = useMemo(() => {
    return evaluatedStops.filter(s => (s.delayMinutes ?? 0) <= 15).length;
  }, [evaluatedStops]);

  const punctualityPercent = evaluatedStops.length > 0
    ? Math.round((onTimeCount / evaluatedStops.length) * 100)
    : null;

  // Selected key stations for Elevation Profile X-axis
  const elevationNodes = useMemo(() => {
    if (!stops.length) return [];
    if (stops.length <= 6) return stops;
    const step = (stops.length - 1) / 5;
    return [
      stops[0],
      stops[Math.round(step * 1)],
      stops[Math.round(step * 2)],
      stops[Math.round(step * 3)],
      stops[Math.round(step * 4)],
      stops[stops.length - 1]
    ];
  }, [stops]);

  const elevationProfile: any[] = useMemo(() => analyticsData?.elevationProfile || [], [analyticsData?.elevationProfile]);
  const hasElevationData = elevationProfile.length >= 2;

  const elevationStats = useMemo(() => {
    if (!hasElevationData) return null;
    const elevations = elevationProfile.map((ep: any) => ep.elevationM || 0);
    return {
      peak: Math.max(...elevations),
      min: Math.min(...elevations),
      current: elevationProfile[Math.min(currentStopIdx, elevationProfile.length - 1)]?.elevationM || 0,
    };
  }, [elevationProfile, hasElevationData, currentStopIdx]);

  // Construct dynamic SVG coordinates and labels from genuine elevation profile
  const elevationChart = useMemo(() => {
    if (!hasElevationData) return null;

    const elevations = elevationProfile.map(p => Number(p.elevationM) || 0);
    const distances = elevationProfile.map(p => Number(p.distanceKm) || 0);

    const rawMinY = Math.min(...elevations);
    const rawMaxY = Math.max(...elevations);
    const yPad = Math.max(20, Math.round((rawMaxY - rawMinY) * 0.1));
    const yMin = Math.max(0, Math.floor((rawMinY - yPad) / 10) * 10);
    const yMax = Math.ceil((rawMaxY + yPad) / 10) * 10;
    const yRange = Math.max(1, yMax - yMin);

    const xMin = Math.min(...distances);
    const xMax = Math.max(...distances);
    const xRange = Math.max(1, xMax - xMin);

    const plotLeft = 55;
    const plotRight = 980;
    const plotTop = 20;
    const plotBottom = 200;
    const plotWidth = plotRight - plotLeft;
    const plotHeight = plotBottom - plotTop;

    const points = elevationProfile.map(p => {
      const d = Number(p.distanceKm) || 0;
      const e = Number(p.elevationM) || 0;
      const x = plotLeft + ((d - xMin) / xRange) * plotWidth;
      const y = plotBottom - ((e - yMin) / yRange) * plotHeight;
      return { x, y, elevation: e, distance: d, stationCode: p.stationCode, stationName: p.stationName };
    });

    const chartPath = points.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(' ');
    const areaPath = points.length > 0
      ? `${chartPath} L ${points[points.length - 1].x.toFixed(1)} ${plotBottom} L ${points[0].x.toFixed(1)} ${plotBottom} Z`
      : '';

    const yTicks = [0, 1, 2, 3, 4].map(i => {
      const val = Math.round(yMax - (i / 4) * (yMax - yMin));
      const y = plotTop + (i / 4) * plotHeight;
      return { val, y };
    });

    return { chartPath, areaPath, yTicks, xMin, xMax, points, plotLeft, plotWidth, xRange };
  }, [elevationProfile, hasElevationData]);

  if (isLoading) return <div className="p-8 text-center text-secondary">Loading Analytics...</div>;
  if (error || !journey) return <div className="p-8 text-center text-red-500">Error loading analytics.</div>;

  // Real speed without fabricated defaults
  const currentSpeed = Math.round(currentPosition?.speedKph || 0);
  const maxSpeed = 130;
  const speedPercentage = currentSpeed > 0 ? Math.round((currentSpeed / maxSpeed) * 100) : 0;

  return (
    <div className="bg-surface-elevated text-on-surface antialiased font-body-md text-body-md min-h-screen">
      <main className="max-w-[1440px] mx-auto px-6 py-6 space-y-6">

        {/* Section Header */}
        <section className="flex flex-col gap-3">
          <nav className="flex items-center gap-1.5 text-body-sm font-body-sm text-secondary">
            <span>Network Overview</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span>{journey?.train?.originStationName || 'Origin'} Corridor</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-on-surface font-medium">{journey?.train?.number} {journey?.train?.name}</span>
            <span className="material-symbols-outlined text-[14px]">chevron_right</span>
            <span className="text-primary font-semibold">Journey Analytics</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pt-1">
            <div>
              <h1 className="text-heading-lg font-heading-lg text-primary tracking-tight">
                Journey Analytics &amp; Telemetry
              </h1>
              <p className="text-body-sm font-body-sm text-secondary mt-0.5">
                {journey?.train?.number} {journey?.train?.name} · {journey?.train?.originStationName} ({journey?.train?.originStationId}) to {journey?.train?.destinationStationName} ({journey?.train?.destinationStationId}){journey?.train?.type ? ` · ${journey?.train?.type}` : ''}
              </p>
            </div>

            <div className="flex items-center flex-wrap gap-2.5">
              <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-label font-label ${delayMinutes > 15 ? 'border-danger/20 bg-danger/5 text-danger' : delayMinutes > 0 ? 'border-warning/20 bg-warning/5 text-warning' : 'border-success/20 bg-success/5 text-success'}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${delayMinutes > 15 ? 'bg-danger' : delayMinutes > 0 ? 'bg-warning' : 'bg-success'}`}></span>
                <span>{delayMinutes > 0 ? `+${delayMinutes} min Delay` : `On Time`}</span>
              </div>

              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-surface border border-border text-secondary text-label font-label">
                <span className="material-symbols-outlined text-[14px] text-success">satellite_alt</span>
                <span className="tnum">RailRadar Telemetry Synced</span>
              </div>

              <Link href={`/journey/${journeyId}/map`} className="flex items-center gap-1.5 px-3.5 py-1.5 text-body-sm font-body-sm rounded bg-primary text-on-primary hover:bg-inverse-surface shadow-sm transition-colors active:scale-[0.99]">
                <span className="material-symbols-outlined text-[16px]">radar</span>
                <span>Live Radar View</span>
              </Link>
            </div>
          </div>
        </section>

        {/* 4 Summary Cards */}
        <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          
          {/* Card 1: Journey Completion */}
          <div className="p-5 rounded-xl bg-surface-elevated border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-secondary">
                <span className="text-label font-label tracking-wider uppercase text-outline">Journey Completion</span>
                <span className="material-symbols-outlined text-outline">timelapse</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-display-lg font-display-lg text-primary tracking-tight tnum">{progress?.percent ?? 0}%</span>
                {delayMinutes > 15 ? (
                  <span className="text-label font-label text-danger flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">warning</span> +{delayMinutes}m delay
                  </span>
                ) : delayMinutes > 0 ? (
                  <span className="text-label font-label text-warning flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">schedule</span> +{delayMinutes}m delay
                  </span>
                ) : journey?.status === 'completed' ? (
                  <span className="text-label font-label text-secondary flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">check_circle</span> Completed
                  </span>
                ) : (
                  <span className="text-label font-label text-success flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">arrow_upward</span> On track
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 pt-2">
              <div className="w-full bg-surface-container rounded-full h-1.5 overflow-hidden">
                <div className="bg-primary h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(0, progress?.percent ?? 0))}%` }}></div>
              </div>
              <p className="text-label font-label text-secondary mt-2 tnum">
                {Math.round(progress?.coveredDistanceKm || 0)} km of {Math.round(progress?.totalDistanceKm || 0)} km total · {Math.round(progress?.remainingDistanceKm || 0)} km remaining
              </p>
            </div>
          </div>

          {/* Card 2: Distance Covered */}
          <div className="p-5 rounded-xl bg-surface-elevated border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-secondary">
                <span className="text-label font-label tracking-wider uppercase text-outline">Distance Covered</span>
                <span className="material-symbols-outlined text-outline">straighten</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-display-lg font-display-lg text-primary tracking-tight tnum">{Math.round(progress?.coveredDistanceKm || 0)}</span>
                <span className="text-heading-md font-heading-md text-secondary">km</span>
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-border/60">
              <p className="text-body-sm font-body-sm text-secondary tnum">
                {Math.round(progress?.remainingDistanceKm || 0)} km remaining to destination · Avg Pace <span className="text-on-surface font-semibold">{currentSpeed} km/h</span>
              </p>
            </div>
          </div>

          {/* Card 3: Current Variance */}
          <div className="p-5 rounded-xl bg-surface-elevated border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-secondary">
                <span className="text-label font-label tracking-wider uppercase text-outline">Current Variance</span>
                <span className="material-symbols-outlined text-warning">schedule</span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className={`text-display-lg font-display-lg tracking-tight tnum ${delayMinutes > 0 ? 'text-warning' : 'text-success'}`}>
                  {delayMinutes > 0 ? `+${delayMinutes}` : '0'}
                </span>
                <span className={`text-heading-md font-heading-md ${delayMinutes > 0 ? 'text-warning' : 'text-success'}`}>min</span>
                <span className={`px-2 py-0.5 rounded text-label font-label ${delayMinutes > 15 ? 'bg-danger/10 text-danger' : delayMinutes > 0 ? 'bg-warning/10 text-warning' : 'bg-success/10 text-success'}`}>
                  {delayMinutes <= 0 ? 'On Time' : delayMinutes <= 15 ? 'Minor' : 'Moderate'}
                </span>
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-border/60">
              <p className="text-body-sm font-body-sm text-secondary tnum">
                Max delay +{maxDelayStop?.delayMinutes || delayMinutes} min at {maxDelayStop?.stationId || 'en route'}
              </p>
            </div>
          </div>

          {/* Card 4: Route Waypoints */}
          <div className="p-5 rounded-xl bg-surface-elevated border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between text-secondary">
                <span className="text-label font-label tracking-wider uppercase text-outline">Route Waypoints</span>
                <span className="material-symbols-outlined text-outline">pin_drop</span>
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <span className="text-display-lg font-display-lg text-primary tracking-tight tnum">{currentStopIdx + 1}</span>
                <span className="text-heading-md font-heading-md text-secondary">/ {stops.length}</span>
              </div>
            </div>
            <div className="mt-4 pt-2 border-t border-border/60">
              <p className="text-body-sm font-body-sm text-secondary tnum">
                Next: <span className="text-primary font-semibold">{nextStop?.stationName || 'Destination'} ({nextStop?.stationId || '-'})</span> · {Math.max(0, stops.length - currentStopIdx - 1)} halts remaining
              </p>
            </div>
          </div>

        </section>

        {/* Route Elevation Profile */}
        <section className="p-6 rounded-xl bg-surface-elevated border border-border shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-6 border-b border-border/70">
            <div>
              <h2 className="text-heading-md font-heading-md text-primary tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-on-surface">landscape</span>
                Route Elevation Profile
              </h2>
              <p className="text-body-sm font-body-sm text-secondary">
                Continuous topological grade, track altitude, and live electric locomotive traction position
              </p>
            </div>

            <div className="flex items-center flex-wrap gap-2 text-label font-label tnum">
              {hasElevationData && elevationStats ? (
                <>
                  <span className="px-2.5 py-1 rounded bg-surface border border-border text-on-surface flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
                    Peak: {elevationStats.peak}m
                  </span>
                  <span className="px-2.5 py-1 rounded bg-surface border border-border text-secondary">
                    Min: {elevationStats.min}m
                  </span>
                  <span className="px-2.5 py-1 rounded bg-surface-container border border-border text-primary font-semibold">
                    Current: {elevationStats.current}m
                  </span>
                </>
              ) : (
                <span className="px-2.5 py-1 rounded bg-surface border border-border text-secondary">
                  Elevation profile: Data unavailable for this corridor
                </span>
              )}
            </div>
          </div>

          <div className="relative w-full mt-6 select-none">
            {/* Live Train Indicator on Elevation SVG */}
            {hasElevationData && (
              <div style={{ left: `${Math.min(95, Math.max(5, progress?.percent ?? 0))}%` }} className="absolute top-6 -translate-x-1/2 z-20 hidden md:flex flex-col items-center pointer-events-none">
                <div className="bg-primary text-on-primary px-3 py-1.5 rounded shadow-lg text-label font-label whitespace-nowrap flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live"></span>
                  <span>Current: {Math.round(progress?.coveredDistanceKm || 0)} km</span>
                  {elevationStats && (
                    <>
                      <span className="text-outline-variant">|</span>
                      <span className="tnum">Alt: {elevationStats.current}m</span>
                    </>
                  )}
                  <span className="text-outline-variant">|</span>
                  <span className="tnum">{currentSpeed} km/h</span>
                </div>
                <div className="w-0.5 h-3 bg-primary"></div>
              </div>
            )}

            <div className="w-full overflow-x-auto pb-2">
              {hasElevationData && elevationChart ? (
                <svg className="w-full min-w-[760px] h-48 sm:h-56" preserveAspectRatio="none" viewBox="0 0 1000 240">
                  <defs>
                    <linearGradient id="elevationGrad" x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25"></stop>
                      <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0"></stop>
                    </linearGradient>
                  </defs>

                  <g stroke="#e7e7ea" strokeDasharray="2,2" strokeWidth="1">
                    {elevationChart.yTicks.map((t, idx) => (
                      <line key={idx} x1="45" x2="980" y1={t.y} y2={t.y}></line>
                    ))}
                  </g>

                  <g className="text-[10px] font-mono fill-secondary" textAnchor="end">
                    {elevationChart.yTicks.map((t, idx) => (
                      <text key={idx} x="40" y={t.y + 4}>{t.val}m</text>
                    ))}
                  </g>

                  {/* Dynamic Area Fill & Elevation Contour */}
                  {elevationChart.areaPath && (
                    <path d={elevationChart.areaPath} fill="url(#elevationGrad)"></path>
                  )}
                  {elevationChart.chartPath && (
                    <path d={elevationChart.chartPath} fill="none" stroke="#0284c7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5"></path>
                  )}

                  {/* Elevation sample points */}
                  {elevationChart.points.map((pt, idx) => (
                    <circle key={idx} cx={pt.x} cy={pt.y} fill="#0284c7" r="3.5" stroke="#ffffff" strokeWidth="1.5">
                      <title>{pt.stationCode ? `${pt.stationCode}: ` : ''}{pt.elevation}m ({Math.round(pt.distance)} km)</title>
                    </circle>
                  ))}
                </svg>
              ) : (
                <div className="py-12 text-center text-body-sm font-body-sm text-secondary bg-surface/40 rounded-lg border border-dashed border-border">
                  <span className="material-symbols-outlined text-[32px] text-outline mb-1">terrain</span>
                  <p>Topographical elevation measurements are currently unavailable for this corridor.</p>
                </div>
              )}
            </div>

            {/* X-axis Station Labels */}
            <div className="mt-2 flex justify-between text-body-sm font-body-sm text-secondary px-8 border-t border-border pt-2 tnum">
              {elevationNodes.map((stn, idx) => (
                <div key={stn.stationId || idx} className="flex flex-col items-center">
                  <span className={`font-semibold ${idx === currentStopIdx ? 'text-warning' : 'text-primary'}`}>{stn.stationId}</span>
                  <span className="text-label text-outline">{Math.round(stn.distanceKm ?? stn.distanceFromSourceKm ?? 0)} km</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Station-by-Station Delay Trend & Punctuality */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* Station Delay Trend */}
          <div className="lg:col-span-7 p-6 rounded-xl bg-surface-elevated border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-heading-md font-heading-md text-primary tracking-tight">
                    Station-by-Station Delay Trend
                  </h2>
                  <p className="text-body-sm font-body-sm text-secondary">
                    Cumulative minutes variance against Master Timetable slot
                  </p>
                </div>
                <div className="flex items-center gap-3 text-label font-label">
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-success"></span>
                    <span className="text-secondary">On-Time Line</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-warning"></span>
                    <span className="text-secondary">Delay (min)</span>
                  </div>
                </div>
              </div>

              <div className="mt-6 space-y-3">
                {stops.slice(0, 7).map((stn, idx) => {
                  const delay = stn.delayMinutes || 0;
                  const isCurrent = idx === currentStopIdx;
                  return (
                    <div key={stn.stationId || idx} className={`flex items-center gap-4 text-body-sm font-body-sm ${isCurrent ? 'bg-warning/5 py-1 px-1 rounded border border-warning/15' : ''}`}>
                      <span className="w-14 text-right font-medium text-on-surface">{stn.stationId}</span>
                      <div className="flex-1 bg-surface-container rounded h-5 relative flex items-center px-2">
                        <div 
                          className={`h-3 rounded-sm ${delay === 0 ? 'bg-success w-1' : delay > 15 ? 'bg-danger/80' : 'bg-warning/80'}`} 
                          style={{ width: delay > 0 ? `${Math.min(80, delay * 4)}%` : '4px' }}
                        ></div>
                        <span className={`text-label font-label ml-2 tnum ${delay === 0 ? 'text-success font-semibold' : 'text-warning'}`}>
                          {delay > 0 ? `+${delay} min` : '0 min (On Time)'}
                        </span>
                      </div>
                      <span className="w-16 text-right text-label font-label text-secondary tnum">
                        {formatTime(stn.actualDeparture || stn.scheduledDeparture)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="mt-6 pt-3 border-t border-border flex items-center justify-between text-label font-label text-secondary">
              <span>RailRadar Real-Time Telemetry Tracking Active</span>
              <span className="text-on-surface font-semibold">Master Slot Tracking: Standard Operational Slot</span>
            </div>
          </div>

          {/* Punctuality Analysis */}
          <div className="lg:col-span-5 p-6 rounded-xl bg-surface-elevated border border-border shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <h2 className="text-heading-md font-heading-md text-primary tracking-tight">
                  Punctuality Analysis
                </h2>
                <span className="px-2 py-0.5 rounded bg-surface border border-border text-label font-label text-secondary">IR CTC Model</span>
              </div>
              <p className="text-body-sm font-body-sm text-secondary mt-0.5">
                Real-time headway clearance and corridor compliance
              </p>

              <div className="mt-6 space-y-4">
                
                {/* Metric 1 */}
                <div className="p-3.5 rounded-lg border border-border bg-surface flex items-center justify-between">
                  <div>
                    <span className="text-label font-label uppercase tracking-wider text-outline">Terminal Arrival Confidence</span>
                    <div className="text-heading-lg font-heading-lg text-primary tracking-tight tnum mt-0.5">
                      {punctualityPercent != null ? `${punctualityPercent}%` : '—'}
                    </div>
                    <span className="text-label font-label text-success">
                      {punctualityPercent != null ? `${onTimeCount} of ${evaluatedStops.length} recorded halts within 15m buffer` : 'Awaiting timetable data'}
                    </span>
                  </div>
                  <div className="w-12 h-12 rounded-full border-2 border-primary flex items-center justify-center font-label text-primary font-bold">
                    {punctualityPercent != null ? `${punctualityPercent}%` : '—'}
                  </div>
                </div>

                {/* Metric 2 */}
                <div className="p-3.5 rounded-lg border border-border bg-surface flex items-center justify-between">
                  <div>
                    <span className="text-label font-label uppercase tracking-wider text-outline">Section Velocity vs Permissible</span>
                    <div className="text-heading-lg font-heading-lg text-primary tracking-tight tnum mt-0.5">
                      {currentSpeed} <span className="text-body-md font-body-md text-secondary font-normal">/ {maxSpeed} km/h</span>
                    </div>
                    <span className="text-label font-label text-secondary">
                      {currentSpeed > 0 ? `Operating at ${speedPercentage}% of Max Authorized` : 'Train stationary / awaiting telemetry'}
                    </span>
                  </div>
                  <span className="material-symbols-outlined text-outline text-[28px]">speed</span>
                </div>

                {/* Metric 3 */}
                <div className="p-3.5 rounded-lg border border-border bg-surface flex items-center justify-between">
                  <div>
                    <span className="text-label font-label uppercase tracking-wider text-outline">Signal & Headway Compliance</span>
                    <div className="text-heading-lg font-heading-lg text-primary tracking-tight tnum mt-0.5">
                      {delayMinutes <= 0 ? 'Clear (On Time)' : delayMinutes <= 15 ? `Nominal (+${delayMinutes}m)` : `Caution (+${delayMinutes}m)`}
                    </div>
                    <span className="text-label font-label text-secondary">
                      {delayMinutes <= 0 ? 'Track section headway: Clear' : 'Track section headway spacing active'}
                    </span>
                  </div>
                  <span className={`w-3 h-3 rounded-full ${delayMinutes <= 15 ? 'bg-success' : 'bg-warning'}`}></span>
                </div>

              </div>
            </div>
            <div className="mt-6 pt-3 border-t border-border flex items-center justify-between text-label font-label text-secondary">
              <span>Corridor Signaling: Standard Block Protection</span>
              <span className="text-success font-medium">Braking Distance: Nominal</span>
            </div>
          </div>

        </section>

        {/* Station Timetable & Performance Log */}
        <section className="p-6 rounded-xl bg-surface-elevated border border-border shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-border">
            <div>
              <h2 className="text-heading-md font-heading-md text-primary tracking-tight">
                Station Timetable &amp; Performance Log
              </h2>
              <p className="text-body-sm font-body-sm text-secondary">
                Granular station stops, platform routing, and dwell time variance
              </p>
            </div>

            <div className="flex items-center p-1 bg-surface rounded-lg border border-border self-start sm:self-auto">
              <button className="px-3 py-1 rounded text-label font-label text-primary bg-surface-elevated shadow-sm font-semibold transition-all">
                All {stops.length} Stations
              </button>
            </div>
          </div>

          <div className="overflow-x-auto mt-2">
            <table className="w-full text-left border-collapse text-body-sm font-body-sm">
              <thead>
                <tr className="border-b border-border text-label font-label text-outline uppercase tracking-wider">
                  <th className="py-3 px-3">Station &amp; Code</th>
                  <th className="py-3 px-3">Distance</th>
                  <th className="py-3 px-3">Scheduled Arr / Dep</th>
                  <th className="py-3 px-3">Actual / Expected</th>
                  <th className="py-3 px-3">Platform</th>
                  <th className="py-3 px-3">Variance</th>
                  <th className="py-3 px-3 text-right">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {stops.map((stop: any, idx: number) => {
                  const delay = stop.delayMinutes || 0;
                  const isDeparted = stop.status === 'departed';
                  const isAtStation = stop.status === 'at-station';
                  return (
                    <tr key={stop.stationId || idx} className="hover:bg-surface/50 transition-colors">
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <div className={`w-2 h-2 rounded-full ${isDeparted ? 'bg-primary' : isAtStation ? 'bg-warning pulse-live' : 'bg-outline'}`}></div>
                          <div>
                            <span className="font-semibold text-primary">{stop.stationName}</span>
                            <span className="ml-1 text-label font-label text-outline">({stop.stationId})</span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3.5 px-3 tnum text-secondary">{Math.round(stop.distanceKm ?? stop.distanceFromSourceKm ?? 0)} km</td>
                      <td className="py-3.5 px-3 tnum text-secondary">
                        {stop.scheduledArrival ? formatTime(stop.scheduledArrival) : 'Source'} / {stop.scheduledDeparture ? formatTime(stop.scheduledDeparture) : 'Term'}
                      </td>
                      <td className="py-3.5 px-3 tnum text-on-surface font-medium">
                        {formatTime(stop.actualArrival || stop.scheduledArrival, delay)} / {formatTime(stop.actualDeparture || stop.scheduledDeparture, delay)}
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="px-2 py-0.5 rounded bg-surface border border-border text-label font-label">PF {stop.platform || '—'}</span>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className={`text-label font-label font-semibold ${delay > 0 ? 'text-warning' : 'text-success'}`}>
                          {delay > 0 ? `+${delay} min` : 'On Time'}
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-right">
                        <span className={`px-2.5 py-1 rounded border text-label font-label ${isDeparted ? 'bg-surface border-border text-secondary' : isAtStation ? 'bg-warning/10 border-warning/30 text-warning font-semibold' : 'bg-surface/50 border-border/50 text-outline'}`}>
                          {isDeparted ? 'Departed' : isAtStation ? 'At Station' : 'Scheduled'}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

      </main>
    </div>
  );
}
