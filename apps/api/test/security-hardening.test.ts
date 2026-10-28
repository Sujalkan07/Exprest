import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { buildApp, resolveTrustProxy, validateStartupEnvironment } from '../src/app.js';
import { resolvePublicAppUrl } from '../src/routes/index.js';
import { AppError } from '../src/common/errors/AppError.js';

describe('Security Hardening Suite (Fastify 5, Proxy, Origin, Error Sanitization)', () => {
  describe('1. Proxy Trust Configuration (resolveTrustProxy)', () => {
    const originalTrustProxy = process.env.TRUST_PROXY;
    const originalNodeEnv = process.env.NODE_ENV;

    it('defaults to false when TRUST_PROXY is unset in development/test', () => {
      try {
        delete process.env.TRUST_PROXY;
        process.env.NODE_ENV = 'test';
        assert.equal(resolveTrustProxy(), false);

        process.env.NODE_ENV = 'development';
        assert.equal(resolveTrustProxy(), false);
      } finally {
        process.env.TRUST_PROXY = originalTrustProxy;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('defaults to true (trust proxy hops) in production when TRUST_PROXY is unset', () => {
      try {
        delete process.env.TRUST_PROXY;
        process.env.NODE_ENV = 'production';
        assert.equal(resolveTrustProxy(), true);
      } finally {
        process.env.TRUST_PROXY = originalTrustProxy;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('honors explicit boolean-like strings for TRUST_PROXY', () => {
      try {
        process.env.TRUST_PROXY = 'true';
        assert.equal(resolveTrustProxy(), true);

        process.env.TRUST_PROXY = 'false';
        assert.equal(resolveTrustProxy(), false);
      } finally {
        process.env.TRUST_PROXY = originalTrustProxy;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('honors IP and subnet values or comma-separated lists for TRUST_PROXY', () => {
      try {
        process.env.TRUST_PROXY = '127.0.0.1';
        assert.equal(resolveTrustProxy(), '127.0.0.1');

        process.env.TRUST_PROXY = '10.0.0.1, 10.0.0.2';
        assert.deepEqual(resolveTrustProxy(), ['10.0.0.1', '10.0.0.2']);
      } finally {
        process.env.TRUST_PROXY = originalTrustProxy;
        process.env.NODE_ENV = originalNodeEnv;
      }
    });

    it('does not spoof remote IP via X-Forwarded-For when trustProxy is disabled', async () => {
      const app = Fastify({ trustProxy: false });
      app.get('/test-ip', async (req) => ({ ip: req.ip }));

      const res = await app.inject({
        method: 'GET',
        url: '/test-ip',
        headers: {
          'x-forwarded-for': '203.0.113.195',
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.payload);
      assert.notEqual(data.ip, '203.0.113.195', 'Untrusted X-Forwarded-For must NOT be returned as client IP');
      await app.close();
    });
  });

  describe('2. Production Error Sanitization', () => {
    it('sanitizes 500 error messages to generic string in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const app = await buildApp();

        // Inject route that throws internal error with sensitive details
        app.get('/test-throw-internal', async () => {
          throw new Error('Database password failed: postgres://user:secret123@internal-db:5432/main');
        });

        const res = await app.inject({
          method: 'GET',
          url: '/test-throw-internal',
        });

        assert.equal(res.statusCode, 500);
        const body = JSON.parse(res.payload);
        assert.equal(body.error.message, 'An internal server error occurred.');
        assert.equal(body.error.code, 'INTERNAL_ERROR');
        assert.ok(body.meta.requestId, 'Must retain requestId for tracing');
        assert.ok(!res.payload.includes('secret123'), 'Must never leak sensitive exception text');
        assert.ok(!res.payload.includes('postgres://'), 'Must never leak connection string');

        await app.close();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });

    it('preserves client-facing AppError messages below 500 in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      try {
        process.env.NODE_ENV = 'production';
        const app = await buildApp();

        app.get('/test-client-error', async () => {
          throw new AppError('INVALID_INPUT', 'The requested station code is invalid.', 400);
        });

        const res = await app.inject({
          method: 'GET',
          url: '/test-client-error',
        });

        assert.equal(res.statusCode, 400);
        const body = JSON.parse(res.payload);
        assert.equal(body.error.code, 'INVALID_INPUT');
        assert.equal(body.error.message, 'The requested station code is invalid.');

        await app.close();
      } finally {
        process.env.NODE_ENV = originalEnv;
      }
    });
  });

  describe('3. Public App URL and Origin Validation', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalCors = process.env.CORS_ORIGINS;
    const originalPublicUrl = process.env.PUBLIC_APP_URL;

    it('rejects untrusted origin header in production and falls back to canonical URL', () => {
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.PUBLIC_APP_URL;
        delete process.env.CORS_ORIGINS;

        const resolved = resolvePublicAppUrl('https://evil-phishing.com');
        assert.equal(resolved, 'https://exprest.vercel.app');
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.CORS_ORIGINS = originalCors;
        process.env.PUBLIC_APP_URL = originalPublicUrl;
      }
    });

    it('accepts legitimate production origin header', () => {
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.PUBLIC_APP_URL;

        const resolved = resolvePublicAppUrl('https://exprest.vercel.app');
        assert.equal(resolved, 'https://exprest.vercel.app');
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.PUBLIC_APP_URL = originalPublicUrl;
      }
    });

    it('accepts configured CORS origins as valid public origin header in production', () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.CORS_ORIGINS = 'https://rail.myorg.in,https://custom.exprest.dev';

        assert.equal(resolvePublicAppUrl('https://rail.myorg.in'), 'https://rail.myorg.in');
        assert.equal(resolvePublicAppUrl('https://custom.exprest.dev'), 'https://custom.exprest.dev');
        assert.equal(resolvePublicAppUrl('https://malicious.org'), 'https://exprest.vercel.app');
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.CORS_ORIGINS = originalCors;
        process.env.PUBLIC_APP_URL = originalPublicUrl;
      }
    });
  });

  describe('4. Startup Environment Validation (Supabase JWT Secret)', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.RAILRADAR_API_KEY;
    const originalAuth = process.env.AUTH_SECRET;
    const originalJwt = process.env.SUPABASE_JWT_SECRET;

    it('strictly rejects weak or placeholder SUPABASE_JWT_SECRET in production', () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.RAILRADAR_API_KEY = 'valid_radar_key_12345';
        process.env.AUTH_SECRET = 'valid_auth_secret_1234567890';

        // Placeholder default
        process.env.SUPABASE_JWT_SECRET = 'dev_secret_change_in_prod';
        assert.throws(
          () => validateStartupEnvironment(),
          /Configuration error: Insecure SUPABASE_JWT_SECRET in production/
        );

        // Too short (<16 chars)
        process.env.SUPABASE_JWT_SECRET = 'short_jwt_secret';
        assert.throws(
          () => validateStartupEnvironment(),
          /Configuration error: Insecure SUPABASE_JWT_SECRET in production/
        );

        // Secure secret (>= 16 chars) passes
        process.env.SUPABASE_JWT_SECRET = 'strong_production_supabase_jwt_secret_xyz123';
        assert.doesNotThrow(() => validateStartupEnvironment());
      } finally {
        process.env.NODE_ENV = originalEnv;
        process.env.RAILRADAR_API_KEY = originalKey;
        process.env.AUTH_SECRET = originalAuth;
        process.env.SUPABASE_JWT_SECRET = originalJwt;
      }
    });
  });
});
