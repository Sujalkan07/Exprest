'use client';

import React, { useEffect, useRef } from 'react';
import maplibregl from 'maplibre-gl';

interface JourneyMapProps {
  routeCoordinates?: [number, number][];
  currentPosition?: { latitude: number; longitude: number };
}

export const JourneyMap: React.FC<JourneyMapProps> = ({ routeCoordinates, currentPosition }) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);

  useEffect(() => {
    if (!mapContainer.current) return;

    // Use dark map style surface (MapLibre dark tile source)
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: {
        version: 8,
        sources: {
          'osm-tiles': {
            type: 'raster',
            tiles: ['https://cartodb-basemaps-a.global.ssl.fastly.net/dark_all/{z}/{x}/{y}.png'],
            tileSize: 256,
            attribution: '&copy; CartoDB & OpenStreetMap'
          }
        },
        layers: [
          {
            id: 'osm-tiles',
            type: 'raster',
            source: 'osm-tiles',
            minzoom: 0,
            maxzoom: 19
          }
        ]
      },
      center: currentPosition ? [currentPosition.longitude, currentPosition.latitude] : [80.1, 17.2],
      zoom: 6,
      pitch: 30
    });

    map.current.addControl(new maplibregl.NavigationControl({ showCompass: true }), 'top-right');

    map.current.on('load', () => {
      if (!map.current) return;

      // Add route line source
      if (routeCoordinates && routeCoordinates.length > 0) {
        map.current.addSource('route', {
          type: 'geojson',
          data: {
            type: 'Feature',
            properties: {},
            geometry: {
              type: 'LineString',
              coordinates: routeCoordinates
            }
          }
        });

        // Remaining Route Line
        map.current.addLayer({
          id: 'route-line',
          type: 'line',
          source: 'route',
          layout: {
            'line-join': 'round',
            'line-cap': 'round'
          },
          paint: {
            'line-color': '#3b82f6',
            'line-width': 4,
            'line-opacity': 0.8
          }
        });
      }

      // Add train marker element
      if (currentPosition) {
        const el = document.createElement('div');
        el.className = 'relative flex items-center justify-center';
        el.innerHTML = `
          <div className="w-6 h-6 rounded-full bg-cyan-400 border-2 border-white shadow-lg flex items-center justify-center animate-pulse">
            <div className="w-2.5 h-2.5 rounded-full bg-cyan-900"></div>
          </div>
        `;

        new maplibregl.Marker({ element: el })
          .setLngLat([currentPosition.longitude, currentPosition.latitude])
          .addTo(map.current);
      }
    });

    return () => {
      map.current?.remove();
    };
  }, [routeCoordinates, currentPosition]);

  return (
    <div className="relative w-full h-full min-h-[400px] rounded-hero overflow-hidden shadow-md border border-border">
      <div ref={mapContainer} className="absolute inset-0 w-full h-full" />
    </div>
  );
};
