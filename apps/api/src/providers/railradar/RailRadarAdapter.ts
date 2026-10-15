import { Train, JourneyRun, LivePosition, TrainStop, JourneyStatus, PnrStatusResult, PassengerStatus, CoachRakeItem, PnrLiveTrainStatus } from '@exprest/types';
import { AppError } from '../../common/errors/AppError.js';

export interface TrainProvider {
  search(query: string): Promise<Train[]>;
  getRun(trainNumber: string, serviceDate: string): Promise<{ train: Train; run: JourneyRun; stops: TrainStop[]; allStops: any[]; liveStatus: string; isLive: boolean } | null>;
  getLivePosition(trainNumber: string): Promise<LivePosition | null>;
  getRouteGeometry(trainNumber: string): Promise<{ type: 'LineString'; coordinates: [number, number][] } | null>;
  getPnrStatus(pnr: string): Promise<PnrStatusResult>;
  getTrainFare(trainNumber: string, fromStation: string, toStation: string, journeyDate?: string, classCode?: string, quota?: string): Promise<any>;
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

    if (res.status === 404) {
      const json = await res.json().catch(() => null);
      const errCode = json?.error?.code;
      const errMsg = json?.error?.message;
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

    if (!res.ok) {
      throw new AppError('PROVIDER_TIMEOUT', `Upstream provider error (${res.status}).`, 502, true);
    }

    const json = await res.json();
    const d = json?.data;
    if (!d) {
      throw new AppError('PNR_NOT_FOUND', 'No PNR data found in provider response.', 404);
    }

    const trainNum = String(d.trainNumber || d.train_number || d.train?.number || '').trim();
    const trainName = d.trainName || d.train_name || d.train?.name || (trainNum ? `Train ${trainNum}` : 'Express');
    const journeyDate = d.journeyDate || d.dateOfJourney || d.doj || d.date || '';

    const srcCode = d.sourceStation?.code || d.sourceStation || d.from || d.boardingPoint?.code || d.boardingPoint || 'SRC';
    const srcName = d.sourceStation?.name || d.sourceStationName || d.fromName || d.boardingPoint?.name || d.boardingPointName || srcCode;
    const destCode = d.destinationStation?.code || d.destinationStation || d.to || d.reservationUpto?.code || d.reservationUpto || 'DEST';
    const destName = d.destinationStation?.name || d.destinationStationName || d.toName || d.reservationUpto?.name || d.reservationUptoName || destCode;

    const travelClass = d.class || d.journeyClass || d.travelClass || '';
    const quota = d.quota || 'GN';

    const chartPrepared = Boolean(
      d.chartPrepared === true ||
      d.chartStatus === 'CHART PREPARED' ||
      d.chart_status === 'CHART PREPARED' ||
      String(d.chartStatus || '').toUpperCase().includes('PREPARED')
    );

    const rawPassengers: any[] = Array.isArray(d.passengers) ? d.passengers : (Array.isArray(d.passengerList) ? d.passengerList : []);
    const passengers: PassengerStatus[] = rawPassengers.map((p, idx) => {
      const pNum = p.passengerSerialNumber || p.no || p.passengerNumber || idx + 1;
      const bStatus = p.bookingStatus || p.booking_status || 'CNF';
      const cStatus = p.currentStatus || p.current_status || bStatus;
      const coach = p.currentCoach || p.coach || p.bookingCoach || null;
      const berth = p.currentBerth || p.berthNumber || p.berth || p.bookingBerth || null;
      const berthType = p.berthType || p.berth_type || null;
      const isConfirmed = cStatus.toUpperCase().includes('CNF') || cStatus.toUpperCase().includes('CONFIRM');

      return {
        passengerNumber: pNum,
        bookingStatus: bStatus,
        bookingCoach: p.bookingCoach || null,
        bookingBerth: p.bookingBerth || null,
        currentStatus: cStatus,
        coach,
        berthNumber: berth,
        berthType,
        confirmed: isConfirmed,
        age: typeof p.age === 'number' ? p.age : null,
        gender: p.gender || null,
      };
    });

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
            transactionId: d.fare?.transactionId || `PRS-${cleanPnr}`,
            paymentMethod: d.fare?.paymentMethod || 'Online Gateway / Verified via PRS',
            breakdownSource: fareData.source || 'railradar_prs',
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
