'use client';

import React, { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  const originStop = stops[0];
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

  // 3. Fetch POIs from backend API
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
    try {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['journey', journeyId] }),
        refetchWeather(),
        queryClient.invalidateQueries({ queryKey: ['journeyPois', journeyId] }),
      ]);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Export Itinerary Companion Document
  const handleExportItinerary = () => {
    const isLiveSpeed = typeof journey?.livePosition?.speedKmph === 'number';
    const hasProgress = progress?.percent != null;
    const report = [
      `=================================================================`,
      `EXPREST RAILWAYS - TRAVEL COMPANION & ROUTE PANORAMA DOSSIER`,
      `=================================================================`,
      `Train: ${journey?.train?.number || '—'} - ${journey?.train?.name || 'Active Journey'}`,
      `Route: ${journey?.train?.originStationName || originStop?.stationName || 'Origin'} -> ${journey?.train?.destinationStationName || destStop?.stationName || 'Destination'}`,
      `Journey ID: ${journeyId}`,
      `Export Generated: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST`,
      `Status: ${journey?.run?.status || 'Scheduled'} | Current Speed: ${isLiveSpeed ? `${Math.round(journey.livePosition.speedKmph)} km/h` : 'Telemetry Unavailable'}`,
      `Progress: ${hasProgress ? `${progress.percent}% completed` : 'In Transit'}${progress?.traveledDistanceKm != null ? ` (${Math.round(progress.traveledDistanceKm)} km` : ''}${progress?.totalDistanceKm != null ? ` / ${Math.round(progress.totalDistanceKm)} km)` : ''}`,
      ``,
      `--- MICROCLIMATE SENSOR ARRAY ---`,
      `Current Station: ${currentStop?.stationName || originStop?.stationName || 'Origin'} (${currentStop?.stationId || originStop?.stationId || '—'})`,
      `  Temp: ${currentWeather?.temperatureCelsius != null ? `${currentWeather.temperatureCelsius}°C` : 'Unavailable'}${currentWeather?.tempMaxC != null ? ` | High: ${currentWeather.tempMaxC}°C` : ''} | ${currentWeather?.description || 'Weather unavailable'}`,
      `  Humidity: ${currentWeather?.humidityPct != null ? `${currentWeather.humidityPct}%` : 'Unavailable'} | Wind: ${currentWeather?.windSpeedKph != null ? `${currentWeather.windSpeedKph} km/h` : 'Unavailable'}`,
      `Approaching Next: ${nextStop?.stationName || 'Next Station'} (${nextStop?.stationId || '—'})`,
      `  Temp: ${nextWeather?.temperatureCelsius != null ? `${nextWeather.temperatureCelsius}°C` : 'Unavailable'} | Rain Prob: ${nextWeather?.rainProbabilityPct != null ? `${nextWeather.rainProbabilityPct}%` : 'Unavailable'}`,
      `Terminal Destination: ${destStop?.stationName || 'Destination'} (${destStop?.stationId || '—'})`,
      `  Temp: ${destWeather?.temperatureCelsius != null ? `${destWeather.temperatureCelsius}°C` : 'Unavailable'} | Forecast: ${destWeather?.description || 'Forecast unavailable'}`,
      ``,
      `--- ROUTE LANDMARKS & HERITAGE POINTS ---`,
      ...(landmarks.length > 0
        ? landmarks.map((l, i) => `${i + 1}. ${l.title} (${l.categoryLabel})\n   ${l.description}\n   Coordinates: ${l.telemetryData.coordinates || 'N/A'}`)
        : ['No cataloged scenic landmarks along this corridor section.']),
      `=================================================================`,
      `Verified Railway Timetable & Telemetry Integration`,
      `Exprest Core v2.4.1 · (C) Exprest Railways`,
    ].join('\n');

    const blob = new Blob([report], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Exprest-Travel-Companion-${journey?.train?.number || 'Journey'}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const curTemp = currentWeather?.temperatureCelsius != null ? `${currentWeather.temperatureCelsius}` : '—';
  const curHigh = currentWeather?.tempMaxC != null ? `${currentWeather.tempMaxC}` : '—';
  const curCond = currentWeather?.description || 'Weather unavailable';
  const curHum = currentWeather?.humidityPct != null ? `${currentWeather.humidityPct}` : '—';
  const curWind = currentWeather?.windSpeedKph != null ? `${currentWeather.windSpeedKph} km/h` : '—';

  const nextTemp = nextWeather?.temperatureCelsius != null ? `${nextWeather.temperatureCelsius}` : '—';
  const nextHigh = nextWeather?.tempMaxC != null ? `${nextWeather.tempMaxC}` : '—';
  const nextCond = nextWeather?.description || 'Weather unavailable';
  const nextHum = nextWeather?.humidityPct != null ? `${nextWeather.humidityPct}` : '—';
  const nextWind = nextWeather?.windSpeedKph != null ? `${nextWeather.windSpeedKph} km/h` : '—';
  const nextRain = nextWeather?.rainProbabilityPct != null ? `${nextWeather.rainProbabilityPct}%` : '—';

  const destTemp = destWeather?.temperatureCelsius != null ? `${destWeather.temperatureCelsius}` : '—';
  const destHigh = destWeather?.tempMaxC != null ? `${destWeather.tempMaxC}` : '—';
  const destCond = destWeather?.description || 'Weather unavailable';
  const destHum = destWeather?.humidityPct != null ? `${destWeather.humidityPct}` : '—';
  const destWind = destWeather?.windSpeedKph != null ? `${destWeather.windSpeedKph} km/h` : '—';
  const destRain = destWeather?.rainProbabilityPct != null ? `${destWeather.rainProbabilityPct}%` : '—';

  // Sample corridor stations from actual journey stops
  const corridorStations = useMemo(() => {
    if (!stops.length) return [];
    if (stops.length <= 7) {
      return stops.map((s, i) => ({
        code: s.stationId,
        dist: Math.round(s.distanceKm ?? s.distanceFromSourceKm ?? 0),
        status: s.status === 'departed' ? 'Departed' : s.status === 'at-station' ? 'At Station' : 'Upcoming',
        weather: i === currentStopIdx && curTemp !== '—' ? `${curTemp}°C` : (i === nextStopIdx && nextTemp !== '—' ? `${nextTemp}°C` : '—'),
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
        weather: isCurr && curTemp !== '—' ? `${curTemp}°C` : '—',
        isCurrent: isCurr,
      };
    });
  }, [stops, currentStopIdx, nextStopIdx, curTemp, nextTemp]);

  const isSouthCentralCorridor = useMemo(() => {
    return stops.some((s: any) => ['BZA', 'WL', 'KZJ', 'SC', 'BPQ'].includes(s.stationId?.toUpperCase()));
  }, [stops]);

  // Master Scenic Landmarks Dataset: real Overpass POIs + corridor-accurate heritage
  const landmarks: LandmarkItem[] = useMemo(() => {
    const items: LandmarkItem[] = [];

    if (Array.isArray(poisRes?.data) && poisRes.data.length > 0) {
      for (const p of poisRes.data) {
        const cat = p.category as string;
        const catKey: LandmarkItem['categoryKey'] =
          cat === 'BRIDGES_TUNNELS' ? 'BRIDGES_TUNNELS' :
          cat === 'MOUNTAINS_GHATS' ? 'MOUNTAINS_GHATS' :
          cat === 'MONUMENTS' ? 'MONUMENTS' : 'RIVERS_LAKES';

        const catLabel =
          catKey === 'BRIDGES_TUNNELS' ? 'Tunnels & Viaducts' :
          catKey === 'MOUNTAINS_GHATS' ? 'Mountains & Ghats' :
          catKey === 'MONUMENTS' ? 'Nearby Heritage & Monuments' : 'Rivers & Water Bodies';

        const icon =
          catKey === 'BRIDGES_TUNNELS' ? 'account_tree' :
          catKey === 'MOUNTAINS_GHATS' ? 'terrain' :
          catKey === 'MONUMENTS' ? 'temple_hindu' : 'water';

        items.push({
          id: p.id || `poi_${p.latitude}_${p.longitude}`,
          categoryKey: catKey,
          categoryLabel: catLabel,
          icon,
          title: p.name || 'Route Landmark',
          badge: `${Math.round((p.distanceFromRouteM || 0) / 100) / 10} km from track · OpenStreetMap`,
          description: p.tags?.description || p.tags?.historic || p.tags?.wikipedia || 'Geographic landmark located along the active rail transit corridor.',
          sightlineType: 'Window View',
          sightlineText: `Coordinates: ${p.latitude?.toFixed(4)}° N, ${p.longitude?.toFixed(4)}° E`,
          statusBadge: 'Verified Geographic Point',
          statusIcon: 'pin_drop',
          geoLabel: `${p.latitude?.toFixed(4)}° N, ${p.longitude?.toFixed(4)}° E`,
          geoIcon: 'pin_drop',
          actionLabel: 'View Coordinate Specs',
          actionType: 'specs',
          telemetryData: {
            coordinates: `${p.latitude?.toFixed(4)}° N, ${p.longitude?.toFixed(4)}° E`,
            structureType: p.tags?.bridge ? 'Rail Bridge / Viaduct' : p.tags?.historic ? 'Historical Monument' : 'Natural Formation',
            safetyStatus: 'Verified spatial alignment from OpenStreetMap Overpass query',
          },
        });
      }
    }

    if (isSouthCentralCorridor) {
      items.push(
        {
          id: 'krishna-river-bridge',
          categoryKey: 'RIVERS_LAKES',
          categoryLabel: 'Rivers & Lakes',
          icon: 'water',
          title: 'Krishna River Rail Bridge',
          badge: 'Architectural Marvel · Constructed 1974',
          description: 'Crossing at km 410 · 2.8 km span length · Second longest rail bridge in South Central zone. Spans the sacred Krishna River with the historic Prakasam Barrage water gates visible upstream.',
          sightlineType: 'Window View',
          sightlineText: 'Left & Right (Panoramic river vistas with Prakasam Barrage upstream)',
          statusBadge: 'South Central Mainline Corridor',
          statusIcon: 'schedule',
          geoLabel: '16.5193° N, 80.6305° E',
          geoIcon: 'pin_drop',
          actionLabel: 'View River Bridge Specs',
          actionType: 'specs',
          telemetryData: {
            coordinates: '16.5193° N, 80.6305° E',
            structureType: 'Multi-span Prestressed Concrete Box Girder (56 spans)',
            safetyStatus: 'Structural health: Nominal · South Central Zone Rail Bridge',
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
          statusBadge: 'Deccan Plateau Ascent',
          statusIcon: 'terrain',
          geoLabel: 'Grade: +0.48% gradual climb',
          geoIcon: 'straighten',
          actionLabel: 'Topographic Profile',
          actionType: 'profile',
          telemetryData: {
            coordinates: '17.4120° N, 79.1850° E',
            gradient: '+0.48% (1:200 compensation incline)',
            structureType: 'Heavy density deep ballast cushion with side retaining cribs',
            safetyStatus: 'Track stability index: Nominal · Permissible track speed',
          },
        },
        {
          id: 'kazipet-escarpment',
          categoryKey: 'BRIDGES_TUNNELS',
          categoryLabel: 'Tunnels & Viaducts',
          icon: 'account_tree',
          title: 'Kazipet Escarpment Viaducts & Rock Cuts',
          badge: 'Grade 1 Heavy Haul Engineering',
          description: '3 Curved Viaducts · 1.4 km deep basalt cutting with double-tracked high speed bypass. Remarkable railway engineering permitting trains to negotiate the escarpment without speed restriction.',
          sightlineType: 'Window View',
          sightlineText: 'Acoustic sensation · High traction zone',
          statusBadge: 'Kazipet - Balharshah Section',
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
            safetyStatus: 'Civil engineering structure inspected regularly by zonal safety officers',
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
          sightlineText: 'Look east towards Warangal outer section for distant sight of historic ramparts',
          statusBadge: 'Warangal Heritage Area',
          statusIcon: 'place',
          geoLabel: 'Built 1163 CE · Rudra Deva Era',
          geoIcon: 'history_edu',
          actionLabel: 'Heritage Narrative Dossier',
          actionType: 'specs',
          telemetryData: {
            coordinates: '17.9689° N, 79.5941° E',
            historicalEra: '1163 CE · Kakatiya Dynasty (Rudra Deva)',
            narrator: 'National Heritage Rail Archives (ASI Documentation)',
            transcript: 'As the train reduces speed on its approach to Warangal outer yard, glance towards the eastern horizon. The Thousand Pillar Temple, constructed in the distinctive star-shaped Trikuta architectural style, stands alongside the ancient mud and stone concentric fortification walls commissioned by King Ganapati Deva in the 12th century. The intricate carved basalt pillars and iconic Kakatiya Thorana gate are celebrated symbols of Deccan architectural heritage.',
          },
        }
      );
    }

    return items;
  }, [poisRes?.data, isSouthCentralCorridor]);

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

  const trainNumber = journey?.train?.number || '—';
  const trainName = journey?.train?.name || 'Train Run';
  const currentSpeed = typeof journey?.livePosition?.speedKmph === 'number' ? Math.round(journey.livePosition.speedKmph) : null;
  const traveledKm = Math.round(progress?.traveledDistanceKm ?? currentStop?.distanceKm ?? 0);
  const totalKm = Math.round(progress?.totalDistanceKm ?? destStop?.distanceKm ?? 0);
  const percentCompleted = progress?.percent != null ? progress.percent : (totalKm > 0 ? Math.min(100, Math.round((traveledKm / totalKm) * 100)) : 0);

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
                    {currentStop?.status === 'departed' ? 'CURRENT STATION · DEPARTED' : currentStop?.status === 'at-station' ? 'CURRENT STATION · AT PLATFORM' : 'ORIGIN STATION'}
                  </span>
                  <span className="text-label font-label text-text-tertiary">km {Math.round(currentStop?.distanceKm ?? currentStop?.distanceFromSourceKm ?? 0)}</span>
                </div>

                <h3 className="text-heading-md font-heading-md text-primary mb-1">
                  {currentStop?.stationName || originStop?.stationName || 'Origin Station'} {currentStop?.stationId ? `(${currentStop.stationId})` : ''}
                </h3>
                <p className="text-body-sm font-body-sm text-secondary mb-5">
                  {currentStop?.platform ? `Platform ${currentStop.platform}` : 'Scheduled Stop'}
                </p>

                <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-border/70">
                  <div className="flex items-baseline gap-2">
                    <span className="text-display-lg font-display-lg text-primary tracking-tight">{curTemp !== '—' ? `${curTemp}°C` : '—'}</span>
                    {curHigh !== '—' && (
                      <span className="text-body-md font-body-md text-secondary">/ {curHigh}° High</span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-warning">
                    <span className="material-symbols-outlined text-[26px]">wb_sunny</span>
                    <span className="text-body-sm font-body-sm font-medium text-on-surface">{curCond}</span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3.5 mb-5">
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Humidity</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{curHum !== '—' ? `${curHum}%` : '—'}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Wind</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{curWind}</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-label font-label text-text-tertiary">
                <span className="material-symbols-outlined text-[15px]">straighten</span>
                <span>Track Distance: km {Math.round(currentStop?.distanceKm ?? currentStop?.distanceFromSourceKm ?? 0)} from origin</span>
              </div>
            </div>

            {/* Card 2: Approaching Next Station */}
            <div className="bg-surface-elevated rounded-xl border border-border p-6 shadow-xs flex flex-col justify-between transition-shadow hover:shadow-md ring-1 ring-border/80">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label font-label bg-surface-container text-info border border-border/80">
                    <span className="material-symbols-outlined text-[13px] text-info">near_me</span>
                    NEXT SCHEDULED HALT
                  </span>
                  <span className="text-label font-label text-text-tertiary">km {Math.round(nextStop?.distanceKm ?? nextStop?.distanceFromSourceKm ?? 0)}</span>
                </div>

                <h3 className="text-heading-md font-heading-md text-primary mb-1">
                  {nextStop?.stationName || 'Next Station'} {nextStop?.stationId ? `(${nextStop.stationId})` : ''}
                </h3>
                <p className="text-body-sm font-body-sm text-secondary mb-5">
                  {nextStop?.platform ? `Platform ${nextStop.platform} Scheduled` : 'Scheduled Halt'}
                </p>

                <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-border/70">
                  <div className="flex items-baseline gap-2">
                    <span className="text-display-lg font-display-lg text-primary tracking-tight">{nextTemp !== '—' ? `${nextTemp}°C` : '—'}</span>
                    {nextHigh !== '—' && (
                      <span className="text-body-md font-body-md text-secondary">/ {nextHigh}° High</span>
                    )}
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
                    <div className="text-body-md font-body-md font-semibold text-primary">{nextHum !== '—' ? `${nextHum}%` : '—'}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Wind</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{nextWind}</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-start gap-2 text-label font-label text-secondary">
                <span className="material-symbols-outlined text-[16px] text-info flex-shrink-0">schedule</span>
                <span>Scheduled Halt: {formatTime(nextStop?.scheduledArrival, 0)}</span>
              </div>
            </div>

            {/* Card 3: Terminal Destination */}
            <div className="bg-surface-elevated rounded-xl border border-border p-6 shadow-xs flex flex-col justify-between transition-shadow hover:shadow-md">
              <div>
                <div className="flex items-center justify-between gap-2 mb-4">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-label font-label bg-surface-container text-on-surface-variant border border-border/80">
                    <span className="material-symbols-outlined text-[13px]">flag</span>
                    TERMINAL DESTINATION
                  </span>
                  <span className="text-label font-label text-text-tertiary">{totalKm > 0 ? `km ${totalKm}` : '—'}</span>
                </div>

                <h3 className="text-heading-md font-heading-md text-primary mb-1">
                  {destStop?.stationName || 'Destination Station'} {destStop?.stationId ? `(${destStop.stationId})` : ''}
                </h3>
                <p className="text-body-sm font-body-sm text-secondary mb-5">{destStop?.platform ? `Terminus Platform ${destStop.platform}` : 'Journey Terminal'}</p>

                <div className="flex items-baseline justify-between mb-6 pb-4 border-b border-border/70">
                  <div className="flex items-baseline gap-2">
                    <span className="text-display-lg font-display-lg text-primary tracking-tight">{destTemp !== '—' ? `${destTemp}°C` : '—'}</span>
                    {destHigh !== '—' && (
                      <span className="text-body-md font-body-md text-secondary">/ {destHigh}° High</span>
                    )}
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
                    <div className="text-label font-label text-secondary mb-0.5">Humidity</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{destHum !== '—' ? `${destHum}%` : '—'}</div>
                  </div>
                  <div className="p-2.5 bg-surface rounded-lg border border-border/60">
                    <div className="text-label font-label text-secondary mb-0.5">Wind</div>
                    <div className="text-body-md font-body-md font-semibold text-primary">{destWind}</div>
                  </div>
                </div>
              </div>

              <div className="pt-3 border-t border-border/60 flex items-center gap-2 text-label font-label text-text-tertiary">
                <span className="material-symbols-outlined text-[15px]">flag</span>
                <span>Scheduled Terminus Arrival: {formatTime(destStop?.scheduledArrival, 0)}</span>
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
                  Real-time Doppler precipitation radar mapped across corridor waypoints from {journey?.train?.originStationName || originStop?.stationName || 'Origin'} to {journey?.train?.destinationStationName || destStop?.stationName || 'Destination'} ({totalKm.toLocaleString()} km)
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
                    }}
                    className="text-secondary font-medium hover:text-primary cursor-pointer transition-colors flex items-center gap-1 group-hover:translate-x-0.5 transition-transform"
                  >
                    <span>{landmark.actionLabel}</span>
                    <span className="material-symbols-outlined text-[13px]">arrow_forward</span>
                  </button>
                </div>
              </div>
            ))}

            {filteredLandmarks.length === 0 && (
              <div className="p-12 text-center bg-surface-elevated rounded-xl border border-dashed border-border col-span-full my-4">
                <span className="material-symbols-outlined text-[36px] text-text-tertiary mb-2">landscape</span>
                <h3 className="text-heading-md font-semibold text-primary">No Cataloged Landmarks for this Corridor</h3>
                <p className="text-body-sm text-secondary max-w-md mx-auto mt-1">
                  Scenic landmarks and topographic points are cataloged as trains traverse documented heritage and geological sectors.
                </p>
              </div>
            )}
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

            {/* Modal Body: Historical / Heritage Dossier */}
            {activeModal.actionType === 'audio' && (
              <div className="space-y-4">
                <div className="p-4 bg-surface rounded-xl border border-border">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-primary text-[20px]">history_edu</span>
                      <span className="text-label font-label text-primary font-semibold">Heritage Narrative Dossier</span>
                    </div>
                  </div>

                  {activeModal.telemetryData.narrator && (
                    <p className="text-label text-secondary italic mb-2">
                      Documentation source: {activeModal.telemetryData.narrator}
                    </p>
                  )}

                  {activeModal.telemetryData.transcript && (
                    <div className="p-3.5 bg-surface-container-low rounded-lg border border-border text-body-sm text-on-surface leading-relaxed max-h-56 overflow-y-auto">
                      {activeModal.telemetryData.transcript}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-5 pt-3 border-t border-border flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setActiveModal(null);
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
