'use client';

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { createStationPopupNode, createTrainMarkerNode } from './mapDOMUtils';

// Explicitly register worker url to ensure Next.js / Webpack uses the bundled same-origin static worker
if (typeof window !== 'undefined' && typeof maplibregl.setWorkerUrl === 'function') {
  maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
}

interface StopInfo {
  stationId: string;
  stationName?: string;
  stationLat?: number;
  stationLon?: number;
  scheduledArrival?: string | null;
  actualArrival?: string | null;
  delayMinutes?: number | null;
  status?: string;
}

export interface JourneyMapRef {
  recenter: () => void;
  fitRoute: () => void;
  resetNorth: () => void;
}

export interface JourneyMapProps {
  routeCoordinates?: [number, number][];
  currentPosition?: {
    latitude: number;
    longitude: number;
    speedKph?: number | null;
    heading?: number | null;
    currentStationName?: string | null;
    nextStationName?: string | null;
    delayMinutes?: number;
  };
  stops?: StopInfo[];
  stations?: StopInfo[]; // alias
  className?: string;
}

function formatTime(iso: string | null | undefined, extraDelayMinutes: number = 0): string {
  if (!iso) return '--:--';
  try {
    const d = new Date(iso);
    if (extraDelayMinutes > 0) d.setMinutes(d.getMinutes() + extraDelayMinutes);
    return d.toLocaleTimeString('en-IN', {
      hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata'
    });
  } catch { return iso; }
}

export function isValidCoordinate(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

export const JourneyMap = forwardRef<JourneyMapRef, JourneyMapProps>(({
  routeCoordinates,
  currentPosition,
  stops,
  stations,
  className,
}, ref) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const trainMarkerRef = useRef<maplibregl.Marker | null>(null);
  const stopMarkersRef = useRef<maplibregl.Marker[]>([]);
  const hasInitialFitRef = useRef(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';
  if (!mapTilerKey && typeof window !== 'undefined') {
    console.warn('[JourneyMap] NEXT_PUBLIC_MAPTILER_KEY environment variable is not defined.');
  }

  const stationList: StopInfo[] = (stops || stations || []).filter(
    s => isValidCoordinate(s.stationLat, s.stationLon)
  );
  const hasRoute = Boolean(
    routeCoordinates &&
    routeCoordinates.length >= 2 &&
    routeCoordinates.every(c => Array.isArray(c) && isValidCoordinate(c[1], c[0]))
  );
  const hasPosition = Boolean(
    currentPosition &&
    isValidCoordinate(currentPosition.latitude, currentPosition.longitude)
  );

  // Track the index of the last departed/at-station to split the route rendering (past vs future)
  const currentStopIndex = stationList.findLastIndex(s => s.status === 'departed' || s.status === 'at-station');
  const pastCoords: [number, number][] = [];
  const futureCoords: [number, number][] = [];

  if (hasRoute && routeCoordinates) {
    if (currentStopIndex >= 0 && currentStopIndex < stationList.length - 1 && hasPosition && currentPosition) {
      let closestIdx = 0;
      let minDst = Infinity;
      routeCoordinates.forEach((c, idx) => {
        const dx = c[0] - currentPosition.longitude;
        const dy = c[1] - currentPosition.latitude;
        const dst = dx * dx + dy * dy;
        if (dst < minDst) { minDst = dst; closestIdx = idx; }
      });
      pastCoords.push(...routeCoordinates.slice(0, closestIdx + 1));
      futureCoords.push(routeCoordinates[closestIdx]);
      futureCoords.push(...routeCoordinates.slice(closestIdx + 1));
    } else if (currentStopIndex === -1) {
      futureCoords.push(...routeCoordinates);
    } else {
      pastCoords.push(...routeCoordinates);
    }
  }

  // Compute map center
  const center: [number, number] = hasPosition && currentPosition
    ? [currentPosition.longitude, currentPosition.latitude]
    : hasRoute && routeCoordinates
    ? [routeCoordinates[Math.floor(routeCoordinates.length / 2)][0], routeCoordinates[Math.floor(routeCoordinates.length / 2)][1]]
    : [79.5, 20.0];

  useEffect(() => {
    if (!mapContainer.current) return;

    if (typeof maplibregl.setWorkerUrl === 'function') {
      maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
    }

    const mapInstance = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${mapTilerKey}`,
      center,
      zoom: 6.5,
      pitch: 0,
      bearing: 0,
      interactive: true,
      attributionControl: false,
    });

    map.current = mapInstance;

    mapInstance.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
    mapInstance.on('dragstart', () => setIsFollowing(false));
    mapInstance.on('zoomstart', (e: { originalEvent?: unknown }) => { if (e.originalEvent) setIsFollowing(false); });

    mapInstance.on('error', (e) => {
      console.warn('[JourneyMap] MapLibre notice:', e?.error?.message || e);
    });

    mapInstance.on('load', () => {
      setMapReady(true);
      mapInstance.resize();
    });

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainer.current) {
      resizeObserver = new ResizeObserver(() => {
        mapInstance.resize();
      });
      resizeObserver.observe(mapContainer.current);
    }

    return () => {
      resizeObserver?.disconnect();
      stopMarkersRef.current.forEach(m => m.remove());
      stopMarkersRef.current = [];
      trainMarkerRef.current?.remove();
      trainMarkerRef.current = null;
      mapInstance.remove();
      map.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTilerKey]);

  // Synchronize route lines & station markers whenever data arrives or changes
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapReady || !mapInstance) return;

    // --- Route Layers (Future & Past) ---
    if (hasRoute && routeCoordinates && routeCoordinates.length > 0) {
      const futureGeoJson = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: futureCoords.length > 1 ? futureCoords : [],
        },
      };

      const futureSource = mapInstance.getSource('route-future') as maplibregl.GeoJSONSource | undefined;
      if (futureSource) {
        futureSource.setData(futureGeoJson);
      } else if (futureCoords.length > 1) {
        mapInstance.addSource('route-future', {
          type: 'geojson',
          data: futureGeoJson,
        });
        mapInstance.addLayer({
          id: 'route-future-line',
          type: 'line',
          source: 'route-future',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#475569', 'line-width': 3, 'line-dasharray': [2, 3] },
        });
      }

      const pastGeoJson = {
        type: 'Feature' as const,
        properties: {},
        geometry: {
          type: 'LineString' as const,
          coordinates: pastCoords.length > 1 ? pastCoords : [],
        },
      };

      const pastSource = mapInstance.getSource('route-past') as maplibregl.GeoJSONSource | undefined;
      if (pastSource) {
        pastSource.setData(pastGeoJson);
      } else if (pastCoords.length > 1) {
        mapInstance.addSource('route-past', {
          type: 'geojson',
          data: pastGeoJson,
        });
        mapInstance.addLayer({
          id: 'route-past-glow',
          type: 'line',
          source: 'route-past',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#00e5ff', 'line-width': 8, 'line-opacity': 0.3, 'line-blur': 4 },
        });
        mapInstance.addLayer({
          id: 'route-past-line',
          type: 'line',
          source: 'route-past',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#00e5ff', 'line-width': 4 },
        });
      }

      if (!hasInitialFitRef.current) {
        const bounds = new maplibregl.LngLatBounds();
        routeCoordinates.forEach((coord) => {
          if (Array.isArray(coord) && isValidCoordinate(coord[1], coord[0])) {
            bounds.extend(coord);
          }
        });
        if (!bounds.isEmpty()) {
          mapInstance.fitBounds(bounds, { padding: { top: 100, bottom: 100, left: 400, right: 100 }, maxZoom: 10 });
          hasInitialFitRef.current = true;
        }
      }
    }

    // --- Station Markers ---
    stopMarkersRef.current.forEach((m) => m.remove());
    stopMarkersRef.current = [];

    stationList.forEach((stn) => {
      const isPast = stn.status === 'departed' || stn.status === 'at-station';

      const markerRoot = document.createElement('div');
      markerRoot.className = 'station-marker-root';
      markerRoot.setAttribute('role', 'button');
      markerRoot.setAttribute('tabindex', '0');
      markerRoot.setAttribute('aria-label', `${stn.stationId} ${stn.stationName || ''}`);
      markerRoot.style.cssText = `
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        z-index: 10;
      `;

      const dot = document.createElement('div');
      dot.className = 'station-marker-dot';
      dot.style.cssText = `
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: ${isPast ? '#00e5ff' : '#64748b'};
        box-shadow: ${isPast ? '0 0 10px #00e5ff' : 'none'};
        transition: transform 0.15s ease-out, background 0.15s ease-out;
        pointer-events: none;
      `;

      markerRoot.onmouseenter = () => { dot.style.transform = 'scale(1.5)'; };
      markerRoot.onmouseleave = () => { dot.style.transform = 'scale(1)'; };
      markerRoot.onfocus = () => { dot.style.transform = 'scale(1.5)'; };
      markerRoot.onblur = () => { dot.style.transform = 'scale(1)'; };
      markerRoot.appendChild(dot);

      const actTimeStr = formatTime(
        stn.actualArrival || stn.scheduledArrival,
        !stn.actualArrival ? (stn.delayMinutes || 0) : 0
      );

      const popupNode = createStationPopupNode({
        stationId: stn.stationId,
        stationName: stn.stationName,
        etaStr: actTimeStr,
      });

      const popup = new maplibregl.Popup({ offset: 12, closeButton: false, closeOnClick: true })
        .setDOMContent(popupNode);

      const marker = new maplibregl.Marker({ element: markerRoot, anchor: 'center' })
        .setLngLat([stn.stationLon!, stn.stationLat!])
        .setPopup(popup)
        .addTo(mapInstance);

      markerRoot.onkeydown = (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          marker.togglePopup();
        }
      };

      stopMarkersRef.current.push(marker);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, routeCoordinates, stops, stations]);

  // Synchronize Train Marker & Camera
  useEffect(() => {
    const mapInstance = map.current;
    if (!mapReady || !mapInstance) return;

    if (hasPosition && currentPosition) {
      const speed = Math.round(currentPosition.speedKph || 0);
      const heading = Math.round(currentPosition.heading || 38);
      const nextStopTarget = stationList[currentStopIndex + 1];
      const nextEtaStr = formatTime(nextStopTarget?.actualArrival || nextStopTarget?.scheduledArrival);

      if (!trainMarkerRef.current) {
        const trainRoot = createTrainMarkerNode({
          speed,
          heading,
          nextStationName: currentPosition.nextStationName,
          nextEtaStr,
        });

        trainMarkerRef.current = new maplibregl.Marker({ element: trainRoot, anchor: 'center' })
          .setLngLat([currentPosition.longitude, currentPosition.latitude])
          .addTo(mapInstance);
      } else {
        trainMarkerRef.current.setLngLat([currentPosition.longitude, currentPosition.latitude]);
      }

      if (isFollowing) {
        mapInstance.panTo([currentPosition.longitude, currentPosition.latitude], { duration: 1000 });
      }
    } else if (trainMarkerRef.current) {
      trainMarkerRef.current.remove();
      trainMarkerRef.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapReady, currentPosition, isFollowing]);

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    recenter: () => {
      if (map.current && currentPosition && isValidCoordinate(currentPosition.latitude, currentPosition.longitude)) {
        setIsFollowing(true);
        map.current.flyTo({
          center: [currentPosition.longitude, currentPosition.latitude],
          zoom: 9,
          duration: 1000
        });
      }
    },
    fitRoute: () => {
      if (map.current && routeCoordinates && routeCoordinates.length > 0) {
        setIsFollowing(false);
        const bounds = new maplibregl.LngLatBounds();
        routeCoordinates.forEach(coord => {
          if (Array.isArray(coord) && isValidCoordinate(coord[1], coord[0])) {
            bounds.extend(coord);
          }
        });
        if (!bounds.isEmpty()) {
          map.current.fitBounds(bounds, { padding: { top: 100, bottom: 100, left: 400, right: 100 }, maxZoom: 10, duration: 1000 });
        }
      }
    },
    resetNorth: () => {
      if (map.current) {
        map.current.resetNorthPitch({ duration: 500 });
      }
    }
  }));

  return (
    <div className={`relative ${className}`}>
      {/* Fallback CSS for map container if missing */}
      <style>{`.maplibregl-popup-content { padding: 0 !important; background: transparent !important; box-shadow: none !important; }`}</style>
      <div ref={mapContainer} className="w-full h-full absolute inset-0" />
    </div>
  );
});

JourneyMap.displayName = 'JourneyMap';
