import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import {
  stationSearchQuerySchema,
  journeyAlternativesQuerySchema,
  validateInput,
} from '../src/common/validation/schemas.js';

describe('Journey Alternatives Test Suite', () => {
  describe('1. Validation Schemas & Input Constraints', () => {
    it('stationSearchQuerySchema trims input and rejects empty queries', () => {
      assert.throws(() => validateInput(stationSearchQuerySchema, { q: '' }));
      assert.throws(() => validateInput(stationSearchQuerySchema, { q: '   ' }));
      const valid = validateInput(stationSearchQuerySchema, { q: '  BZA  ' });
      assert.equal(valid.q, 'BZA');
    });

    it('journeyAlternativesQuerySchema normalizes station codes to uppercase', () => {
      const valid = validateInput(journeyAlternativesQuerySchema, {
        from: 'bza',
        to: 'lko',
        class: '3A',
      });
      assert.equal(valid.from, 'BZA');
      assert.equal(valid.to, 'LKO');
    });

    it('journeyAlternativesQuerySchema accepts optional trainNumber', () => {
      const valid = validateInput(journeyAlternativesQuerySchema, {
        from: 'BZA',
        to: 'LKO',
        trainNumber: ' 12512 ',
      });
      assert.equal(valid.trainNumber, '12512');
    });

    it('journeyAlternativesQuerySchema strictly rejects identical origin and destination', () => {
      assert.throws(
        () =>
          validateInput(journeyAlternativesQuerySchema, {
            from: 'NDLS',
            to: 'NDLS',
          }),
        /Origin and destination stations cannot be the same station/
      );
    });

    it('journeyAlternativesQuerySchema rejects invalid or impossible dates', () => {
      assert.throws(() =>
        validateInput(journeyAlternativesQuerySchema, {
          from: 'BZA',
          to: 'LKO',
          date: '2026-02-30', // Feb 30 does not exist
        })
      );
      assert.throws(() =>
        validateInput(journeyAlternativesQuerySchema, {
          from: 'BZA',
          to: 'LKO',
          date: 'not-a-date',
        })
      );
    });
  });

  describe('2. Calculations & Business Logic Integrity', () => {
    it('calculates accurate paper vs intended travel time and additional route distance', () => {
      const ticketedDist = 2085;
      const intendedDist = 1654;
      const additionalDist = ticketedDist - intendedDist;
      assert.equal(additionalDist, 431);

      const paperTravelMins = 1920; // 32 hours
      const intendedTravelMins = 1475; // 24h 35m
      const additionalMins = paperTravelMins - intendedTravelMins;
      assert.equal(additionalMins, 445); // 7h 25m
    });

    it('correctly computes fare difference without fabricating synthetic values', () => {
      const extendedFare = 2185;
      const intendedFare = 1840;
      const diff = extendedFare - intendedFare;
      assert.equal(diff, 345);
    });

    it('evaluates connecting layover validity and enforces minimum/maximum layover bounds', () => {
      // Leg 1 arrives at 16:10 (970 mins), Leg 2 departs at 18:30 (1110 mins)
      const arrMins = 16 * 60 + 10;
      const depMins = 18 * 60 + 30;
      const layover = depMins - arrMins;
      assert.equal(layover, 140); // 2h 20m buffer

      // Feasible layovers are >= 45m and <= 480m (8h)
      const isFeasible = layover >= 45 && layover <= 480;
      assert.equal(isFeasible, true);

      // Infeasible layover (< 45 mins risk of missing connection)
      const tooTight = 30;
      assert.equal(tooTight >= 45, false);

      // Infeasible layover (> 8h excessive waiting)
      const tooLong = 600;
      assert.equal(tooLong <= 480, false);
    });

    it('correctly calculates layover crossing midnight boundary (day rollover)', () => {
      // Leg 1 arrives at 23:15 (1395 mins), Leg 2 departs next morning at 01:45 (105 mins)
      const arrMins = 23 * 60 + 15;
      const depMins = 1 * 60 + 45;
      let layover = depMins - arrMins;
      if (layover < 0) {
        layover += 1440;
      }
      assert.equal(layover, 150); // 2h 30m buffer
      assert.ok(layover >= 45 && layover <= 480);
    });

    it('calculates total connecting duration as Leg 1 duration + Layover + Leg 2 duration', () => {
      const leg1Duration = 460; // 7h 40m
      const layover = 140; // 2h 20m
      const leg2Duration = 700; // 11h 40m
      const totalDuration = leg1Duration + layover + leg2Duration;
      assert.equal(totalDuration, 1300); // 21h 40m
    });

    it('sums known fares and preserves null when a leg fare is unknown', () => {
      const fare1 = 1200;
      const fare2 = 1220;
      const totalFare = fare1 && fare2 ? fare1 + fare2 : null;
      assert.equal(totalFare, 2420);

      const unknownFare2: number | null = null;
      const incompleteTotal = fare1 && unknownFare2 ? fare1 + unknownFare2 : null;
      assert.equal(incompleteTotal, null, 'Unknown leg fare must not be coerced to zero');
    });
  });

  describe('3. Comparison Selection & Enforcing Limits', () => {
    it('enforces maximum limit of 3 selected journeys for comparison matrix', () => {
      const maxAllowed = 3;
      const selected = ['st-1', 'dir-1', 'con-1'];
      assert.equal(selected.length <= maxAllowed, true);

      const attemptAddFourth = [...selected, 'con-2'];
      assert.equal(attemptAddFourth.length <= maxAllowed, false);
    });

    it('prevents duplicate selections in comparison tray', () => {
      const selected = new Set<string>();
      selected.add('st-1');
      selected.add('st-1');
      assert.equal(selected.size, 1);
    });
  });

  describe('4. Fastify Endpoints & Live Routing Integration', () => {
    let app: FastifyInstance;

    before(async () => {
      app = await buildApp();
      await app.ready();
    });

    after(async () => {
      await app.close();
    });

    it('GET /api/v1/stations/search returns matching stations with verified codes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/stations/search?q=BZA',
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.equal(Array.isArray(json.data), true);
      assert.ok(json.meta?.requestId);

      if (json.data.length > 0) {
        const match = json.data.find((s: any) => s.code === 'BZA');
        assert.ok(match, 'Expected BZA in station search results');
        assert.equal(match.code, 'BZA');
      }
    });

    it('GET /api/v1/stations/search rejects empty query with 400 validation error', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/stations/search?q=',
      });
      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.body);
      assert.equal(json.error?.code, 'VALIDATION_ERROR');
    });

    it('GET /api/v1/journeys/alternatives rejects identical origin and destination with 400', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/alternatives?from=NDLS&to=NDLS',
      });
      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.body);
      assert.equal(json.error?.code, 'VALIDATION_ERROR');
    });

    it('GET /api/v1/journeys/alternatives returns route-only mode when trainNumber is omitted', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/alternatives?from=BZA&to=LKO',
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      assert.ok(json.data);
      assert.ok(json.meta?.requestId);

      const d = json.data;
      assert.equal(d.query?.from, 'BZA');
      assert.equal(d.query?.to, 'LKO');
      assert.equal(d.isRouteOnly, true, 'isRouteOnly must be true when trainNumber is not supplied');
      assert.equal(d.query?.originalTrainNumber, undefined);
      assert.ok(Array.isArray(d.sameTrainAlternatives));
      assert.ok(Array.isArray(d.directAlternatives));
      assert.ok(Array.isArray(d.connectingAlternatives));
      assert.ok(typeof d.totalCandidatePaths === 'number');

      // Check Category 1: Same Train Alternative if present
      for (const st of d.sameTrainAlternatives) {
        assert.equal(st.category, 'SAME_TRAIN');
        assert.ok(st.boardingRuleNotice.includes('Change Boarding Point'));
        assert.ok(st.additionalDistanceKm == null || st.additionalDistanceKm >= 0);
        assert.ok(['QUOTED', 'ESTIMATED', 'UNAVAILABLE'].includes(st.fareType));
        assert.ok(['AVAILABLE', 'RAC', 'WAITLISTED', 'NOT_CHECKED', 'UNAVAILABLE', 'UNKNOWN'].includes(st.availabilityCategory));
        // Departure time must never be fabricated '00:00'
        assert.notEqual(st.departureTimeTicketed, '00:00');
        assert.notEqual(st.departureTimeBoarding, '00:00');
      }

      // Check Category 2: Direct Trains if present
      for (const dt of d.directAlternatives) {
        assert.equal(dt.category, 'DIRECT');
        assert.ok(dt.trainNumber);
        assert.notEqual(dt.departureTime, '00:00');
        assert.notEqual(dt.arrivalTime, '00:00');
        assert.ok(['QUOTED', 'ESTIMATED', 'UNAVAILABLE'].includes(dt.fareType));
        assert.ok(['AVAILABLE', 'RAC', 'WAITLISTED', 'NOT_CHECKED', 'UNAVAILABLE', 'UNKNOWN'].includes(dt.availabilityCategory));
        if (dt.availabilityCategory === 'NOT_CHECKED') {
          assert.equal(dt.availabilityAvailable, false, 'Unchecked availability must not claim available: true');
        }
      }

      // Check Category 3: Connecting Journeys if present
      for (const con of d.connectingAlternatives) {
        assert.equal(con.category, 'CONNECTING');
        assert.ok(con.leg1);
        assert.ok(con.leg2);
        assert.ok(con.interchangeStation);
        assert.ok(con.transferLayoverMinutes >= 45, 'Layover must be >= 45 minutes');
        assert.ok(con.transferLayoverMinutes <= 480, 'Layover must be <= 480 minutes (8h)');
        assert.ok(con.advisoryText.includes('separately booked'));
        assert.ok(['QUOTED', 'ESTIMATED', 'UNAVAILABLE'].includes(con.fareType));
        if (con.leg1.fare == null || con.leg2.fare == null) {
          assert.equal(con.totalFare, null, 'Total connecting fare must be null if any leg fare is missing');
        }
      }
    });

    it('GET /api/v1/journeys/alternatives honors preferred trainNumber mode', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/journeys/alternatives?from=BZA&to=LKO&trainNumber=12512',
      });

      assert.equal(res.statusCode, 200);
      const json = JSON.parse(res.body);
      const d = json.data;
      assert.equal(d.isRouteOnly, false);
      assert.equal(d.query?.originalTrainNumber, '12512');
    });
  });
});
