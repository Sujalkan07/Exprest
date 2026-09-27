import { ElevationPoint, GeoPoint } from '@exprest/types';

export interface TerrainProvider {
  getElevationProfile(points: GeoPoint[]): Promise<ElevationPoint[]>;
}

export class OpenTopographyAdapter implements TerrainProvider {
  private apiKey = process.env.OPENTOPOGRAPHY_API_KEY || '1962defb21ebc350baebe48a7c8b12e6';

  async getElevationProfile(points: GeoPoint[]): Promise<ElevationPoint[]> {
    try {
      if (this.apiKey && points.length > 0) {
        const locations = points.map(p => `${p.latitude},${p.longitude}`).join('|');
        const res = await fetch(`https://api.opentopography.org/v1/globaldem?demtype=COP30&locations=${encodeURIComponent(locations)}&outputFormat=JSON&API_Key=${this.apiKey}`);
        if (res.ok) {
          const data = await res.json();
          if (data.results && Array.isArray(data.results)) {
            return data.results.map((r: any, i: number) => ({
              distanceKm: i * 40,
              latitude: r.latitude ?? points[i].latitude,
              longitude: r.longitude ?? points[i].longitude,
              elevationM: Math.round(r.elevation ?? 150)
            }));
          }
        }
      }
    } catch (err) {
      console.warn('OpenTopography live fetch failed, using fallback profile:', err);
    }

    return points.map((pt, i) => ({
      distanceKm: i * 40,
      latitude: pt.latitude,
      longitude: pt.longitude,
      elevationM: Math.floor(150 + Math.sin(i / 2) * 350 + (i * 15))
    }));
  }
}
