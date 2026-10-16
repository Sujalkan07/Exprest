import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { isValidCalendarDate } from '../src/common/validation/schemas.js';
import { JourneyService } from '../src/modules/journeys/JourneyService.js';

describe('Phase 2 Reliability: Journey ID, Telemetry & SSE Stream Tests', () => {

  describe('1. Calendar Date Validation & Journey ID Parsing', () => {
    it('accepts valid calendar dates including leap years', () => {
      assert.equal(isValidCalendarDate('2026-10-24'), true);
      assert.equal(isValidCalendarDate('2028-02-29'), true, '2028 is a leap year');
      assert.equal(isValidCalendarDate('2024-02-29'), true, '2024 is a leap year');
      assert.equal(isValidCalendarDate('2026-01-31'), true);
      assert.equal(isValidCalendarDate('2026-04-30'), true);
    });

    it('rejects impossible calendar dates that pass simple regex format', () => {
      assert.equal(isValidCalendarDate('2026-02-29'), false, '2026 is NOT a leap year');
      assert.equal(isValidCalendarDate('2026-02-30'), false, 'Feb 30 does not exist');
      assert.equal(isValidCalendarDate('2026-02-31'), false, 'Feb 31 does not exist');
      assert.equal(isValidCalendarDate('2026-04-31'), false, 'April has 30 days');
      assert.equal(isValidCalendarDate('2026-06-31'), false, 'June has 30 days');
      assert.equal(isValidCalendarDate('2026-09-31'), false, 'September has 30 days');
      assert.equal(isValidCalendarDate('2026-11-31'), false, 'November has 30 days');
      assert.equal(isValidCalendarDate('2026-13-01'), false, 'Month 13 does not exist');
      assert.equal(isValidCalendarDate('2026-00-15'), false, 'Month 0 does not exist');
      assert.equal(isValidCalendarDate('2026-05-00'), false, 'Day 0 does not exist');
      assert.equal(isValidCalendarDate('2026-05-32'), false, 'Day 32 does not exist');
    });

    it('rejects impossible dates via HTTP GET /api/v1/journeys/:journeyId', async () => {
      const app = await buildApp();

      const resFeb31 = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/journey_12951_2026-02-31',
      });
      assert.equal(resFeb31.statusCode, 400);
      const bodyFeb31 = JSON.parse(resFeb31.payload);
      assert.equal(bodyFeb31.error.code, 'VALIDATION_ERROR');

      const resMonth13 = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/journey_12951_2026-13-01',
      });
      assert.equal(resMonth13.statusCode, 400);

      const resInvalidTrain = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/journey_ABCDE_2026-10-24',
      });
      assert.equal(resInvalidTrain.statusCode, 400);

      const resShortTrain = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/journey_12_2026-10-24',
      });
      assert.equal(resShortTrain.statusCode, 400);

      await app.close();
    });

    it('rejects impossible dates via HTTP GET /api/v1/journeys/:journeyId/analytics', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/journey_12951_2026-02-31/analytics',
      });
      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.equal(body.error.code, 'VALIDATION_ERROR');

      await app.close();
    });

    it('rejects malformed journeyId directly in JourneyService with INVALID_JOURNEY_ID', async () => {
      const journeyService = new JourneyService();

      await assert.rejects(
        () => journeyService.getJourneyDetails('journey_12951_2026-02-31'),
        (err: any) => {
          assert.equal(err.code, 'INVALID_JOURNEY_ID');
          return true;
        }
      );

      await assert.rejects(
        () => journeyService.getJourneyDetails('invalid-journey-format'),
        (err: any) => {
          assert.equal(err.code, 'INVALID_JOURNEY_ID');
          return true;
        }
      );
    });
  });

  describe('2. Telemetry Truthfulness & Zero-Coordinate Safeguard', () => {
    it('safeguards against zero coordinates (0, 0) by falling back to station or setting null', async () => {
      const journeyService = new JourneyService();

      // Mock railRadar provider to simulate zero coordinates returned by upstream telemetry
      (journeyService as any).railRadar = {
        async getRun(trainNumber: string, serviceDate: string) {
          return {
            isLive: true,
            liveStatus: 'RUNNING',
            train: { number: trainNumber, name: 'Test Express' },
            run: { status: 'RUNNING', delayMinutes: 5 },
            stops: [
              { stationId: 'NDLS', stationName: 'New Delhi', status: 'at-station', stationLat: 28.643, stationLon: 77.219, distanceKm: 0 },
              { stationId: 'CNB', stationName: 'Kanpur Central', status: 'upcoming', stationLat: 26.454, stationLon: 80.350, distanceKm: 440 },
            ],
            allStops: [
              { stationCode: 'NDLS', station: { code: 'NDLS', name: 'New Delhi', lat: 28.643, lng: 77.219 } },
            ],
          };
        },
        async getLivePosition(trainNumber: string) {
          return {
            trainNumber,
            latitude: 0,
            longitude: 0,
            status: 'RUNNING',
            delayMinutes: 5,
            currentStationId: 'NDLS',
            currentStationName: 'New Delhi',
            nextStationId: 'CNB',
            nextStationName: 'Kanpur Central',
            speedKph: 0,
            observedAt: '2026-10-24T12:00:00Z',
          };
        },
        async getRouteGeometry() {
          return null;
        },
      };

      const details = await journeyService.getJourneyDetails('journey_12951_2026-10-24');

      // The livePosition must NOT have 0, 0 coordinates!
      assert.notEqual(details.livePosition?.latitude, 0);
      assert.notEqual(details.livePosition?.longitude, 0);
      assert.equal(details.livePosition?.latitude, 28.643);
      assert.equal(details.livePosition?.longitude, 77.219);
      assert.equal((details.livePosition as any)?.isStationFallback, true);
    });

    it('sets coordinates to null if station fallback is also unavailable', async () => {
      const journeyService = new JourneyService();

      (journeyService as any).railRadar = {
        async getRun(trainNumber: string, serviceDate: string) {
          return {
            isLive: true,
            liveStatus: 'RUNNING',
            train: { number: trainNumber, name: 'Test Express' },
            run: { status: 'RUNNING', delayMinutes: 0 },
            stops: [],
            allStops: [],
          };
        },
        async getLivePosition(trainNumber: string) {
          return {
            trainNumber,
            latitude: 0,
            longitude: 0,
            status: 'RUNNING',
            delayMinutes: 0,
            currentStationId: 'UNKNOWN',
            currentStationName: 'Unknown',
            speedKph: 0,
            observedAt: '2026-10-24T12:00:00Z',
          };
        },
        async getRouteGeometry() {
          return null;
        },
      };

      const details = await journeyService.getJourneyDetails('journey_12951_2026-10-24');
      assert.equal(details.livePosition, null, 'Coordinates (0,0) without station fallback must be null');
    });
  });

  describe('3. Historical vs Live Journey Telemetry Separation', () => {
    it('does not attach live run delay to historical journey analytics', async () => {
      const journeyService = new JourneyService();

      // Simulate a historical run where isLive is false
      (journeyService as any).railRadar = {
        async getRun(trainNumber: string, serviceDate: string) {
          return {
            isLive: false,
            liveStatus: 'COMPLETED',
            train: { number: trainNumber, name: 'Rajdhani Express' },
            run: { status: 'COMPLETED', delayMinutes: 10 }, // historical final delay was 10 min
            stops: [
              { stationId: 'NDLS', status: 'departed', distanceKm: 0, stationLat: 28.643, stationLon: 77.219 },
              { stationId: 'BCT', status: 'departed', distanceKm: 1384, stationLat: 18.97, stationLon: 72.82 },
            ],
          };
        },
        async getLivePosition(trainNumber: string) {
          // Today's live run of this train happens to be running 180 min late
          return {
            trainNumber,
            latitude: 23.5,
            longitude: 75.8,
            status: 'RUNNING',
            delayMinutes: 180, // live delay must NOT leak to historical run!
            observedAt: '2026-10-24T12:00:00Z',
          };
        },
      };

      const analytics = await journeyService.getAnalytics('journey_12951_2026-09-01');

      // The historical run delay must be 10 minutes, NOT today's 180 minutes!
      assert.equal(analytics.delayMinutes, 10);
    });

    it('safely rejects live tracking request for historical journeys with 404 LIVE_NOT_FOUND', async () => {
      const journeyService = new JourneyService();

      (journeyService as any).railRadar = {
        async getRun(trainNumber: string, serviceDate: string) {
          return {
            isLive: false,
            liveStatus: 'COMPLETED',
            train: { number: trainNumber, name: 'Rajdhani Express' },
          };
        },
        async getLivePosition(trainNumber: string) {
          return {
            trainNumber,
            status: 'RUNNING',
            delayMinutes: 0,
          };
        },
      };

      await assert.rejects(
        () => journeyService.getLiveStatus('journey_12951_2026-09-01'),
        (err: any) => {
          assert.equal(err.code, 'LIVE_NOT_FOUND');
          return true;
        }
      );
    });
  });

  describe('4. SSE Stream Lifecycle & Error Handling', () => {
    it('sets correct SSE headers on GET /api/v1/journeys/:journeyId/stream', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/journey_12951_2026-10-24/stream',
      });

      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'text/event-stream');
      assert.equal(res.headers['cache-control'], 'no-cache');
      assert.equal(res.headers['connection'], 'keep-alive');

      // Check that it contains an event stream payload
      assert.ok(
        res.payload.includes('event: journey.updated') ||
        res.payload.includes('event: journey.error'),
        `Payload should contain SSE events, received: ${res.payload.slice(0, 100)}`
      );

      await app.close();
    });

    it('rejects invalid journeyId format on stream endpoint with 400', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/journey_12951_2026-02-31/stream',
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.equal(body.error.code, 'VALIDATION_ERROR');

      await app.close();
    });
  });
});
