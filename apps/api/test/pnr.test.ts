import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { PnrService } from '../src/modules/pnr/PnrService.js';
import { RailRadarAdapter } from '../src/providers/railradar/RailRadarAdapter.js';
import { AppError } from '../src/common/errors/AppError.js';
import { registerRoutes } from '../src/routes/index.js';

process.env.RAILRADAR_API_KEY = process.env.RAILRADAR_API_KEY || 'test_railradar_api_key';

describe('PNR Status API & Validation Suite', () => {
  describe('1. PNR Input Validation & Normalization', () => {
    const mockAdapter = {
      getPnrStatus: async (pnr: string) => ({
        pnr,
        trainNumber: '12951',
        trainName: 'MUMBAI TEJAS RAJDHANI',
        journeyDate: '2025-10-24',
        sourceStationCode: 'NDLS',
        sourceStationName: 'New Delhi',
        destinationStationCode: 'MMCT',
        destinationStationName: 'Mumbai Central',
        travelClass: '3A',
        quota: 'GN',
        chartPrepared: true,
        bookingStatus: 'CONFIRMED',
        passengers: [],
      }),
    } as any;

    const pnrService = new PnrService(mockAdapter);

    it('accepts a valid 10-digit PNR', async () => {
      const res = await pnrService.getPnrStatus('6248193042');
      assert.equal(res.pnr, '6248193042');
      assert.equal(res.trainNumber, '12951');
    });

    it('normalizes formatted PNR with hyphens, spaces, and dots', async () => {
      const formatted = '624-819-3042';
      const res = await pnrService.getPnrStatus(formatted);
      assert.equal(res.pnr, '6248193042');

      const spaced = '624 819 3042';
      const resSpaced = await pnrService.getPnrStatus(spaced);
      assert.equal(resSpaced.pnr, '6248193042');

      const dotted = '624.819.3042';
      const resDotted = await pnrService.getPnrStatus(dotted);
      assert.equal(resDotted.pnr, '6248193042');
    });

    it('rejects input with invalid length (< 10 digits or > 10 digits)', async () => {
      await assert.rejects(
        async () => pnrService.getPnrStatus('12345'),
        (err: any) => err instanceof AppError && err.code === 'INVALID_PNR' && err.statusCode === 400
      );

      await assert.rejects(
        async () => pnrService.getPnrStatus('1234567890123'),
        (err: any) => err instanceof AppError && err.code === 'INVALID_PNR' && err.statusCode === 400
      );
    });

    it('rejects input containing alphabetic or special characters', async () => {
      await assert.rejects(
        async () => pnrService.getPnrStatus('624819304A'),
        (err: any) => err instanceof AppError && err.code === 'INVALID_PNR' && err.statusCode === 400
      );

      await assert.rejects(
        async () => pnrService.getPnrStatus('PNR_624819'),
        (err: any) => err instanceof AppError && err.code === 'INVALID_PNR' && err.statusCode === 400
      );
    });

    it('rejects null, undefined, or empty input', async () => {
      await assert.rejects(
        async () => pnrService.getPnrStatus(''),
        (err: any) => err instanceof AppError && err.code === 'INVALID_PNR' && err.statusCode === 400
      );

      await assert.rejects(
        async () => pnrService.getPnrStatus(null as any),
        (err: any) => err instanceof AppError && err.code === 'INVALID_PNR' && err.statusCode === 400
      );
    });
  });

  describe('2. Provider Response Mapping & Missing Fields Handling', () => {
    it('accurately maps complete provider response', async () => {
      const adapter = new RailRadarAdapter();
      // Test mapper directly by mocking fetch
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/pnr/6248193042')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: {
                  pnr: '6248193042',
                  trainNumber: '12951',
                  trainName: 'MUMBAI TEJAS RAJDHANI',
                  journeyDate: '2025-10-24',
                  sourceStation: { code: 'NDLS', name: 'New Delhi' },
                  destinationStation: { code: 'MMCT', name: 'Mumbai Central' },
                  class: '3A',
                  quota: 'GN',
                  chartStatus: 'CHART PREPARED',
                  bookingStatus: 'CONFIRMED',
                  passengers: [
                    {
                      passengerSerialNumber: 1,
                      bookingStatus: 'B4, 32',
                      currentStatus: 'CNF',
                      coach: 'B4',
                      berth: 32,
                      berthType: 'LB',
                      age: 34,
                      gender: 'M',
                    },
                    {
                      passengerSerialNumber: 2,
                      bookingStatus: 'B4, 33',
                      currentStatus: 'CNF',
                      coach: 'B4',
                      berth: 33,
                      berthType: 'MB',
                      age: 31,
                      gender: 'F',
                    },
                  ],
                  fare: {
                    baseFare: 5490,
                    total: 6435,
                    transactionId: 'IRCTC-8392014820',
                    paymentMethod: 'UPI',
                  },
                },
              }),
            } as any;
          }
          if (urlStr.includes('/coaches')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: {
                  rake: [
                    { position: 1, code: 'ENG', classType: 'LOCO' },
                    { position: 2, code: 'B4', classType: '3A' },
                  ],
                },
              }),
            } as any;
          }
          return { ok: false, status: 404 } as any;
        };

        const res = await adapter.getPnrStatus('6248193042');
        assert.equal(res.pnr, '6248193042');
        assert.equal(res.trainNumber, '12951');
        assert.equal(res.trainName, 'MUMBAI TEJAS RAJDHANI');
        assert.equal(res.sourceStationCode, 'NDLS');
        assert.equal(res.sourceStationName, 'New Delhi');
        assert.equal(res.chartPrepared, true);
        assert.equal(res.passengers.length, 2);
        assert.equal(res.passengers[0].coach, 'B4');
        assert.equal(res.passengers[0].berthNumber, 32);
        assert.equal(res.passengers[0].confirmed, true);
        assert.equal(res.passengers[0].age, null, 'Passenger age must be redacted for privacy');
        assert.equal(res.passengers[0].gender, null, 'Passenger gender must be redacted for privacy');
        assert.equal(res.fare?.totalAmountPaid, 6435);
        assert.equal(res.fare?.isEstimated, false);
        assert.equal(res.rakeComposition?.length, 2);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('safely handles missing optional fields without crashing or inventing data', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/pnr/')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: {
                  pnr: '9999999999',
                  trainNumber: '12002',
                  trainName: 'Bhopal Shatabdi',
                  // Missing station objects, fare, passengers, chartStatus
                },
              }),
            } as any;
          }
          return { ok: false, status: 404 } as any;
        };

        const res = await adapter.getPnrStatus('9999999999');
        assert.equal(res.pnr, '9999999999');
        assert.equal(res.trainNumber, '12002');
        assert.equal(res.chartPrepared, false);
        assert.equal(res.passengers.length, 0);
        assert.equal(res.fare, null);
        assert.equal(res.duration, null);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('3. Error Responses & Security (Flushed, Not Found, Timeout, Credential Redaction)', () => {
    it('maps PRS:PNR_FLUSHED upstream error to canonical PNR_FLUSHED 404', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => ({
          ok: false,
          status: 404,
          json: async () => ({
            success: false,
            error: {
              code: 'PRS:PNR_FLUSHED',
              message: 'This PNR record has been flushed or expired after journey completion.',
            },
          }),
        } as any);

        await assert.rejects(
          async () => adapter.getPnrStatus('6248193042'),
          (err: any) => {
            assert.equal(err instanceof AppError, true);
            assert.equal(err.code, 'PNR_FLUSHED');
            assert.equal(err.statusCode, 404);
            assert.equal(err.message.includes('flushed'), true);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('maps API:DATA_NOT_AVAILABLE to PNR_NOT_FOUND 404', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => ({
          ok: false,
          status: 404,
          json: async () => ({
            success: false,
            error: {
              code: 'API:DATA_NOT_AVAILABLE',
              message: 'PNR No. is not valid',
            },
          }),
        } as any);

        await assert.rejects(
          async () => adapter.getPnrStatus('0000000000'),
          (err: any) => {
            assert.equal(err instanceof AppError, true);
            assert.equal(err.code, 'PNR_NOT_FOUND');
            assert.equal(err.statusCode, 404);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles provider rate limit (429) as retryable error', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => ({
          ok: false,
          status: 429,
          json: async () => ({}),
        } as any);

        await assert.rejects(
          async () => adapter.getPnrStatus('1234567890'),
          (err: any) => {
            assert.equal(err.code, 'PROVIDER_RATE_LIMITED');
            assert.equal(err.statusCode, 429);
            assert.equal(err.retryable, true);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles provider timeout (504/Abort) gracefully', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => {
          const timeoutErr = new Error('The operation was aborted');
          timeoutErr.name = 'TimeoutError';
          throw timeoutErr;
        };

        await assert.rejects(
          async () => adapter.getPnrStatus('1234567890'),
          (err: any) => {
            assert.equal(err.code, 'PROVIDER_TIMEOUT');
            assert.equal(err.statusCode, 504);
            assert.equal(err.retryable, true);
            return true;
          }
        );
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('redacts sensitive API keys from logs and error strings', () => {
      const textWithKey = 'Failed to connect to https://railradar.in/api/v1/pnr/1234567890?api_key=rg_secret_12345_xyz';
      const redacted = RailRadarAdapter.redactCredentials(textWithKey);
      assert.equal(redacted.includes('rg_secret_12345_xyz'), false);
      assert.equal(redacted.includes('api_key=[REDACTED]'), true);
    });
  });

  describe('4. Fastify HTTP Endpoint Integration (/api/v1/pnr/:pnr)', () => {
    let app: any;

    beforeEach(async () => {
      app = Fastify();
      await registerRoutes(app);
    });

    afterEach(async () => {
      await app.close();
    });

    it('returns 400 for invalid non-10-digit PNR via HTTP endpoint', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/pnr/invalid-pnr',
      });

      assert.equal(res.statusCode, 400);
      const body = JSON.parse(res.payload);
      assert.equal(body.error.code, 'INVALID_PNR');
      assert.equal(Boolean(body.meta.requestId), true);
    });

    it('normalizes formatted PNRs in URL route parameter', async () => {
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: any) => {
          const urlStr = String(url);
          assert.equal(urlStr.includes('/pnr/6248193042'), true);
          return {
            ok: true,
            status: 200,
            json: async () => ({
              success: true,
              data: {
                pnr: '6248193042',
                trainNumber: '12951',
                trainName: 'MUMBAI TEJAS RAJDHANI',
              },
            }),
          } as any;
        };

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/pnr/624-819-3042',
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.equal(body.data.pnr, '6248193042');
        assert.equal(body.data.trainNumber, '12951');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('6. Train Fare Calculation & Dynamic Breakdown', () => {
    it('calculates fare dynamically using RailRadar fare endpoint', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/fare')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: {
                  trainNumber: '12951',
                  trainName: 'Mumbai Central - New Delhi Tejas Rajdhani Express',
                  distance: 1384,
                  breakdown: {
                    baseFare: 1820,
                    reservationCharge: 40,
                    superfastCharge: 45,
                    tatkalFare: 0,
                    goodsServiceTax: 132,
                    cateringCharge: 400,
                    dynamicFare: 728,
                    otherCharge: 0,
                    totalFare: 3165,
                  },
                },
              }),
            } as any;
          }
          return { ok: false, status: 404 } as any;
        };

        const fare = await adapter.getTrainFare('12951', 'MMCT', 'NDLS', '2026-10-20', '3A');
        assert.equal(fare.trainNumber, '12951');
        assert.equal(fare.breakdown.baseFare, 1820);
        assert.equal(fare.breakdown.totalFare, 3165);
        assert.equal(fare.source, 'prs');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('enriches PNR status with dynamic fare scaled by passenger count when d.fare is missing', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/pnr/')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: {
                  pnr: '6248193042',
                  trainNumber: '12951',
                  trainName: 'MUMBAI TEJAS RAJDHANI',
                  sourceStation: { code: 'NDLS', name: 'New Delhi' },
                  destinationStation: { code: 'MMCT', name: 'Mumbai Central' },
                  class: '3A',
                  passengers: [
                    { passengerSerialNumber: 1, currentStatus: 'CNF', coach: 'B4', berth: 32 },
                    { passengerSerialNumber: 2, currentStatus: 'CNF', coach: 'B4', berth: 33 },
                  ],
                  // Notice: NO fare object in PNR response!
                },
              }),
            } as any;
          }
          if (urlStr.includes('/fare')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: {
                  trainNumber: '12951',
                  breakdown: {
                    baseFare: 1820,
                    reservationCharge: 40,
                    superfastCharge: 45,
                    tatkalFare: 0,
                    goodsServiceTax: 132,
                    cateringCharge: 400,
                    dynamicFare: 728,
                    otherCharge: 0,
                    totalFare: 3165,
                  },
                },
              }),
            } as any;
          }
          return { ok: false, status: 404 } as any;
        };

        const result = await adapter.getPnrStatus('6248193042');
        assert.equal(result.passengers.length, 2);
        // Scaled by 2 passengers!
        assert.equal(result.fare?.baseFare, 1820 * 2);
        assert.equal(result.fare?.cateringCharges, 400 * 2);
        assert.equal(result.fare?.surcharges, (40 + 45 + 728) * 2);
        assert.equal(result.fare?.convenienceFee, (132 * 2) + 35);
        assert.equal(result.fare?.totalAmountPaid, (3165 * 2) + 35);
        assert.equal(result.fare?.transactionId, null);
        assert.equal(result.fare?.isEstimated, true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('computes telescopic fallback when upstream fare endpoint returns 404', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async () => ({ ok: false, status: 404 } as any);

        const fare = await adapter.getTrainFare('12951', 'MMCT', 'NDLS', '2026-10-20', '3A');
        assert.equal(fare.trainNumber, '12951');
        assert.equal(typeof fare.breakdown.baseFare, 'number');
        assert.equal(fare.breakdown.baseFare > 0, true);
        assert.equal(fare.source, 'telescopic_fallback');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('serves train fare via GET /api/v1/trains/:trainNumber/fare', async () => {
      const app = Fastify();
      await registerRoutes(app);

      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/fare')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: {
                  trainNumber: '12951',
                  breakdown: {
                    baseFare: 1820,
                    totalFare: 3165,
                  },
                },
              }),
            } as any;
          }
          return { ok: false, status: 404 } as any;
        };

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/trains/12951/fare?from=MMCT&to=NDLS&class=3A&date=2026-10-20',
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.equal(body.data.trainNumber, '12951');
        assert.equal(body.data.breakdown.baseFare, 1820);
        assert.equal(Boolean(body.meta.requestId), true);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });

  describe('7. Dedicated PNR Endpoint Rate Limiting (B2/B5)', () => {
    it('enforces route-level rate limiting on /api/v1/pnr/:pnr', async () => {
      const app = Fastify();
      const rateLimitPlugin = (await import('@fastify/rate-limit')).default;
      await app.register(rateLimitPlugin, { max: 100, timeWindow: '1 minute' });
      await registerRoutes(app);

      let lastStatus = 200;
      for (let i = 0; i < 12; i++) {
        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/pnr/invalid',
        });
        lastStatus = res.statusCode;
      }

      assert.equal(lastStatus, 429, '11th request must trigger 429 rate limit');
      await app.close();
    });
  });

  describe('8. Robust Coach and Berth Extraction & Normalization', () => {
    it('normalizes coach codes across diverse formatting styles', () => {
      assert.equal(RailRadarAdapter.normalizeCoachCode('b-4'), 'B4');
      assert.equal(RailRadarAdapter.normalizeCoachCode('B - 4'), 'B4');
      assert.equal(RailRadarAdapter.normalizeCoachCode('B 4'), 'B4');
      assert.equal(RailRadarAdapter.normalizeCoachCode('b4'), 'B4');
      assert.equal(RailRadarAdapter.normalizeCoachCode('B04'), 'B4');
      assert.equal(RailRadarAdapter.normalizeCoachCode('S-12'), 'S12');
      assert.equal(RailRadarAdapter.normalizeCoachCode('S01'), 'S1');
      assert.equal(RailRadarAdapter.normalizeCoachCode('EC'), 'EC');
      assert.equal(RailRadarAdapter.normalizeCoachCode('CC'), 'CC');
      assert.equal(RailRadarAdapter.normalizeCoachCode('FC'), 'FC');
      assert.equal(RailRadarAdapter.normalizeCoachCode('EA'), 'EA');
      assert.equal(RailRadarAdapter.normalizeCoachCode('HA1'), 'HA1');
      assert.equal(RailRadarAdapter.normalizeCoachCode('HB1'), 'HB1');
      assert.equal(RailRadarAdapter.normalizeCoachCode('M2'), 'M2');
      assert.equal(RailRadarAdapter.normalizeCoachCode('C1'), 'C1');

      // Invalid tokens / status strings must not be treated as coach
      assert.equal(RailRadarAdapter.normalizeCoachCode('WL'), null);
      assert.equal(RailRadarAdapter.normalizeCoachCode('RLWL'), null);
      assert.equal(RailRadarAdapter.normalizeCoachCode('RAC'), null);
      assert.equal(RailRadarAdapter.normalizeCoachCode('CNF'), null);
      assert.equal(RailRadarAdapter.normalizeCoachCode('GN'), null);
      assert.equal(RailRadarAdapter.normalizeCoachCode('-'), null);
      assert.equal(RailRadarAdapter.normalizeCoachCode('--'), null);
      assert.equal(RailRadarAdapter.normalizeCoachCode('0'), null);
      assert.equal(RailRadarAdapter.normalizeCoachCode('NA'), null);
      assert.equal(RailRadarAdapter.normalizeCoachCode(null), null);
    });

    it('sanitizes berth numbers safely', () => {
      assert.equal(RailRadarAdapter.sanitizeBerthNumber(32), 32);
      assert.equal(RailRadarAdapter.sanitizeBerthNumber('32'), 32);
      assert.equal(RailRadarAdapter.sanitizeBerthNumber('32 (LB)'), 32);
      assert.equal(RailRadarAdapter.sanitizeBerthNumber('032'), 32);
      assert.equal(RailRadarAdapter.sanitizeBerthNumber('-'), null);
      assert.equal(RailRadarAdapter.sanitizeBerthNumber('0'), null);
      assert.equal(RailRadarAdapter.sanitizeBerthNumber('NA'), null);
      assert.equal(RailRadarAdapter.sanitizeBerthNumber(null), null);
    });

    it('normalizes berth types and rejects quota codes', () => {
      assert.equal(RailRadarAdapter.normalizeBerthType('LB'), 'LB');
      assert.equal(RailRadarAdapter.normalizeBerthType('MB'), 'MB');
      assert.equal(RailRadarAdapter.normalizeBerthType('UB'), 'UB');
      assert.equal(RailRadarAdapter.normalizeBerthType('SL'), 'SL');
      assert.equal(RailRadarAdapter.normalizeBerthType('SU'), 'SU');
      assert.equal(RailRadarAdapter.normalizeBerthType('LOWER'), 'LB');
      assert.equal(RailRadarAdapter.normalizeBerthType('UPPER'), 'UB');
      assert.equal(RailRadarAdapter.normalizeBerthType('WINDOW'), 'WS');

      // Quotas must not be treated as berth types
      assert.equal(RailRadarAdapter.normalizeBerthType('GN'), null);
      assert.equal(RailRadarAdapter.normalizeBerthType('PQ'), null);
      assert.equal(RailRadarAdapter.normalizeBerthType('RL'), null);
      assert.equal(RailRadarAdapter.normalizeBerthType('CK'), null);
      assert.equal(RailRadarAdapter.normalizeBerthType('TQ'), null);
      assert.equal(RailRadarAdapter.normalizeBerthType('-'), null);
    });

    it('extracts coach, berth, and berthType from various status string formats', () => {
      const cnfSlash = RailRadarAdapter.extractCoachAndBerthFromText('CNF / B4 / 32 / LB');
      assert.equal(cnfSlash.coach, 'B4');
      assert.equal(cnfSlash.berth, 32);
      assert.equal(cnfSlash.berthType, 'LB');

      const cnfQuota = RailRadarAdapter.extractCoachAndBerthFromText('B4, 32, GN');
      assert.equal(cnfQuota.coach, 'B4');
      assert.equal(cnfQuota.berth, 32);
      assert.equal(cnfQuota.berthType, null); // GN quota is ignored

      const cnfHyphen = RailRadarAdapter.extractCoachAndBerthFromText('B4-32');
      assert.equal(cnfHyphen.coach, 'B4');
      assert.equal(cnfHyphen.berth, 32);

      const cnfSpace = RailRadarAdapter.extractCoachAndBerthFromText('CNF B4 32 LB');
      assert.equal(cnfSpace.coach, 'B4');
      assert.equal(cnfSpace.berth, 32);
      assert.equal(cnfSpace.berthType, 'LB');

      const ecSeat = RailRadarAdapter.extractCoachAndBerthFromText('CNF / EC / 14 / W');
      assert.equal(ecSeat.coach, 'EC');
      assert.equal(ecSeat.berth, 14);
      assert.equal(ecSeat.berthType, 'WS');

      const labeled = RailRadarAdapter.extractCoachAndBerthFromText('Coach: B4, Berth: 32');
      assert.equal(labeled.coach, 'B4');
      assert.equal(labeled.berth, 32);

      const reverse = RailRadarAdapter.extractCoachAndBerthFromText('Berth 32, Coach B4');
      assert.equal(reverse.coach, 'B4');
      assert.equal(reverse.berth, 32);

      const commaReverse = RailRadarAdapter.extractCoachAndBerthFromText('32, B4');
      assert.equal(commaReverse.coach, 'B4');
      assert.equal(commaReverse.berth, 32);

      const rac = RailRadarAdapter.extractCoachAndBerthFromText('RAC / B1 / 23');
      assert.equal(rac.coach, 'B1');
      assert.equal(rac.berth, 23);

      const wl = RailRadarAdapter.extractCoachAndBerthFromText('WL 45');
      assert.equal(wl.coach, null);
      assert.equal(wl.berth, null);
    });

    it('infers class-accurate berth types correctly', () => {
      // 3A / SL (mod 8)
      assert.equal(RailRadarAdapter.inferBerthType(1, 'B1', '3A'), 'LB');
      assert.equal(RailRadarAdapter.inferBerthType(2, 'B1', '3A'), 'MB');
      assert.equal(RailRadarAdapter.inferBerthType(3, 'B1', '3A'), 'UB');
      assert.equal(RailRadarAdapter.inferBerthType(7, 'B1', '3A'), 'SL');
      assert.equal(RailRadarAdapter.inferBerthType(8, 'B1', '3A'), 'SU');

      // 2A (mod 6) - 2A has NO middle berths!
      assert.equal(RailRadarAdapter.inferBerthType(1, 'A1', '2A'), 'LB');
      assert.equal(RailRadarAdapter.inferBerthType(2, 'A1', '2A'), 'UB');
      assert.equal(RailRadarAdapter.inferBerthType(3, 'A1', '2A'), 'LB');
      assert.equal(RailRadarAdapter.inferBerthType(4, 'A1', '2A'), 'UB');
      assert.equal(RailRadarAdapter.inferBerthType(5, 'A1', '2A'), 'SL');
      assert.equal(RailRadarAdapter.inferBerthType(6, 'A1', '2A'), 'SU');

      // 3E (mod 9)
      assert.equal(RailRadarAdapter.inferBerthType(7, 'M1', '3E'), 'SL');
      assert.equal(RailRadarAdapter.inferBerthType(8, 'M1', '3E'), 'SM');
      assert.equal(RailRadarAdapter.inferBerthType(9, 'M1', '3E'), 'SU');

      // CC (mod 5)
      assert.equal(RailRadarAdapter.inferBerthType(1, 'C1', 'CC'), 'WS');
      assert.equal(RailRadarAdapter.inferBerthType(2, 'C1', 'CC'), 'MS');
      assert.equal(RailRadarAdapter.inferBerthType(3, 'C1', 'CC'), 'AS');
    });

    it('maps alternative PRS / RailRadar response fields into coach and berth', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/pnr/')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: {
                  pnr: '6248193042',
                  trainNumber: '12951',
                  trainName: 'MUMBAI TEJAS RAJDHANI',
                  travelClass: '3A',
                  passengers: [
                    // Field variation 1: currentCoachId & currentBerthNo
                    {
                      passengerSerialNumber: 1,
                      currentCoachId: 'B4',
                      currentBerthNo: 32,
                      currentStatus: 'CNF',
                      bookingStatus: 'CNF',
                    },
                    // Field variation 2: placeholder current values, coach & berth in bookingStatus
                    {
                      passengerSerialNumber: 2,
                      currentCoach: '-',
                      currentBerth: '-',
                      bookingStatus: 'B4, 33, GN',
                      currentStatus: 'CNF',
                    },
                    // Field variation 3: coach & berth in currentStatusDetails
                    {
                      passengerSerialNumber: 3,
                      currentStatus: 'CNF',
                      bookingStatus: 'WL 12',
                      currentStatusDetails: 'CNF / B4 / 34 / UB',
                    },
                    // Field variation 4: bookingCoachId & bookingBerthNo
                    {
                      passengerSerialNumber: 4,
                      bookingCoachId: 'B4',
                      bookingBerthNo: 35,
                      currentStatus: 'CNF',
                      bookingStatus: 'CNF',
                    },
                    // Field variation 5: formatted coach and berth string "B-4", "36 (MB)"
                    {
                      passengerSerialNumber: 5,
                      coach: 'B-4',
                      berth: '36 (MB)',
                      currentStatus: 'CNF',
                    },
                  ],
                },
              }),
            } as any;
          }
          return { ok: false, status: 404 } as any;
        };

        const result = await adapter.getPnrStatus('6248193042');
        assert.equal(result.passengers.length, 5);

        // Passenger 1
        assert.equal(result.passengers[0].coach, 'B4');
        assert.equal(result.passengers[0].berthNumber, 32);
        assert.equal(result.passengers[0].berthType, 'SU'); // 32 in 3A is SU
        assert.equal(result.passengers[0].confirmed, true);

        // Passenger 2
        assert.equal(result.passengers[1].coach, 'B4');
        assert.equal(result.passengers[1].berthNumber, 33);
        assert.equal(result.passengers[1].berthType, 'LB'); // 33 in 3A is LB
        assert.equal(result.passengers[1].confirmed, true);

        // Passenger 3
        assert.equal(result.passengers[2].coach, 'B4');
        assert.equal(result.passengers[2].berthNumber, 34);
        assert.equal(result.passengers[2].berthType, 'UB'); // From string
        assert.equal(result.passengers[2].confirmed, true);

        // Passenger 4
        assert.equal(result.passengers[3].coach, 'B4');
        assert.equal(result.passengers[3].berthNumber, 35);
        assert.equal(result.passengers[3].berthType, 'UB');
        assert.equal(result.passengers[3].confirmed, true);

        // Passenger 5
        assert.equal(result.passengers[4].coach, 'B4');
        assert.equal(result.passengers[4].berthNumber, 36);
        assert.equal(result.passengers[4].berthType, 'MB'); // Extracted from string
        assert.equal(result.passengers[4].confirmed, true);

        // userCoach should be derived
        assert.equal(result.userCoach, 'B4');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });

    it('handles passengerList and seatNumber/coachNumber naming', async () => {
      const adapter = new RailRadarAdapter();
      const originalFetch = globalThis.fetch;
      try {
        globalThis.fetch = async (url: any) => {
          const urlStr = String(url);
          if (urlStr.includes('/pnr/')) {
            return {
              ok: true,
              status: 200,
              json: async () => ({
                success: true,
                data: {
                  pnr: '6248193042',
                  trainNumber: '12002',
                  trainName: 'Bhopal Shatabdi',
                  class: 'CC',
                  passengerList: [
                    {
                      sNo: 1,
                      coachNumber: 'C1',
                      seatNumber: 15,
                      currentStatus: 'CNF',
                      bookingStatus: 'CNF',
                    },
                  ],
                },
              }),
            } as any;
          }
          return { ok: false, status: 404 } as any;
        };

        const result = await adapter.getPnrStatus('6248193042');
        assert.equal(result.passengers.length, 1);
        assert.equal(result.passengers[0].coach, 'C1');
        assert.equal(result.passengers[0].berthNumber, 15);
        assert.equal(result.passengers[0].berthType, 'WS'); // 15 % 5 = 0 -> Window Seat in CC
        assert.equal(result.userCoach, 'C1');
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});