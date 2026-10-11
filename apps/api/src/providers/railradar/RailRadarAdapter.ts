import { Train, JourneyRun, LivePosition, TrainStop, JourneyStatus } from '@exprest/types';

export interface TrainProvider {
  search(query: string): Promise<Train[]>;
  getRun(trainNumber: string, serviceDate: string): Promise<{ train: Train; run: JourneyRun; stops: TrainStop[]; allStops: any[]; liveStatus: string; isLive: boolean } | null>;
  getLivePosition(trainNumber: string): Promise<LivePosition | null>;
  getRouteGeometry(trainNumber: string): Promise<{ type: 'LineString'; coordinates: [number, number][] } | null>;
}

const BASE_URL = 'https://railradar.in/api/v1';

export class RailRadarAdapter implements TrainProvider {
  private apiKey = process.env.RAILRADAR_API_KEY!;
  private trainCoordsCache = new Map<string, Map<string, { lat: number; lng: number }>>();

  private get headers() {
    const key = (process.env.RAILRADAR_API_KEY || '').trim().replace(/['"]/g, '');
    if (!key) {
      throw new Error('Missing RAILRADAR_API_KEY environment variable. Please configure it in your backend environment.');
    }
    return {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }

  private buildUrl(targetUrl: string): string {
    const scraperKey = process.env.SCRAPER_API_KEY;
    if (scraperKey) {
      return `http://api.scraperapi.com?api_key=${scraperKey}&url=${encodeURIComponent(targetUrl)}&keep_headers=true`;
    }
    return targetUrl;
  }

  private async getCoordsForTrain(trainNumber: string): Promise<Map<string, { lat: number; lng: number }>> {
    const cached = this.trainCoordsCache.get(trainNumber);
    if (cached && cached.size > 0) return cached;

    try {
      const res = await fetch(
        this.buildUrl(`${BASE_URL}/trains/${trainNumber}`),
        { headers: this.headers, signal: AbortSignal.timeout(10_000) }
      );
      if (res.ok) {
        const json = await res.json();
        const stopsRaw: any[] = json?.data?.route || json?.data?.stops || [];
        const map = new Map<string, { lat: number; lng: number }>();
        for (const s of stopsRaw) {
          const code = s.station?.code || s.stationCode;
          if (code && typeof s.station?.lat === 'number') {
            map.set(code, { lat: s.station.lat, lng: s.station.lng });
          }
        }
        this.trainCoordsCache.set(trainNumber, map);
        return map;
      }
    } catch (err) {
      console.warn(`RailRadar getCoordsForTrain error for ${trainNumber}:`, err);
    }
    return new Map();
  }

  async search(query: string): Promise<Train[]> {
    const q = query.trim();
    if (!q) return [];

    try {
      const res = await fetch(
        this.buildUrl(`${BASE_URL}/lookup/search/trains?q=${encodeURIComponent(q)}`),
        { headers: this.headers, signal: AbortSignal.timeout(10_000) }
      );

      if (res.ok) {
        const json = await res.json();
        const items: any[] = json?.data || [];
        if (items.length > 0) {
          return items.map((item) => ({
            id: `TRN_${item.number}`,
            number: item.number,
            name: item.name,
            originStationId: item.source || '',
            destinationStationId: item.dest || '',
            originStationName: item.sourceName || '',
            destinationStationName: item.destName || '',
            type: item.type || '',
            sourceProvider: 'RailRadar',
            providerTrainId: item.number,
            routeVersion: 'v1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }));
        }
      } else {
        console.warn(`RailRadar search API returned status: ${res.status}`);
      }

      // Fallback for 5-digit train numbers if lookup search returned empty results
      if (/^\d{5}$/.test(q)) {
        try {
          const trainRes = await fetch(
            this.buildUrl(`${BASE_URL}/trains/${q}`),
            { headers: this.headers, signal: AbortSignal.timeout(10_000) }
          );
          if (trainRes.ok) {
            const trainJson = await trainRes.json();
            const tData = trainJson?.data;
            const trainInfo = tData?.train || tData;
            const stops: any[] = tData?.route || tData?.stops || [];
            const origin = stops[0];
            const dest = stops[stops.length - 1];

            // Validate provider response before constructing a train result
            const hasValidName = typeof trainInfo?.name === 'string' && trainInfo.name.trim().length > 0;
            const hasValidNumber = Boolean(trainInfo?.number && String(trainInfo.number) === q);
            const hasValidStops = Array.isArray(stops) && stops.length > 0;

            if (trainInfo && (hasValidName || (hasValidNumber && hasValidStops))) {
              return [{
                id: `TRN_${q}`,
                number: q,
                name: hasValidName ? trainInfo.name.trim() : (trainInfo.number ? `Train ${trainInfo.number}` : `Train ${q}`),
                originStationId: origin?.station?.code || origin?.stationCode || trainInfo?.source || '',
                destinationStationId: dest?.station?.code || dest?.stationCode || trainInfo?.dest || '',
                originStationName: origin?.station?.name || origin?.stationName || trainInfo?.sourceName || '',
                destinationStationName: dest?.station?.name || dest?.stationName || trainInfo?.destName || '',
                type: trainInfo?.type || 'Express',
                sourceProvider: 'RailRadar',
                providerTrainId: q,
                routeVersion: 'v1',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              }];
            }
          }
        } catch (fallbackErr) {
          console.warn(`RailRadar 5-digit fallback error for ${q}:`, fallbackErr);
        }
      }
    } catch (err) {
      console.error('RailRadar search API error:', err);
    }

    return [];
  }

  async getRun(trainNumber: string, serviceDate: string): Promise<{ train: Train; run: JourneyRun; stops: TrainStop[]; allStops: any[]; liveStatus: string; isLive: boolean } | null> {
    let liveData: any = null;
    try {
      // PRIMARY: use /live which has real-time status, actualArrival, actualDeparture, delays per stop
      const liveRes = await fetch(
        this.buildUrl(`${BASE_URL}/trains/${trainNumber}/live`),
        { headers: this.headers, signal: AbortSignal.timeout(10_000) }
      );

      if (liveRes.ok) {
        const liveJson = await liveRes.json();
        liveData = liveJson?.data;
      }
    } catch (err) {
      console.warn(`RailRadar live fetch error for train ${trainNumber}:`, err);
    }

    // FALLBACK / STATIC: use schedule endpoint
    let staticData: any = null;
    try {
      const staticRes = await fetch(
        this.buildUrl(`${BASE_URL}/trains/${trainNumber}`),
        { headers: this.headers, signal: AbortSignal.timeout(10_000) }
      );

      if (staticRes.ok) {
        const staticJson = await staticRes.json();
        staticData = staticJson?.data;
      }
    } catch (err) {
      console.warn(`RailRadar static fetch error for train ${trainNumber}:`, err);
    }

    if (!staticData && !liveData) return null;

    // Determine the authoritative route array:
    // Live route has real-time statuses (departed/at-station/upcoming), actual times, delays
    // Static route has station coordinates (lat/lng)
    const liveRoute: any[] = liveData?.route || [];
    const staticRoute: any[] = staticData?.route || staticData?.stops || [];

    // Build a coordinate map from static data for hydration
    const coordMap = new Map<string, { lat: number; lng: number }>();
    for (const s of staticRoute) {
      const code = s.station?.code || s.stationCode;
      if (code && typeof s.station?.lat === 'number') {
        coordMap.set(code, { lat: s.station.lat, lng: s.station.lng });
      }
    }
    this.trainCoordsCache.set(trainNumber, coordMap);

    // Extract real-time startDate from liveData or origin scheduled departure ISO string
    const originStopCandidate = (liveRoute.length > 0 ? liveRoute : staticRoute).find((s: any) => s.isHalt) || (liveRoute.length > 0 ? liveRoute[0] : staticRoute[0]);
    const originScheduledDep = originStopCandidate?.scheduledDeparture;
    const originDateFromDep = (typeof originScheduledDep === 'string' && originScheduledDep.includes('T'))
      ? originScheduledDep.split('T')[0]
      : null;
    const liveStartDate = liveData?.startDate || originDateFromDep;

    // For multi-day train runs in India (e.g. overnight Rajdhani running across dates):
    // Determine the arrival date at the destination stop
    const lastLiveStop = liveRoute.length > 0 ? liveRoute[liveRoute.length - 1] : null;
    const destArrival = lastLiveStop?.scheduledArrival || lastLiveStop?.actualArrival;
    const liveEndDate = (typeof destArrival === 'string' && destArrival.includes('T'))
      ? destArrival.split('T')[0]
      : liveStartDate;

    const todayDate = new Date().toISOString().split('T')[0];
    let isDateMatching = false;
    if (!serviceDate) {
      isDateMatching = true;
    } else if (serviceDate === liveStartDate) {
      isDateMatching = true;
    } else if (liveData && (liveData.isLive !== false || liveData.status === 'running')) {
      if (liveStartDate && liveEndDate && serviceDate >= liveStartDate && serviceDate <= liveEndDate) {
        isDateMatching = true;
      } else if (serviceDate === todayDate && (liveData.isLive !== false || liveData.status === 'running')) {
        isDateMatching = true;
      }
    }

    const isLive = Boolean(liveData && liveData.isLive !== false && isDateMatching);
    const activeLiveData = isDateMatching ? liveData : null;

    // Use live route as authoritative only if it is for the matching live date
    // Hydrate coordinates for each stop in authorRoute from coordMap
    const baseRoute: any[] = (isLive && liveRoute.length > 0) ? liveRoute : staticRoute;
    const authorRoute = baseRoute.map((s: any) => {
      const code = s.stationCode || s.station?.code;
      const coords = coordMap.get(code);
      return {
        ...s,
        stationCode: code,
        station: {
          code,
          name: s.stationName || s.station?.name || '',
          lat: coords?.lat || s.station?.lat || 0,
          lng: coords?.lng || s.station?.lng || 0,
        },
      };
    });

    // All halt stops with live data merged
    const haltStops = authorRoute.filter((s: any) => s.isHalt);
    const stopsToUse = haltStops.length > 0 ? haltStops : authorRoute;

    const trainInfo = activeLiveData?.train || staticData?.train || staticData || {};
    const originStop = stopsToUse[0];
    const destStop = stopsToUse[stopsToUse.length - 1];

    const actualStartDate = serviceDate || liveStartDate || todayDate;

    const train: Train = {
      id: `TRN_${trainNumber}`,
      number: trainNumber,
      name: trainInfo.name || `Train ${trainNumber}`,
      originStationId: originStop?.stationCode || originStop?.station?.code || '',
      destinationStationId: destStop?.stationCode || destStop?.station?.code || '',
      originStationName: originStop?.stationName || originStop?.station?.name || '',
      destinationStationName: destStop?.stationName || destStop?.station?.name || '',
      sourceProvider: 'RailRadar',
      providerTrainId: trainNumber,
      routeVersion: 'v1',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any;

    let fallbackStatus: JourneyStatus = 'NO_LIVE_DATA';
    if (!isLive) {
      if (serviceDate && serviceDate < todayDate) {
        fallbackStatus = 'COMPLETED';
      } else if (serviceDate && serviceDate > todayDate) {
        fallbackStatus = 'NOT_STARTED';
      }
    }

    const liveStatusRaw = (activeLiveData?.status || '').toUpperCase();
    const liveStatus: JourneyStatus = isLive
      ? (liveStatusRaw === 'RUNNING' || liveStatusRaw === 'ON_TIME' || liveStatusRaw === 'DELAYED' || liveStatusRaw === 'COMPLETED' || liveStatusRaw === 'CANCELLED' || liveStatusRaw === 'NOT_STARTED'
          ? liveStatusRaw as JourneyStatus
          : 'RUNNING')
      : fallbackStatus;

    const run: JourneyRun = {
      id: `journey_${trainNumber}_${actualStartDate}`,
      trainId: train.id,
      serviceDate: actualStartDate,
      startDate: liveStartDate || actualStartDate,
      originStationId: train.originStationId,
      destinationStationId: train.destinationStationId,
      status: liveStatus,
      startedAt: `${liveStartDate || actualStartDate}T00:00:00Z`,
      completedAt: liveStatus === 'COMPLETED' ? `${actualStartDate}T23:59:59Z` : null,
      observedAt: activeLiveData?.lastUpdatedAt || new Date().toISOString(),
      delayMinutes: isLive ? (activeLiveData?.delayMinutes || 0) : 0,
    } as any;

    // Build stops from the route
    const stops: TrainStop[] = stopsToUse.map((s: any, i: number) => {
      const code = s.stationCode || s.station?.code;
      const coords = coordMap.get(code);
      
      const scheduledArr = s.scheduledArrival || (s.arrival ? `${actualStartDate}T${s.arrival}:00+05:30` : null);
      const scheduledDep = s.scheduledDeparture || (s.departure ? `${actualStartDate}T${s.departure}:00+05:30` : null);
      
      const defaultStopStatus = fallbackStatus === 'COMPLETED' ? 'departed' : 'upcoming';

      return {
        stationId: code,
        stationName: s.stationName || s.station?.name,
        stationLat: coords?.lat || s.station?.lat || null,
        stationLon: coords?.lng || s.station?.lng || null,
        sequence: s.sequence || i + 1,
        scheduledArrival: scheduledArr,
        scheduledDeparture: scheduledDep,
        actualArrival: isLive ? (s.actualArrival || null) : null,
        actualDeparture: isLive ? (s.actualDeparture || null) : null,
        delayMinutes: isLive ? (s.delayArrival ?? s.delayDeparture ?? 0) : null,
        distanceKm: s.distance || 0,
        platform: s.platform || null,
        status: isLive ? (s.status || 'upcoming') : defaultStopStatus,
      };
    });

    return {
      train,
      run,
      stops,
      allStops: authorRoute,
      liveStatus,
      isLive,
    };
  }

  async getLivePosition(trainNumber: string): Promise<LivePosition | null> {
    try {
      const res = await fetch(
        this.buildUrl(`${BASE_URL}/trains/${trainNumber}/live`),
        { headers: this.headers, signal: AbortSignal.timeout(10_000) }
      );

      if (!res.ok) return null;

      const json = await res.json();
      const d = json?.data;
      if (!d) return null;

      // Current position from telemetry
      const currentLoc = d.currentLocation || {};
      const nextHalt = d.nextHalt || {};

      // Hydrate coords from the route array or from cached train coords
      const routeStop = (d.route || []).find((s: any) => s.stationCode === currentLoc.stationCode);
      let lat = routeStop?.station?.lat || 0;
      let lng = routeStop?.station?.lng || 0;

      if ((lat === 0 && lng === 0) && currentLoc.stationCode) {
        const coordsMap = await this.getCoordsForTrain(trainNumber);
        const coords = coordsMap.get(currentLoc.stationCode);
        if (coords) {
          lat = coords.lat;
          lng = coords.lng;
        }
      }

      const statusRaw = (d.status || currentLoc.status || 'RUNNING').toUpperCase();

      return {
        latitude: lat,
        longitude: lng,
        heading: 0,
        speedKph: currentLoc.speedKmh || d.speedKmh || 0,
        currentStationId: currentLoc.stationCode || '',
        currentStationName: currentLoc.stationName || '',
        nextStationId: nextHalt.stationCode || '',
        nextStationName: nextHalt.stationName || '',
        delayMinutes: d.delayMinutes ?? currentLoc.delayMinutes ?? 0,
        status: statusRaw,
        startDate: d.startDate || undefined,
        observedAt: d.lastUpdatedAt || new Date().toISOString(),
      };
    } catch (err) {
      console.warn(`RailRadar getLivePosition error for ${trainNumber}:`, err);
      return null;
    }
  }

  async getRouteGeometry(trainNumber: string): Promise<{ type: 'LineString'; coordinates: [number, number][] } | null> {
    try {
      // Use the static schedule endpoint which has lat/lng for every stop
      const res = await fetch(
        this.buildUrl(`${BASE_URL}/trains/${trainNumber}`),
        { headers: this.headers, signal: AbortSignal.timeout(10_000) }
      );

      if (!res.ok) return null;

      const json = await res.json();
      const stopsRaw: any[] = json?.data?.route || json?.data?.stops || [];

      // Filter stops that have coordinates
      const coords: [number, number][] = stopsRaw
        .filter((s: any) => s.station?.lat && s.station?.lng)
        .map((s: any) => [s.station.lng, s.station.lat] as [number, number]);

      if (coords.length < 2) return null;

      return { type: 'LineString', coordinates: coords };
    } catch (err) {
      console.warn(`RailRadar getRouteGeometry error for ${trainNumber}:`, err);
      return null;
    }
  }
}
