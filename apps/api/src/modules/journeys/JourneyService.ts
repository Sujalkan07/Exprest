import { RailRadarAdapter } from '../../providers/railradar/RailRadarAdapter.js';
import { OpenWeatherAdapter } from '../../providers/openweather/OpenWeatherAdapter.js';
import { OpenTopographyAdapter } from '../../providers/opentopography/OpenTopographyAdapter.js';
import { OverpassAdapter } from '../../providers/overpass/OverpassAdapter.js';
import { AppError } from '../../common/errors/AppError.js';

/**
 * Parse journeyId format: journey_{trainNumber}_{date}
 * e.g. journey_12433_2026-09-26
 */
function parseJourneyId(journeyId: string): { trainNumber: string; serviceDate: string } {
  const parts = journeyId.split('_');
  if (parts.length < 3 || parts[0] !== 'journey') {
    throw new AppError('INVALID_JOURNEY_ID', `Invalid journeyId format: ${journeyId}`, 400);
  }
  const trainNumber = parts[1];
  const serviceDate = parts.slice(2).join('_'); // date portion: 2026-09-26
  return { trainNumber, serviceDate };
}

export class JourneyService {
  private railRadar = new RailRadarAdapter();
  private weather = new OpenWeatherAdapter();
  private terrain = new OpenTopographyAdapter();
  private poi = new OverpassAdapter();

  async getJourneyDetails(journeyId: string) {
    const { trainNumber, serviceDate } = parseJourneyId(journeyId);

    const [runData, live, route] = await Promise.all([
      this.railRadar.getRun(trainNumber, serviceDate),
      this.railRadar.getLivePosition(trainNumber),
      this.railRadar.getRouteGeometry(trainNumber),
    ]);

    if (!runData) {
      throw new AppError('RUN_NOT_FOUND', `No run data found for train ${trainNumber}`, 404);
    }

    // --- Compute progress from the live stop statuses ---
    // RailRadar live API gives status: 'departed' | 'at-station' | 'upcoming' per halt stop
    const stops = runData.stops;
    const totalStops = stops.length;
    const totalDistanceKm = stops[totalStops - 1]?.distanceKm || 0;

    // Count departed stops (strictly those that have status=departed)
    const departedCount = stops.filter((s: any) => s.status === 'departed').length;
    const atStationIdx = stops.findIndex((s: any) => s.status === 'at-station');

    // The "current" stop is the at-station stop (or last departed if none at-station)
    let currentStopIdx = atStationIdx !== -1 ? atStationIdx : Math.max(0, departedCount - 1);
    
    // The "next" stop is the first upcoming halt after the current
    let nextStopIdx = stops.findIndex((s: any, i: number) => i > currentStopIdx && s.status === 'upcoming');
    if (nextStopIdx === -1 && departedCount === totalStops) {
      // Journey completed
      nextStopIdx = totalStops - 1;
    }

    // completedStations = number of stops train has already passed/departed
    const completedStations = departedCount;

    // Distance covered = distance of current at-station stop (or last departed)
    const currentStop = stops[currentStopIdx];
    const coveredDistanceKm = currentStop?.distanceKm || 0;
    const remainingDistanceKm = Math.max(0, totalDistanceKm - coveredDistanceKm);
    const progressPercent = totalDistanceKm > 0
      ? Math.min(100, Math.round((coveredDistanceKm / totalDistanceKm) * 100))
      : 0;

    const delayMinutes = live?.delayMinutes || 0;

    // Hydrate live lat/lng
    let livePosition = live;
    if (livePosition && livePosition.latitude === 0 && livePosition.longitude === 0 && currentStop) {
      livePosition = {
        ...livePosition,
        latitude: currentStop.stationLat || 0,
        longitude: currentStop.stationLon || 0,
      };
    }

    const startDate = (runData.run as any)?.startDate || live?.startDate || (runData.run as any)?.serviceDate || serviceDate;

    return {
      journeyId,
      train: runData.train,
      startDate,
      run: {
        ...runData.run,
        startDate,
        status: runData.liveStatus || live?.status || 'RUNNING',
        delayMinutes,
        isLive: runData.isLive,
      },
      stops: runData.stops,
      livePosition,
      route,
      progress: {
        totalDistanceKm,
        coveredDistanceKm,
        remainingDistanceKm,
        percent: progressPercent,
        completedStations,
        totalStations: totalStops,
        currentStopIdx,
        nextStopIdx,
      },
      freshness: {
        observedAt: live?.observedAt || new Date().toISOString(),
        receivedAt: new Date().toISOString(),
      },
    };
  }

  async getLiveStatus(journeyId: string) {
    const { trainNumber, serviceDate } = parseJourneyId(journeyId);
    
    const [live, runData] = await Promise.all([
      this.railRadar.getLivePosition(trainNumber),
      this.railRadar.getRun(trainNumber, serviceDate)
    ]);

    if (!live) {
      throw new AppError('LIVE_NOT_FOUND', `No live data for train ${trainNumber}`, 404);
    }

    if (runData && live.latitude === 0 && live.longitude === 0) {
      const currentStn = runData.stops.find((s: any) => s.stationId === live.currentStationId);
      if (currentStn) {
        live.latitude = currentStn.stationLat || 0;
        live.longitude = currentStn.stationLon || 0;
      }
    }

    return {
      position: live,
      status: live.status || 'RUNNING',
      delayMinutes: live.delayMinutes,
      currentStationId: live.currentStationId,
      currentStationName: live.currentStationName,
      nextStationId: live.nextStationId,
      nextStationName: live.nextStationName,
      speedKph: live.speedKph,
      observedAt: live.observedAt,
    };
  }

  async getAnalytics(journeyId: string) {
    const { trainNumber, serviceDate } = parseJourneyId(journeyId);

    const runData = await this.railRadar.getRun(trainNumber, serviceDate);
    if (!runData) {
      throw new AppError('RUN_NOT_FOUND', `No run data found for train ${trainNumber}`, 404);
    }

    const live = await this.railRadar.getLivePosition(trainNumber);

    // Get elevation profile from halt stations that have coordinates
    const haltCoords = runData.stops
      .filter((s: any) => s.stationLat && s.stationLon)
      .map((s: any) => ({ latitude: s.stationLat, longitude: s.stationLon }));

    const elevationProfile = haltCoords.length >= 2
      ? await this.terrain.getElevationProfile(haltCoords)
      : [];

    // Map elevation profile to distance-based format
    const profileWithDistance = elevationProfile.map((ep: any, i: number) => ({
      distanceKm: runData.stops[i]?.distanceKm || i * 100,
      elevationM: ep.elevationM || ep.elevation || 0,
      stationCode: runData.stops[i]?.stationId || '',
      stationName: runData.stops[i]?.stationName || '',
    }));

    const totalDistanceKm = runData.stops[runData.stops.length - 1]?.distanceKm || 0;
    const delayMinutes = live?.delayMinutes || 0;

    const departedCount = runData.stops.filter((s: any) => s.status === 'departed').length;
    const currentStn = runData.stops.find((s: any) => s.status === 'at-station')
      || runData.stops[Math.max(0, departedCount - 1)];
    const coveredDistanceKm = currentStn?.distanceKm || 0;

    return {
      completionPercent: totalDistanceKm > 0
        ? Math.min(100, Math.round((coveredDistanceKm / totalDistanceKm) * 100))
        : 0,
      distanceCoveredKm: coveredDistanceKm,
      distanceRemainingKm: totalDistanceKm - coveredDistanceKm,
      delayMinutes,
      completedStations: departedCount,
      totalStations: runData.stops.length,
      elevationProfile: profileWithDistance,
      stationHistory: runData.stops.map((s: any) => ({
        stationCode: s.stationId,
        stationName: s.stationName,
        scheduledArrival: s.scheduledArrival,
        actualArrival: s.actualArrival,
        delayMinutes: s.delayMinutes,
        status: s.status,
        distanceKm: s.distanceKm,
      })),
      calculatedAt: new Date().toISOString(),
    };
  }

  async getWeather(journeyId: string) {
    const { trainNumber, serviceDate } = parseJourneyId(journeyId);

    const runData = await this.railRadar.getRun(trainNumber, serviceDate);
    if (!runData) {
      throw new AppError('RUN_NOT_FOUND', `No run data found for train ${trainNumber}`, 404);
    }

    const live = await this.railRadar.getLivePosition(trainNumber);

    const atStationStop = runData.stops.find((s: any) => s.status === 'at-station');
    const departedCount = runData.stops.filter((s: any) => s.status === 'departed').length;
    const currentStop = atStationStop || runData.stops[Math.max(0, departedCount - 1)] || runData.stops[0];
    const currentIdx = runData.stops.indexOf(currentStop);
    const nextStop = runData.stops[currentIdx + 1] || runData.stops[1];
    const destStop = runData.stops[runData.stops.length - 1];

    const [currentWeather, nextWeather, destWeather] = await Promise.all([
      currentStop?.stationLat != null
        ? this.weather.getCurrent(currentStop.stationLat!, currentStop.stationLon!)
        : null,
      nextStop?.stationLat != null
        ? this.weather.getForecast(nextStop.stationLat!, nextStop.stationLon!)
        : null,
      destStop?.stationLat != null
        ? this.weather.getForecast(destStop.stationLat!, destStop.stationLon!)
        : null,
    ]);

    return {
      currentStation: {
        code: currentStop?.stationId,
        name: currentStop?.stationName,
        weather: currentWeather,
      },
      nextStation: {
        code: nextStop?.stationId,
        name: nextStop?.stationName,
        weather: nextWeather,
      },
      destination: {
        code: destStop?.stationId,
        name: destStop?.stationName,
        weather: destWeather,
      },
      sampledAt: new Date().toISOString(),
    };
  }

  async getPois(journeyId: string, category?: any) {
    const { trainNumber, serviceDate } = parseJourneyId(journeyId);

    const runData = await this.railRadar.getRun(trainNumber, serviceDate);
    if (!runData) return [];

    // Build bounding box from all halt stops
    const lats = runData.stops.filter((s: any) => s.stationLat).map((s: any) => s.stationLat);
    const lons = runData.stops.filter((s: any) => s.stationLon).map((s: any) => s.stationLon);

    if (lats.length === 0) return [];

    const bbox = {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
    };

    return this.poi.searchNearby(bbox, category);
  }
}
