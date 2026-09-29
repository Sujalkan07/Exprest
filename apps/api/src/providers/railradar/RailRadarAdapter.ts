import { Train, JourneyRun, LivePosition, TrainStop } from '@exprest/types';

export interface TrainProvider {
  search(query: string): Promise<Train[]>;
  getRun(trainNumber: string, serviceDate: string): Promise<{ train: Train; run: JourneyRun; stops: TrainStop[]; allStops: any[]; liveStatus: string; isLive: boolean } | null>;
  getLivePosition(trainNumber: string): Promise<LivePosition | null>;
  getRouteGeometry(trainNumber: string): Promise<{ type: 'LineString'; coordinates: [number, number][] } | null>;
}

const BASE_URL = 'https://railradar.in/api/v1';

export class RailRadarAdapter implements TrainProvider {
  private apiKey = process.env.RAILRADAR_API_KEY!;

  private get headers() {
    const key = (process.env.RAILRADAR_API_KEY || 'rg_c8e0a13b5f5442ddb02279a187144e7b').trim().replace(/['"]/g, '');
    return {
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    };
  }

  async search(query: string): Promise<Train[]> {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    try {
      const res = await fetch(
        `${BASE_URL}/lookup/search/trains?q=${encodeURIComponent(query.trim())}`,
        { headers: this.headers }
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
      }
    } catch (err) {
      console.warn('RailRadar search API error, falling back to local dataset:', err);
    }

    // Curated fallback trains for popular searches (e.g. 12951, 12864, 12002, Rajdhani, Express, etc.)
    const FALLBACK_TRAINS: Train[] = [
      {
        id: 'TRN_12951',
        number: '12951',
        name: 'Mumbai Central - New Delhi Tejas Rajdhani Express',
        originStationId: 'MMCT',
        originStationName: 'Mumbai Central',
        destinationStationId: 'NDLS',
        destinationStationName: 'New Delhi',
        type: 'Rajdhani Express',
        sourceProvider: 'RailRadar',
        providerTrainId: '12951',
        routeVersion: 'v1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'TRN_12864',
        number: '12864',
        name: 'Sir M. Visvesvaraya Terminal - Howrah SF Express',
        originStationId: 'SMVB',
        originStationName: 'Sir M. Visvesvaraya Terminal Bengaluru',
        destinationStationId: 'HWH',
        destinationStationName: 'Howrah Junction',
        type: 'Superfast Express',
        sourceProvider: 'RailRadar',
        providerTrainId: '12864',
        routeVersion: 'v1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'TRN_12002',
        number: '12002',
        name: 'New Delhi - Rani Kamlapati Shatabdi Express',
        originStationId: 'NDLS',
        originStationName: 'New Delhi',
        destinationStationId: 'RKMP',
        destinationStationName: 'Rani Kamlapati',
        type: 'Shatabdi Express',
        sourceProvider: 'RailRadar',
        providerTrainId: '12002',
        routeVersion: 'v1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'TRN_22436',
        number: '22436',
        name: 'New Delhi - Varanasi Vande Bharat Express',
        originStationId: 'NDLS',
        originStationName: 'New Delhi',
        destinationStationId: 'BSB',
        destinationStationName: 'Varanasi Junction',
        type: 'Vande Bharat',
        sourceProvider: 'RailRadar',
        providerTrainId: '22436',
        routeVersion: 'v1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      {
        id: 'TRN_12424',
        number: '12424',
        name: 'New Delhi - Dibrugarh Rajdhani Express',
        originStationId: 'NDLS',
        originStationName: 'New Delhi',
        destinationStationId: 'DBRG',
        destinationStationName: 'Dibrugarh',
        type: 'Rajdhani Express',
        sourceProvider: 'RailRadar',
        providerTrainId: '12424',
        routeVersion: 'v1',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ];

    return FALLBACK_TRAINS.filter(
      (t) =>
        t.number.includes(q) ||
        t.name.toLowerCase().includes(q) ||
        (t.originStationName && t.originStationName.toLowerCase().includes(q)) ||
        (t.destinationStationName && t.destinationStationName.toLowerCase().includes(q))
    );
  }

  async getRun(trainNumber: string, serviceDate: string): Promise<{ train: Train; run: JourneyRun; stops: TrainStop[]; allStops: any[]; liveStatus: string; isLive: boolean } | null> {
    // PRIMARY: use /live which has real-time status, actualArrival, actualDeparture, delays per stop
    const liveRes = await fetch(
      `${BASE_URL}/trains/${trainNumber}/live`,
      { headers: this.headers }
    );

    let liveData: any = null;
    if (liveRes.ok) {
      const liveJson = await liveRes.json();
      liveData = liveJson?.data;
    }

    // FALLBACK: use static schedule if live fails
    const staticRes = await fetch(
      `${BASE_URL}/trains/${trainNumber}`,
      { headers: this.headers }
    );

    if (!staticRes.ok && !liveData) return null;

    let staticData: any = null;
    if (staticRes.ok) {
      const staticJson = await staticRes.json();
      staticData = staticJson?.data;
    }

    // Determine the authoritative route array:
    // Live route has real-time statuses (departed/at-station/upcoming), actual times, delays
    // Static route has station coordinates (lat/lng)
    const liveRoute: any[] = liveData?.route || [];
    const staticRoute: any[] = staticData?.route || staticData?.stops || [];

    // Build a coordinate map from static data for hydration
    const coordMap = new Map<string, { lat: number; lng: number }>();
    for (const s of staticRoute) {
      const code = s.station?.code || s.stationCode;
      if (code && s.station?.lat) {
        coordMap.set(code, { lat: s.station.lat, lng: s.station.lng });
      }
    }

    // Use live route as authoritative, fallback to static
    const authorRoute: any[] = liveRoute.length > 0 ? liveRoute : staticRoute;

    // All halt stops with live data merged
    const haltStops = authorRoute.filter((s: any) => s.isHalt);

    const trainInfo = liveData?.train || staticData?.train || staticData || {};
    const originStop = haltStops[0];
    const destStop = haltStops[haltStops.length - 1];

    // Extract real-time startDate from liveData or origin scheduled departure ISO string
    const originScheduledDep = originStop?.scheduledDeparture;
    const originDateFromDep = (typeof originScheduledDep === 'string' && originScheduledDep.includes('T'))
      ? originScheduledDep.split('T')[0]
      : null;
    const actualStartDate = liveData?.startDate || originDateFromDep || serviceDate;

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

    const run: JourneyRun = {
      id: `journey_${trainNumber}_${serviceDate}`,
      trainId: train.id,
      serviceDate: actualStartDate,
      startDate: actualStartDate,
      originStationId: train.originStationId,
      destinationStationId: train.destinationStationId,
      status: liveData?.status || 'RUNNING',
      startedAt: `${actualStartDate}T00:00:00Z`,
      completedAt: null,
      observedAt: liveData?.lastUpdatedAt || new Date().toISOString(),
    } as any;

    // Build stops from the live route (which has status, actual times, delays)
    const stops: TrainStop[] = haltStops.map((s: any, i: number) => {
      const code = s.stationCode || s.station?.code;
      const coords = coordMap.get(code);
      
      // Time values come directly from live API (already full ISO strings)
      const scheduledArr = s.scheduledArrival || (s.arrival ? `${actualStartDate}T${s.arrival}:00+05:30` : null);
      const scheduledDep = s.scheduledDeparture || (s.departure ? `${actualStartDate}T${s.departure}:00+05:30` : null);
      
      return {
        stationId: code,
        stationName: s.stationName || s.station?.name,
        stationLat: coords?.lat || s.station?.lat || null,
        stationLon: coords?.lng || s.station?.lng || null,
        sequence: s.sequence || i + 1,
        scheduledArrival: scheduledArr,
        scheduledDeparture: scheduledDep,
        actualArrival: s.actualArrival || null,
        actualDeparture: s.actualDeparture || null,
        delayMinutes: s.delayArrival ?? s.delayDeparture ?? 0,
        distanceKm: s.distance || 0,
        platform: s.platform || null,
        status: s.status || 'upcoming',   // 'departed' | 'at-station' | 'upcoming'
      };
    });

    return {
      train,
      run,
      stops,
      allStops: authorRoute,
      liveStatus: liveData?.status || 'unknown',
      isLive: liveData?.isLive || false,
    };
  }

  async getLivePosition(trainNumber: string): Promise<LivePosition | null> {
    const res = await fetch(
      `${BASE_URL}/trains/${trainNumber}/live`,
      { headers: this.headers }
    );

    if (!res.ok) return null;

    const json = await res.json();
    const d = json?.data;
    if (!d) return null;

    // Current position from telemetry
    const currentLoc = d.currentLocation || {};
    const nextHalt = d.nextHalt || {};

    // Hydrate coords from the route array
    const routeStop = (d.route || []).find((s: any) => s.stationCode === currentLoc.stationCode);

    return {
      latitude: routeStop?.station?.lat || 0,
      longitude: routeStop?.station?.lng || 0,
      heading: 0,
      speedKph: currentLoc.speedKmh || d.speedKmh || 0,
      currentStationId: currentLoc.stationCode || '',
      currentStationName: currentLoc.stationName || '',
      nextStationId: nextHalt.stationCode || '',
      nextStationName: nextHalt.stationName || '',
      delayMinutes: d.delayMinutes ?? currentLoc.delayMinutes ?? 0,
      status: d.status || currentLoc.status || 'RUNNING',
      startDate: d.startDate || undefined,
      observedAt: d.lastUpdatedAt || new Date().toISOString(),
    };
  }

  async getRouteGeometry(trainNumber: string): Promise<{ type: 'LineString'; coordinates: [number, number][] } | null> {
    // Use the static schedule endpoint which has lat/lng for every stop
    const res = await fetch(
      `${BASE_URL}/trains/${trainNumber}`,
      { headers: this.headers }
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
  }
}
