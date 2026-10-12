import { NearbyPoi, PoiCategory, GeoBounds, GeoPoint } from '@exprest/types';

export interface PoiProvider {
  searchNearby(bounds: GeoBounds, category?: PoiCategory, routePoints?: GeoPoint[]): Promise<NearbyPoi[]>;
}

const CATEGORY_OVERPASS_MAP: Record<string, string[]> = {
  RIVERS_LAKES: ['waterway=river', 'natural=water'],
  MOUNTAINS_GHATS: ['natural=peak', 'natural=hill', 'natural=mountain_range'],
  BRIDGES_TUNNELS: ['bridge=yes', 'tunnel=yes'],
  MONUMENTS: ['historic=monument', 'historic=fort', 'tourism=attraction'],
  CITIES_DISTRICTS: ['place=city', 'place=town'],
};

function buildOverpassQuery(bounds: GeoBounds, filters: string[]): string {
  const { minLat, maxLon, maxLat, minLon } = bounds;
  const bbox = `${minLat},${minLon},${maxLat},${maxLon}`;
  const nwrFilters = filters.map(f => `nwr[${f}](${bbox});`).join('\n');
  return `[out:json][timeout:15];(${nwrFilters});out center 30;`;
}

function haversineDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // meters
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export class OverpassAdapter implements PoiProvider {
  private readonly OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

  async searchNearby(bounds: GeoBounds, category?: PoiCategory, routePoints?: GeoPoint[]): Promise<NearbyPoi[]> {
    try {
      const categories = category
        ? { [category]: CATEGORY_OVERPASS_MAP[category] || [] }
        : CATEGORY_OVERPASS_MAP;

      const allPois: NearbyPoi[] = [];
      const seenIds = new Set<string>();

      // Query each category
      for (const [cat, filters] of Object.entries(categories)) {
        if (!filters.length) continue;

        const query = buildOverpassQuery(bounds, filters);
        const res = await fetch(this.OVERPASS_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: `data=${encodeURIComponent(query)}`,
          signal: AbortSignal.timeout(20_000),
        });

        if (!res.ok) continue;

        const json = await res.json();
        const elements: any[] = json?.elements || [];

        for (const el of elements.slice(0, 10)) {
          const poiId = `poi_osm_${el.id}`;
          if (seenIds.has(poiId)) continue;

          const name = el.tags?.name || el.tags?.['name:en'] || el.tags?.official_name;
          const lat = typeof el.lat === 'number' ? el.lat : el.center?.lat;
          const lon = typeof el.lon === 'number' ? el.lon : el.center?.lon;
          if (!name || typeof lat !== 'number' || typeof lon !== 'number') continue;

          // Calculate distance to the nearest route point or bounding box center
          let minDistanceM = 0;
          if (routePoints && routePoints.length > 0) {
            let shortest = Infinity;
            for (const pt of routePoints) {
              const d = haversineDistanceM(lat, lon, pt.latitude, pt.longitude);
              if (d < shortest) shortest = d;
            }
            minDistanceM = shortest !== Infinity ? shortest : 0;
          } else {
            const midLat = (bounds.minLat + bounds.maxLat) / 2;
            const midLon = (bounds.minLon + bounds.maxLon) / 2;
            minDistanceM = haversineDistanceM(lat, lon, midLat, midLon);
          }

          seenIds.add(poiId);
          allPois.push({
            id: poiId,
            category: cat as PoiCategory,
            name,
            latitude: lat,
            longitude: lon,
            distanceFromRouteM: minDistanceM,
            source: 'OpenStreetMap/Overpass',
            tags: el.tags || {},
          });
        }
      }

      return allPois.slice(0, 15);
    } catch (err) {
      console.warn('Overpass query failed:', err);
      return [];
    }
  }
}
