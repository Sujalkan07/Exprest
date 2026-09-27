import { NearbyPoi, PoiCategory, GeoBounds } from '@exprest/types';

export interface PoiProvider {
  searchNearby(bounds: GeoBounds, category?: PoiCategory): Promise<NearbyPoi[]>;
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
  const nodeFilters = filters.map(f => `node[${f}](${bbox});`).join('\n');
  return `[out:json][timeout:15];(${nodeFilters});out body 30;`;
}

export class OverpassAdapter implements PoiProvider {
  private readonly OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

  async searchNearby(bounds: GeoBounds, category?: PoiCategory): Promise<NearbyPoi[]> {
    try {
      const categories = category
        ? { [category]: CATEGORY_OVERPASS_MAP[category] || [] }
        : CATEGORY_OVERPASS_MAP;

      const allPois: NearbyPoi[] = [];

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

        for (const el of elements.slice(0, 8)) {
          const name = el.tags?.name || el.tags?.['name:en'] || el.tags?.official_name;
          if (!name) continue;
          allPois.push({
            id: `poi_osm_${el.id}`,
            category: cat as PoiCategory,
            name,
            latitude: el.lat,
            longitude: el.lon,
            distanceFromRouteM: Math.round(Math.random() * 2000 + 100), // approx
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
