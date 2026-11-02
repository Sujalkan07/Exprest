/**
 * Railway Date, Time & Journey Duration Utilities
 * Enforces strict 24-hour time boundaries (00:00 to 23:59),
 * midnight rollovers, multi-day calendar arithmetic, and layover buffers.
 */

/**
 * Validates strictly formatted 24-hour time string in HH:mm format.
 * Valid ranges: hours 00-23, minutes 00-59.
 * Rejects 24:00, 25:90, 99:99, 12:75, malformed strings, null, undefined.
 */
export function isValidTimeString(timeStr?: string | null): boolean {
  if (!timeStr || typeof timeStr !== 'string') return false;
  const trimmed = timeStr.trim();
  const match = /^([0-1]?[0-9]|2[0-3]):([0-5][0-9])$/.exec(trimmed);
  if (!match) return false;
  const hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

/**
 * Parses a valid 24-hour time string to total minutes from midnight (0 to 1439).
 * Returns null if the time string is invalid.
 */
export function parseTimeToMinutes(timeStr?: string | null): number | null {
  if (!isValidTimeString(timeStr)) return null;
  const [hStr, mStr] = timeStr!.trim().split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  return h * 60 + m;
}

/**
 * Computes duration in minutes between departure time and arrival time.
 * If arrival time is earlier than departure time, accounts for midnight rollover (+1440 mins).
 * Returns null if either time string is invalid.
 */
export function computeDurationMins(depStr: string, arrStr: string): number | null {
  const depM = parseTimeToMinutes(depStr);
  const arrM = parseTimeToMinutes(arrStr);
  if (depM == null || arrM == null) return null;
  if (arrM >= depM) {
    return arrM - depM;
  }
  // Midnight day rollover
  return 1440 - depM + arrM;
}

/**
 * Formats a duration in minutes into human-readable string (e.g. '2h 15m' or '45m').
 */
export function formatMinutes(mins: number | null | undefined): string {
  if (mins == null || isNaN(mins) || mins <= 0) return 'Schedule Pending';
  const h = Math.floor(mins / 60);
  const m = Math.round(mins % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m < 10 ? '0' : ''}${m}m`;
}

/**
 * Safely adds days to a calendar date (YYYY-MM-DD) using UTC arithmetic.
 * Correctly accounts for month transitions, leap years, and year boundaries.
 */
export function addDaysToDate(dateStr: string, daysToAdd: number): string {
  if (daysToAdd === 0) return dateStr;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + daysToAdd, 12, 0, 0));
  const newY = dt.getUTCFullYear();
  const newM = String(dt.getUTCMonth() + 1).padStart(2, '0');
  const newD = String(dt.getUTCDate()).padStart(2, '0');
  return `${newY}-${newM}-${newD}`;
}

/**
 * Calculates the exact arrival calendar date for a train journey.
 * Uses provider-supplied arrival date if valid; otherwise calculates day rollover
 * from departure date, departure time, arrival time, and duration.
 */
export function calculateArrivalDate(
  departureDate: string,
  depTime: string,
  arrTime: string,
  durationMinutes?: number | null,
  providerArrivalDate?: string | null
): string {
  // 1. Use provider arrival date if valid calendar date
  if (providerArrivalDate && /^\d{4}-\d{2}-\d{2}$/.test(providerArrivalDate.trim())) {
    const cleanProviderDate = providerArrivalDate.trim();
    if (cleanProviderDate >= departureDate) {
      return cleanProviderDate;
    }
  }

  const depM = parseTimeToMinutes(depTime);
  const arrM = parseTimeToMinutes(arrTime);

  // 2. If duration is explicitly known and depM is valid
  if (depM != null && durationMinutes != null && !isNaN(durationMinutes) && durationMinutes > 0) {
    const totalMinsFromDepMidnight = depM + durationMinutes;
    const daysAdded = Math.floor(totalMinsFromDepMidnight / 1440);
    return addDaysToDate(departureDate, daysAdded);
  }

  // 3. Fallback: if arrM < depM, journey crossed midnight into the next day
  if (depM != null && arrM != null && arrM < depM) {
    return addDaysToDate(departureDate, 1);
  }

  return departureDate;
}

/**
 * Evaluates feasibility of connecting two trains at an interchange junction.
 * Calculates boarding date for the second train and layover duration.
 * Enforces minimum layover (45 mins) and maximum layover (480 mins / 8 hours).
 */
export function evaluateConnectionFeasibility(
  leg1ArrDate: string,
  leg1ArrTime: string,
  leg2DepTime: string,
  minLayoverMins = 45,
  maxLayoverMins = 480
): {
  isFeasible: boolean;
  leg2DepDate: string;
  layoverMinutes: number;
} | null {
  const t1ArrMins = parseTimeToMinutes(leg1ArrTime);
  const t2DepMins = parseTimeToMinutes(leg2DepTime);

  if (t1ArrMins == null || t2DepMins == null) {
    return null;
  }

  // Case A: Train 2 departs later on the SAME calendar day as Leg 1 arrival
  if (t2DepMins >= t1ArrMins) {
    const sameDayLayover = t2DepMins - t1ArrMins;
    if (sameDayLayover >= minLayoverMins && sameDayLayover <= maxLayoverMins) {
      return {
        isFeasible: true,
        leg2DepDate: leg1ArrDate,
        layoverMinutes: sameDayLayover,
      };
    }

    // If sameDayLayover < minLayoverMins, passenger cannot board same day.
    // Check if boarding next morning's service is within max layover
    const nextDayLayover = (1440 - t1ArrMins) + t2DepMins;
    if (nextDayLayover >= minLayoverMins && nextDayLayover <= maxLayoverMins) {
      return {
        isFeasible: true,
        leg2DepDate: addDaysToDate(leg1ArrDate, 1),
        layoverMinutes: nextDayLayover,
      };
    }

    return null;
  }

  // Case B: Train 2 departs at a time earlier than Leg 1 arrival (overnight layover into next morning)
  const overnightLayover = (1440 - t1ArrMins) + t2DepMins;
  if (overnightLayover >= minLayoverMins && overnightLayover <= maxLayoverMins) {
    return {
      isFeasible: true,
      leg2DepDate: addDaysToDate(leg1ArrDate, 1),
      layoverMinutes: overnightLayover,
    };
  }

  return null;
}
