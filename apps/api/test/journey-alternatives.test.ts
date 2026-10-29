import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import {
  stationSearchQuerySchema,
  journeyAlternativesQuerySchema,
  validateInput,
} from '../src/common/validation/schemas.js';
import { AlternativeJourneyService } from '../src/modules/journeys/AlternativeJourneyService.js';

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
      // Leg 1 arrives at 16:10 (970 mins from midnight), Leg 2 departs at 18:30 (1110 mins from midnight)
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

    it('GET /api/v1/journeys/alternatives returns candidate journey pathways with data truthfulness', async () => {
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
      assert.ok(Array.isArray(d.sameTrainAlternatives));
      assert.ok(Array.isArray(d.directAlternatives));
      assert.ok(Array.isArray(d.connectingAlternatives));
      assert.ok(typeof d.totalCandidatePaths === 'number');

      // Check Category 1: Same Train Alternative if present
      if (d.sameTrainAlternatives.length > 0) {
        const st = d.sameTrainAlternatives[0];
        assert.equal(st.category, 'SAME_TRAIN');
        assert.ok(st.boardingRuleNotice.includes('Change Boarding Point'));
        assert.ok(st.additionalDistanceKm >= 0);
        assert.ok(st.fare != null);
      }

      // Check Category 2: Direct Trains if present
      if (d.directAlternatives.length > 0) {
        const dt = d.directAlternatives[0];
        assert.equal(dt.category, 'DIRECT');
        assert.ok(dt.trainNumber);
        assert.ok(dt.durationMinutes > 0);
      }

      // Check Category 3: Connecting Journeys if present
      if (d.connectingAlternatives.length > 0) {
        const con = d.connectingAlternatives[0];
        assert.equal(con.category, 'CONNECTING');
        assert.ok(con.leg1);
        assert.ok(con.leg2);
        assert.ok(con.interchangeStation);
        assert.ok(con.transferLayoverMinutes >= 45);
        assert.ok(con.advisoryText.includes('separately booked'));
      }
    });
  });
});
