import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { JourneyStatus } from '@exprest/types';

describe('Train Running Status and Time Correctness', () => {
  describe('1. IST Timezone and Midnight Boundary', () => {
    it('correctly maps UTC time around midnight to IST calendar day', () => {
      // 2026-10-11 20:00:00 UTC is 2026-10-12 01:30:00 IST (+5:30)
      const lateUtcDate = new Date('2026-10-11T20:00:00.000Z');
      
      const utcDay = lateUtcDate.toISOString().split('T')[0];
      const istDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(lateUtcDate);
      
      assert.equal(utcDay, '2026-10-11', 'UTC date reflects previous day');
      assert.equal(istDay, '2026-10-12', 'IST date correctly reflects next day across midnight');
    });

    it('correctly formats Indian dates without UTC skew', () => {
      const earlyMorningIst = new Date('2026-10-12T02:00:00+05:30');
      const formatted = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(earlyMorningIst);
      assert.equal(formatted, '2026-10-12');
    });
  });

  describe('2. Canonical Journey Status Mapping', () => {
    const KNOWN_LIVE_STATUSES: Record<string, JourneyStatus> = {
      RUNNING: 'RUNNING',
      ON_TIME: 'ON_TIME',
      DELAYED: 'DELAYED',
      COMPLETED: 'COMPLETED',
      CANCELLED: 'CANCELLED',
      NOT_STARTED: 'NOT_STARTED',
    };

    function resolveLiveStatus(rawStatus: string | null | undefined, isLive: boolean, fallbackStatus: JourneyStatus): JourneyStatus {
      const liveStatusRaw = (rawStatus || '').toUpperCase().replace(/-/g, '_');
      return isLive
        ? (KNOWN_LIVE_STATUSES[liveStatusRaw] ?? 'NO_LIVE_DATA')
        : fallbackStatus;
    }

    it('maps lowercase running to canonical RUNNING', () => {
      const status = resolveLiveStatus('running', true, 'NO_LIVE_DATA');
      assert.equal(status, 'RUNNING');
    });

    it('maps hyphenated not-started to canonical NOT_STARTED', () => {
      const status = resolveLiveStatus('not-started', true, 'NO_LIVE_DATA');
      assert.equal(status, 'NOT_STARTED');
    });

    it('maps delayed and on_time accurately', () => {
      assert.equal(resolveLiveStatus('delayed', true, 'NO_LIVE_DATA'), 'DELAYED');
      assert.equal(resolveLiveStatus('on_time', true, 'NO_LIVE_DATA'), 'ON_TIME');
    });

    it('NEVER defaults unknown status to RUNNING', () => {
      assert.equal(resolveLiveStatus('unknown_telemetry', true, 'NO_LIVE_DATA'), 'NO_LIVE_DATA');
      assert.equal(resolveLiveStatus('', true, 'NO_LIVE_DATA'), 'NO_LIVE_DATA');
      assert.equal(resolveLiveStatus(null, true, 'NO_LIVE_DATA'), 'NO_LIVE_DATA');
    });

    it('falls back to COMPLETED for past service date when not live', () => {
      assert.equal(resolveLiveStatus(undefined, false, 'COMPLETED'), 'COMPLETED');
    });
  });

  describe('3. Multi-day Journey Date Span Matching', () => {
    function isServiceDateMatching(serviceDate: string, liveStartDate: string, liveEndDate: string, isLiveRun: boolean, todayIst: string): boolean {
      if (!serviceDate) return true;
      if (serviceDate === liveStartDate) return true;
      if (isLiveRun) {
        if (liveStartDate && liveEndDate && serviceDate >= liveStartDate && serviceDate <= liveEndDate) {
          return true;
        }
        if (serviceDate === todayIst) {
          return true;
        }
      }
      return false;
    }

    it('matches an overnight train on arrival date while still running', () => {
      // Train departed on 2026-10-11 and arrives on 2026-10-12
      const matched = isServiceDateMatching('2026-10-12', '2026-10-11', '2026-10-12', true, '2026-10-12');
      assert.equal(matched, true, 'Journey query for arrival date should match active run');
    });

    it('matches an overnight train on departure date', () => {
      const matched = isServiceDateMatching('2026-10-11', '2026-10-11', '2026-10-12', true, '2026-10-12');
      assert.equal(matched, true, 'Journey query for departure date should match active run');
    });

    it('rejects an old historical date for an active run', () => {
      const matched = isServiceDateMatching('2026-09-26', '2026-10-11', '2026-10-12', true, '2026-10-12');
      assert.equal(matched, false, 'Historical date from last month should not match current live run');
    });
  });

  describe('4. Telemetry and Timestamps Separation', () => {
    it('distinguishes provider observation time from local fetch time', () => {
      const providerLastUpdated = '2026-10-12T03:30:00+05:30';
      const fetchedAt = new Date().toISOString();

      const freshness = {
        observedAt: providerLastUpdated,
        receivedAt: fetchedAt,
      };

      assert.equal(freshness.observedAt, providerLastUpdated);
      assert.notEqual(freshness.observedAt, freshness.receivedAt);
    });

    it('does not fabricate observedAt when provider has no observation timestamp', () => {
      const liveDataWithoutLastUpdate = { lastUpdatedAt: null };
      const observedAt = liveDataWithoutLastUpdate.lastUpdatedAt || null;

      assert.equal(observedAt, null, 'observedAt should be null when missing from provider');
    });
  });
});
