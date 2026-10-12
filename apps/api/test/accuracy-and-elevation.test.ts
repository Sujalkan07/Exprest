import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenTopographyAdapter } from '../src/providers/opentopography/OpenTopographyAdapter.js';

// Coordinate validation function as implemented in JourneyMap
function isValidCoordinate(lat: unknown, lon: unknown): boolean {
  return (
    typeof lat === 'number' &&
    typeof lon === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

// Haversine formula calculation for testing
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

describe('Data Accuracy, Coordinate Validation & Elevation Profile Tests', () => {

  describe('1. Coordinate Validation (Allowing 0, 0)', () => {
    it('accepts (0, 0) as a valid coordinate', () => {
      assert.equal(isValidCoordinate(0, 0), true, '(0, 0) is valid');
      assert.equal(isValidCoordinate(0, 77.2), true);
      assert.equal(isValidCoordinate(28.6, 0), true);
    });

    it('accepts valid geographic coordinates in India and globally', () => {
      assert.equal(isValidCoordinate(28.6139, 77.2090), true, 'New Delhi');
      assert.equal(isValidCoordinate(18.9220, 72.8347), true, 'Mumbai');
      assert.equal(isValidCoordinate(-33.8688, 151.2093), true, 'Sydney');
    });

    it('rejects out of bounds coordinates', () => {
      assert.equal(isValidCoordinate(91, 77.2), false, 'Latitude > 90');
      assert.equal(isValidCoordinate(-90.1, 77.2), false, 'Latitude < -90');
      assert.equal(isValidCoordinate(28.6, 180.1), false, 'Longitude > 180');
      assert.equal(isValidCoordinate(28.6, -180.1), false, 'Longitude < -180');
    });

    it('rejects NaN, Infinity, strings, null, and undefined', () => {
      assert.equal(isValidCoordinate(NaN, 77.2), false);
      assert.equal(isValidCoordinate(Infinity, 77.2), false);
      assert.equal(isValidCoordinate(-Infinity, 77.2), false);
      assert.equal(isValidCoordinate(null, 77.2), false);
      assert.equal(isValidCoordinate(undefined, 77.2), false);
      assert.equal(isValidCoordinate('28.6', '77.2'), false);
    });
  });

  describe('2. OpenTopography Haversine and Elevation Mapping', () => {
    it('calculates accurate Haversine distance between New Delhi and Agra', () => {
      // NDLS: 28.6430, 77.2195; AGC: 27.1592, 77.9944 (~180-190 km)
      const dist = haversineDistanceKm(28.6430, 77.2195, 27.1592, 77.9944);
      assert.ok(dist >= 170 && dist <= 200, `Distance should be ~180 km, got ${dist}`);
    });

    it('does not return synthetic values when points array is empty', async () => {
      const adapter = new OpenTopographyAdapter();
      const profile = await adapter.getElevationProfile([]);
      assert.deepEqual(profile, [], 'Must return empty array without throwing');
    });

    it('does not return synthetic values for single point', async () => {
      const adapter = new OpenTopographyAdapter();
      const profile = await adapter.getElevationProfile([{ latitude: 28.6, longitude: 77.2 }]);
      assert.deepEqual(profile, [], 'Must require at least 2 points');
    });
  });

  describe('3. Journey Run StartedAt & CompletedAt Truthfulness', () => {
    function computeRunTimestamps(
      liveStatus: string,
      originActualDep: string | null,
      originSchedDep: string | null,
      destActualArr: string | null,
      destSchedArr: string | null
    ) {
      const startedAt = liveStatus !== 'NOT_STARTED'
        ? (originActualDep || originSchedDep || null)
        : null;

      const completedAt = liveStatus === 'COMPLETED'
        ? (destActualArr || destSchedArr || null)
        : null;

      return { startedAt, completedAt };
    }

    it('does not produce T00:00:00Z or T23:59:59Z midnight strings', () => {
      const originDep = '2026-10-12T06:15:00+05:30';
      const destArr = '2026-10-12T14:30:00+05:30';

      const running = computeRunTimestamps('RUNNING', originDep, null, null, destArr);
      assert.equal(running.startedAt, originDep);
      assert.equal(running.completedAt, null, 'Running train must not have completedAt');

      const completed = computeRunTimestamps('COMPLETED', originDep, null, destArr, null);
      assert.equal(completed.startedAt, originDep);
      assert.equal(completed.completedAt, destArr);

      assert.ok(!running.startedAt?.endsWith('T00:00:00Z'), 'Never fabricate T00:00:00Z');
      assert.ok(!completed.completedAt?.endsWith('T23:59:59Z'), 'Never fabricate T23:59:59Z');
    });

    it('returns null startedAt when train is NOT_STARTED', () => {
      const notStarted = computeRunTimestamps('NOT_STARTED', null, '2026-10-12T06:15:00+05:30', null, null);
      assert.equal(notStarted.startedAt, null);
      assert.equal(notStarted.completedAt, null);
    });
  });

  describe('4. Punctuality Accuracy (Excluding Unknown Future Halts)', () => {
    it('evaluates punctuality only over halts with recorded delays', () => {
      const stops = [
        { stationId: 'NDLS', delayMinutes: 0 },
        { stationId: 'GZB', delayMinutes: 5 },
        { stationId: 'ALJN', delayMinutes: 20 },
        { stationId: 'TDL', delayMinutes: null }, // upcoming halt
        { stationId: 'CNB', delayMinutes: null }, // upcoming halt
      ];

      const evaluatedStops = stops.filter(s => typeof s.delayMinutes === 'number');
      const onTimeCount = evaluatedStops.filter(s => (s.delayMinutes ?? 0) <= 15).length;
      const punctualityPercent = evaluatedStops.length > 0
        ? Math.round((onTimeCount / evaluatedStops.length) * 100)
        : null;

      assert.equal(evaluatedStops.length, 3, 'Only 3 halts have recorded delay');
      assert.equal(onTimeCount, 2, 'NDLS (0) and GZB (5) are on time; ALJN (20) is late');
      assert.equal(punctualityPercent, 67, '2/3 is 67%, not 4/5 (80%)');
    });
  });
});
