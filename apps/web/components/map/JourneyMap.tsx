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

  const stationList: StopInfo[] = (stops || stations || []).filter(s => s.stationLat && s.stationLon);
  const hasRoute = routeCoordinates && routeCoordinates.length >= 2;
  const hasPosition = currentPosition && currentPosition.latitude && currentPosition.longitude;

  // Track the index of the last departed/at-station to split the route rendering (past vs future)
  const currentStopIndex = stationList.findLastIndex(s => s.status === 'departed' || s.status === 'at-station');
  const pastCoords: [number, number][] = [];
  const futureCoords: [number, number][] = [];

  if (hasRoute) {
    if (currentStopIndex >= 0 && currentStopIndex < stationList.length - 1 && hasPosition) {
      // Split the route at the current position.
      // For simplicity in this demo, we'll find the closest point in the route to the train's position.
      let closestIdx = 0;
      let minDst = Infinity;
      routeCoordinates.forEach((c, idx) => {
        const dx = c[0] - currentPosition.longitude;
        const dy = c[1] - currentPosition.latitude;
        const dst = dx * dx + dy * dy;
        if (dst < minDst) { minDst = dst; closestIdx = idx; }
      });
      pastCoords.push(...routeCoordinates.slice(0, closestIdx + 1));
      futureCoords.push(routeCoordinates[closestIdx]); // connect them seamlessly
      futureCoords.push(...routeCoordinates.slice(closestIdx + 1));
    } else if (currentStopIndex === -1) {
      // Not started
      futureCoords.push(...routeCoordinates);
    } else {
      // Completed
      pastCoords.push(...routeCoordinates);
    }
  }

  // Compute map center
  const center: [number, number] = hasPosition
    ? [currentPosition.longitude, currentPosition.latitude]
    : hasRoute
    ? [routeCoordinates![Math.floor(routeCoordinates!.length / 2)][0], routeCoordinates![Math.floor(routeCoordinates!.length / 2)][1]]
    : [79.5, 20.0];

  useEffect(() => {
    if (!mapContainer.current) return;

    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${mapTilerKey}`,
      center,
      zoom: 6.5,
      pitch: 0, // 2D flat for better radar UI
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

      if (hasRoute) {
        // --- Future Route (Dashed Teal/Grey) ---
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
            paint: { 'line-color': '#475569', 'line-width': 3, 'line-dasharray': [2, 3] } // Grey dashed
          });
        }

        // --- Past Route (Solid Glowing Teal) ---
        if (pastCoords.length > 1) {
          map.current.addSource('route-past', {
            type: 'geojson',
            data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: pastCoords } }
          });
          // Outer Glow
          map.current.addLayer({
            id: 'route-past-glow',
            type: 'line',
            source: 'route-past',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00e5ff', 'line-width': 8, 'line-opacity': 0.3, 'line-blur': 4 }
          });
          // Inner Solid
          map.current.addLayer({
            id: 'route-past-line',
            type: 'line',
            source: 'route-past',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#00e5ff', 'line-width': 4 }
          });
        }

        const bounds = new maplibregl.LngLatBounds();
        routeCoordinates!.forEach(coord => bounds.extend(coord));
        map.current.fitBounds(bounds, { padding: { top: 100, bottom: 100, left: 400, right: 100 }, maxZoom: 10 });
      }

      // --- Station Markers ---
      stationList.forEach((stn, idx) => {
        const isPast = stn.status === 'departed' || stn.status === 'at-station';
        
        const el = document.createElement('div');
        el.style.cssText = `
          width: 10px; height: 10px; border-radius: 50%;
          background: ${isPast ? '#00e5ff' : '#64748b'}; 
          box-shadow: ${isPast ? '0 0 10px #00e5ff' : 'none'};
          cursor: pointer; transition: transform 0.15s;
          z-index: 10;
        `;
        
        el.onmouseenter = () => { el.style.transform = 'scale(1.5)'; };
        el.onmouseleave = () => { el.style.transform = 'scale(1)'; };

        // Station Label (only display for some, or on hover in a real app, but we will attach a clean popup)
        const actTimeStr = formatTime(stn.actualArrival || stn.scheduledArrival, !stn.actualArrival ? (stn.delayMinutes || 0) : 0);
        
        const popupHTML = `
          <div style="font-family:'Inter', sans-serif;font-size:12px;padding:8px 12px;background:rgba(13,17,23,0.9);backdrop-filter:blur(8px);border-radius:8px;border:1px solid rgba(255,255,255,0.15);color:white;min-width:140px;">
            <div style="font-weight:700;font-size:13px;color:#f8fafc;margin-bottom:2px">${stn.stationId} - ${stn.stationName}</div>
            <div style="color:#94a3b8;font-size:11px;">ETA ${actTimeStr}</div>
          </div>
        `;

        const popup = new maplibregl.Popup({ offset: 10, closeButton: false, closeOnClick: true })
          .setHTML(popupHTML);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([stn.stationLon!, stn.stationLat!])
          .setPopup(popup)
          .addTo(map.current!);
          
        stopMarkersRef.current.push(marker);
      });

      // --- Train Radar Marker (Stitch Design) ---
      if (hasPosition) {
        const speed = Math.round(currentPosition!.speedKph || 0);
        const heading = Math.round(currentPosition!.heading || 38); // Default 038 bearing for styling
        
        const trainWrapper = document.createElement('div');
        trainWrapper.style.cssText = 'position:absolute; transform: translate(-50%, -50%); display:flex; flex-direction:column; align-items:center; z-index:50; pointer-events:auto;';

        // Glowing cyan radar marker with navigation arrow
        const markerHTML = `
          <div style="position:relative;display:flex;align-items:center;justify-content:center;cursor:pointer;" id="train-marker-core">
            <!-- Pulsing outer rings -->
            <div style="position:absolute;width:60px;height:60px;border-radius:50%;border:1px solid rgba(0, 229, 255, 0.4);animation:ping 2.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
            <div style="position:absolute;width:40px;height:40px;border-radius:50%;border:2px solid rgba(0, 229, 255, 0.8);"></div>
            <!-- Inner Dark Circle with Arrow -->
            <div style="position:relative;width:30px;height:30px;border-radius:50%;background:#0d1117;display:flex;align-items:center;justify-content:center;transform:rotate(${heading}deg);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#ffffff" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 2L22 22L12 18L2 22L12 2Z" fill="white"/>
              </svg>
            </div>
          </div>
          
          <!-- Tooltip HUD directly under the marker -->
          <div style="margin-top:8px; display:flex; flex-direction:column; align-items:center;">
            <!-- Target popup -->
            <div style="background:rgba(13,17,23,0.85);backdrop-filter:blur(4px);border:1px solid #00e5ff;border-radius:6px;padding:4px 8px;display:flex;align-items:center;gap:6px;box-shadow:0 4px 12px rgba(0,229,255,0.15); margin-bottom:4px;">
              <span class="material-symbols-outlined" style="font-size:14px;color:#00e5ff;">my_location</span>
              <div style="display:flex;flex-direction:column;line-height:1.2;">
                <span style="font-size:10px;font-weight:700;color:white;text-transform:uppercase;">${currentPosition!.nextStationName || 'Unknown'}</span>
                <span style="font-size:9px;color:#00e5ff;font-weight:600;">ETA — ${formatTime(stationList[currentStopIndex + 1]?.actualArrival || stationList[currentStopIndex + 1]?.scheduledArrival)}</span>
              </div>
            </div>
            
            <!-- Speed & Bearing Pill -->
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
        
        trainWrapper.innerHTML = markerHTML;

        trainMarkerRef.current = new maplibregl.Marker({ element: trainWrapper })
          .setLngLat([currentPosition!.longitude, currentPosition!.latitude])
          .addTo(map.current!);
      }
    });

    return () => {
      map.current?.remove();
    };
  }, [mapTilerKey]); // Only re-mount map on critical init changes

  // Expose methods via ref
  useImperativeHandle(ref, () => ({
    recenter: () => {
      if (map.current && currentPosition?.latitude && currentPosition?.longitude) {
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
        routeCoordinates.forEach(coord => bounds.extend(coord));
        map.current.fitBounds(bounds, { padding: { top: 100, bottom: 100, left: 400, right: 100 }, maxZoom: 10, duration: 1000 });
      }
    }
  }));

  // Auto-follow effect (simplified)
  useEffect(() => {
    if (isFollowing && mapReady && trainMarkerRef.current && currentPosition?.latitude && currentPosition?.longitude) {
      trainMarkerRef.current.setLngLat([currentPosition.longitude, currentPosition.latitude]);
      map.current?.panTo([currentPosition.longitude, currentPosition.latitude], { duration: 1000 });
    }
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
