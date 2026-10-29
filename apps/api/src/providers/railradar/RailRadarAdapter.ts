import { Train, JourneyRun, LivePosition, TrainStop, JourneyStatus, PnrStatusResult, PassengerStatus, CoachRakeItem, PnrLiveTrainStatus, StationInfo, AvailabilityCategory } from '@exprest/types';
import { AppError } from '../../common/errors/AppError.js';

export interface TrainProvider {
  search(query: string): Promise<Train[]>;
  searchStations(query: string): Promise<StationInfo[]>;
  getTrainsBetween(from: string, to: string, options?: { byCity?: boolean; date?: string; live?: boolean }): Promise<any>;
  getTrainDetails(trainNumber: string): Promise<any>;
  getRun(trainNumber: string, serviceDate: string): Promise<{ train: Train; run: JourneyRun; stops: TrainStop[]; allStops: any[]; liveStatus: string; isLive: boolean } | null>;
  getLivePosition(trainNumber: string): Promise<LivePosition | null>;
  getRouteGeometry(trainNumber: string): Promise<{ type: 'LineString'; coordinates: [number, number][] } | null>;
  getPnrStatus(pnr: string): Promise<PnrStatusResult>;
  getTrainFare(trainNumber: string, fromStation: string, toStation: string, journeyDate?: string, classCode?: string, quota?: string): Promise<any>;
  getSeatAvailability(trainNumber: string, fromStation: string, toStation: string, journeyDate: string, classCode?: string, quota?: string): Promise<any>;
}

const BASE_URL = 'https://railradar.in/api/v1';

export class RailRadarAdapter implements TrainProvider {
  private trainCoordsCache = new Map<string, Map<string, { lat: number; lng: number }>>();

  /**
   * Redacts sensitive API keys from strings, URLs, and diagnostic logs.
   */
  static redactCredentials(text: string): string {
    return text.replace(/api_key=[^& \t\r\n]+/gi, 'api_key=[REDACTED]');
  }

  /**
   * Builds the request URL directly to the upstream RailRadar provider.
   */
  static buildUrl(targetUrl: string): string {
    return targetUrl;
  }

  private buildUrl(targetUrl: string): string {
    return RailRadarAdapter.buildUrl(targetUrl);
  }

  private sanitizeError(err: unknown): string {
    if (err instanceof Error) {
      return RailRadarAdapter.redactCredentials(err.message);
    }
    return RailRadarAdapter.redactCredentials(String(err));
  }

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
      console.warn(`RailRadar getCoordsForTrain error for ${trainNumber}:`, this.sanitizeError(err));
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
          console.warn(`RailRadar 5-digit fallback error for ${q}:`, this.sanitizeError(fallbackErr));
        }
      }
    } catch (err) {
      console.error('RailRadar search API error:', this.sanitizeError(err));
    }

    return [];
  }

  async searchStations(query: string): Promise<StationInfo[]> {
    const q = query.trim();
    if (!q) return [];

    try {
      const res = await fetch(
        this.buildUrl(`${BASE_URL}/stations/search?q=${encodeURIComponent(q)}`),
        { headers: this.headers, signal: AbortSignal.timeout(8_000) }
      );

      if (res.ok) {
        const json = await res.json();
        const items: any[] = json?.data || [];
        if (Array.isArray(items) && items.length > 0) {
          const seen = new Set<string>();
          const results: StationInfo[] = [];
          for (const item of items) {
            const code = (item.code || '').trim().toUpperCase();
            if (!code || seen.has(code)) continue;
            seen.add(code);
            results.push({
              code,
              name: item.name || code,
              city: item.city || null,
              state: item.state || null,
              lat: typeof item.lat === 'number' ? item.lat : null,
              lng: typeof item.lng === 'number' ? item.lng : null,
            });
          }
          return results;
        }
      } else {
        console.warn(`RailRadar searchStations API returned status: ${res.status}`);
      }
    } catch (err) {
      console.error('RailRadar searchStations API error:', this.sanitizeError(err));
    }

    return [];
  }

  async getTrainsBetween(
    from: string,
    to: string,
    options?: { byCity?: boolean; date?: string; live?: boolean }
  ): Promise<any> {
    const cleanFrom = from.trim().toUpperCase();
    const cleanTo = to.trim().toUpperCase();
    if (!cleanFrom || !cleanTo) {
      return { from: { code: cleanFrom, name: cleanFrom }, to: { code: cleanTo, name: cleanTo }, trains: [], count: 0 };
    }

    const byCity = options?.byCity !== false;
    let url = `${BASE_URL}/trains/between/${encodeURIComponent(cleanFrom)}/${encodeURIComponent(cleanTo)}?byCity=${byCity ? 'true' : 'false'}`;
    if (options?.date) {
      url += `&date=${encodeURIComponent(options.date)}`;
    }
    if (options?.live) {
      url += `&live=true`;
    }

    try {
      const res = await fetch(this.buildUrl(url), {
        headers: this.headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const json = await res.json();
        return json?.data || { from: { code: cleanFrom, name: cleanFrom }, to: { code: cleanTo, name: cleanTo }, trains: [], count: 0 };
      } else {
        console.warn(`RailRadar getTrainsBetween (${cleanFrom} -> ${cleanTo}) returned status: ${res.status}`);
      }
    } catch (err) {
      console.error(`RailRadar getTrainsBetween (${cleanFrom} -> ${cleanTo}) API error:`, this.sanitizeError(err));
    }

    return { from: { code: cleanFrom, name: cleanFrom }, to: { code: cleanTo, name: cleanTo }, trains: [], count: 0 };
  }

  async getTrainDetails(trainNumber: string): Promise<any> {
    const cleanNum = trainNumber.trim().replace(/\D/g, '');
    if (!cleanNum) return null;

    try {
      const res = await fetch(this.buildUrl(`${BASE_URL}/trains/${cleanNum}`), {
        headers: this.headers,
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const json = await res.json();
        return json?.data || null;
      }
    } catch (err) {
      console.warn(`RailRadar getTrainDetails (${cleanNum}) error:`, this.sanitizeError(err));
    }
    return null;
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
      } else {
        console.warn(`RailRadar live fetch returned status: ${liveRes.status} for train ${trainNumber}`);
      }
    } catch (err) {
      console.warn(`RailRadar live fetch error for train ${trainNumber}:`, this.sanitizeError(err));
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
      } else {
        console.warn(`RailRadar static fetch returned status: ${staticRes.status} for train ${trainNumber}`);
      }
    } catch (err) {
      console.warn(`RailRadar static fetch error for train ${trainNumber}:`, this.sanitizeError(err));
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

    // IST date: use Asia/Kolkata timezone — UTC date can differ around midnight IST
    const todayDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
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

    // Map raw provider status to canonical JourneyStatus — never default to RUNNING
    // RailRadar returns lowercase: 'running', 'not-started' etc. — toUpperCase normalises them
    // 'NOT-STARTED' (hyphen) → 'NOT-STARTED'.toUpperCase() which we also handle here
    const liveStatusRaw = (activeLiveData?.status || '').toUpperCase().replace(/-/g, '_');
    const KNOWN_LIVE_STATUSES: Record<string, JourneyStatus> = {
      RUNNING: 'RUNNING',
      ON_TIME: 'ON_TIME',
      DELAYED: 'DELAYED',
      COMPLETED: 'COMPLETED',
      CANCELLED: 'CANCELLED',
      NOT_STARTED: 'NOT_STARTED',
    };
    const liveStatus: JourneyStatus = isLive
      ? (KNOWN_LIVE_STATUSES[liveStatusRaw] ?? 'NO_LIVE_DATA')
      : fallbackStatus;

    const run: JourneyRun = {
      id: `journey_${trainNumber}_${actualStartDate}`,
      trainId: train.id,
      serviceDate: actualStartDate,
      startDate: liveStartDate || actualStartDate,
      originStationId: train.originStationId,
      destinationStationId: train.destinationStationId,
      status: liveStatus,
      startedAt: liveStatus !== 'NOT_STARTED'
        ? (originStop?.actualDeparture || originStop?.scheduledDeparture || (originStop?.departure ? `${actualStartDate}T${originStop.departure}:00+05:30` : null))
        : null,
      completedAt: liveStatus === 'COMPLETED'
        ? (destStop?.actualArrival || destStop?.scheduledArrival || (destStop?.arrival ? `${actualStartDate}T${destStop.arrival}:00+05:30` : null))
        : null,
      observedAt: activeLiveData?.lastUpdatedAt || null,
      delayMinutes: (activeLiveData && typeof activeLiveData.delayMinutes === 'number') ? activeLiveData.delayMinutes : undefined,
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

      // Normalise provider status — RailRadar returns lowercase, hyphens in 'not-started'
      const statusRaw = (d.status || currentLoc.status || '').toUpperCase().replace(/-/g, '_') || 'NO_LIVE_DATA';

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
        observedAt: d.lastUpdatedAt || null,
      };
    } catch (err) {
      console.warn(`RailRadar getLivePosition error for ${trainNumber}:`, this.sanitizeError(err));
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
      console.warn(`RailRadar getRouteGeometry error for ${trainNumber}:`, this.sanitizeError(err));
      return null;
    }
  }

  /**
   * Normalizes an Indian Railways class name or code into standard code (1A, 2A, 3A, 3E, CC, EC, SL, 2S).
   */
  static normalizeClassCode(rawClass?: string | null): string {
    if (!rawClass) return '3A';
    const c = String(rawClass).toUpperCase().trim();
    if (c.includes('1A') || c.includes('FIRST AC') || c.includes('1ST AC')) return '1A';
    if (c.includes('2A') || c.includes('SECOND AC') || c.includes('2ND AC')) return '2A';
    if (c.includes('3A') || c.includes('THIRD AC') || c.includes('3RD AC') || c.includes('3 TIER')) return '3A';
    if (c.includes('3E') || c.includes('ECONOMY')) return '3E';
    if (c.includes('EC') || c.includes('EXECUTIVE')) return 'EC';
    if (c.includes('CC') || c.includes('CHAIR')) return 'CC';
    if (c.includes('SL') || c.includes('SLEEPER')) return 'SL';
    if (c.includes('2S') || c.includes('SECOND SEAT')) return '2S';
    const match = c.match(/([123]A|3E|CC|EC|SL|2S)/);
    if (match) return match[1];
    return '3A';
  }

  /**
   * Sanitizes raw string/number values from upstream railway APIs.
   * Converts empty strings and common placeholder values ('-', 'NA', 'NONE', '0', etc.) to null.
   */
  static sanitizeRawValue(val: unknown): string | null {
    if (val == null) return null;
    const str = String(val).trim();
    if (!str) return null;
    const upper = str.toUpperCase();
    if (['-', '--', '0', 'NA', 'N/A', 'N.A.', 'NONE', 'NULL', 'NIL', 'UNDEF'].includes(upper)) {
      return null;
    }
    return str;
  }

  /**
   * Normalizes an Indian Railways coach code (e.g. 'b-4' -> 'B4', 'S-02' -> 'S2', 'B 4' -> 'B4').
   */
  static normalizeCoachCode(val: unknown): string | null {
    const sanitized = RailRadarAdapter.sanitizeRawValue(val);
    if (!sanitized) return null;
    let clean = sanitized.toUpperCase().replace(/\s+/g, '').replace(/-/g, '');
    clean = clean.replace(/^([A-Z]+)0+([1-9][0-9]*)$/, '$1$2');

    const validCoachRegex = /^(?:HA[0-9]|HB[0-9]|AB[0-9]|[BASHMCDEGKJ][0-9]{1,2}|EC|EA|EV|FC|CC|GS|GEN|PC)$/;
    if (validCoachRegex.test(clean)) {
      return clean;
    }
    return null;
  }

  /**
   * Sanitizes and extracts numeric or clean berth number (e.g. 32, '32', '32 (LB)' -> 32).
   */
  static sanitizeBerthNumber(val: unknown): number | string | null {
    const sanitized = RailRadarAdapter.sanitizeRawValue(val);
    if (!sanitized) return null;
    const digitsOnly = sanitized.replace(/\D/g, '');
    if (digitsOnly) {
      const num = parseInt(digitsOnly, 10);
      if (!isNaN(num) && num > 0 && num <= 150) {
        return num;
      }
    }
    return sanitized;
  }

  /**
   * Normalizes berth type to canonical code if valid, or null if it is a quota or invalid.
   */
  static normalizeBerthType(val: unknown): string | null {
    const sanitized = RailRadarAdapter.sanitizeRawValue(val);
    if (!sanitized) return null;
    const upper = sanitized.toUpperCase().replace(/[^A-Z]/g, '');

    const quotasAndStatuses = new Set([
      'GN', 'PQ', 'RL', 'CK', 'TQ', 'PT', 'DP', 'SS', 'DF', 'HP', 'LD', 'HO',
      'RC', 'RAC', 'WL', 'CNF', 'CAN', 'MOD', 'NOSB', 'NW', 'RS', 'OS'
    ]);
    if (quotasAndStatuses.has(upper)) {
      return null;
    }

    if (['LB', 'MB', 'UB', 'SL', 'SU', 'SM', 'WS', 'MS', 'AS', 'CP', 'CB'].includes(upper)) {
      return upper;
    }

    if (upper === 'LOWER' || upper === 'L') return 'LB';
    if (upper === 'MIDDLE' || upper === 'M') return 'MB';
    if (upper === 'UPPER' || upper === 'U') return 'UB';
    if (upper === 'SIDELOWER' || upper === 'SL') return 'SL';
    if (upper === 'SIDEUPPER' || upper === 'SU') return 'SU';
    if (upper === 'SIDEMIDDLE' || upper === 'SM') return 'SM';
    if (upper === 'WINDOW' || upper === 'WINDOWSEAT' || upper === 'W') return 'WS';
    if (upper === 'AISLE' || upper === 'AISLESEAT' || upper === 'A') return 'AS';
    if (upper === 'CABIN') return 'CB';
    if (upper === 'COUPE') return 'CP';

    return null;
  }

  /**
   * Extracts coach, berth, and berthType from status detail text strings.
   */
  static extractCoachAndBerthFromText(text: string): {
    coach: string | null;
    berth: number | string | null;
    berthType: string | null;
  } {
    let coach: string | null = null;
    let berth: number | string | null = null;
    let berthType: string | null = null;

    if (!text || typeof text !== 'string') {
      return { coach, berth, berthType };
    }

    // Pattern 1: Explicit labels like "Coach: B4, Berth: 32" or "COACH B4 BERTH 32"
    const labeledCoachMatch = text.match(/(?:COACH|CH|COACH NO|COACH ID)\s*[:#-]?\s*([A-Za-z0-9-]+)\b/i);
    if (labeledCoachMatch) {
      const candidate = RailRadarAdapter.normalizeCoachCode(labeledCoachMatch[1]);
      if (candidate) coach = candidate;
    }

    const labeledBerthMatch = text.match(/(?:BERTH|SEAT|BTH|ST|BERTH NO|SEAT NO)\s*[:#-]?\s*([0-9]{1,3})\b/i);
    if (labeledBerthMatch) {
      const candidate = RailRadarAdapter.sanitizeBerthNumber(labeledBerthMatch[1]);
      if (candidate != null) berth = candidate;
    }

    // Pattern 2: Delimited coach and berth e.g. "CNF / B4 / 32 / LB", "B4, 32, GN", "B4-32", "CNF B4 32", "EC, 14", "HA1, 10"
    if (!coach || !berth) {
      const coachBerthRegex = /\b(HA[0-9]|HB[0-9]|AB[0-9]|[BASHMCDEGKJ]-?[0-9]{1,2}|EC|EA|EV|FC|CC|GS|GEN)\s*[,/ -]\s*([0-9]{1,3})(?:\s*[,/ -]\s*([A-Za-z]{1,12}))?\b/i;
      const match = text.match(coachBerthRegex);
      if (match) {
        if (!coach) coach = RailRadarAdapter.normalizeCoachCode(match[1]);
        if (!berth) berth = RailRadarAdapter.sanitizeBerthNumber(match[2]);
        if (!berthType && match[3]) {
          berthType = RailRadarAdapter.normalizeBerthType(match[3]);
        }
      }
    }

    // Pattern 3: Berth then Coach: e.g. "32, B4" or "32 / B4"
    if (!coach || !berth) {
      const berthCoachRegex = /\b([0-9]{1,3})\s*[,/ -]\s*(HA[0-9]|HB[0-9]|AB[0-9]|[BASHMCDEGKJ]-?[0-9]{1,2}|EC|EA|EV|FC|CC|GS|GEN)\b/i;
      const match = text.match(berthCoachRegex);
      if (match) {
        if (!berth) berth = RailRadarAdapter.sanitizeBerthNumber(match[1]);
        if (!coach) coach = RailRadarAdapter.normalizeCoachCode(match[2]);
      }
    }

    // Pattern 4: Standalone coach code if still missing
    if (!coach) {
      const standaloneCoachRegex = /\b(HA[0-9]|HB[0-9]|AB[0-9]|[BASHMCDEGKJ][0-9]{1,2}|EC|EA|EV|FC|CC)\b/i;
      const match = text.match(standaloneCoachRegex);
      if (match) {
        coach = RailRadarAdapter.normalizeCoachCode(match[1]);
      }
    }

    // Pattern 5: Standalone berth in CNF / CONFIRMED context
    if (!berth && (text.toUpperCase().includes('CNF') || text.toUpperCase().includes('CONFIRM') || coach != null)) {
      const standaloneBerthMatch = text.match(/(?:CNF|CONFIRMED|RAC)[ /-]+([0-9]{1,3})\b/i);
      if (standaloneBerthMatch) {
        berth = RailRadarAdapter.sanitizeBerthNumber(standaloneBerthMatch[1]);
      }
    }

    // Pattern 6: Extract berth type from anywhere in string if not yet identified
    if (!berthType) {
      const btMatch = text.match(/\b(LB|MB|UB|SL|SU|SM|WS|MS|AS|CP|CB|LOWER|MIDDLE|UPPER|SIDE\s+LOWER|SIDE\s+UPPER|SIDE\s+MIDDLE|WINDOW|AISLE)\b/i);
      if (btMatch) {
        berthType = RailRadarAdapter.normalizeBerthType(btMatch[1]);
      }
    }

    return { coach, berth, berthType };
  }

  /**
   * Infers standard Indian Railways berth type from berth number and travel/coach class.
   */
  static inferBerthType(berthNum: number, coachCode?: string | null, travelClass?: string | null): string {
    const coachUpper = (coachCode || '').toUpperCase();
    const classUpper = (travelClass || '').toUpperCase();

    // 2A (AC 2-Tier): 6 berths per bay (1, 3: LB, 2, 4: UB, 5: SL, 6: SU)
    if (coachUpper.startsWith('A') || classUpper.includes('2A') || classUpper.includes('2-TIER') || classUpper.includes('2 TIER')) {
      const mod = berthNum % 6;
      if (mod === 1 || mod === 3) return 'LB';
      if (mod === 2 || mod === 4) return 'UB';
      if (mod === 5) return 'SL';
      return 'SU';
    }

    // 3E (AC 3 Economy): 9 berths per bay (1, 4: LB, 2, 5: MB, 3, 6: UB, 7: SL, 8: SM, 9: SU)
    if (coachUpper.startsWith('M') || classUpper.includes('3E') || classUpper.includes('ECONOMY')) {
      const mod = berthNum % 9;
      if (mod === 1 || mod === 4) return 'LB';
      if (mod === 2 || mod === 5) return 'MB';
      if (mod === 3 || mod === 6) return 'UB';
      if (mod === 7) return 'SL';
      if (mod === 8) return 'SM';
      return 'SU';
    }

    // 1A (AC First Class): 4 berths per bay / cabin (1, 3: LB, 2, 4: UB)
    if (coachUpper.startsWith('H') || classUpper.includes('1A') || classUpper.includes('FIRST')) {
      const mod = berthNum % 4;
      if (mod === 1 || mod === 3) return 'LB';
      return 'UB';
    }

    // CC / 2S / EC (Chair Car): 5 seats per row
    if (coachUpper.startsWith('C') || coachUpper.startsWith('D') || coachUpper.startsWith('E') ||
        classUpper.includes('CC') || classUpper.includes('2S') || classUpper.includes('CHAIR') || classUpper.includes('EC')) {
      const mod = berthNum % 5;
      if (mod === 1 || mod === 0) return 'WS';
      if (mod === 2) return 'MS';
      return 'AS';
    }

    // Standard 3A, SL, Sleeper, Garib Rath: 8 berths per bay
    const mod8 = berthNum % 8;
    if (mod8 === 1 || mod8 === 4) return 'LB';
    if (mod8 === 2 || mod8 === 5) return 'MB';
    if (mod8 === 3 || mod8 === 6) return 'UB';
    if (mod8 === 7) return 'SL';
    return 'SU';
  }

  /**
   * Normalizes a journey date to YYYY-MM-DD.
   * If empty, past, or invalid, returns today's date in IST.
   */
  static normalizeFareDate(journeyDate?: string | null): string {
    const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    if (!journeyDate || typeof journeyDate !== 'string') return todayIst;
    const clean = journeyDate.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
      return clean >= todayIst ? clean : todayIst;
    }
    const dmy = clean.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (dmy) {
      const formatted = `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
      return formatted >= todayIst ? formatted : todayIst;
    }
    const parsed = new Date(clean);
    if (!isNaN(parsed.getTime())) {
      const iso = parsed.toISOString().split('T')[0];
      return iso >= todayIst ? iso : todayIst;
    }
    return todayIst;
  }

  /**
   * Fallback telescopic fare calculation in accordance with Indian Railways passenger tariffs.
   */
  static computeTelescopicFareFallback(distanceKm: number, classCode: string, isSuperfast = true): {
    baseFare: number;
    reservationCharge: number;
    superfastCharge: number;
    tatkalFare: number;
    goodsServiceTax: number;
    cateringCharge: number;
    dynamicFare: number;
    otherCharge: number;
    totalFare: number;
  } {
    const dist = Math.max(50, distanceKm || 800);
    const cls = RailRadarAdapter.normalizeClassCode(classCode);

    let ratePerKm = 1.6;
    let resCharge = 40;
    let sfCharge = isSuperfast ? 45 : 0;
    let gstPct = 0.05;
    let catering = 0;

    switch (cls) {
      case '1A':
        ratePerKm = 3.85;
        resCharge = 60;
        sfCharge = isSuperfast ? 75 : 0;
        gstPct = 0.05;
        catering = 450;
        break;
      case '2A':
        ratePerKm = 2.35;
        resCharge = 50;
        sfCharge = isSuperfast ? 45 : 0;
        gstPct = 0.05;
        catering = 400;
        break;
      case '3A':
      case '3E':
        ratePerKm = 1.65;
        resCharge = 40;
        sfCharge = isSuperfast ? 45 : 0;
        gstPct = 0.05;
        catering = 350;
        break;
      case 'CC':
        ratePerKm = 1.45;
        resCharge = 40;
        sfCharge = isSuperfast ? 45 : 0;
        gstPct = 0.05;
        catering = 250;
        break;
      case 'EC':
        ratePerKm = 3.10;
        resCharge = 60;
        sfCharge = isSuperfast ? 75 : 0;
        gstPct = 0.05;
        catering = 400;
        break;
      case 'SL':
        ratePerKm = 0.58;
        resCharge = 20;
        sfCharge = isSuperfast ? 30 : 0;
        gstPct = 0;
        catering = 0;
        break;
      case '2S':
        ratePerKm = 0.28;
        resCharge = 15;
        sfCharge = isSuperfast ? 15 : 0;
        gstPct = 0;
        catering = 0;
        break;
    }

    const baseFare = Math.round(dist * ratePerKm);
    const subtotal = baseFare + resCharge + sfCharge;
    const gst = Math.round(subtotal * gstPct);
    const totalFare = subtotal + gst + catering;

    return {
      baseFare,
      reservationCharge: resCharge,
      superfastCharge: sfCharge,
      tatkalFare: 0,
      goodsServiceTax: gst,
      cateringCharge: catering,
      dynamicFare: 0,
      otherCharge: 0,
      totalFare,
    };
  }

  async getTrainFare(
    trainNumber: string,
    fromStation: string,
    toStation: string,
    journeyDate?: string,
    classCode?: string,
    quota?: string
  ): Promise<any> {
    const cleanTrain = (trainNumber || '').replace(/\D/g, '').trim();
    if (!cleanTrain) {
      throw new AppError('INVALID_QUERY', 'Train number is required for fare lookup.', 400);
    }

    const normClass = RailRadarAdapter.normalizeClassCode(classCode);
    const fareDate = RailRadarAdapter.normalizeFareDate(journeyDate);
    let src = (fromStation || '').trim();
    let dst = (toStation || '').trim();

    // If source or destination missing, fetch from train details
    let trainDistance = 800;
    try {
      const trainRes = await fetch(this.buildUrl(`${BASE_URL}/trains/${cleanTrain}`), {
        headers: this.headers,
        signal: AbortSignal.timeout(4_000),
      });
      if (trainRes.ok) {
        const trainJson = await trainRes.json();
        const tInfo = trainJson?.data?.train;
        if (!src && tInfo?.source?.code) src = tInfo.source.code;
        if (!dst && tInfo?.destination?.code) dst = tInfo.destination.code;
        const distNum = Number(tInfo?.distance);
        if (!isNaN(distNum) && distNum > 0) trainDistance = distNum;
      }
    } catch {}

    // Query upstream RailRadar fare endpoint
    if (src && dst) {
      try {
        let url = `${BASE_URL}/trains/${cleanTrain}/fare?from=${encodeURIComponent(src)}&to=${encodeURIComponent(dst)}&journeyDate=${encodeURIComponent(fareDate)}&classCode=${encodeURIComponent(normClass)}`;
        if (quota && quota.trim()) {
          url += `&quota=${encodeURIComponent(quota.trim())}`;
        }

        const res = await fetch(this.buildUrl(url), {
          headers: this.headers,
          signal: AbortSignal.timeout(6_000),
        });

        if (res.ok) {
          const json = await res.json();
          if (json?.data?.breakdown) {
            return {
              ...json.data,
              source: 'prs',
            };
          }
        }
      } catch (err) {
        console.warn(`RailRadar getTrainFare error for train ${cleanTrain}:`, this.sanitizeError(err));
      }
    }

    // Fallback: estimate from train distance
    const breakdown = RailRadarAdapter.computeTelescopicFareFallback(trainDistance, normClass, true);
    return {
      trainNumber: cleanTrain,
      distance: trainDistance,
      breakdown,
      source: 'telescopic_fallback',
      generatedAt: new Date().toISOString(),
    };
  }

  async getSeatAvailability(
    trainNumber: string,
    fromStation: string,
    toStation: string,
    journeyDate: string,
    classCode = '3A',
    quota = 'GN'
  ): Promise<{
    trainNumber: string;
    fromStation: string;
    toStation: string;
    journeyDate: string;
    travelClass: string;
    quota: string;
    category: AvailabilityCategory;
    statusText: string;
    isAvailable: boolean;
    confirmedSeats?: number | null;
    racNumber?: number | null;
    waitlistNumber?: number | null;
    source: 'prs' | 'unverified';
  }> {
    const cleanTrain = (trainNumber || '').replace(/\D/g, '').trim();
    const cleanFrom = (fromStation || '').trim().toUpperCase();
    const cleanTo = (toStation || '').trim().toUpperCase();
    const normClass = RailRadarAdapter.normalizeClassCode(classCode);
    const date = RailRadarAdapter.normalizeFareDate(journeyDate);

    if (!cleanTrain || !cleanFrom || !cleanTo) {
      return {
        trainNumber: cleanTrain,
        fromStation: cleanFrom,
        toStation: cleanTo,
        journeyDate: date,
        travelClass: normClass,
        quota,
        category: 'NOT_CHECKED',
        statusText: 'Check Live PRS on IRCTC',
        isAvailable: false,
        source: 'unverified',
      };
    }

    try {
      const url = `${BASE_URL}/trains/${cleanTrain}/availability?from=${encodeURIComponent(cleanFrom)}&to=${encodeURIComponent(cleanTo)}&journeyDate=${encodeURIComponent(date)}&classCode=${encodeURIComponent(normClass)}&quota=${encodeURIComponent(quota)}`;
      const res = await fetch(this.buildUrl(url), {
        headers: this.headers,
        signal: AbortSignal.timeout(6_000),
      });

      if (res.ok) {
        const json = await res.json();
        const d = json?.data;
        if (d) {
          const rawStatus = String(d.status || d.currentStatus || d.availabilityStatus || '').trim().toUpperCase();
          let category: AvailabilityCategory = 'UNKNOWN';
          let isAvail = false;

          if (rawStatus.includes('AVAILABLE') || rawStatus.includes('AVBL') || rawStatus.includes('CURR_AVBL')) {
            category = 'AVAILABLE';
            isAvail = true;
          } else if (rawStatus.includes('RAC')) {
            category = 'RAC';
            isAvail = true;
          } else if (rawStatus.includes('WL') || rawStatus.includes('WAIT')) {
            category = 'WAITLISTED';
            isAvail = false;
          } else if (rawStatus.includes('REGRET') || rawStatus.includes('NOT AVAILABLE')) {
            category = 'UNAVAILABLE';
            isAvail = false;
          } else if (rawStatus) {
            category = 'UNKNOWN';
            isAvail = false;
          }

          return {
            trainNumber: cleanTrain,
            fromStation: cleanFrom,
            toStation: cleanTo,
            journeyDate: date,
            travelClass: normClass,
            quota,
            category,
            statusText: d.status || d.currentStatus || (isAvail ? 'Available' : 'Check PRS'),
            isAvailable: isAvail,
            confirmedSeats: typeof d.availableSeats === 'number' ? d.availableSeats : undefined,
            racNumber: typeof d.racNumber === 'number' ? d.racNumber : undefined,
            waitlistNumber: typeof d.waitlistNumber === 'number' ? d.waitlistNumber : undefined,
            source: 'prs',
          };
        }
      }
    } catch {
      // Endpoint may not be provisioned or failed
    }

    return {
      trainNumber: cleanTrain,
      fromStation: cleanFrom,
      toStation: cleanTo,
      journeyDate: date,
      travelClass: normClass,
      quota,
      category: 'NOT_CHECKED',
      statusText: 'Check Live PRS on IRCTC',
      isAvailable: false,
      source: 'unverified',
    };
  }

  async getPnrStatus(pnr: string): Promise<PnrStatusResult> {
    const cleanPnr = (pnr || '').replace(/\D/g, '');
    if (cleanPnr.length !== 10) {
      throw new AppError('INVALID_PNR', 'PNR number must be exactly 10 numeric digits.', 400);
    }

    const key = (process.env.RAILRADAR_API_KEY || '').trim().replace(/['"]/g, '');
    if (!key) {
      throw new AppError(
        'UNAUTHORIZED',
        'RAILRADAR_API_KEY is not configured on the server. Please configure it in your backend environment.',
        502
      );
    }

    let res: Response;
    try {
      res = await fetch(this.buildUrl(`${BASE_URL}/pnr/${cleanPnr}`), {
        headers: this.headers,
        signal: AbortSignal.timeout(10_000),
      });
    } catch (err: any) {
      if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
        throw new AppError('PROVIDER_TIMEOUT', 'Upstream provider timed out while querying PNR status. Please retry.', 504, true);
      }
      throw new AppError('PROVIDER_TIMEOUT', `Network error contacting provider: ${this.sanitizeError(err)}`, 502, true);
    }

    if (!res.ok) {
      const json = await res.json().catch(() => null);
      const errCode = json?.error?.code;
      const errMsg = json?.error?.message;

      if (res.status === 404) {
        if (errCode === 'PRS:PNR_FLUSHED') {
          throw new AppError('PNR_FLUSHED', errMsg || 'This PNR record has been flushed or expired after journey completion.', 404);
        }
        if (errCode === 'API:DATA_NOT_AVAILABLE') {
          throw new AppError('PNR_NOT_FOUND', errMsg || 'PNR No. is not valid or unavailable in PRS.', 404);
        }
        throw new AppError('PNR_NOT_FOUND', errMsg || 'PNR record not found.', 404);
      }

      if (res.status === 401 || res.status === 403) {
        throw new AppError('UNAUTHORIZED', 'Provider authentication error or plan access restricted.', 502);
      }

      if (res.status === 429) {
        throw new AppError('PROVIDER_RATE_LIMITED', 'Upstream provider rate limited. Please retry in a few moments.', 429, true);
      }

      // Upstream server errors (500, 502, 503, 504) or PRS socket connection resets
      if (
        res.status >= 500 ||
        errCode === 'SYSTEM:UNKNOWN_ERROR' ||
        (errMsg && errMsg.toLowerCase().includes('socket'))
      ) {
        throw new AppError(
          'PNR_UNAVAILABLE',
          'Indian Railways PRS servers are currently unavailable or experiencing connection issues. Please retry in a few moments.',
          503,
          true
        );
      }

      throw new AppError('PROVIDER_TIMEOUT', errMsg || `Upstream provider error (${res.status}).`, 502, true);
    }

    const json = await res.json();
    const d = json?.data;
    if (!d) {
      throw new AppError('PNR_NOT_FOUND', 'No PNR data found in provider response.', 404);
    }

    const trainNum = String(d.trainNumber || d.train_number || d.train?.number || '').trim();
    const trainName = d.trainName || d.train_name || d.train?.name || (trainNum ? `Train ${trainNum}` : 'Express');
    const journeyDate = d.journeyDate || d.dateOfJourney || d.doj || d.date || d.train?.journeyDate || '';

    const srcCode = d.sourceStation?.code || d.sourceStation || d.from || d.boardingPoint?.code || d.boardingPoint || d.train?.source?.code || d.train?.boardingPoint?.code || 'SRC';
    const srcName = d.sourceStation?.name || d.sourceStationName || d.fromName || d.boardingPoint?.name || d.boardingPointName || d.train?.source?.name || d.train?.boardingPoint?.name || srcCode;
    const destCode = d.destinationStation?.code || d.destinationStation || d.to || d.reservationUpto?.code || d.reservationUpto || d.train?.destination?.code || d.train?.reservationUpto?.code || 'DEST';
    const destName = d.destinationStation?.name || d.destinationStationName || d.toName || d.reservationUpto?.name || d.reservationUptoName || d.train?.destination?.name || d.train?.reservationUpto?.name || destCode;

    const travelClass = d.class || d.journeyClass || d.travelClass || d.train?.journeyClass || '';

    const chartPrepared = Boolean(
      d.chartPrepared === true ||
      d.charting?.isPrepared === true ||
      d.chartStatus === 'CHART PREPARED' ||
      d.chart_status === 'CHART PREPARED' ||
      (String(d.charting?.status || '').toUpperCase().includes('PREPARED') && !String(d.charting?.status || '').toUpperCase().includes('NOT')) ||
      (String(d.chartStatus || '').toUpperCase().includes('PREPARED') && !String(d.chartStatus || '').toUpperCase().includes('NOT'))
    );

    const rawPassengers: any[] = Array.isArray(d.passengers)
      ? d.passengers
      : Array.isArray(d.passengerList)
      ? d.passengerList
      : Array.isArray(d.passenger_list)
      ? d.passenger_list
      : Array.isArray(d.passengerInfo)
      ? d.passengerInfo
      : Array.isArray(d.passengersList)
      ? d.passengersList
      : Array.isArray(d.Passenger)
      ? d.Passenger
      : Array.isArray(d.passenger)
      ? d.passenger
      : [];

    const passengers: PassengerStatus[] = rawPassengers.map((p, idx) => {
      const pNum = p.passengerSerialNumber || p.passengerNumber || p.serialNumber || p.no || p.sNo || p.number || idx + 1;
      const bStatus = RailRadarAdapter.sanitizeRawValue(p.booking?.formatted || p.booking?.status || p.bookingStatus || p.booking_status) || 'CNF';
      const cStatus = RailRadarAdapter.sanitizeRawValue(p.current?.formatted || p.current?.status || p.currentStatus || p.current_status) || bStatus;

      // Check all known PRS and RailRadar coach property names including nested objects (p.current, p.booking)
      let coach = RailRadarAdapter.normalizeCoachCode(
        p.current?.coachId ??
        p.current?.coach ??
        p.current?.coachNumber ??
        p.booking?.coachId ??
        p.booking?.coach ??
        p.booking?.coachNumber ??
        p.currentCoach ??
        p.currentCoachId ??
        p.coach ??
        p.coachId ??
        p.coach_id ??
        p.coachPosition ??
        p.coachNumber ??
        p.coach_number ??
        p.coachName ??
        p.coachNo ??
        p.coach_no ??
        p.allocatedCoach ??
        p.bookingCoach ??
        p.bookingCoachId ??
        p.booking_coach
      );

      // Check all known PRS and RailRadar berth/seat property names including nested objects (p.current, p.booking)
      let berth = RailRadarAdapter.sanitizeBerthNumber(
        p.current?.berthNo ??
        p.current?.berth ??
        p.current?.berthNumber ??
        p.current?.seatNo ??
        p.current?.seatNumber ??
        p.booking?.berthNo ??
        p.booking?.berth ??
        p.booking?.berthNumber ??
        p.booking?.seatNo ??
        p.booking?.seatNumber ??
        p.currentBerth ??
        p.currentBerthNo ??
        p.berthNumber ??
        p.berth ??
        p.berthNo ??
        p.berth_no ??
        p.berth_number ??
        p.seatNumber ??
        p.seatNo ??
        p.seat_no ??
        p.seat ??
        p.currentSeat ??
        p.allocatedBerth ??
        p.bookingBerth ??
        p.bookingBerthNo ??
        p.booking_berth_no ??
        p.booking_berth ??
        p.bookingSeat
      );

      let berthType = RailRadarAdapter.normalizeBerthType(
        p.berthCode ??
        p.berth_code ??
        p.booking?.berthCode ??
        p.current?.berthCode ??
        p.booking?.berth_code ??
        p.current?.berth_code ??
        p.berthType ??
        p.berth_type ??
        p.seatType ??
        p.seat_type
      );

      // Collect all status detail text strings to inspect for encoded coach and berth (e.g. "B4, 32", "CNF/A1/44", "CNF/A1/44/UB/GN")
      const textToInspect = [
        p.current?.formatted,
        p.booking?.formatted,
        p.current?.status,
        p.booking?.status,
        p.currentStatusDetails,
        p.bookingStatusDetails,
        p.current_status_details,
        p.booking_status_details,
        p.statusDetails,
        p.status_details,
        cStatus,
        bStatus,
        p.status,
        typeof p.currentBerth === 'string' ? p.currentBerth : null,
        typeof p.berth === 'string' ? p.berth : null,
        typeof p.currentCoach === 'string' ? p.currentCoach : null,
        typeof p.coach === 'string' ? p.coach : null,
      ]
        .filter((val): val is string => typeof val === 'string' && Boolean(val.trim()))
        .join(' | ');

      if (!coach || berth == null || !berthType) {
        const extracted = RailRadarAdapter.extractCoachAndBerthFromText(textToInspect);
        if (!coach && extracted.coach) coach = extracted.coach;
        if (berth == null && extracted.berth != null) berth = extracted.berth;
        if (!berthType && extracted.berthType) berthType = extracted.berthType;
      }

      // If booking coach/berth were set and current status is confirmed but current coach was empty, fall back to booking
      if (!coach && (cStatus.toUpperCase().includes('CNF') || cStatus.toUpperCase().includes('CONFIRM') || bStatus.toUpperCase().includes('CNF'))) {
        const fallbackCoach = RailRadarAdapter.normalizeCoachCode(p.booking?.coachId ?? p.booking?.coach ?? p.bookingCoach ?? p.bookingCoachId ?? p.booking_coach);
        if (fallbackCoach) coach = fallbackCoach;
      }
      if (berth == null && (cStatus.toUpperCase().includes('CNF') || cStatus.toUpperCase().includes('CONFIRM') || bStatus.toUpperCase().includes('CNF'))) {
        const fallbackBerth = RailRadarAdapter.sanitizeBerthNumber(p.booking?.berthNo ?? p.booking?.berth ?? p.bookingBerth ?? p.bookingBerthNo ?? p.booking_berth_no ?? p.booking_berth);
        if (fallbackBerth != null) berth = fallbackBerth;
      }

      const isConfirmed =
        p.isConfirmed === true ||
        cStatus.toUpperCase().includes('CNF') ||
        cStatus.toUpperCase().includes('CONFIRM') ||
        bStatus.toUpperCase().includes('CNF') ||
        bStatus.toUpperCase().includes('CONFIRM') ||
        Boolean(coach && berth != null);

      // Infer standard Indian Railways berth type if numeric and missing
      if (!berthType && typeof berth === 'number') {
        berthType = RailRadarAdapter.inferBerthType(berth, coach, travelClass);
      }

      // If current status is purely waitlisted and not confirmed, clear spurious berth/coach
      const isPureWaitlist =
        (cStatus.toUpperCase().includes('WL') || cStatus.toUpperCase().includes('WAIT')) &&
        !cStatus.toUpperCase().includes('CNF') &&
        !cStatus.toUpperCase().includes('CONFIRM') &&
        !cStatus.toUpperCase().includes('RAC');
      if (isPureWaitlist && !cStatus.toUpperCase().includes('/')) {
        coach = null;
        berth = null;
      }

      const bookingCoach = RailRadarAdapter.normalizeCoachCode(p.booking?.coachId ?? p.booking?.coach ?? p.bookingCoach ?? p.bookingCoachId ?? p.booking_coach);
      const bookingBerth = RailRadarAdapter.sanitizeBerthNumber(p.booking?.berthNo ?? p.booking?.berth ?? p.bookingBerth ?? p.bookingBerthNo ?? p.booking_berth_no ?? p.booking_berth);

      return {
        passengerNumber: Number(pNum) || idx + 1,
        bookingStatus: bStatus,
        bookingCoach: bookingCoach || null,
        bookingBerth: bookingBerth ?? null,
        currentStatus: cStatus,
        coach: coach || null,
        berthNumber: berth ?? null,
        berthType: berthType || null,
        confirmed: isConfirmed,
        // PII Data Minimization (Phase 1): Redact age and gender from public response
        age: null,
        gender: null,
      };
    });

    const quota = rawPassengers[0]?.booking?.quota || rawPassengers[0]?.current?.quota || d.quota || d.train?.quota || 'GN';

    const userCoach = passengers.find(p => p.coach)?.coach || null;
    const bookingStatus = d.bookingStatus || (passengers[0]?.currentStatus) || 'CONFIRMED';

    // Enrich with coach rake and live status if trainNumber is available
    let rakeComposition: CoachRakeItem[] | undefined;
    let liveTrainStatus: PnrLiveTrainStatus | null = null;
    let intermediateHalts: Array<{ code: string; name?: string; time?: string }> | undefined;
    let distanceKm: number | string | null = d.distance || d.distanceKm || null;
    let duration: string | null = d.duration || null;
    let departureTime: string | null = d.departureTime || d.departure || null;
    let arrivalTime: string | null = d.arrivalTime || d.arrival || null;
    let departurePlatform: string | null = d.platform || d.departurePlatform || null;

    if (trainNum) {
      try {
        const coachRes = await fetch(this.buildUrl(`${BASE_URL}/trains/${trainNum}/coaches`), {
          headers: this.headers,
          signal: AbortSignal.timeout(5_000),
        });
        if (coachRes.ok) {
          const coachJson = await coachRes.json();
          if (Array.isArray(coachJson?.data?.rake)) {
            rakeComposition = coachJson.data.rake.map((r: any) => ({
              position: r.position,
              code: r.code,
              classType: r.classType || r.category || '',
              className: r.className,
              category: r.category,
              totalBerths: r.totalBerths,
              hasSeats: r.hasSeats,
            }));
          }
        }
      } catch (coachErr) {
        console.warn(`Could not enrich coach rake for ${trainNum}:`, this.sanitizeError(coachErr));
      }

      try {
        const trainRes = await fetch(this.buildUrl(`${BASE_URL}/trains/${trainNum}`), {
          headers: this.headers,
          signal: AbortSignal.timeout(5_000),
        });
        if (trainRes.ok) {
          const trainJson = await trainRes.json();
          const tInfo = trainJson?.data?.train;
          const stops: any[] = trainJson?.data?.route || trainJson?.data?.stops || [];
          if (!distanceKm && tInfo?.distance) distanceKm = `${tInfo.distance} km`;
          if (!duration && tInfo?.duration) {
            const hrs = Math.floor(tInfo.duration / 60);
            const mins = tInfo.duration % 60;
            duration = `${hrs}h ${mins}m`;
          }
          if (stops.length > 0) {
            const firstStop = stops[0];
            const lastStop = stops[stops.length - 1];
            if (!departureTime && firstStop?.departure) departureTime = firstStop.departure;
            if (!arrivalTime && lastStop?.arrival) arrivalTime = lastStop.arrival;
            if (!departurePlatform && firstStop?.platform) departurePlatform = firstStop.platform;

            if (stops.length > 2) {
              intermediateHalts = stops.slice(1, -1).slice(0, 6).map((s: any) => ({
                code: s.station?.code || s.stationCode || '',
                name: s.station?.name || s.stationName || '',
                time: s.arrival || s.departure || '',
              }));
            }
          }
        }
      } catch (trainErr) {
        console.warn(`Could not enrich train details for ${trainNum}:`, this.sanitizeError(trainErr));
      }

      try {
        const livePos = await this.getLivePosition(trainNum);
        if (livePos) {
          const isDelayed = (livePos.delayMinutes ?? 0) > 5;
          const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
          liveTrainStatus = {
            trainNumber: trainNum,
            statusText: livePos.status || (isDelayed ? 'DELAYED' : 'ON TIME'),
            isOnTime: !isDelayed,
            delayMinutes: livePos.delayMinutes ?? 0,
            speedKmh: livePos.speedKph ?? 0,
            platform: departurePlatform || undefined,
            locationNotice: livePos.currentStationName ? `Near ${livePos.currentStationName}` : undefined,
            journeyId: `journey_${trainNum}_${journeyDate || todayIst}`,
          };
        }
      } catch (liveErr) {
        console.warn(`Could not enrich live status for ${trainNum}:`, this.sanitizeError(liveErr));
      }
    }

    // Calculate dynamic fare via RailRadar fare API or PRS booking breakdown
    let fare: any = null;
    if (d.fare && (d.fare.baseFare || d.fare.base) && (d.fare.total || d.fare.totalAmountPaid)) {
      fare = {
        baseFare: d.fare.baseFare || d.fare.base || null,
        surcharges: d.fare.surcharges || null,
        convenienceFee: d.fare.convenienceFee || null,
        cateringCharges: d.fare.cateringCharges || null,
        totalAmountPaid: d.fare.total || d.fare.totalAmountPaid || null,
        transactionId: d.fare.transactionId || null,
        paymentMethod: d.fare.paymentMethod || null,
        breakdownSource: 'provider_pnr',
        isEstimated: false,
      };
    } else if (trainNum && passengers.length > 0) {
      try {
        const fareData = await this.getTrainFare(
          trainNum,
          srcCode !== 'SRC' ? srcCode : '',
          destCode !== 'DEST' ? destCode : '',
          journeyDate,
          travelClass,
          quota
        );

        if (fareData?.breakdown) {
          const b = fareData.breakdown;
          const numPassengers = Math.max(1, passengers.length || 1);
          const isAc = !['SL', '2S'].includes(RailRadarAdapter.normalizeClassCode(travelClass));
          const irctcConvenienceFee = isAc ? 35 : 18;

          const baseFare = (Number(b.baseFare) || 0) * numPassengers;
          const surcharges = (
            (Number(b.reservationCharge) || 0) +
            (Number(b.superfastCharge) || 0) +
            (Number(b.tatkalFare) || 0) +
            (Number(b.dynamicFare) || 0) +
            (Number(b.otherCharge) || 0)
          ) * numPassengers;
          const cateringCharges = (Number(b.cateringCharge) || 0) * numPassengers;
          const convenienceFee = ((Number(b.goodsServiceTax) || 0) * numPassengers) + irctcConvenienceFee;
          const totalAmountPaid = (Number(b.totalFare) || 0) * numPassengers + irctcConvenienceFee;

          fare = {
            baseFare,
            surcharges,
            convenienceFee,
            cateringCharges,
            totalAmountPaid,
            perPassengerFare: Number(b.totalFare) || null,
            // Phase 1 Fare Integrity: Never fabricate synthetic transaction ID or payment method
            transactionId: d.fare?.transactionId || null,
            paymentMethod: d.fare?.paymentMethod || null,
            breakdownSource: fareData.source || 'railradar_prs',
            isEstimated: true,
          };
        }
      } catch (fareErr) {
        console.warn(`Could not compute dynamic fare for train ${trainNum}:`, this.sanitizeError(fareErr));
      }
    }

    return {
      pnr: cleanPnr,
      trainNumber: trainNum,
      trainName,
      journeyDate,
      sourceStationCode: srcCode,
      sourceStationName: srcName,
      destinationStationCode: destCode,
      destinationStationName: destName,
      departureTime,
      arrivalTime,
      departurePlatform,
      arrivalPlatform: d.arrivalPlatform || null,
      duration,
      haltsCount: d.totalHalts || intermediateHalts?.length || null,
      intermediateHalts,
      travelClass,
      quota,
      distanceKm,
      chartPrepared,
      bookingStatus,
      confirmationProbability: d.confirmationProbability ?? (bookingStatus.includes('CNF') ? 100 : null),
      passengers,
      rakeComposition,
      userCoach,
      fare,
      cancellationTerms: d.cancellationTerms || null,
      liveTrainStatus,
      telemetryFreshness: {
        source: 'Indian Railways CRIS / NTES PRS Telemetry',
        fetchedAt: new Date().toISOString(),
      },
    };
  }
}
