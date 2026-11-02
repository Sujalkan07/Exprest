import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { RailRadarAdapter } from '../src/providers/railradar/RailRadarAdapter.js';
import { AppError } from '../src/common/errors/AppError.js';

describe('Phase 2, 6 & 7 — Availability Classification, Date Normalization & Fare Reliability Suite', () => {

  describe('Phase 2 — Seat Availability Classification Truthfulness', () => {
    it('REGRESSION: strictly guarantees that NOT AVAILABLE never becomes AVAILABLE', () => {
      const negativeVariants = [
        'NOT AVAILABLE',
        'not available',
        'Not Available',
        'NOT-AVAILABLE',
        'not-available',
        'NOT_AVAILABLE',
        '  NOT AVAILABLE  ',
        'REGRET / NOT AVAILABLE',
        'TRAIN DEPARTED / NOT AVAILABLE',
      ];

      for (const variant of negativeVariants) {
        const res = RailRadarAdapter.normalizeAvailabilityStatus(variant);
        assert.equal(
          res.category,
          'UNAVAILABLE',
          `Variant '${variant}' must be categorized as UNAVAILABLE, got ${res.category}`
        );
        assert.equal(
          res.isAvailable,
          false,
          `Variant '${variant}' must have isAvailable = false`
        );
      }
    });

    it('correctly maps all positive available statuses to AVAILABLE', () => {
      const positiveVariants = [
        'AVAILABLE',
        'available',
        '  AVAILABLE  ',
        'AVBL',
        'avbl',
        'CURR_AVBL',
        'CURR AVBL',
        'AVAILABLE 42',
        'AVAILABLE-0024',
        'AVBL 10',
        'CURRENTLY AVAILABLE',
      ];

      for (const variant of positiveVariants) {
        const res = RailRadarAdapter.normalizeAvailabilityStatus(variant);
        assert.equal(
          res.category,
          'AVAILABLE',
          `Variant '${variant}' must be categorized as AVAILABLE`
        );
        assert.equal(
          res.isAvailable,
          true,
          `Variant '${variant}' must have isAvailable = true`
        );
      }
    });

    it('classifies RAC accurately without representing it as a confirmed seat', () => {
      const racVariants = [
        'RAC',
        'rac',
        'RAC 12',
        'RAC 1',
        'RAC/25',
        '  RAC 04  ',
      ];

      for (const variant of racVariants) {
        const res = RailRadarAdapter.normalizeAvailabilityStatus(variant);
        assert.equal(
          res.category,
          'RAC',
          `Variant '${variant}' must be categorized as RAC`
        );
        assert.equal(
          res.isAvailable,
          false,
          `RAC variant '${variant}' must NOT be represented as confirmed available`
        );
      }
    });

    it('classifies waitlisted tickets as WAITLISTED without presenting them as available', () => {
      const wlVariants = [
        'WL',
        'WL 15',
        'GNWL 45/WL 12',
        'PQWL 10/WL 5',
        'RLWL 2',
        'TQWL 8',
        'WAITLIST',
        'WAITLISTED',
        'WAITING',
      ];

      for (const variant of wlVariants) {
        const res = RailRadarAdapter.normalizeAvailabilityStatus(variant);
        assert.equal(
          res.category,
          'WAITLISTED',
          `Variant '${variant}' must be categorized as WAITLISTED`
        );
        assert.equal(
          res.isAvailable,
          false,
          `Waitlisted variant '${variant}' must NOT be available`
        );
      }
    });

    it('classifies REGRET, CLOSED, and negative statuses as UNAVAILABLE', () => {
      const unavailableVariants = [
        'REGRET',
        'regret',
        'CLOSED',
        'closed',
        'NO SEATS',
        'CANNOT ALLOT',
        'DEPARTED',
      ];

      for (const variant of unavailableVariants) {
        const res = RailRadarAdapter.normalizeAvailabilityStatus(variant);
        assert.equal(
          res.category,
          'UNAVAILABLE',
          `Variant '${variant}' must be categorized as UNAVAILABLE`
        );
        assert.equal(res.isAvailable, false);
      }
    });

    it('classifies unknown statuses as UNKNOWN and preserves distinction from UNAVAILABLE', () => {
      const unknownVariants = [
        'CHARTING_PENDING',
        'TECHNICAL_HOLD',
        'SOME_FUTURE_CODE_123',
      ];

      for (const variant of unknownVariants) {
        const res = RailRadarAdapter.normalizeAvailabilityStatus(variant);
        assert.equal(
          res.category,
          'UNKNOWN',
          `Variant '${variant}' must be categorized as UNKNOWN`
        );
        assert.equal(res.isAvailable, false);
      }
    });

    it('classifies null, undefined, and empty string as NOT_CHECKED', () => {
      assert.equal(RailRadarAdapter.normalizeAvailabilityStatus(null).category, 'NOT_CHECKED');
      assert.equal(RailRadarAdapter.normalizeAvailabilityStatus(undefined).category, 'NOT_CHECKED');
      assert.equal(RailRadarAdapter.normalizeAvailabilityStatus('').category, 'NOT_CHECKED');
      assert.equal(RailRadarAdapter.normalizeAvailabilityStatus('   ').category, 'NOT_CHECKED');
    });
  });

  describe('Phase 6 — Journey Date Normalization & Calendar Integrity', () => {
    it('accurately parses valid future and current calendar dates', () => {
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-11-15'), '2026-11-15');
      assert.equal(RailRadarAdapter.parseCalendarDate('15-11-2026'), '2026-11-15');
      assert.equal(RailRadarAdapter.parseCalendarDate('15/11/2026'), '2026-11-15');
    });

    it('correctly handles leap years and rejects non-leap year Feb 29', () => {
      // 2024 is a leap year (Feb 29 exists)
      assert.equal(RailRadarAdapter.parseCalendarDate('2024-02-29'), '2024-02-29');
      // 2026 is NOT a leap year (Feb 29 does not exist)
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-02-29'), null);
      // Feb 30 never exists
      assert.equal(RailRadarAdapter.parseCalendarDate('2024-02-30'), null);
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-02-30'), null);
    });

    it('strictly rejects impossible dates (e.g. April 31, Month 13, Day 32)', () => {
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-04-31'), null); // April has 30 days
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-06-31'), null); // June has 30 days
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-09-31'), null); // September has 30 days
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-11-31'), null); // November has 30 days
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-13-01'), null); // Month 13 invalid
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-00-10'), null); // Month 0 invalid
      assert.equal(RailRadarAdapter.parseCalendarDate('2026-05-32'), null); // Day 32 invalid
    });

    it('NEVER silently replaces a requested historical date when historical queries are allowed', () => {
      const historicalDate = '2024-01-15';
      const result = RailRadarAdapter.normalizeFareDate(historicalDate, { allowHistorical: true });
      assert.equal(result, '2024-01-15', 'Requested historical date must be preserved exactly');
    });

    it('explicitly rejects historical dates with clear validation error for live seat availability', () => {
      const historicalDate = '2024-01-15';
      assert.throws(
        () => RailRadarAdapter.normalizeFareDate(historicalDate, { allowHistorical: false }),
        (err: any) => {
          assert.ok(err instanceof AppError);
          assert.equal(err.statusCode, 400);
          assert.ok(err.message.includes('Historical journey date'));
          return true;
        }
      );
    });

    it('defaults to today in IST when date is empty or undefined', () => {
      const todayIst = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      assert.equal(RailRadarAdapter.normalizeFareDate(), todayIst);
      assert.equal(RailRadarAdapter.normalizeFareDate(null), todayIst);
      assert.equal(RailRadarAdapter.normalizeFareDate(''), todayIst);
    });
  });

  describe('Phase 7 — Fare Calculation Reliability & Distance Safeguards', () => {
    it('removes arbitrary 800 km fallback and returns null when distance is missing or non-positive', () => {
      assert.equal(RailRadarAdapter.computeTelescopicFareFallback(0, '3A'), null);
      assert.equal(RailRadarAdapter.computeTelescopicFareFallback(-100, '3A'), null);
      assert.equal(RailRadarAdapter.computeTelescopicFareFallback(NaN, '3A'), null);
      assert.equal(RailRadarAdapter.computeTelescopicFareFallback(null as any, '3A'), null);
    });

    it('calculates proportional telescopic fare for actual segment distance', () => {
      const shortDistance = 200; // e.g. MTJ to KOTA
      const shortFare = RailRadarAdapter.computeTelescopicFareFallback(shortDistance, '3A', true);
      assert.ok(shortFare);
      assert.ok(shortFare.totalFare > 0);

      const longDistance = 1400; // full train run
      const longFare = RailRadarAdapter.computeTelescopicFareFallback(longDistance, '3A', true);
      assert.ok(longFare);
      assert.ok(longFare.totalFare > shortFare.totalFare, 'Full run fare must exceed short segment fare');
    });

    it('returns UNAVAILABLE fare structure when neither PRS quote nor segment distance can be verified', async () => {
      const adapter = new RailRadarAdapter();
      // Use non-existent stations and train number to trigger unverified fallback path
      const result = await adapter.getTrainFare('00000', 'NONEXISTENT_FROM', 'NONEXISTENT_TO', '2026-11-15', '3A');
      assert.equal(result.source, 'unavailable');
      assert.equal(result.breakdown, null);
      assert.equal(result.distance, null);
    });
  });
});
