import { ElevationPoint, GeoPoint } from '@exprest/types';

export interface TerrainProvider {
  getElevationProfile(points: GeoPoint[]): Promise<ElevationPoint[]>;
}

function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

export class OpenTopographyAdapter implements TerrainProvider {
  private apiKey = process.env.OPENTOPOGRAPHY_API_KEY || '';

  async getElevationProfile(points: GeoPoint[]): Promise<ElevationPoint[]> {
    if (!this.apiKey || !points || points.length < 2) {
      return [];
    }

    try {
      // Filter strictly valid finite coordinates
      const validPoints = points.filter(
        p => typeof p.latitude === 'number' && typeof p.longitude === 'number' &&
             isFinite(p.latitude) && isFinite(p.longitude) &&
             p.latitude >= -90 && p.latitude <= 90 &&
             p.longitude >= -180 && p.longitude <= 180
      );

      if (validPoints.length < 2) return [];

      // Sample up to 12 representative points along the route to respect rate limits
      const maxSamples = 12;
      const sampledPoints: GeoPoint[] = [];
      if (validPoints.length <= maxSamples) {
        sampledPoints.push(...validPoints);
      } else {
        const step = (validPoints.length - 1) / (maxSamples - 1);
        for (let i = 0; i < maxSamples; i++) {
          const idx = Math.min(validPoints.length - 1, Math.round(i * step));
          sampledPoints.push(validPoints[idx]);
        }
      }

      // Compute cumulative route distance along sampled points using Haversine
      const distances: number[] = [0];
      for (let i = 1; i < sampledPoints.length; i++) {
        const legKm = haversineDistanceKm(
          sampledPoints[i - 1].latitude,
          sampledPoints[i - 1].longitude,
          sampledPoints[i].latitude,
          sampledPoints[i].longitude
        );
        distances.push(Math.round((distances[i - 1] + legKm) * 10) / 10);
      }

      // Fetch elevations in parallel from official portal endpoint
      const results = await Promise.allSettled(
        sampledPoints.map(async p => {
          const url = `https://portal.opentopography.org/API/v1/elevation?longitude=${p.longitude}&latitude=${p.latitude}&dataset=COP30&API_Key=${this.apiKey}`;
          const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!res.ok) return null;
          const data = await res.json();
          if (data && data.Status === 'Success' && typeof data.Elevation === 'number' && !isNaN(data.Elevation)) {
            return Math.round(data.Elevation * 10) / 10;
          }
          return null;
        })
      );

      const profile: ElevationPoint[] = [];
      for (let i = 0; i < sampledPoints.length; i++) {
        const r = results[i];
        if (r.status === 'fulfilled' && typeof r.value === 'number') {
          profile.push({
            distanceKm: distances[i],
            latitude: sampledPoints[i].latitude,
            longitude: sampledPoints[i].longitude,
            elevationM: r.value,
          });
        }
      }

      // Only return if we obtained at least 2 valid elevation measurements
      if (profile.length >= 2) {
        return profile;
      }
    } catch (err) {
      console.warn('OpenTopography live fetch failed:', err);
    }

    // Do not fabricate or return synthetic elevation values when provider data is unavailable
    return [];
  }
}
