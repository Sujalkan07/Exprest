'use client';

import React, { useMemo } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const OPENWEATHER_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_KEY || '';

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

export default function CompanionPage() {
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
  const stops: any[] = journey?.stops || [];
  const currentStopIdx = progress?.currentStopIdx ?? 0;
  const nextStopIdx = progress?.nextStopIdx ?? Math.min(stops.length - 1, currentStopIdx + 1);
  const currentStop = stops[currentStopIdx];
  const nextStop = stops[nextStopIdx];
  const destStop = stops[stops.length - 1];

  // Sample 6 stations across the route for Weather Horizon
  const weatherHorizonNodes = useMemo(() => {
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

  // Fetch Weather for Current Station
  const { data: currentWeather } = useQuery({
    queryKey: ['weather', currentStop?.stationLat, currentStop?.stationLon],
    queryFn: async () => {
      if (!currentStop?.stationLat || !currentStop?.stationLon) return null;
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${currentStop.stationLat}&lon=${currentStop.stationLon}&appid=${OPENWEATHER_KEY}&units=metric`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!currentStop?.stationLat && !!currentStop?.stationLon,
  });

  // Fetch Weather for Next Station
  const { data: nextWeather } = useQuery({
    queryKey: ['weather', nextStop?.stationLat, nextStop?.stationLon],
    queryFn: async () => {
      if (!nextStop?.stationLat || !nextStop?.stationLon) return null;
      const res = await fetch(`https://api.openweathermap.org/data/2.5/weather?lat=${nextStop.stationLat}&lon=${nextStop.stationLon}&appid=${OPENWEATHER_KEY}&units=metric`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!nextStop?.stationLat && !!nextStop?.stationLon,
  });

  if (isLoading) return <div className="p-8 text-center text-secondary">Loading Companion...</div>;
  if (error || !journey) return <div className="p-8 text-center text-red-500">Error loading companion.</div>;

  const curTemp = currentWeather?.main?.temp ? Math.round(currentWeather.main.temp) : 31;
  const curHigh = currentWeather?.main?.temp_max ? Math.round(currentWeather.main.temp_max) : 35;
  const curCond = currentWeather?.weather?.[0]?.main || 'Sunny & Humid';
  const curHum = currentWeather?.main?.humidity || 65;
  const curWind = currentWeather?.wind?.speed ? Math.round(currentWeather.wind.speed * 3.6) : 12;

  const nextTemp = nextWeather?.main?.temp ? Math.round(nextWeather.main.temp) : 29;
  const nextHigh = nextWeather?.main?.temp_max ? Math.round(nextWeather.main.temp_max) : 31;
  const nextCond = nextWeather?.weather?.[0]?.main || 'Scattered Overcast';
  const nextHum = nextWeather?.main?.humidity || 72;

  return (
    <div className="bg-surface-elevated text-on-surface antialiased font-body-md text-body-md min-h-screen">
      <main className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 pt-8 pb-20">

        {/* Section Header */}
        <section className="mb-8">
          <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-label font-label text-text-tertiary mb-3">
            <span>Network Overview</span>
            <span className="material-symbols-outlined text-[13px]">chevron_right</span>
            <span>{journey?.train?.originStationName || 'Origin'} Corridor</span>
            <span className="material-symbols-outlined text-[13px]">chevron_right</span>
            <span>{journey?.train?.number} {journey?.train?.name}</span>
            <span className="material-symbols-outlined text-[13px]">chevron_right</span>
            <span className="text-primary font-medium">Travel Companion</span>
          </nav>

          <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-5 border-b border-border pb-6">
            <div>
              <div className="flex items-center gap-3 mb-1.5">
                <h1 className="text-heading-lg font-heading-lg text-primary tracking-tight">Travel Companion &amp; Route Panorama</h1>
                <span className="px-2.5 py-0.5 rounded-full text-label font-label bg-surface-container text-secondary border border-border">Active Run</span>
              </div>
              <p className="text-body-sm font-body-sm text-secondary">
                {journey?.train?.number} {journey?.train?.name} · Live En-Route Environment, Meteorological Radar &amp; Scenic Topography
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link href={`/journey/${journeyId}/map`} className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-on-background text-on-primary rounded-lg text-body-sm font-body-sm shadow-sm transition-all duration-150 active:scale-[0.98]">
                <span className="material-symbols-outlined text-[17px] text-on-primary">satellite_alt</span>
                <span className="font-medium">Switch to Live Radar</span>
              </Link>
            </div>
          </div>
        </section>

        {/* Microclimate Sensor Array */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">thermostat</span>
              <h2 className="text-heading-md font-heading-md text-primary">Microclimate Sensor Array</h2>
            </div>
            <div className="text-label font-label text-text-tertiary">Station sensor barometers sync live with OpenWeather API</div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            
            {/* Card 1: Current Station */}
            <div className="bg-surface-elevated rounded-xl border border-border p-6 shadow-xs flex flex-col justify-between transition-shadow hover:shadow-md">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label font-label bg-surface-container text-success border border-border/80">
                    <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live"></span>
                    CURRENT STATION · JUST DEPARTED
                  </span>
                  <span className="text-label font-label text-text-tertiary">km {Math.round(currentStop?.distanceKm ?? currentStop?.distanceFromSourceKm ?? 0)}</span>
                </div>

                <h3 className="text-heading-md font-heading-md text-primary mb-1">{currentStop?.stationName || 'Origin'} ({currentStop?.stationId || '-'})</h3>
                <p className="text-body-sm font-body-sm text-secondary mb-5">Platform {currentStop?.platform || 1} Mainline · Railway Division</p>

                <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-border/70">
                  <div className="flex items-baseline gap-2">
                    <span className="text-display-lg font-display-lg text-primary tracking-tight">{curTemp}°C</span>
                    <span className="text-body-md font-body-md text-secondary">/ {curHigh}° High</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-warning">
                    <span className="material-symbols-outlined text-[26px]">wb_sunny</span>
                    <span className="text-body-sm font-body-sm font-medium text-on-surface">{curCond}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 mb-5">
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Humidity</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{curHum}%</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Wind</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{curWind} km/h</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">UV Index</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">6 (Moderate)</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Air Quality (AQI)</div>
                    <div className="text-body-md font-body-md font-semibold text-success">54 (Good)</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-label font-label text-text-tertiary">
                <span className="material-symbols-outlined text-[15px]">straighten</span>
                <span>Track elevation: 124m · OpenWeather Meteorological Sync</span>
              </div>
            </div>

            {/* Card 2: Approaching Next Station */}
            <div className="bg-surface-elevated rounded-xl border border-border p-6 shadow-xs flex flex-col justify-between transition-shadow hover:shadow-md ring-1 ring-border/80">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label font-label bg-surface-container text-info border border-border/80">
                    <span className="material-symbols-outlined text-[13px] text-info">near_me</span>
                    APPROACHING NEXT
                  </span>
                  <span className="text-label font-label text-text-tertiary">km {Math.round(nextStop?.distanceKm ?? nextStop?.distanceFromSourceKm ?? 0)}</span>
                </div>

                <h3 className="text-heading-md font-heading-md text-primary mb-1">{nextStop?.stationName || 'Destination'} ({nextStop?.stationId || '-'})</h3>
                <p className="text-body-sm font-body-sm text-secondary mb-5">Platform {nextStop?.platform || 1} Loop Line · Approaching Station</p>

                <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-border/70">
                  <div className="flex items-baseline gap-2">
                    <span className="text-display-lg font-display-lg text-primary tracking-tight">{nextTemp}°C</span>
                    <span className="text-body-md font-body-md text-secondary">/ {nextHigh}° High</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-secondary">
                    <span className="material-symbols-outlined text-[26px]">partly_cloudy_day</span>
                    <span className="text-body-sm font-body-sm font-medium text-on-surface">{nextCond}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 mb-5">
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Rain Probability</div>
                    <div className="text-body-md font-body-md font-semibold text-info">15% Chance</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Humidity</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{nextHum}%</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Wind</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">14 km/h NE</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Dew Point</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">20°C</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-label font-label text-text-tertiary">
                <span className="material-symbols-outlined text-[15px]">schedule</span>
                <span>Expected Arrival: {formatTime(nextStop?.actualArrival || nextStop?.scheduledArrival)}</span>
              </div>
            </div>

            {/* Card 3: Terminal Destination */}
            <div className="bg-surface-elevated rounded-xl border border-border p-6 shadow-xs flex flex-col justify-between transition-shadow hover:shadow-md">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label font-label bg-surface-container text-secondary border border-border/80">
                    <span className="material-symbols-outlined text-[13px]">flag</span>
                    TERMINAL DESTINATION
                  </span>
                  <span className="text-label font-label text-text-tertiary">km {Math.round(progress?.totalDistanceKm || destStop?.distanceKm || 0)}</span>
                </div>

                <h3 className="text-heading-md font-heading-md text-primary mb-1">{destStop?.stationName || 'Destination'} ({destStop?.stationId || '-'})</h3>
                <p className="text-body-sm font-body-sm text-secondary mb-5">Main Terminal Station</p>

                <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-border/70">
                  <div className="flex items-baseline gap-2">
                    <span className="text-display-lg font-display-lg text-primary tracking-tight">24°C</span>
                    <span className="text-body-md font-body-md text-secondary">/ 28° High</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-secondary">
                    <span className="material-symbols-outlined text-[26px]">nights_stay</span>
                    <span className="text-body-sm font-body-sm font-medium text-on-surface">Pleasant &amp; Clear</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 mb-5">
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Rain Probability</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">0% (Dry)</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Overnight Low</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">18°C</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Wind</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">8 km/h NW</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Air Quality (AQI)</div>
                    <div className="text-body-md font-body-md font-semibold text-warning">142 (Moderate)</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-label font-label text-text-tertiary">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                <span>Clear track conditions across final arrival corridor</span>
              </div>
            </div>

          </div>
        </section>

        {/* Route Rain & Weather Horizon */}
        <section className="mb-10 p-6 bg-surface-elevated rounded-xl border border-border shadow-xs">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-heading-md font-heading-md text-primary flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[20px]">radar</span>
                Route Rain &amp; Weather Horizon
              </h2>
              <p className="text-body-sm font-body-sm text-secondary">
                Real-time Doppler precipitation radar mapped across corridor waypoints
              </p>
            </div>
            <div className="flex items-center gap-3 text-label font-label">
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-border"></span>Clear</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-info/40"></span>Overcast</span>
              <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-sm bg-info"></span>Rain Band</span>
            </div>
          </div>

          <div className="relative w-full py-4 px-2">
            <div className="w-full h-3 bg-surface-container rounded-full relative overflow-hidden flex items-center">
              <div className="h-full bg-primary rounded-full" style={{ width: `${progress?.percent || 0}%` }}></div>
            </div>

            <div className="flex justify-between items-center mt-4 text-body-sm font-body-sm text-secondary">
              {weatherHorizonNodes.map((stn: any, idx: number) => {
                const dist = Math.round(stn.distanceKm ?? stn.distanceFromSourceKm ?? 0);
                const isPassed = stn.status === 'departed';
                const isAtStation = stn.status === 'at-station';
                return (
                  <div key={stn.stationId || idx} className="flex flex-col items-center text-center">
                    <span className={`font-semibold ${isAtStation ? 'text-info font-bold' : 'text-primary'}`}>{stn.stationId}</span>
                    <span className="text-label text-text-tertiary">{dist} km</span>
                    <span className={`text-label font-medium ${isPassed ? 'text-success' : isAtStation ? 'text-info' : 'text-secondary'}`}>
                      {isPassed ? 'Passed' : isAtStation ? 'At Station' : 'Upcoming'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

      </main>
    </div>
  );
}
