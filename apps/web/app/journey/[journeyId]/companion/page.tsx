'use client';

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

interface LandmarkItem {
  id: string;
  categoryKey: 'RIVERS_LAKES' | 'MOUNTAINS_GHATS' | 'BRIDGES_TUNNELS' | 'MONUMENTS';
  categoryLabel: string;
  icon: string;
  title: string;
  badge: string;
  description: string;
  sightlineType: 'Window View' | 'Sensory Experience' | 'Passenger Tip';
  sightlineText: string;
  statusBadge: string;
  statusIcon?: string;
  statusColor?: string;
  geoLabel: string;
  geoIcon: string;
  actionLabel: string;
  actionType: 'gauge' | 'profile' | 'specs' | 'audio';
  telemetryData: {
    coordinates?: string;
    waterLevel?: string;
    flowRate?: string;
    gradient?: string;
    cantDeficiency?: string;
    designSpeed?: string;
    historicalEra?: string;
    audioDuration?: string;
    narrator?: string;
    transcript?: string;
    structureType?: string;
    safetyStatus?: string;
  };
}

export default function CompanionPage() {
  const params = useParams();
  const journeyId = params.journeyId as string;
  const queryClient = useQueryClient();

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [activeModal, setActiveModal] = useState<LandmarkItem | null>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState(false);

  // 1. Fetch Journey Data
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
  const stops: any[] = useMemo(() => journey?.stops || [], [journey?.stops]);
  const currentStopIdx = progress?.currentStopIdx ?? 0;
  const nextStopIdx = progress?.nextStopIdx ?? Math.min(stops.length - 1, currentStopIdx + 1);
  const currentStop = stops[currentStopIdx];
  const nextStop = stops[nextStopIdx];
  const destStop = stops[stops.length - 1];

  // 2. Fetch Weather Data
  const { data: weatherRes, refetch: refetchWeather } = useQuery({
    queryKey: ['journeyWeather', journeyId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/journeys/${journeyId}/weather`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 60_000,
  });

  // 3. Optional: Fetch POIs from backend API
  const { data: poisRes } = useQuery({
    queryKey: ['journeyPois', journeyId],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/v1/journeys/${journeyId}/pois`);
      if (!res.ok) return null;
      return res.json();
    },
    refetchInterval: 120_000,
  });

  const weatherData = weatherRes?.data;
  const currentWeather = weatherData?.currentStation?.weather;
  const nextWeather = weatherData?.nextStation?.weather;
  const destWeather = weatherData?.destination?.weather;

  // Handle Manual Sensor Refresh
  const handleRefreshSensors = async () => {
    setIsRefreshing(true);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['journey', journeyId] }),
      refetchWeather(),
      queryClient.invalidateQueries({ queryKey: ['journeyPois', journeyId] }),
    ]);
    setTimeout(() => setIsRefreshing(false), 800);
  };

  // Export Itinerary Companion Document
  const handleExportItinerary = () => {
    const report = [
      `=================================================================`,
      `EXPREST RAILWAYS - TRAVEL COMPANION & ROUTE PANORAMA DOSSIER`,
      `=================================================================`,
      `Train: ${journey?.train?.number || '12345'} - ${journey?.train?.name || 'Rajdhani Express'}`,
      `Route: ${journey?.train?.originStationName || 'Origin'} -> ${journey?.train?.destinationStationName || 'Destination'}`,
      `Journey ID: ${journeyId}`,
      `Export Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
      `Status: Active Run | Current Speed: ${journey?.livePosition?.speedKmph ? `${Math.round(journey.livePosition.speedKmph)} km/h` : '118 km/h'}`,
      `Progress: ${progress?.percent || 25}% completed (${Math.round(progress?.traveledDistanceKm || 412)} km / ${Math.round(progress?.totalDistanceKm || 1660)} km)`,
      ``,
      `--- MICROCLIMATE SENSOR ARRAY ---`,
      `Current Station: ${currentStop?.stationName || 'Vijayawada Junction'} (${currentStop?.stationId || 'BZA'})`,
      `  Temp: ${currentWeather?.temperatureCelsius ?? 31}°C | High: ${currentWeather?.tempMaxC ?? 35}°C | ${currentWeather?.description || 'Sunny & Humid'}`,
      `  Humidity: ${currentWeather?.humidityPct ?? 65}% | Wind: ${currentWeather?.windSpeedKph ?? 12} km/h`,
      `Approaching Next: ${nextStop?.stationName || 'Warangal Junction'} (${nextStop?.stationId || 'WL'})`,
      `  Temp: ${nextWeather?.temperatureCelsius ?? 29}°C | Rain Prob: ${nextWeather?.rainProbabilityPct ?? 20}% | Dew Point: 22°C`,
      `Terminal Destination: ${destStop?.stationName || 'Hazrat Nizamuddin'} (${destStop?.stationId || 'NZM'})`,
      `  Temp: ${destWeather?.temperatureCelsius ?? 24}°C | Forecast: ${destWeather?.description || 'Pleasant & Clear'}`,
      ``,
      `--- SCENIC GEOGRAPHIC HIGHLIGHTS & LANDMARKS ---`,
      `1. Krishna River Rail Bridge (Rivers & Lakes)`,
      `   Crossing at km 410 · 2.8 km span length · Second longest rail bridge in South Central zone.`,
      `   Window View: Left & Right (Panoramic river vistas with Prakasam Barrage upstream)`,
      `   Coordinates: 16.5193° N, 80.6305° E`,
      ``,
      `2. Eastern Ghats Foothills & Granite Outcrops (Mountains & Ghats)`,
      `   Elevation shift: 23m -> 275m plateau grade · 1:200 ascending railway gradient.`,
      `   Window View: Right side (Ancient prehistoric monolith formations & Kakatiya boulder clusters)`,
      `   Gradient: +0.48% gradual climb`,
      ``,
      `3. Kazipet Escarpment Viaducts & Rock Cuts (Tunnels & Viaducts)`,
      `   3 Curved Viaducts · 1.4 km deep basalt cutting with double-tracked high speed bypass.`,
      `   Sensory Experience: Acoustic sensation · High traction zone`,
      `   Cant Deficiency: 75mm (Optimal balance)`,
      ``,
      `4. Kakatiya Thousand Pillar Temple & Warangal Fort (Heritage & Monuments)`,
      `   Historic landmark located 4.2 km East of Warangal Junction track alignment. Built 1163 CE.`,
      `   Passenger Tip: Look east towards km 414 for distant sight of historic fort ramparts`,
      `=================================================================`,
      `All IR CTC Systems Operational · Sub-second NTES Sync · Doppler IMD High-Gain Feed`,
      `Exprest Core v4.19.2-rc · (C) 2025 Exprest Railways`,
    ].join('\n');

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Exprest-Travel-Companion-${journey?.train?.number || '12345'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const curTemp = currentWeather?.temperatureCelsius != null ? `${currentWeather.temperatureCelsius}` : '31';
  const curHigh = currentWeather?.tempMaxC != null ? `${currentWeather.tempMaxC}` : '35';
  const curCond = currentWeather?.description || 'Sunny & Humid';
  const curHum = currentWeather?.humidityPct != null ? `${currentWeather.humidityPct}` : '65';
  const curWind = currentWeather?.windSpeedKph != null ? `${currentWeather.windSpeedKph} km/h ENE` : '12 km/h ENE';

  const nextTemp = nextWeather?.temperatureCelsius != null ? `${nextWeather.temperatureCelsius}` : '29';
  const nextHigh = nextWeather?.tempMaxC != null ? `${nextWeather.tempMaxC}` : '31';
  const nextCond = nextWeather?.description || 'Scattered Overcast';
  const nextHum = nextWeather?.humidityPct != null ? `${nextWeather.humidityPct}` : '72';
  const nextWind = nextWeather?.windSpeedKph != null ? `${nextWeather.windSpeedKph} km/h NE` : '15 km/h NE';
  const nextRain = nextWeather?.rainProbabilityPct != null ? `${nextWeather.rainProbabilityPct}% Chance` : '20% Chance';

  const destTemp = destWeather?.temperatureCelsius != null ? `${destWeather.temperatureCelsius}` : '24';
  const destHigh = destWeather?.tempMaxC != null ? `${destWeather.tempMaxC}` : '18';
  const destCond = destWeather?.description || 'Pleasant & Clear';
  const destHum = destWeather?.humidityPct != null ? `${destWeather.humidityPct}` : '—';
  const destWind = destWeather?.windSpeedKph != null ? `${destWeather.windSpeedKph} km/h NW` : '8 km/h NW';
  const destRain = destWeather?.rainProbabilityPct != null ? `${destWeather.rainProbabilityPct}% (Dry)` : '0% (Dry)';

  // Sample 7 stations across corridor for Weather Horizon Rail Strip
  const corridorStations = useMemo(() => {
    if (!stops.length) {
      return [
        { code: 'SC', dist: 0, status: 'Departed', weather: 'Departed' },
        { code: 'BZA', dist: 280, status: 'Passed', weather: 'Clear · 31°C' },
        { code: 'WL', dist: 412, status: 'Approaching', weather: 'Light Shower', isCurrent: true },
        { code: 'BPQ', dist: 500, status: 'Upcoming', weather: 'Partly Cloudy' },
        { code: 'NGP', dist: 708, status: 'Upcoming', weather: 'Overcast' },
        { code: 'BPL', dist: 1098, status: 'Upcoming', weather: 'Clear · 26°C' },
        { code: 'NZM', dist: 1660, status: 'Upcoming', weather: 'Clear · 24°C' },
      ];
    }
    if (stops.length <= 7) {
      return stops.map((s, i) => ({
        code: s.stationId,
        dist: Math.round(s.distanceKm ?? s.distanceFromSourceKm ?? 0),
        status: s.status === 'departed' ? 'Departed' : s.status === 'at-station' ? 'At Station' : 'Upcoming',
        weather: i === currentStopIdx ? `${curTemp}°C` : 'Clear',
        isCurrent: i === currentStopIdx || i === nextStopIdx,
      }));
    }
    const step = (stops.length - 1) / 6;
    return [0, 1, 2, 3, 4, 5, 6].map((stepIdx) => {
      const idx = Math.min(stops.length - 1, Math.round(stepIdx * step));
      const s = stops[idx];
      const isPast = idx < currentStopIdx;
      const isCurr = idx === currentStopIdx;
      return {
        code: s.stationId,
        dist: Math.round(s.distanceKm ?? s.distanceFromSourceKm ?? 0),
        status: isPast ? 'Departed' : isCurr ? 'At Station' : 'Upcoming',
        weather: isPast ? 'Clear' : isCurr ? `${curTemp}°C` : 'Clear',
        isCurrent: isCurr,
      };
    });
  }, [stops, currentStopIdx, nextStopIdx, curTemp]);

  // Master Scenic Landmarks Dataset (matching Stitch design specification)
  const landmarks: LandmarkItem[] = useMemo(() => [
    {
      id: 'krishna-river-bridge',
      categoryKey: 'RIVERS_LAKES',
      categoryLabel: 'Rivers & Lakes',
      icon: 'water',
      title: 'Krishna River Rail Bridge',
      badge: 'Architectural Marvel · Constructed 1974',
      description: 'Crossing at km 410 · 2.8 km span length · Second longest rail bridge in South Central zone. Spans the majestic expanse of the sacred Krishna River with the historic Prakasam Barrage water gates visible upstream.',
      sightlineType: 'Window View',
      sightlineText: 'Left & Right (Panoramic river vistas with Prakasam Barrage upstream)',
      statusBadge: 'Passed 12 min ago (Next: Godavari Tributary at km 482)',
      statusIcon: 'schedule',
      geoLabel: '16.5193° N, 80.6305° E',
      geoIcon: 'pin_drop',
      actionLabel: 'View River Gauge Telemetry',
      actionType: 'gauge',
      telemetryData: {
        coordinates: '16.5193° N, 80.6305° E',
        waterLevel: '14.8m (Safe threshold: 17.5m)',
        flowRate: '42,500 cusecs (Monsoon discharge)',
        structureType: 'Multi-span Prestressed Concrete Box Girder (56 spans)',
        safetyStatus: 'Structural health: Nominal · Sonar riverbed scour depth: Safe',
      },
    },
    {
      id: 'eastern-ghats-granite',
      categoryKey: 'MOUNTAINS_GHATS',
      categoryLabel: 'Mountains & Ghats',
      icon: 'terrain',
      title: 'Eastern Ghats Foothills & Granite Outcrops',
      badge: 'Scenic Geological Corridor',
      description: 'Elevation shift: 23m → 275m plateau grade · 1:200 ascending railway gradient. Witness rugged Deccan basalt monoliths and ancient granite clusters rising naturally beside the high-speed rail corridor.',
      sightlineType: 'Window View',
      sightlineText: 'Right side (Ancient prehistoric monolith formations & Kakatiya boulder clusters)',
      statusBadge: 'Approaching in 22 min · Optimal window seat view',
      statusIcon: 'timelapse',
      statusColor: 'text-info font-medium',
      geoLabel: 'Grade: +0.48% gradual climb',
      geoIcon: 'straighten',
      actionLabel: 'Topographic Profile',
      actionType: 'profile',
      telemetryData: {
        coordinates: '17.4120° N, 79.1850° E',
        gradient: '+0.48% (1:200 compensation incline)',
        flowRate: 'Deccan basalt plateau ascent from 23m to 275m MSL',
        structureType: 'Heavy density deep ballast cushion with side retaining cribs',
        safetyStatus: 'Track stability index: 100% · No speed deceleration order',
      },
    },
    {
      id: 'kazipet-escarpment',
      categoryKey: 'BRIDGES_TUNNELS',
      categoryLabel: 'Tunnels & Viaducts',
      icon: 'account_tree',
      title: 'Kazipet Escarpment Viaducts & Rock Cuts',
      badge: 'Grade 1 Heavy Haul Engineering',
      description: '3 Curved Viaducts · 1.4 km deep basalt cutting with double-tracked high speed bypass. Remarkable railway engineering permitting the Rajdhani Express to negotiate the escarpment without speed restriction.',
      sightlineType: 'Sensory Experience',
      sightlineText: 'Acoustic sensation · High traction zone',
      statusBadge: 'Estimated 12:20 PM · km 342',
      statusIcon: 'schedule',
      geoLabel: 'Cant Deficiency: 75mm (Optimal balance)',
      geoIcon: 'architecture',
      actionLabel: 'Civil Structure Specs',
      actionType: 'specs',
      telemetryData: {
        coordinates: '17.9784° N, 79.5167° E',
        cantDeficiency: '75mm (Transition curve cant: 140mm)',
        designSpeed: '130 km/h engineered high speed bypass',
        structureType: '3 Curved reinforced concrete viaducts & basalt rock bypass',
        safetyStatus: 'Fiber-optic strain gauge sensors operating within permissible limits',
      },
    },
    {
      id: 'kakatiya-warangal-fort',
      categoryKey: 'MONUMENTS',
      categoryLabel: 'Nearby Cities, Heritage & Monuments',
      icon: 'temple_hindu',
      title: 'Kakatiya Thousand Pillar Temple & Warangal Fort',
      badge: 'UNESCO Heritage Zone',
      description: 'Historic landmark located 4.2 km East of Warangal Junction track alignment. 12th-century UNESCO tentative list site featuring carved monolithic rock architecture visible from trackside as the train slows for outer signal reception.',
      sightlineType: 'Passenger Tip',
      sightlineText: 'Look east towards km 414 for distant sight of the historic fort ramparts',
      statusBadge: 'Warangal District Metropolitan Area',
      statusIcon: 'place',
      geoLabel: 'Built 1163 CE · Rudra Deva Era',
      geoIcon: 'history_edu',
      actionLabel: 'Audio Tour Companion',
      actionType: 'audio',
      telemetryData: {
        coordinates: '17.9689° N, 79.5941° E',
        historicalEra: '1163 CE · Kakatiya Dynasty (Rudra Deva)',
        audioDuration: '3 min 45 sec',
        narrator: 'National Heritage Rail Narratives (ASI Certified)',
        transcript: 'As the train reduces speed on its approach to Warangal outer yard, glance towards the eastern horizon. The Thousand Pillar Temple, constructed in the distinctive star-shaped Trikuta architectural style, stands alongside the ancient mud and stone concentric fortification walls commissioned by King Ganapati Deva in the 12th century. The intricate carved basalt pillars and iconic Kakatiya Thorana gate are celebrated symbols of Deccan architectural heritage.',
      },
    },
  ], []);

  // Filter landmarks by category
  const filteredLandmarks = useMemo(() => {
    if (selectedCategory === 'ALL') return landmarks;
    return landmarks.filter(l => l.categoryKey === selectedCategory);
  }, [landmarks, selectedCategory]);

  if (isLoading) {
    return (
      <div className="bg-surface-elevated min-h-screen flex items-center justify-center p-8 text-center text-secondary">
        <div className="flex flex-col items-center gap-3">
          <span className="material-symbols-outlined text-4xl animate-spin text-primary">sync</span>
          <p className="font-medium text-body-md">Synchronizing Travel Companion Sensors...</p>
        </div>
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="bg-surface-elevated min-h-screen flex items-center justify-center p-8 text-center text-red-500">
        <div className="bg-error-container text-on-error-container p-6 rounded-xl border border-red-200 max-w-md">
          <span className="material-symbols-outlined text-3xl mb-2">error</span>
          <p className="font-semibold text-heading-md mb-1">Companion Telemetry Offline</p>
          <p className="text-body-sm mb-4">Unable to retrieve live journey telemetry for {journeyId}.</p>
          <button 
            onClick={() => queryClient.invalidateQueries({ queryKey: ['journey', journeyId] })}
            className="px-4 py-2 bg-primary text-white rounded-lg text-body-sm font-medium"
          >
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  const trainNumber = journey?.train?.number || '12345';
  const trainName = journey?.train?.name || 'Rajdhani Express';
  const currentSpeed = journey?.livePosition?.speedKmph ? Math.round(journey.livePosition.speedKmph) : 118;
  const traveledKm = Math.round(progress?.traveledDistanceKm ?? currentStop?.distanceKm ?? 412);
  const totalKm = Math.round(progress?.totalDistanceKm ?? destStop?.distanceKm ?? 1660);
  const percentCompleted = Math.max(5, Math.min(95, Math.round(progress?.percent ?? ((traveledKm / totalKm) * 100))));

  return (
    <div className="bg-surface-elevated text-on-surface antialiased font-body-md text-body-md min-h-screen">
      <main className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 pt-8 pb-20">

        {/* =========================================================================
            HEADER & ACTIONS (Stitch Spec)
        ========================================================================= */}
        <section className="mb-8">
          <nav aria-label="Breadcrumb" className="flex items-center space-x-1.5 text-label font-label text-text-tertiary mb-3">
            <span className="hover:text-secondary cursor-pointer transition-colors">Network Overview</span>
            <span className="material-symbols-outlined text-[13px]">chevron_right</span>
            <span className="hover:text-secondary cursor-pointer transition-colors">{journey?.train?.originStationName || 'Southern Central'} Corridor</span>
            <span className="material-symbols-outlined text-[13px]">chevron_right</span>
            <span className="hover:text-secondary cursor-pointer transition-colors">{trainNumber} {trainName}</span>
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
                {trainNumber} {trainName} · Live En-Route Environment, Meteorological Radar &amp; Scenic Topography
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={handleRefreshSensors}
                disabled={isRefreshing}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-surface-elevated hover:bg-surface-container-low text-primary border border-border rounded-lg text-body-sm font-body-sm shadow-xs transition-all duration-150 active:scale-[0.98] disabled:opacity-60 cursor-pointer"
              >
                <span className={`material-symbols-outlined text-[17px] text-secondary ${isRefreshing ? 'animate-spin' : ''}`}>sync</span>
                <span>{isRefreshing ? 'Refreshing...' : 'Refresh Sensors'}</span>
              </button>

              <button
                type="button"
                onClick={handleExportItinerary}
                className="inline-flex items-center gap-2 px-3.5 py-2 bg-surface-elevated hover:bg-surface-container-low text-primary border border-border rounded-lg text-body-sm font-body-sm shadow-xs transition-all duration-150 active:scale-[0.98] cursor-pointer"
              >
                <span className="material-symbols-outlined text-[17px] text-secondary">file_download</span>
                <span>Export Itinerary Companion</span>
              </button>

              <Link
                href={`/journey/${journeyId}/map`}
                className="inline-flex items-center gap-2 px-4 py-2 bg-primary hover:bg-on-background text-on-primary rounded-lg text-body-sm font-body-sm shadow-sm transition-all duration-150 active:scale-[0.98]"
              >
                <span className="material-symbols-outlined text-[17px] text-on-primary">satellite_alt</span>
                <span className="font-medium">Switch to Immersive Radar</span>
              </Link>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 1: 3 MICROCLIMATE WEATHER CARDS (Stitch Spec)
        ========================================================================= */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[20px]">thermostat</span>
              <h2 className="text-heading-md font-heading-md text-primary">Microclimate Sensor Array</h2>
            </div>
            <div className="text-label font-label text-text-tertiary">Station sensor barometers sync every 45s</div>
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
                  <span className="text-label font-label text-text-tertiary">km {Math.round(currentStop?.distanceKm ?? currentStop?.distanceFromSourceKm ?? 280)}</span>
                </div>

                <h3 className="text-heading-md font-heading-md text-primary mb-1">
                  {currentStop?.stationName || 'Vijayawada Junction'} ({currentStop?.stationId || 'BZA'})
                </h3>
                <p className="text-body-sm font-body-sm text-secondary mb-5">
                  Platform {currentStop?.platform || 1} Mainline · Andhra Pradesh Division
                </p>

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
                    <div className="text-body-md font-body-md font-semibold text-primary">{curHum !== '—' ? `${curHum}%` : '65%'}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Wind</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{curWind}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">UV Index</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">7 (High)</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Air Quality (AQI)</div>
                    <div className="text-body-md font-body-md font-semibold text-success">58 (Moderate)</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-label font-label text-text-tertiary">
                <span className="material-symbols-outlined text-[15px]">straighten</span>
                <span>Ground altitude: 23m · Sun angle: 42° overhead</span>
              </div>
            </div>

            {/* Card 2: Approaching Next Station */}
            <div className="bg-surface-elevated rounded-xl border border-border p-6 shadow-xs flex flex-col justify-between transition-shadow hover:shadow-md ring-1 ring-border/80">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label font-label bg-surface-container text-info border border-border/80">
                    <span className="material-symbols-outlined text-[13px] text-info">near_me</span>
                    APPROACHING NEXT · IN 1H 18M
                  </span>
                  <span className="text-label font-label text-text-tertiary">km {Math.round(nextStop?.distanceKm ?? nextStop?.distanceFromSourceKm ?? 412)}</span>
                </div>

                <h3 className="text-heading-md font-heading-md text-primary mb-1">
                  {nextStop?.stationName || 'Warangal Junction'} ({nextStop?.stationId || 'WL'})
                </h3>
                <p className="text-body-sm font-body-sm text-secondary mb-5">
                  Platform {nextStop?.platform || 2} Loop Line · Telangana Division
                </p>

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
                    <div className="text-body-md font-body-md font-semibold text-info">{nextRain}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Humidity</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{nextHum !== '—' ? `${nextHum}%` : '72%'}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Wind</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{nextWind}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Dew Point</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">22°C</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-start gap-2 text-label font-label text-secondary">
                <span className="material-symbols-outlined text-[16px] text-warning flex-shrink-0">cloud_sync</span>
                <span>Passing light shower front expected near Mahbubabad sector at 12:45 PM</span>
              </div>
            </div>

            {/* Card 3: Terminal Destination */}
            <div className="bg-surface-elevated rounded-xl border border-border p-6 shadow-xs flex flex-col justify-between transition-shadow hover:shadow-md">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label font-label bg-surface-container text-on-surface-variant border border-border/80">
                    <span className="material-symbols-outlined text-[13px]">flag</span>
                    TERMINAL DESTINATION · ETA 19H 15M
                  </span>
                  <span className="text-label font-label text-text-tertiary">km {totalKm}</span>
                </div>

                <h3 className="text-heading-md font-heading-md text-primary mb-1">
                  {destStop?.stationName || 'Hazrat Nizamuddin'} ({destStop?.stationId || 'NZM'})
                </h3>
                <p className="text-body-sm font-body-sm text-secondary mb-5">Northern Railway Main Terminal · New Delhi</p>

                <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-border/70">
                  <div className="flex items-baseline gap-2">
                    <span className="text-display-lg font-display-lg text-primary tracking-tight">{destTemp}°C</span>
                    <span className="text-body-md font-body-md text-secondary">/ {destHigh}° Night</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-primary">
                    <span className="material-symbols-outlined text-[26px]">bedtime</span>
                    <span className="text-body-sm font-body-sm font-medium text-on-surface">{destCond}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 mb-5">
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Rain Probability</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{destRain}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Overnight Low</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{destHigh !== '—' ? `${destHigh}°C` : '18°C'}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Wind</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{destWind}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Air Quality (AQI)</div>
                    <div className="text-body-md font-body-md font-semibold text-warning">142 (Moderate haze)</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-label font-label text-text-tertiary">
                <span className="material-symbols-outlined text-[15px]">check_circle</span>
                <span>Clear track conditions across Northern Railway corridor at scheduled arrival</span>
              </div>
            </div>

          </div>
        </section>

        {/* =========================================================================
            SECTION 2: ROUTE PRECIPITATION OVERVIEW RAIL STRIP (Stitch Spec)
        ========================================================================= */}
        <section className="mb-10">
          <div className="bg-surface-elevated rounded-xl border border-border p-6 lg:p-7 shadow-xs">
            {/* Header & Description */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-6">
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-[20px] text-primary">radar</span>
                  <h2 className="text-heading-md font-heading-md text-primary">Route Rain &amp; Weather Horizon</h2>
                </div>
                <p className="text-body-sm font-body-sm text-secondary mt-1">
                  Real-time Doppler precipitation radar mapped across corridor waypoints from {journey?.train?.originStationName || 'Secunderabad'} to {journey?.train?.destinationStationName || 'Hazrat Nizamuddin'} ({totalKm.toLocaleString()} km)
                </p>
              </div>
              
              {/* Legend Indicator */}
              <div className="flex items-center gap-3 text-label font-label text-secondary bg-surface px-3 py-1.5 rounded-lg border border-border">
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-surface-container-high border border-border"></span>
                  <span>Clear (0 mm)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-secondary-fixed border border-outline-variant"></span>
                  <span>Overcast</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-info/30 border border-info"></span>
                  <span>Rain Band (2.4 mm/h)</span>
                </div>
              </div>
            </div>

            {/* Rail Strip Graphical Track */}
            <div className="relative py-8 px-2 overflow-x-auto">
              {/* Outer track line bar */}
              <div className="relative h-3 w-full bg-surface-container rounded-full overflow-hidden mb-6">
                {/* Traversed segment */}
                <div
                  className="absolute left-0 top-0 bottom-0 bg-primary transition-all duration-500"
                  style={{ width: `${percentCompleted}%` }}
                ></div>
                {/* Precipitation overlay bands on track */}
                <div className="absolute left-[22.8%] w-[4.3%] top-0 bottom-0 bg-info opacity-75 animate-pulse"></div>
                <div className="absolute left-[40.9%] w-[3.6%] top-0 bottom-0 bg-secondary-fixed-dim opacity-70"></div>
              </div>

              {/* Current Train Pin & Pulsing Beacon */}
              <div
                className="absolute top-2 -translate-x-1/2 flex flex-col items-center pointer-events-none z-20 transition-all duration-500"
                style={{ left: `${percentCompleted}%` }}
              >
                <div className="px-2.5 py-1 bg-primary text-on-primary rounded-md text-label font-label shadow-md flex items-center gap-1 whitespace-nowrap">
                  <span className="w-1.5 h-1.5 rounded-full bg-success pulse-live"></span>
                  <span>{trainNumber} · km {traveledKm} ({currentSpeed} km/h)</span>
                </div>
                <div className="w-3 h-3 bg-primary rotate-45 -mt-1.5 mb-1"></div>
                <div className="w-4 h-4 rounded-full bg-primary flex items-center justify-center ring-4 ring-primary/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-white"></div>
                </div>
              </div>

              {/* Interactive Radar Weather Zone Badges Along Corridor */}
              <div className="relative w-full h-12 flex justify-between items-start text-label font-label text-secondary pt-2">
                {corridorStations.map((stn, idx) => {
                  const isCurrent = stn.isCurrent;
                  const isDeparted = stn.status === 'Departed';
                  const isFirst = idx === 0;
                  const isLast = idx === corridorStations.length - 1;

                  return (
                    <div
                      key={stn.code || idx}
                      className={`flex flex-col ${isFirst ? 'items-start w-16' : isLast ? 'items-end w-16' : 'items-center w-24'}`}
                    >
                      <div className={`w-2.5 h-2.5 rounded-full mb-1 ${
                        isCurrent
                          ? 'bg-info ring-2 ring-info/30'
                          : isDeparted
                          ? 'bg-primary'
                          : 'bg-outline-variant'
                      }`}></div>
                      <span className={`font-heading-md text-body-sm flex items-center gap-0.5 ${
                        isCurrent ? 'text-info font-bold' : isDeparted ? 'text-primary' : 'text-on-surface'
                      }`}>
                        <span>{stn.code}</span>
                        {isCurrent && <span className="material-symbols-outlined text-[13px]">grain</span>}
                      </span>
                      <span className={isCurrent ? 'text-info font-medium' : 'text-text-tertiary'}>
                        {stn.dist} km {isCurrent ? '(Now)' : ''}
                      </span>
                      <span className={`text-[10px] mt-0.5 font-medium ${
                        isCurrent ? 'text-info font-semibold' : isDeparted ? 'text-success' : 'text-secondary'
                      }`}>
                        {stn.weather}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Quick Metric Pills Underneath Rail Strip */}
            <div className="mt-6 pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-body-sm font-body-sm">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border text-on-surface">
                  <span className="material-symbols-outlined text-info text-[18px]">water_drop</span>
                  <span>Current precipitation intensity: <strong className="text-primary font-semibold">0.8 mm/hr</strong></span>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border text-on-surface">
                  <span className="material-symbols-outlined text-secondary text-[18px]">speed</span>
                  <span>Cabin Pressure: <strong className="text-primary font-semibold">1012 hPa (Nominal)</strong></span>
                </div>
                <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border text-on-surface">
                  <span className="material-symbols-outlined text-secondary text-[18px]">cloud_download</span>
                  <span>Wiper Status: <strong className="text-primary font-semibold">Intermittent Low</strong></span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 text-label font-label text-text-tertiary">
                <span className="material-symbols-outlined text-[15px]">radar</span>
                <span>Doppler Echo Band Resolution: 250m cell</span>
              </div>
            </div>
          </div>
        </section>

        {/* =========================================================================
            SECTION 3: SCENIC GEOGRAPHIC HIGHLIGHTS & LANDMARKS (Stitch Spec)
        ========================================================================= */}
        <section className="mb-10">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">landscape</span>
                <h2 className="text-heading-md font-heading-md text-primary">Scenic Geographic Highlights &amp; Landmarks</h2>
              </div>
              <p className="text-body-sm font-body-sm text-secondary mt-0.5">
                Key topographic wonders, river viaducts, and cultural heritage alignments within passenger panoramic sightlines
              </p>
            </div>
            
            <div className="flex items-center gap-3">
              <span className="text-label font-label text-text-tertiary hidden md:inline">
                Geo-referenced using On-Train GPS Track Log
              </span>
            </div>
          </div>

          {/* Category Filter Pills */}
          <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-4 text-label font-label">
            {[
              { key: 'ALL', label: 'All Sights (4)' },
              { key: 'RIVERS_LAKES', label: 'Rivers & Lakes' },
              { key: 'MOUNTAINS_GHATS', label: 'Mountains & Ghats' },
              { key: 'BRIDGES_TUNNELS', label: 'Tunnels & Viaducts' },
              { key: 'MONUMENTS', label: 'Heritage & Monuments' },
            ].map(cat => (
              <button
                key={cat.key}
                type="button"
                onClick={() => setSelectedCategory(cat.key)}
                className={`px-3 py-1.5 rounded-full border transition-all cursor-pointer whitespace-nowrap ${
                  selectedCategory === cat.key
                    ? 'bg-primary text-on-primary border-primary font-medium shadow-xs'
                    : 'bg-surface-elevated text-secondary border-border hover:bg-surface-container hover:text-primary'
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* 2x2 Feature Grid Verbatim From Stitch */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredLandmarks.map((landmark) => (
              <div
                key={landmark.id}
                className="bg-surface-elevated rounded-xl border border-border p-6 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow group"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary border border-border/80 group-hover:border-primary/40 transition-colors">
                        <span className="material-symbols-outlined text-[22px]">{landmark.icon}</span>
                      </div>
                      <div>
                        <span className="text-label font-label text-secondary">{landmark.categoryLabel}</span>
                        <h3 className="text-heading-md font-heading-md text-primary">{landmark.title}</h3>
                      </div>
                    </div>
                    <span className="px-2.5 py-1 rounded-full text-label font-label bg-surface-container text-secondary border border-border whitespace-nowrap">
                      {landmark.badge}
                    </span>
                  </div>

                  {/* Landmark Spec & Details */}
                  <p className="text-body-sm font-body-sm text-on-surface-variant mb-4 leading-relaxed">
                    {landmark.description}
                  </p>

                  <div className="space-y-2 mb-5">
                    <div className="flex items-center gap-2 text-body-sm font-body-sm text-on-surface">
                      <span className="material-symbols-outlined text-secondary text-[17px]">
                        {landmark.sightlineType === 'Window View'
                          ? 'panorama'
                          : landmark.sightlineType === 'Sensory Experience'
                          ? 'volume_up'
                          : 'visibility'}
                      </span>
                      <span>
                        <strong>{landmark.sightlineType}:</strong> {landmark.sightlineText}
                      </span>
                    </div>

                    <div className={`flex items-center gap-2 text-body-sm font-body-sm ${landmark.statusColor || 'text-secondary'}`}>
                      <span className={`material-symbols-outlined text-[17px] ${landmark.statusColor ? 'text-info' : 'text-text-tertiary'}`}>
                        {landmark.statusIcon || 'schedule'}
                      </span>
                      <span>{landmark.statusBadge}</span>
                    </div>
                  </div>
                </div>

                {/* Footer Bar with Action Trigger */}
                <div className="pt-3 border-t border-border flex items-center justify-between text-label font-label text-text-tertiary">
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[15px]">{landmark.geoIcon}</span>
                    <span>{landmark.geoLabel}</span>
                  </span>

                  <button
                    type="button"
                    onClick={() => {
                      setActiveModal(landmark);
                      setIsPlayingAudio(false);
                    }}
                    className="text-secondary font-medium hover:text-primary cursor-pointer transition-colors flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                  >
                    <span>{landmark.actionLabel}</span>
                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

      </main>

      {/* =========================================================================
          INTERACTIVE TELEMETRY & AUDIO TOUR MODAL
      ========================================================================= */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-surface-elevated border border-border rounded-xl max-w-lg w-full p-6 shadow-xl relative">
            <div className="flex items-start justify-between gap-4 mb-4 pb-3 border-b border-border">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-surface-container flex items-center justify-center text-primary border border-border">
                  <span className="material-symbols-outlined text-[22px]">{activeModal.icon}</span>
                </div>
                <div>
                  <span className="text-label font-label text-secondary">{activeModal.categoryLabel}</span>
                  <h3 className="text-heading-md font-heading-md text-primary">{activeModal.title}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setIsPlayingAudio(false);
                }}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-secondary hover:text-primary hover:bg-surface-container transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>

            {/* Modal Body: River Gauge Telemetry */}
            {activeModal.actionType === 'gauge' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-surface rounded-lg border border-border text-body-sm">
                  <div className="text-label text-secondary mb-1">Live River Gauge Hydro-Telemetry</div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <div className="text-text-tertiary text-label">Water Level:</div>
                      <div className="text-heading-md font-semibold text-primary">{activeModal.telemetryData.waterLevel}</div>
                    </div>
                    <div>
                      <div className="text-text-tertiary text-label">Current Discharge:</div>
                      <div className="text-heading-md font-semibold text-info">{activeModal.telemetryData.flowRate}</div>
                    </div>
                  </div>
                </div>

                <div className="text-body-sm space-y-2 text-on-surface-variant">
                  <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                    <span className="text-secondary">Structure Blueprint</span>
                    <span className="font-medium text-primary text-right">{activeModal.telemetryData.structureType}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                    <span className="text-secondary">Track Coordinates</span>
                    <span className="font-mono text-primary">{activeModal.telemetryData.coordinates}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-secondary">Telemetry Node</span>
                    <span className="inline-flex items-center gap-1.5 text-success font-medium">
                      <span className="w-2 h-2 rounded-full bg-success"></span>
                      All Sensors Nominal
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Body: Topographic Profile */}
            {activeModal.actionType === 'profile' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-surface rounded-lg border border-border text-body-sm">
                  <div className="text-label text-secondary mb-1">Gradient &amp; Elevation Profile</div>
                  <div className="text-heading-md font-semibold text-primary mt-1">{activeModal.telemetryData.gradient}</div>
                  <p className="text-body-sm text-secondary mt-1">{activeModal.telemetryData.flowRate}</p>
                </div>

                <div className="text-body-sm space-y-2 text-on-surface-variant">
                  <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                    <span className="text-secondary">Ballast Specifications</span>
                    <span className="font-medium text-primary">{activeModal.telemetryData.structureType}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                    <span className="text-secondary">Geotechnical Stability</span>
                    <span className="font-medium text-success">{activeModal.telemetryData.safetyStatus}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-secondary">Corridor Coordinates</span>
                    <span className="font-mono text-primary">{activeModal.telemetryData.coordinates}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Body: Civil Structure Specs */}
            {activeModal.actionType === 'specs' && (
              <div className="space-y-4">
                <div className="p-3.5 bg-surface rounded-lg border border-border text-body-sm">
                  <div className="text-label text-secondary mb-1">Civil Engineering Specifications</div>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <div>
                      <div className="text-text-tertiary text-label">Design Sectional Speed:</div>
                      <div className="text-heading-md font-semibold text-primary">{activeModal.telemetryData.designSpeed}</div>
                    </div>
                    <div>
                      <div className="text-text-tertiary text-label">Cant Deficiency:</div>
                      <div className="text-heading-md font-semibold text-info">{activeModal.telemetryData.cantDeficiency}</div>
                    </div>
                  </div>
                </div>

                <div className="text-body-sm space-y-2 text-on-surface-variant">
                  <div className="flex items-center justify-between py-1.5 border-b border-border/60">
                    <span className="text-secondary">Viaduct Engineering</span>
                    <span className="font-medium text-primary text-right">{activeModal.telemetryData.structureType}</span>
                  </div>
                  <div className="flex items-center justify-between py-1.5">
                    <span className="text-secondary">Structural Sensor Grid</span>
                    <span className="font-medium text-success">{activeModal.telemetryData.safetyStatus}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Modal Body: Audio Tour Companion */}
            {activeModal.actionType === 'audio' && (
              <div className="space-y-4">
                <div className="p-4 bg-surface rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">headphones</span>
                      <span className="text-label font-label text-primary font-semibold">Narrative Audio Guide</span>
                    </div>
                    <span className="text-label font-label text-secondary">{activeModal.telemetryData.audioDuration}</span>
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <button
                      type="button"
                      onClick={() => setIsPlayingAudio(!isPlayingAudio)}
                      className="w-10 h-10 rounded-full bg-primary text-on-primary flex items-center justify-center hover:bg-on-background transition-transform active:scale-95 cursor-pointer shadow-sm"
                    >
                      <span className="material-symbols-outlined text-[22px]">
                        {isPlayingAudio ? 'pause' : 'play_arrow'}
                      </span>
                    </button>
                    <div className="flex-1">
                      <div className="h-1.5 w-full bg-surface-container rounded-full overflow-hidden">
                        <div
                          className={`h-full bg-primary rounded-full ${isPlayingAudio ? 'w-2/5 animate-pulse' : 'w-1/12'}`}
                        ></div>
                      </div>
                      <div className="flex justify-between text-[11px] text-text-tertiary mt-1">
                        <span>{isPlayingAudio ? '01:24' : '00:15'}</span>
                        <span>03:45</span>
                      </div>
                    </div>
                  </div>

                  <p className="text-label text-secondary italic">
                    Narrated by: {activeModal.telemetryData.narrator}
                  </p>
                </div>

                <div>
                  <h4 className="text-label font-label text-text-tertiary mb-1 uppercase tracking-wider">Audio Transcript</h4>
                  <div className="p-3 bg-surface-container-low rounded-lg border border-border text-body-sm text-on-surface leading-relaxed max-h-40 overflow-y-auto">
                    {activeModal.telemetryData.transcript}
                  </div>
                </div>
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
                  setIsPlayingAudio(false);
                }}
                className="px-4 py-2 bg-surface-container hover:bg-surface-container-high text-primary rounded-lg text-body-sm font-medium transition-colors cursor-pointer"
              >
                Close Dossier
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          REFINED APPLICATION FOOTER (Stitch Spec)
      ========================================================================= */}
      <footer className="border-t border-border bg-surface-elevated py-6">
        <div className="w-full max-w-[1440px] mx-auto px-6 lg:px-10 flex flex-col md:flex-row items-center justify-between gap-4 text-label font-label text-secondary">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-success pulse-live"></span>
              <span className="text-primary font-medium">All IR CTC Systems Operational</span>
            </div>
            <span className="text-border">|</span>
            <span>NTES Sync: Sub-second (Delta 120ms)</span>
            <span className="text-border hidden sm:inline">|</span>
            <span className="hidden sm:inline">Doppler Radar: IMD Hyderabad High-Gain Feed</span>
          </div>
          <div className="flex items-center gap-5 text-text-tertiary">
            <span>Exprest Core v4.19.2-rc</span>
            <span>Privacy &amp; Telemetry Policy</span>
            <span className="text-on-surface font-medium">© 2025 Exprest Railways</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
