import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';

describe('Live Security Smoke Integration Suite', () => {
  let app: FastifyInstance;

  before(async () => {
    app = await buildApp();
  });

  after(async () => {
    await app.close();
  });

  describe('1. Server Hardening & Fingerprint Concealment', () => {
    it('GET /health returns 200 without exposing X-Powered-By header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/health',
      });
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['x-powered-by'], undefined, 'x-powered-by must be hidden');
    });

    it('enforces nosniff and security headers across API routes', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trains/search?q=12951',
      });
      assert.equal(res.headers['x-content-type-options'], 'nosniff');
    });
  });

  describe('2. Authentication Bounds (AuthN)', () => {
    it('rejects unauthenticated requests to protected share creation with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        payload: {
          journeyId: '12951_2026-10-24',
        },
      });
      assert.equal(res.statusCode, 401);
      const json = res.json();
      assert.equal(json.error.code, 'UNAUTHORIZED');
      assert.ok(json.meta.requestId);
    });

    it('rejects malformed Bearer tokens with 401', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: 'Bearer not-a-valid-jwt-format',
        },
        payload: {
          journeyId: '12951_2026-10-24',
        },
      });
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().error.code, 'UNAUTHORIZED');
    });

    it('rejects alg "none" attack tokens with 401', async () => {
      const algNoneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: 'attacker-123', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString('base64url');
      const token = `${algNoneHeader}.${payload}.`;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          journeyId: '12951_2026-10-24',
        },
      });
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().error.code, 'UNAUTHORIZED');
    });

    it('rejects expired tokens with 401', async () => {
      const expiredPayload = Buffer.from(
        JSON.stringify({ sub: 'user-expired', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) - 3600 })
      ).toString('base64url');
      const token = `${Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')}.${expiredPayload}.invalidsig`;

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${token}`,
        },
        payload: {
          journeyId: '12951_2026-10-24',
        },
      });
      assert.equal(res.statusCode, 401);
      assert.equal(res.json().error.code, 'UNAUTHORIZED');
    });
  });

  describe('3. Injection Defenses & Input Bounds', () => {
    it('rejects SQL injection payloads in train numbers with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: "/api/v1/trains/' OR '1'='1/live?date=2026-10-24",
      });
      assert.ok(res.statusCode >= 400 && res.statusCode < 500);
      assert.ok(res.json().error);
    });

    it('rejects path traversal in train parameter with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trains/..%2F..%2Fetc%2Fpasswd/live?date=2026-10-24',
      });
      assert.ok(res.statusCode >= 400 && res.statusCode < 500);
    });

    it('rejects oversized queries (>1000 chars) with 400 Bad Request', async () => {
      const oversized = 'Q'.repeat(1500);
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/trains/search?q=${oversized}`,
      });
      assert.equal(res.statusCode, 400);
      assert.equal(res.json().error.code, 'VALIDATION_ERROR');
    });

    it('rejects invalid date parameters with 400 Bad Request', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trains/12951/live?date=9999-99-99',
      });
      assert.ok(res.statusCode >= 400 && res.statusCode < 500);
    });
  });

  describe('4. Cryptographic Share Links Bounds', () => {
    it('returns 404 on tampered or non-existent share tokens without leaking existence', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/shares/sh_12951_2026-10-24_0000000000000000',
      });
      assert.equal(res.statusCode, 404);
      assert.equal(res.json().error.code, 'RUN_NOT_FOUND');
    });

    it('returns 404 on expired share token timestamps', async () => {
      const pastTime = Math.floor(Date.now() / 1000) - 3600;
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/shares/sh_12951_2026-10-24_exp${pastTime}_abcdef0123456789`,
      });
      assert.equal(res.statusCode, 404);
      assert.equal(res.json().error.code, 'RUN_NOT_FOUND');
    });
  });

  describe('5. Error Sanitization & Information Leakage', () => {
    it('404 errors do not leak stack traces or internal paths in production/test', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/unknown-endpoint-for-error-testing',
      });
      assert.equal(res.statusCode, 404);
      const body = res.body;
      assert.ok(!body.includes('node_modules'));
      assert.ok(!body.includes('postgres://'));
      assert.ok(!body.includes('postgresql://'));
      const json = res.json();
      assert.ok(json.error);
      assert.ok(json.meta);
      assert.ok(json.meta.requestId);
    });
  });
});
