import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/app.js';
import { createTestToken } from '../src/common/middleware/auth.js';
import { PnrService } from '../src/modules/pnr/PnrService.js';

describe('End-to-End Security Edge Cases Suite', () => {

  describe('1. Fastify Body Size Limit & Payload Flooding Prevention', () => {
    it('rejects oversized JSON request payloads exceeding 64 KB with HTTP 413', async () => {
      const app = await buildApp();
      const token = createTestToken({ sub: 'user-body-test' });

      // Generate a payload exceeding 64 KB limit (e.g. 70 KB)
      const oversizedPayload = {
        journeyId: 'journey_12951_2026-10-24',
        padding: 'A'.repeat(70 * 1024),
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: oversizedPayload,
      });

      assert.equal(res.statusCode, 413, 'Must reject oversized payload with 413 Payload Too Large');
      const body = JSON.parse(res.payload);
      assert.ok(body.error, 'Response must be structured error format');
      assert.ok(body.meta?.requestId, 'Response must include requestId');
      await app.close();
    });

    it('accepts valid small JSON payloads within the 64 KB limit', async () => {
      const app = await buildApp();
      const token = createTestToken({ sub: 'user-body-test' });

      const validPayload = {
        journeyId: 'journey_12951_2026-10-24',
        expiresInSeconds: 3600,
      };

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: validPayload,
      });

      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res.payload);
      assert.ok(body.data?.shareToken, 'Must generate share token');
      await app.close();
    });
  });

  describe('2. CORS Origin Preflight & Rejection Verification', () => {
    it('does NOT reflect unapproved origins on preflight OPTIONS requests', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/shares',
        headers: {
          origin: 'https://evil-phishing-domain.com',
          'access-control-request-method': 'POST',
        },
      });

      const allowOrigin = res.headers['access-control-allow-origin'];
      assert.notEqual(
        allowOrigin,
        'https://evil-phishing-domain.com',
        'Unapproved origin must not be reflected in Access-Control-Allow-Origin'
      );
      await app.close();
    });

    it('allows approved canonical frontend origin on preflight OPTIONS', async () => {
      const app = await buildApp();

      const res = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/shares',
        headers: {
          origin: 'http://localhost:3000',
          'access-control-request-method': 'POST',
        },
      });

      const allowOrigin = res.headers['access-control-allow-origin'];
      assert.equal(allowOrigin, 'http://localhost:3000');
      await app.close();
    });
  });

  describe('3. Rate Limiting on Train Fare Endpoint', () => {
    it('enforces 30 requests / min rate limit on /api/v1/trains/:trainNumber/fare', async () => {
      const origGetTrainFare = PnrService.prototype.getTrainFare;
      PnrService.prototype.getTrainFare = async () => ({ fare: 1250, currency: 'INR' });
      const app = await buildApp();

      try {
        // Send 30 valid requests
        for (let i = 0; i < 30; i++) {
          const res = await app.inject({
            method: 'GET',
            url: '/api/v1/trains/12951/fare?from=MMCT&to=NDLS&date=2026-10-28',
          });
          assert.equal(res.statusCode, 200, `Request ${i + 1} under threshold must be 200`);
        }

        // 31st request from same IP within the time window must be throttled with 429
        const throttledRes = await app.inject({
          method: 'GET',
          url: '/api/v1/trains/12951/fare?from=MMCT&to=NDLS&date=2026-10-28',
        });

        assert.equal(throttledRes.statusCode, 429, '31st request must receive HTTP 429 Too Many Requests');
        const json = JSON.parse(throttledRes.payload);
        assert.ok(
          json.error.code === 'RATE_LIMIT_EXCEEDED' || json.error.code === 'FST_ERR_RATE_LIMIT',
          `Error code must indicate rate limit exceeded, received: ${json.error.code}`
        );
      } finally {
        PnrService.prototype.getTrainFare = origGetTrainFare;
        await app.close();
      }
    });
  });

  describe('4. Input Parameter Bounds & Overflow Rejection', () => {
    it('rejects journeyId exceeding 64 characters with 400 VALIDATION_ERROR', async () => {
      const app = await buildApp();
      // Length = 14 + 55 = 69 chars (> 64 Zod max, within Fastify 100-char route param limit)
      const longId = 'journey_12951_' + 'A'.repeat(55);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/journeys/${longId}`,
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error.code, 'VALIDATION_ERROR');
      await app.close();
    });

    it('rejects search queries exceeding 100 characters with 400 VALIDATION_ERROR', async () => {
      const app = await buildApp();
      const longQuery = 'A'.repeat(105);

      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trains/search?q=${longQuery}`,
      });

      assert.equal(res.statusCode, 400);
      const json = JSON.parse(res.payload);
      assert.equal(json.error.code, 'VALIDATION_ERROR');
      await app.close();
    });
  });
});
