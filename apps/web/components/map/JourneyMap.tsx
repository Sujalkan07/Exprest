'use client';

import React, { useEffect, useRef, useState, forwardRef, useImperativeHandle } from 'react';
import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';

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
  const [isFollowing, setIsFollowing] = useState(true);
  const [mapReady, setMapReady] = useState(false);

  const mapTilerKey = process.env.NEXT_PUBLIC_MAPTILER_KEY || '';
  if (!mapTilerKey) {
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

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${mapTilerKey}`,
      center,
      zoom: 6.5,
      pitch: 0,
      bearing: 0,
      interactive: true,
      attributionControl: false,
    });

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true, visualizePitch: true }), 'top-right');
    map.current.on('dragstart', () => setIsFollowing(false));
    map.current.on('zoomstart', (e) => { if (e.originalEvent) setIsFollowing(false); });

    map.current.on('load', () => {
      if (!map.current) return;
      setMapReady(true);

      if (hasRoute && routeCoordinates) {
        if (futureCoords.length > 1) {
          map.current.addSource('route-future', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: futureCoords } }
          });
          map.current.addLayer({
            id: 'route-future-line',
            type: 'line',
            source: 'route-future',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#475569', 'line-width': 3, 'line-dasharray': [2, 3] }
          });
        }

        if (pastCoords.length > 1) {
          map.current.addSource('route-past', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pastCoords } }
          });
          map.current.addLayer({
            id: 'route-past-glow',
            type: 'line',
            source: 'route-past',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00e5ff', 'line-width': 8, 'line-opacity': 0.3, 'line-blur': 4 }
          });
          map.current.addLayer({
            id: 'route-past-line',
            type: 'line',
            source: 'route-past',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00e5ff', 'line-width': 4 }
          });
        }

        const bounds = new maplibregl.LngLatBounds();
        routeCoordinates.forEach(coord => bounds.extend(coord));
        map.current.fitBounds(bounds, { padding: { top: 100, bottom: 100, left: 400, right: 100 }, maxZoom: 10 });
      }

      // --- Station Markers ---
      // Clear existing markers if any
      stopMarkersRef.current.forEach(m => m.remove());
      stopMarkersRef.current = [];

      stationList.forEach((stn) => {
        const isPast = stn.status === 'departed' || stn.status === 'at-station';
        
        // Root container element: MapLibre exclusively manages inline transform (translate) on this
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
        
        // Inner visual dot: child element handles visual scale and hover transformations
        // This ensures markerRoot's transform is NEVER overwritten by mouse/click events!
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
        
        const popupHTML = `
          <div style="font-family:'Inter', sans-serif;font-size:12px;padding:8px 12px;background:rgba(13,17,23,0.9);backdrop-filter:blur(8px);border-radius:8px;border:1px solid rgba(255,255,255,0.15);color:white;min-width:140px;">
            <div style="font-weight:700;font-size:13px;color:#f8fafc;margin-bottom:2px">${stn.stationId} - ${stn.stationName || ''}</div>
            <div style="color:#94a3b8;font-size:11px;">ETA ${actTimeStr}</div>
          </div>
        `;

        const popup = new maplibregl.Popup({ offset: 12, closeButton: false, closeOnClick: true })
          .setHTML(popupHTML);

        markerRoot.onkeydown = (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            marker.togglePopup();
          }
        };

        const marker = new maplibregl.Marker({ element: markerRoot, anchor: 'center' })
          .setLngLat([stn.stationLon!, stn.stationLat!])
          .setPopup(popup)
          .addTo(map.current!);
          
        stopMarkersRef.current.push(marker);
      });

      // --- Train Radar Marker ---
      if (hasPosition && currentPosition) {
        const speed = Math.round(currentPosition.speedKph || 0);
        const heading = Math.round(currentPosition.heading || 38);
        
        const trainRoot = document.createElement('div');
        trainRoot.className = 'train-marker-root';
        trainRoot.style.cssText = 'display:flex; flex-direction:column; align-items:center; z-index:50; pointer-events:auto;';

        const nextStopTarget = stationList[currentStopIndex + 1];
        const nextEtaStr = formatTime(nextStopTarget?.actualArrival || nextStopTarget?.scheduledArrival);

        const markerHTML = `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;" id="train-marker-core">
            <div style="position:absolute;width:60px;height:60px;border-radius:50%;border:1px solid rgba(0, 229, 255, 0.4);animation:ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position:absolute;width:40px;height:40px;border-radius:50%;border:2px solid rgba(0, 229, 255, 0.8);"></div>
            <div style="position:relative;width:30px;height:30px;border-radius:50%;background:#0d1117;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L22 22L12 18L2 22L12 2Z" fill="white"/>
              </svg>
            </div>
          </div>
          
          <div style="margin-top:8px; display:flex; flex-direction:column; align-items:center;">
            <div style="background:rgba(13,17,23,0.85);backdrop-filter:blur(4px);border:1px solid #00e5ff;border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(0,229,255,0.15); margin-bottom:4px;">
              <span class="material-symbols-outlined" style="font-size:14px;color:#00e5ff;">my_location</span>
              <div style="display:flex;flex-direction:column;line-height:1.2;">
                <span style="font-size:10px;font-weight:700;color:white;text-transform:uppercase;">${currentPosition.nextStationName || 'Unknown'}</span>
                <span style="font-size:9px;color:#00e5ff;font-weight:600;">ETA — ${nextEtaStr}</span>
              </div>
            </div>
            
            <div style="background:rgba(13,17,23,0.95);border:1px solid rgba(255,255,255,0.1);border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:6px;">
              <div style="width:6px;height:6px;border-radius:50%;background:#00e5ff;box-shadow:0 0 6px #00e5ff;"></div>
              <div style="display:flex;flex-direction:column;line-height:1.1;">
                <span style="font-size:9px;color:#94a3b8;font-weight:700;">#RAJDHANI</span>
                <span style="font-size:12px;font-weight:800;color:white;">${speed} <span style="font-size:9px;color:#00e5ff;">km/h</span> <span style="font-size:9px;color:#94a3b8;font-weight:600;margin-left:4px;">BEARING ${heading}°</span></span>
              </div>
            </div>
          </div>
          <style>@keyframes ping{0%{transform:scale(0.8);opacity:1} 100%{transform:scale(1.8);opacity:0}}</style>
        `;
        
        trainRoot.innerHTML = markerHTML;

        trainMarkerRef.current = new maplibregl.Marker({ element: trainRoot, anchor: 'center' })
          .setLngLat([currentPosition.longitude, currentPosition.latitude])
          .addTo(map.current!);
      }
    });

    return () => {
      stopMarkersRef.current.forEach(m => m.remove());
      stopMarkersRef.current = [];
      trainMarkerRef.current?.remove();
      trainMarkerRef.current = null;
      map.current?.remove();
      map.current = null;
      setMapReady(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapTilerKey]);

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
    }
  }));

  // Auto-follow effect (safely checks finite coordinates including 0)
  useEffect(() => {
    if (
      isFollowing &&
      mapReady &&
      trainMarkerRef.current &&
      currentPosition &&
      isValidCoordinate(currentPosition.latitude, currentPosition.longitude)
    ) {
      trainMarkerRef.current.setLngLat([currentPosition.longitude, currentPosition.latitude]);
      map.current?.panTo([currentPosition.longitude, currentPosition.latitude], { duration: 1000 });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPosition?.latitude, currentPosition?.longitude, isFollowing, mapReady]);

  return (
    <div className={`relative ${className}`}>
      {/* Fallback CSS for map container if missing */}
      <style>{`.maplibregl-popup-content { padding: 0 !important; background: transparent !important; box-shadow: none !important; }`}</style>
      <div ref={mapContainer} className="w-full h-full absolute inset-0" />
    </div>
  );
});

JourneyMap.displayName = 'JourneyMap';
