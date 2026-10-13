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
    const stops = runData.stops;
    const totalStops = stops.length;
    const totalDistanceKm = totalStops > 0 ? (stops[totalStops - 1]?.distanceKm || 0) : 0;

    // Count departed stops
    const departedCount = stops.filter((s: any) => s.status === 'departed').length;
    const atStationIdx = stops.findIndex((s: any) => s.status === 'at-station');

    const statusUpper = (runData.liveStatus || runData.run?.status || '').toUpperCase();
    const isCompleted = statusUpper === 'COMPLETED' || (totalStops > 0 && departedCount === totalStops);
    const isNotStarted = statusUpper === 'NOT_STARTED' || (departedCount === 0 && atStationIdx === -1);

    let currentStopIdx: number;
    let nextStopIdx: number;
    let coveredDistanceKm: number;
    let progressPercent: number;

    if (isCompleted) {
      currentStopIdx = Math.max(0, totalStops - 1);
      nextStopIdx = -1; // Completed journey: destination has no next station
      coveredDistanceKm = totalDistanceKm;
      progressPercent = 100;
    } else if (isNotStarted) {
      currentStopIdx = 0;
      nextStopIdx = totalStops > 1 ? 1 : -1;
      coveredDistanceKm = 0;
      progressPercent = 0;
    } else {
      currentStopIdx = atStationIdx !== -1 ? atStationIdx : Math.max(0, departedCount - 1);
      nextStopIdx = stops.findIndex((s: any, i: number) => i > currentStopIdx && s.status === 'upcoming');
      if (nextStopIdx === -1 && currentStopIdx < totalStops - 1) {
        nextStopIdx = currentStopIdx + 1;
      }
      const currentStop = stops[currentStopIdx];
      coveredDistanceKm = currentStop?.distanceKm || 0;
      progressPercent = totalDistanceKm > 0
        ? Math.min(100, Math.round((coveredDistanceKm / totalDistanceKm) * 100))
        : 0;
    }

    const completedStations = isCompleted ? totalStops : departedCount;
    const remainingDistanceKm = Math.max(0, totalDistanceKm - coveredDistanceKm);
    const delayMinutes = runData.isLive ? (live?.delayMinutes || 0) : 0;

    // Hydrate live lat/lng only if this is a verified live run
    let livePosition: typeof live | null = runData.isLive ? live : null;
    const currentStop = stops[currentStopIdx];
    if (livePosition && livePosition.latitude === 0 && livePosition.longitude === 0) {
      const allStops = runData.allStops || [];
      const matchStn = allStops.find((s: any) => (s.stationCode || s.station?.code) === livePosition?.currentStationId);
      if (matchStn && matchStn.station?.lat) {
        livePosition = {
          ...livePosition,
          latitude: matchStn.station.lat,
          longitude: matchStn.station.lng,
        };
      } else if (currentStop) {
        livePosition = {
          ...livePosition,
          latitude: currentStop.stationLat || 0,
          longitude: currentStop.stationLon || 0,
        };
      }
    }

    const startDate = (runData.run as any)?.startDate || (runData.run as any)?.serviceDate || serviceDate;

    return {
      journeyId,
      train: runData.train,
      startDate,
      run: {
        ...runData.run,
        startDate,
        status: runData.liveStatus || 'NO_LIVE_DATA',
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
        // observedAt is the time the provider last observed the train — null if not live
        observedAt: (runData.isLive && live?.observedAt && !live.observedAt.startsWith('1970')) ? live.observedAt : null,
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

    if (runData && !runData.isLive) {
      throw new AppError('LIVE_NOT_FOUND', `Live tracking is not active for train ${trainNumber} on service date ${serviceDate}`, 404);
    }

    if (runData && live.latitude === 0 && live.longitude === 0) {
      const allStops = runData.allStops || [];
      const matchStn = allStops.find((s: any) => (s.stationCode || s.station?.code) === live.currentStationId);
      if (matchStn && matchStn.station?.lat) {
        live.latitude = matchStn.station.lat;
        live.longitude = matchStn.station.lng;
      } else {
        const currentStn = runData.stops.find((s: any) => s.stationId === live.currentStationId);
        if (currentStn) {
          live.latitude = currentStn.stationLat || 0;
          live.longitude = currentStn.stationLon || 0;
        }
      }
    }

    return {
      position: live,
      status: live.status || 'NO_LIVE_DATA',
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

    // Get elevation profile from halt stations that have valid coordinates
    const validStops = runData.stops.filter((s: any) =>
      typeof s.stationLat === 'number' && typeof s.stationLon === 'number' &&
      isFinite(s.stationLat) && isFinite(s.stationLon) &&
      s.stationLat >= -90 && s.stationLat <= 90 &&
      s.stationLon >= -180 && s.stationLon <= 180
    );

    const haltCoords = validStops.map((s: any) => ({
      latitude: s.stationLat,
      longitude: s.stationLon,
    }));

    const elevationProfile = haltCoords.length >= 2
      ? await this.terrain.getElevationProfile(haltCoords)
      : [];

    // Map elevation profile to distance-based format matching actual station points
    const profileWithDistance = elevationProfile.map((ep: any) => {
      const matchStop = validStops.find((s: any) =>
        Math.abs(s.stationLat - ep.latitude) < 0.005 &&
        Math.abs(s.stationLon - ep.longitude) < 0.005
      );
      return {
        distanceKm: matchStop?.distanceKm ?? ep.distanceKm,
        elevationM: ep.elevationM,
        latitude: ep.latitude,
        longitude: ep.longitude,
        stationCode: matchStop?.stationId || '',
        stationName: matchStop?.stationName || '',
      };
    });

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

    const validStops = runData.stops.filter((s: any) => typeof s.stationLat === 'number' && typeof s.stationLon === 'number');
    const lats = validStops.map((s: any) => s.stationLat);
    const lons = validStops.map((s: any) => s.stationLon);

    if (lats.length === 0) return [];

    const bbox = {
      minLat: Math.min(...lats),
      maxLat: Math.max(...lats),
      minLon: Math.min(...lons),
      maxLon: Math.max(...lons),
    };

    const routePoints = validStops.map((s: any) => ({ latitude: s.stationLat, longitude: s.stationLon }));
    return this.poi.searchNearby(bbox, category, routePoints);
  }
}
