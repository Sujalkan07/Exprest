import {
  AlternativeJourneysResult,
  AvailabilityCategory,
  ConnectingAlternative,
  ConnectingLeg,
  DirectTrainAlternative,
  FareType,
  SameTrainAlternative,
  StationInfo,
} from '@exprest/types';
import { RailRadarAdapter } from '../../providers/railradar/RailRadarAdapter.js';
import { AppError } from '../../common/errors/AppError.js';
import { isValidCalendarDate } from '../../common/validation/schemas.js';

function getTodayIst(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function parseTimeToMinutes(timeStr?: string | null): number {
  if (!timeStr) return 0;
  const parts = timeStr.trim().split(':');
  const h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  return h * 60 + m;
}

function isValidTimeString(timeStr?: string | null): boolean {
  if (!timeStr) return false;
  return /^\d{1,2}:\d{2}$/.test(timeStr.trim());
}

function computeDurationMins(depStr: string, arrStr: string): number {
  const depM = parseTimeToMinutes(depStr);
  const arrM = parseTimeToMinutes(arrStr);
  if (arrM >= depM) {
    return arrM - depM;
  }
  return 1440 - depM + arrM;
}

function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || isNaN(mins) || mins <= 0) return 'Schedule Pending';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m < 10 ? '0' : ''}${m}m`;
}

// Major hub candidate interchange junctions across India's principal railway corridors
const COMMON_INTERCHANGE_JUNCTIONS = [
  { code: 'NGP', name: 'Nagpur Junction' },
  { code: 'BPL', name: 'Bhopal Junction' },
  { code: 'VGLJ', name: 'VGL Jhansi Junction' },
  { code: 'ET', name: 'Itarsi Junction' },
  { code: 'CNB', name: 'Kanpur Central' },
  { code: 'NDLS', name: 'New Delhi' },
  { code: 'HWH', name: 'Howrah Junction' },
  { code: 'BSL', name: 'Bhusaval Junction' },
  { code: 'PCOI', name: 'Prayagraj Chheoki' },
  { code: 'MAS', name: 'MGR Chennai Central' },
  { code: 'SC', name: 'Secunderabad Junction' },
  { code: 'BZA', name: 'Vijayawada Junction' },
];

export class AlternativeJourneyService {
  private railRadar = new RailRadarAdapter();

  async findAlternatives(
    fromStation: string,
    toStation: string,
    journeyDate?: string,
    classCode = '3A',
    quota = 'GN',
    preferredTrainNumber?: string
  ): Promise<AlternativeJourneysResult> {
    const from = fromStation.trim().toUpperCase();
    const to = toStation.trim().toUpperCase();

    if (!from || !to) {
      throw new AppError('INVALID_QUERY', 'Origin and destination stations are required.', 400);
    }
    if (from === to) {
      throw new AppError('INVALID_QUERY', 'Origin and destination stations cannot be the same station.', 400);
    }

    const todayIst = getTodayIst();
    const isExplicitDate = Boolean(journeyDate && isValidCalendarDate(journeyDate));
    const date = isExplicitDate ? journeyDate! : todayIst;

    // 1. Resolve Origin and Destination station metadata
    const [originSearchResults, destSearchResults] = await Promise.all([
      this.railRadar.searchStations(from).catch(() => []),
      this.railRadar.searchStations(to).catch(() => []),
    ]);

    const originStation: StationInfo = originSearchResults.find((s) => s.code === from) ||
      originSearchResults[0] || {
        code: from,
        name: from,
        city: null,
        state: null,
        lat: null,
        lng: null,
      };

    const destinationStation: StationInfo = destSearchResults.find((s) => s.code === to) ||
      destSearchResults[0] || {
        code: to,
        name: to,
        city: null,
        state: null,
        lat: null,
        lng: null,
      };

    // 2. Fetch direct trains between stations
    // Note: Never fallback to date-less query that attaches user's date to trains that don't run on that date
    const directBetweenData = await this.railRadar
      .getTrainsBetween(from, to, { byCity: true, date })
      .catch(() => null);

    const rawDirectTrains: any[] = directBetweenData?.trains || [];

    // 3. Category 2: Alternative Direct Trains
    const directAlternatives: DirectTrainAlternative[] = [];
    for (let i = 0; i < rawDirectTrains.length; i++) {
      const item = rawDirectTrains[i];
      const t = item.train || {};
      const num = String(t.number || item.number || '').trim();
      const name = t.name || item.name || `Train ${num}`;
      const type = t.type || item.type || 'Superfast Express';

      const depTime = item.from?.departure || item.from?.scheduledDeparture || '';
      const arrTime = item.to?.arrival || item.to?.scheduledArrival || '';
      const durationMins = typeof item.duration === 'number' && item.duration > 0
        ? item.duration
        : (isValidTimeString(depTime) && isValidTimeString(arrTime) ? computeDurationMins(depTime, arrTime) : 0);
      const distance = typeof item.distance === 'number' && item.distance > 0 ? item.distance : null;
      const haltsBetween = typeof item.totalHaltsBetween === 'number' ? item.totalHaltsBetween : undefined;

      // Calculate fare for direct journey
      let directFare: number | null = null;
      let directFareType: FareType = 'UNAVAILABLE';
      try {
        const fareData = await this.railRadar.getTrainFare(num, from, to, date, classCode, quota);
        if (fareData?.breakdown?.totalFare != null) {
          directFare = Number(fareData.breakdown.totalFare);
          directFareType = fareData.source === 'prs' ? 'QUOTED' : 'ESTIMATED';
        }
      } catch {
        directFare = null;
        directFareType = 'UNAVAILABLE';
      }

      // Check seat availability truthfully
      let availCategory: AvailabilityCategory = 'NOT_CHECKED';
      let availStatus = 'Check PRS Live';
      let isAvail = false;
      try {
        const availRes = await this.railRadar.getSeatAvailability(num, from, to, date, classCode, quota);
        if (availRes) {
          availCategory = availRes.category;
          availStatus = availRes.statusText;
          isAvail = availRes.isAvailable;
        }
      } catch {
        availCategory = 'NOT_CHECKED';
        availStatus = 'Check PRS Live';
        isAvail = false;
      }

      directAlternatives.push({
        id: `direct-${num}-${i}`,
        category: 'DIRECT',
        trainNumber: num,
        trainName: name,
        trainType: type,
        origin: {
          code: item.from?.code || from,
          name: item.from?.name || originStation.name,
          city: item.from?.city || originStation.city,
        },
        destination: {
          code: item.to?.code || to,
          name: item.to?.name || destinationStation.name,
          city: item.to?.city || destinationStation.city,
        },
        departureTime: depTime || '--:--',
        arrivalTime: arrTime || '--:--',
        departureDate: date,
        arrivalDate: date,
        durationMinutes: durationMins,
        durationFormatted: formatMinutes(durationMins),
        distanceKm: distance,
        totalHaltsBetween: haltsBetween,
        fare: directFare,
        fareType: directFareType,
        travelClass: classCode,
        availabilityStatus: availStatus,
        availabilityCategory: availCategory,
        availabilityAvailable: isAvail,
        scheduledServiceText: `Regular service connecting ${from} to ${to}`,
        isFaster: false,
        isLive: false,
        freshness: 'RailRadar Timetable Feed',
      });
    }

    // Sort direct alternatives by duration to mark faster ones
    if (directAlternatives.length > 1) {
      const validDurations = directAlternatives.filter((d) => d.durationMinutes > 0);
      if (validDurations.length > 1) {
        validDurations.sort((a, b) => a.durationMinutes - b.durationMinutes);
        validDurations[0].isFaster = true;
      }
    }

    // 4. Category 1: Same Train Alternative Segment
    // If preferredTrainNumber is provided, inspect that specific train.
    // If not provided, inspect candidate direct trains (up to 3) to see if any have prior origins on their route.
    const sameTrainAlternatives: SameTrainAlternative[] = [];
    const candidateTrainNums: string[] = [];

    if (preferredTrainNumber) {
      candidateTrainNums.push(preferredTrainNumber.trim());
    } else if (rawDirectTrains.length > 0) {
      for (const t of rawDirectTrains.slice(0, 3)) {
        const num = String(t.train?.number || t.number || '').trim();
        if (num && !candidateTrainNums.includes(num)) {
          candidateTrainNums.push(num);
        }
      }
    }

    for (const candidateTrainNum of candidateTrainNums) {
      try {
        const trainDetails = await this.railRadar.getTrainDetails(candidateTrainNum);
        const routeStops: any[] = trainDetails?.route || trainDetails?.stops || [];
        const trainInfo = trainDetails?.train || {};

        if (routeStops.length > 2) {
          const fromIdx = routeStops.findIndex(
            (s) => (s.station?.code || s.stationCode) === from
          );
          const toIdx = routeStops.findIndex(
            (s) => (s.station?.code || s.stationCode) === to
          );

          if (fromIdx > 0 && toIdx > fromIdx) {
            // Station starts earlier than intended boarding!
            const priorOriginStop = routeStops[0];
            const boardingStop = routeStops[fromIdx];
            const destStop = routeStops[toIdx];

            const priorOriginCode = priorOriginStop.station?.code || priorOriginStop.stationCode;
            const priorOriginName = priorOriginStop.station?.name || priorOriginStop.stationName || priorOriginCode;

            const distPriorToDest =
              typeof destStop.distance === 'number' && typeof priorOriginStop.distance === 'number'
                ? destStop.distance - priorOriginStop.distance
                : null;
            const distBoardingToDest =
              typeof destStop.distance === 'number' && typeof boardingStop.distance === 'number'
                ? destStop.distance - boardingStop.distance
                : null;
            const additionalDist =
              distPriorToDest != null && distBoardingToDest != null && distPriorToDest > distBoardingToDest
                ? distPriorToDest - distBoardingToDest
                : null;

            const depTimePrior = priorOriginStop.departure || priorOriginStop.arrival || '--:--';
            const depTimeBoarding = boardingStop.departure || boardingStop.arrival || '--:--';
            const arrTimeDest = destStop.arrival || destStop.departure || '--:--';

            // Calculate durations without hardcoded fallbacks
            let paperDurationMins: number | null = null;
            let intendedDurationMins = 0;
            let additionalTimeMins: number | null = null;

            if (isValidTimeString(depTimePrior) && isValidTimeString(arrTimeDest)) {
              paperDurationMins = computeDurationMins(depTimePrior, arrTimeDest);
            } else if (Number(trainDetails?.duration) > 0) {
              paperDurationMins = Number(trainDetails.duration);
            }

            if (isValidTimeString(depTimeBoarding) && isValidTimeString(arrTimeDest)) {
              intendedDurationMins = computeDurationMins(depTimeBoarding, arrTimeDest);
            } else if (paperDurationMins != null && distPriorToDest && distBoardingToDest) {
              intendedDurationMins = Math.round((paperDurationMins * distBoardingToDest) / distPriorToDest);
            }

            if (paperDurationMins != null && intendedDurationMins > 0 && paperDurationMins > intendedDurationMins) {
              additionalTimeMins = paperDurationMins - intendedDurationMins;
            }

            // Fetch actual fares for extended segment vs intended segment
            const [fareExtended, fareIntended] = await Promise.all([
              this.railRadar
                .getTrainFare(candidateTrainNum, priorOriginCode, to, date, classCode, quota)
                .catch(() => null),
              this.railRadar
                .getTrainFare(candidateTrainNum, from, to, date, classCode, quota)
                .catch(() => null),
            ]);

            const extendedFareVal = fareExtended?.breakdown?.totalFare != null
              ? Number(fareExtended.breakdown.totalFare)
              : null;
            const intendedFareVal = fareIntended?.breakdown?.totalFare != null
              ? Number(fareIntended.breakdown.totalFare)
              : null;
            const fareDiff = extendedFareVal != null && intendedFareVal != null
              ? Math.max(0, extendedFareVal - intendedFareVal)
              : null;
            const fareType: FareType = fareExtended?.source === 'prs'
              ? 'QUOTED'
              : (extendedFareVal != null ? 'ESTIMATED' : 'UNAVAILABLE');

            // Seat availability
            let stAvailCategory: AvailabilityCategory = 'NOT_CHECKED';
            let stAvailStatus = 'Candidate General Quota (Check IRCTC)';
            let stIsAvail = false;
            try {
              const availRes = await this.railRadar.getSeatAvailability(
                candidateTrainNum,
                priorOriginCode,
                to,
                date,
                classCode,
                quota
              );
              if (availRes) {
                stAvailCategory = availRes.category;
                stAvailStatus = availRes.statusText;
                stIsAvail = availRes.isAvailable;
              }
            } catch {}

            // Intermediate halts between boarding and destination
            const intermediateHalts = routeStops
              .slice(fromIdx + 1, toIdx)
              .filter((s) => s.isHalt !== false)
              .map((s) => s.station?.name || s.stationName || s.station?.code || '')
              .filter(Boolean)
              .slice(0, 4);

            const isSpecificTrain = Boolean(preferredTrainNumber);
            const advisoryText = isSpecificTrain
              ? `Direct segment from your intended boarding station (${from} to ${to}) on Train ${candidateTrainNum} may face seat contention or waitlists. However, this train originates earlier at ${priorOriginName} (${priorOriginCode}), where candidate General Quota allocations may be available under Railway Commercial Rule 142.`
              : `This train originates earlier at ${priorOriginName} (${priorOriginCode}). Booking from the originating station may provide General Quota allocations under Railway Commercial Rule 142, with legal boarding at your intended station (${from}).`;

            sameTrainAlternatives.push({
              id: `st-${candidateTrainNum}`,
              category: 'SAME_TRAIN',
              trainNumber: candidateTrainNum,
              trainName: trainInfo.name || `Train ${candidateTrainNum}`,
              ticketedOrigin: {
                code: priorOriginCode,
                name: priorOriginName,
                city: priorOriginStop.station?.city || null,
              },
              ticketedDestination: {
                code: to,
                name: destStop.station?.name || destinationStation.name,
                city: destStop.station?.city || destinationStation.city,
              },
              intendedBoarding: {
                code: from,
                name: boardingStop.station?.name || originStation.name,
                city: boardingStop.station?.city || originStation.city,
              },
              departureTimeTicketed: depTimePrior,
              departureTimeBoarding: depTimeBoarding,
              arrivalTimeDestination: arrTimeDest,
              intendedDate: date,
              ticketedStartDate: date,
              destinationArrivalDate: date,
              additionalDistanceKm: additionalDist,
              additionalTimeMinutes: additionalTimeMins,
              totalJourneyMinutes: intendedDurationMins,
              paperJourneyMinutes: paperDurationMins,
              fare: extendedFareVal,
              fareType,
              baseFareForIntended: intendedFareVal,
              fareDifference: fareDiff,
              travelClass: classCode,
              quota: quota,
              availabilityStatus: stAvailStatus,
              availabilityCategory: stAvailCategory,
              availabilityAvailable: stIsAvail,
              intermediateStations: intermediateHalts,
              advisoryText,
              boardingRuleNotice:
                'Essential Boarding Notice: Booking from an earlier originating station creates a reservation for that longer ticketed segment. It does not automatically authorize boarding at your intended station. You must officially submit a "Change Boarding Point" request on IRCTC before chart preparation to avoid seat cancellation.',
              isLive: false,
              freshness: 'RailRadar Timetable & PRS Tariff Calculation',
            });

            if (isSpecificTrain) break;
          }
        }
      } catch (err) {
        console.warn(`Could not construct same train alternative for ${candidateTrainNum}:`, err);
      }
    }

    // 5. Category 3: Connecting Journeys
    // Discover feasible 1-transfer connections via major transit junctions
    const connectingAlternatives: ConnectingAlternative[] = [];
    const candidateJunctions = COMMON_INTERCHANGE_JUNCTIONS.filter(
      (j) => j.code !== from && j.code !== to
    ).slice(0, 4);

    const junctionPromises = candidateJunctions.map(async (junc) => {
      try {
        const [leg1Res, leg2Res] = await Promise.all([
          this.railRadar.getTrainsBetween(from, junc.code, { byCity: false, date }).catch(() => null),
          this.railRadar.getTrainsBetween(junc.code, to, { byCity: false }).catch(() => null),
        ]);

        const leg1Trains: any[] = leg1Res?.trains || [];
        const leg2Trains: any[] = leg2Res?.trains || [];

        if (leg1Trains.length === 0 || leg2Trains.length === 0) return null;

        for (const t1 of leg1Trains.slice(0, 5)) {
          const t1Dep = t1.from?.departure || t1.from?.scheduledDeparture;
          const t1Arr = t1.to?.arrival || t1.to?.scheduledArrival;

          if (!isValidTimeString(t1Dep) || !isValidTimeString(t1Arr)) {
            continue;
          }

          const t1ArrMins = parseTimeToMinutes(t1Arr);
          const t1Dur = Number(t1.duration) || computeDurationMins(t1Dep, t1Arr);

          for (const t2 of leg2Trains.slice(0, 5)) {
            const t2Dep = t2.from?.departure || t2.from?.scheduledDeparture;
            const t2Arr = t2.to?.arrival || t2.to?.scheduledArrival;

            if (!isValidTimeString(t2Dep) || !isValidTimeString(t2Arr)) {
              continue;
            }

            const t2DepMins = parseTimeToMinutes(t2Dep);
            const t2Dur = Number(t2.duration) || computeDurationMins(t2Dep, t2Arr);

            // Compute layover minutes
            let layoverMins = t2DepMins - t1ArrMins;
            if (layoverMins < 0) {
              // Day rollover: train departs next calendar morning
              layoverMins += 1440;
            }

            // Feasible connection buffer constraint: 45 min min, 8 hours (480m) max
            if (layoverMins >= 45 && layoverMins <= 480) {
              const totalDurationMins = t1Dur + layoverMins + t2Dur;

              // Compute leg fares
              const [fare1, fare2] = await Promise.all([
                this.railRadar
                  .getTrainFare(String(t1.train?.number || t1.number), from, junc.code, date, classCode, quota)
                  .catch(() => null),
                this.railRadar
                  .getTrainFare(String(t2.train?.number || t2.number), junc.code, to, date, classCode, quota)
                  .catch(() => null),
              ]);

              const f1Val = fare1?.breakdown?.totalFare != null ? Number(fare1.breakdown.totalFare) : null;
              const f2Val = fare2?.breakdown?.totalFare != null ? Number(fare2.breakdown.totalFare) : null;
              const combinedFare = f1Val != null && f2Val != null ? f1Val + f2Val : null;
              const conFareType: FareType = (fare1?.source === 'prs' && fare2?.source === 'prs')
                ? 'QUOTED'
                : (combinedFare != null ? 'ESTIMATED' : 'UNAVAILABLE');

              const leg1Obj: ConnectingLeg = {
                trainNumber: String(t1.train?.number || t1.number),
                trainName: t1.train?.name || t1.name || `Train ${t1.number}`,
                trainType: t1.train?.type || t1.type || 'Express',
                from: { code: from, name: originStation.name },
                to: { code: junc.code, name: junc.name },
                departureTime: t1Dep,
                arrivalTime: t1Arr,
                departureDate: date,
                arrivalDate: date,
                durationMinutes: t1Dur,
                durationFormatted: formatMinutes(t1Dur),
                distanceKm: Number(t1.distance) || null,
                fare: f1Val,
                fareType: fare1?.source === 'prs' ? 'QUOTED' : (f1Val != null ? 'ESTIMATED' : 'UNAVAILABLE'),
                travelClass: classCode,
                availabilityStatus: 'Separate Booking Required',
                availabilityCategory: 'NOT_CHECKED',
              };

              const leg2Obj: ConnectingLeg = {
                trainNumber: String(t2.train?.number || t2.number),
                trainName: t2.train?.name || t2.name || `Train ${t2.number}`,
                trainType: t2.train?.type || t2.type || 'Express',
                from: { code: junc.code, name: junc.name },
                to: { code: to, name: destinationStation.name },
                departureTime: t2Dep,
                arrivalTime: t2Arr,
                departureDate: date,
                arrivalDate: date,
                durationMinutes: t2Dur,
                durationFormatted: formatMinutes(t2Dur),
                distanceKm: Number(t2.distance) || null,
                fare: f2Val,
                fareType: fare2?.source === 'prs' ? 'QUOTED' : (f2Val != null ? 'ESTIMATED' : 'UNAVAILABLE'),
                travelClass: classCode,
                availabilityStatus: 'Separate Booking Required',
                availabilityCategory: 'NOT_CHECKED',
              };

              const connection: ConnectingAlternative = {
                id: `con-${junc.code}-${leg1Obj.trainNumber}-${leg2Obj.trainNumber}`,
                category: 'CONNECTING',
                name: `${leg1Obj.trainName.split(' ')[0]} + ${leg2Obj.trainName.split(' ')[0]} (via ${junc.code})`,
                origin: originStation,
                destination: destinationStation,
                interchangeStation: {
                  code: junc.code,
                  name: junc.name,
                },
                transferLayoverMinutes: layoverMins,
                transferLayoverFormatted: `${Math.floor(layoverMins / 60)}h ${layoverMins % 60}m buffer`,
                leg1: leg1Obj,
                leg2: leg2Obj,
                totalDurationMinutes: totalDurationMins,
                totalDurationFormatted: formatMinutes(totalDurationMins),
                totalFare: combinedFare,
                fareType: conFareType,
                transfersCount: 1,
                layoverLocationNote: `Interchange at ${junc.name} (${junc.code})`,
                availabilityStatus: 'Separate Booking Required',
                availabilityCategory: 'NOT_CHECKED',
                advisoryText:
                  'Notice: Connecting journeys consist of separately booked PNR tickets. Indian Railways does not guarantee connection protection if the first train is delayed.',
                freshness: 'RailRadar Timetable Feed',
              };

              return connection;
            }
          }
        }
        return null;
      } catch {
        return null;
      }
    });

    const connectionsResolved = await Promise.all(junctionPromises);
    for (const c of connectionsResolved) {
      if (c) connectingAlternatives.push(c);
    }

    const totalCandidatePaths =
      sameTrainAlternatives.length +
      directAlternatives.length +
      connectingAlternatives.length;

    return {
      query: {
        from,
        to,
        date,
        class: classCode,
        originalTrainNumber: preferredTrainNumber || undefined,
      },
      isRouteOnly: !preferredTrainNumber,
      originStation,
      destinationStation,
      sameTrainAlternatives,
      directAlternatives,
      connectingAlternatives,
      totalCandidatePaths,
      telemetryFreshness: {
        source: 'RailRadar Timetable Feed',
        fetchedAt: new Date().toISOString(),
        isLive: false,
      },
    };
  }
}
