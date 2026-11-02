# Exprest Functional Bug Fix & Reliability Remediation Report

**Audit Target:** Application Logic, Journey Recommendation Engine, Railway Tariff Calculation  
**Branch:** `security/comprehensive-remediation`  
**Base Commit:** `4a6154c0ae69695611ce65cdf326f5c315cb49d4`  
**Status:** Remediated, Functionally Validated, Zero Regressions  
**Date:** November 2026  

---

## 1. Executive Summary

This report documents the resolution of critical functional defects, railway tariff calculation anomalies, and journey recommendation logic errors across `@exprest/api`. Prior to this remediation, logic defects in status parsing could present sold-out trains as available, connecting journeys failed to compute second-leg boarding dates across midnight boundaries, and fare calculations inflated intermediate segment prices by substituting the full train length.

All logic flaws have been repaired with mathematically sound, domain-accurate Indian Railways algorithmic implementations.

---

## 2. Remediated Functional Defects

### 2.1 Seat Availability Classification Bug (Phase 2)
- **Defect:** In `RailRadarAdapter.ts`, the status parser tested `rawStatus.includes('AVAILABLE')` prior to evaluating negative statuses. Consequently, statuses containing `"NOT AVAILABLE"` or `"NOT-AVAILABLE"` evaluated as `true` for `AVAILABLE`, displaying sold-out seats as confirmed bookable inventory.
- **Root Cause:** Incomplete condition order and lack of normalized negative status matching.
- **Remediation Implementation:**
  - Implemented `RailRadarAdapter.normalizeAvailabilityStatus(status)` with strict precedence order:
    1. Negative statuses (`NOT AVAILABLE`, `NOT-AVAILABLE`, `REGRET`, `CLOSED`, `TRAIN CANCELLED`) evaluated first -> Category `UNAVAILABLE`, `isAvailable: false`.
    2. Waitlist statuses (`WL`, `RLWL`, `GNWL`, `PQWL`, `TQWL`) -> Category `WAITLISTED`, `isAvailable: false`.
    3. RAC statuses (`RAC 12`, `RAC`) -> Category `RAC`, `isAvailable: false` (Reservation Against Cancellation provides boarding right, but NOT a confirmed berth).
    4. Positive statuses (`AVAILABLE`, `AVBL`, `CURR_AVBL`) -> Category `AVAILABLE`, `isAvailable: true`.
    5. Unrecognized strings -> Category `UNKNOWN`, `isAvailable: false`.
  - Upstream network errors or missing PRS responses map strictly to `NOT_CHECKED` or `UNAVAILABLE`, never defaulting to available.

### 2.2 Connecting Journey Date & Overnight Transit Bug (Phases 3 & 4)
- **Defect:** In `AlternativeJourneyService.ts`, when generating 2-leg connecting journeys, the service passed the user's initial requested date to both Leg 1 and Leg 2. For overnight Leg 1 trains or long layovers that crossed midnight (e.g., departing 22:00 Day 1, arriving 06:00 Day 2), Leg 2 queried timetable and availability for Day 1 instead of Day 2, causing impossible connections or missed transfers.
- **Remediation Implementation:**
  - Integrated `railwayDateTime.ts` utilities:
    - Computed Leg 1 arrival calendar date using `calculateArrivalDate(leg1DepDate, leg1DepTime, leg1ArrTime)`.
    - Calculated transit layover duration in minutes.
    - Accurately determined Leg 2 boarding date (`leg2DepDate`) by evaluating whether Leg 2 departure occurred on Leg 1 arrival day or subsequent days.
  - Passed `leg2DepDate` into the Leg 2 schedule search, guaranteeing valid real-world connection feasibility.
  - Formatted connecting journey advisory notices to clearly state transfer layover, arrival date, and second-leg boarding date.

### 2.3 Strict Time Validation & Midnight Boundary Calculations (Phase 5)
- **Defect:** Timetable parsers accepted out-of-range times (such as `24:00`, `25:90`, `99:99`), leading to `NaN` durations and erroneous journey feasibility scores.
- **Remediation Implementation:**
  - Implemented `isValidTimeString(t)` validating `^(?:[01]\d|2[0-3]):[0-5]\d$`. Rejects 24:00, 25:90, and non-numeric strings.
  - Created `computeDurationMins(depTime, arrTime, daysSpan)` correctly handling same-day journeys and multi-day transits without negative or `NaN` minutes.
  - Added unit test coverage proving strict rejection of all invalid time strings.

### 2.4 Journey Date Normalization & Historical Query Protection (Phase 6)
- **Defect:** Date parsing silently converted past dates to today's date for all queries, masking errors and preventing historical analysis. In addition, regex parsers accepted invalid dates such as February 30 or April 31.
- **Remediation Implementation:**
  - Implemented `parseCalendarDate(str)` with calendar month validation and leap-year leap-day verification (rejects `2026-02-29`, accepts `2024-02-29`).
  - Implemented `normalizeFareDate(date, options)`:
    - When `allowHistorical: false` (used during live seat availability queries), requests with dates in the past throw an `AppError('INVALID_QUERY', ..., 400)`.
    - Historical dates are preserved without silent mutation when analyzing past records.

### 2.5 Railway Tariff & Telescopic Fare Calculation Reliability (Phase 7)
- **Defect:** In `RailRadarAdapter.ts`, when upstream fare endpoints returned 404, the fallback telescopic calculation defaulted to using the total train journey distance (or an arbitrary 800 km default), charging short-distance passengers full train route fares (e.g. 2500 km for a 200 km journey).
- **Remediation Implementation:**
  - Eliminated arbitrary 800 km constants.
  - Looked up intermediate station stops to compute exact segment distance: `segmentDistance = toStop.distance - fromStop.distance`.
  - Full train distance is only utilized if passenger journey points match the train's origin and terminus.
  - If a verified segment distance cannot be computed, `getTrainFare()` returns `source: 'unavailable'` with a null breakdown rather than fabricating artificial fares.

### 2.6 Route-Aware Junction Topology Discovery (Phase 9)
- **Defect:** Alternative connecting journey discovery previously sliced a static array of four junctions (`['BPL', 'BZA', 'ET', 'NGP']`) regardless of source and destination corridors, failing for East-West, Northern, or Southern routes.
- **Remediation Implementation:**
  - Implemented `selectCandidateJunctions(from, to)` indexing key Indian Railway transit hubs across 8 strategic corridors (Western, Central/Southern, Northern, Eastern, Konkan, South-Central, Grand Trunk, North-East).
  - Excluded origin and destination stations from candidate interchange selection.
  - Added cached timetable lookups (`getTrainsBetweenCached`) to prevent excessive outbound API requests during multi-junction fanout.

---

## 3. Verification & Regression Matrix

| Phase | Functional Test Scenario | Verification Status |
|---|---|---|
| Phase 2 | "NOT AVAILABLE" normalizes to UNAVAILABLE, isAvailable: false | PASS |
| Phase 2 | "RAC 12" normalizes to RAC, isAvailable: false | PASS |
| Phase 2 | "WL 45" normalizes to WAITLISTED, isAvailable: false | PASS |
| Phase 2 | "AVAILABLE 0024" normalizes to AVAILABLE, isAvailable: true | PASS |
| Phase 3 | Overnight Leg 1 advances Leg 2 boarding date across midnight | PASS |
| Phase 4 | Multi-day arrival date calculation handles 1-day, 2-day transits | PASS |
| Phase 5 | Strict rejection of `24:00`, `25:90`, `99:99`, `12:75` | PASS |
| Phase 6 | Rejection of `2026-02-29` (non-leap) and `2026-04-31` (invalid day) | PASS |
| Phase 6 | 400 rejection for past dates on live availability | PASS |
| Phase 7 | Telescopic fallback uses route stop segment distance | PASS |
| Phase 7 | Returns unavailable when segment distance cannot be determined | PASS |
| Phase 9 | Corridor-aware junction discovery selects relevant transit hubs | PASS |
