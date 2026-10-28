import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import {
  buildApp,
  resolveTrustProxy,
  validateStartupEnvironment,
  getStartupDiagnostics,
  cleanSensitiveLogText,
  errorLogSerializer,
} from '../src/app.js';
import { resolvePublicAppUrl, toSafeErrorMessage } from '../src/routes/index.js';
import { AppError } from '../src/common/errors/AppError.js';
import {
  verifyJwtToken,
  createTestToken,
  getExpectedAudience,
  getExpectedIssuer,
  getSupabaseJwtSecret,
  clearJwksCache,
  parseJwks,
  setTrustedJwks,
  getJwksCacheExpiresAt,
  getJwksCacheSize,
  DEFAULT_JWKS_CACHE_TTL_MS,
  JWKS_FETCH_THROTTLE_MS,
  MAX_STALE_GRACE_PERIOD_MS,
  MAX_JWKS_PAYLOAD_BYTES,
  MAX_JWKS_KEY_COUNT,
  setJwksClockForTesting,
  setJwksFetchForTesting,
  getStaleGraceExpiresAt,
  getLastJwksFetchAttempt,
  getTrustedKeyRecord,
  loadJwksIfNeeded,
  SUPABASE_CURRENT_ECC_KEY_ID,
  SUPABASE_PREVIOUS_HS256_KEY_ID,
} from '../src/common/middleware/auth.js';
import { getCorsAllowedOrigins, normalizeOrigin } from '../src/cors.js';

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

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
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('NODE_ENV', originalNodeEnv);
      }
    });

    it('defaults to 1 (numeric hop) in production when TRUST_PROXY is unset', () => {
      try {
        delete process.env.TRUST_PROXY;
        process.env.NODE_ENV = 'production';
        const proxyVal = resolveTrustProxy();
        assert.equal(proxyVal, 1);
        assert.equal(typeof proxyVal, 'number', 'Unset TRUST_PROXY in production must resolve to a number (1), not a boolean (true)');
      } finally {
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('NODE_ENV', originalNodeEnv);
      }
    });

    it('honors explicit numeric hop counts and boolean strings for TRUST_PROXY', () => {
      try {
        process.env.TRUST_PROXY = '1';
        assert.equal(resolveTrustProxy(), 1);
        assert.equal(typeof resolveTrustProxy(), 'number');

        process.env.TRUST_PROXY = '2';
        assert.equal(resolveTrustProxy(), 2);
        assert.equal(typeof resolveTrustProxy(), 'number');

        process.env.TRUST_PROXY = 'true';
        assert.equal(resolveTrustProxy(), true);
        assert.equal(typeof resolveTrustProxy(), 'boolean');

        process.env.TRUST_PROXY = 'false';
        assert.equal(resolveTrustProxy(), false);
        assert.equal(typeof resolveTrustProxy(), 'boolean');

        process.env.TRUST_PROXY = '0';
        assert.equal(resolveTrustProxy(), false);
      } finally {
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('NODE_ENV', originalNodeEnv);
      }
    });

    it('honors valid IP and subnet values or comma-separated lists for TRUST_PROXY', () => {
      try {
        process.env.TRUST_PROXY = '127.0.0.1';
        assert.equal(resolveTrustProxy(), '127.0.0.1');

        process.env.TRUST_PROXY = '10.0.0.1, 10.0.0.2';
        assert.deepEqual(resolveTrustProxy(), ['10.0.0.1', '10.0.0.2']);

        process.env.TRUST_PROXY = '10.0.0.0/8';
        assert.equal(resolveTrustProxy(), '10.0.0.0/8');

        process.env.TRUST_PROXY = 'loopback, linklocal';
        assert.deepEqual(resolveTrustProxy(), ['loopback', 'linklocal']);
      } finally {
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('NODE_ENV', originalNodeEnv);
      }
    });

    it('rejects malformed or invalid TRUST_PROXY configuration values with descriptive error', () => {
      try {
        process.env.TRUST_PROXY = 'invalid_val';
        assert.throws(() => resolveTrustProxy(), /Invalid TRUST_PROXY/);

        process.env.TRUST_PROXY = '10.0.0.1, , 999.999';
        assert.throws(() => resolveTrustProxy(), /Invalid TRUST_PROXY/);

        process.env.TRUST_PROXY = '-1';
        assert.throws(() => resolveTrustProxy(), /Invalid TRUST_PROXY/);
      } finally {
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('NODE_ENV', originalNodeEnv);
      }
    });

    it('prevents client IP spoofing via X-Forwarded-For with trustProxy: 1', async () => {
      // Fastify 5's security design fails closed on numeric hop counts without immediate
      // peer validation (returning socket 127.0.0.1), preventing direct client header manipulation.
      const app = Fastify({ trustProxy: 1 });
      app.get('/test-ip', async (req) => ({ ip: req.ip }));

      const res = await app.inject({
        method: 'GET',
        url: '/test-ip',
        headers: {
          'x-forwarded-for': '203.0.113.1, 198.51.100.2',
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.payload);
      assert.equal(data.ip, '127.0.0.1', 'Fastify must not trust X-Forwarded-For from untrusted immediate peer');
      assert.notEqual(data.ip, '203.0.113.1', 'Forged prepended IP must NOT be returned as client IP');
      await app.close();
    });

    it('extracts trusted client IP when upstream reverse proxy is explicitly trusted', async () => {
      // When the upstream reverse proxy (e.g. loopback) is explicitly trusted,
      // Fastify peels the proxy hop and extracts the true client IP (198.51.100.2),
      // discarding forged prepended hops (203.0.113.1).
      const app = Fastify({ trustProxy: 'loopback' });
      app.get('/test-ip', async (req) => ({ ip: req.ip }));

      const res = await app.inject({
        method: 'GET',
        url: '/test-ip',
        headers: {
          'x-forwarded-for': '203.0.113.1, 198.51.100.2',
        },
      });

      assert.equal(res.statusCode, 200);
      const data = JSON.parse(res.payload);
      assert.equal(data.ip, '198.51.100.2', 'Must extract client IP from trusted reverse proxy');
      assert.notEqual(data.ip, '203.0.113.1', 'Forged prepended IP must NOT be returned as client IP');
      await app.close();
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
    const originalEnv = process.env.NODE_ENV;
    const originalTrustProxy = process.env.TRUST_PROXY;
    const originalSupabaseUrl = process.env.SUPABASE_URL;

    it('sanitizes 500 error messages to generic string in production', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        delete process.env.TRUST_PROXY;
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
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });

    it('sanitizes AppError messages with status >= 500 in production', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        delete process.env.TRUST_PROXY;
        const app = await buildApp();

        app.get('/test-app-error-500', async () => {
          throw new AppError(
            'DATABASE_QUERY_FAILED',
            'SELECT * FROM users WHERE connection_str=postgres://admin:pw123@host:5432',
            500
          );
        });

        const res = await app.inject({
          method: 'GET',
          url: '/test-app-error-500',
        });

        assert.equal(res.statusCode, 500);
        const body = JSON.parse(res.payload);
        assert.equal(body.error.code, 'INTERNAL_ERROR');
        assert.equal(body.error.message, 'An internal server error occurred.');
        assert.ok(!res.payload.includes('pw123'), 'Must never leak connection details in 500 AppError');

        await app.close();
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });

    it('preserves client-facing AppError messages below 500 in production', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        delete process.env.TRUST_PROXY;
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
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });
  });

  describe('3. Public App URL and Origin Validation', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalCors = process.env.CORS_ALLOWED_ORIGINS;
    const originalPublicUrl = process.env.PUBLIC_APP_URL;

    it('rejects untrusted origin header in production and falls back to canonical URL', () => {
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.PUBLIC_APP_URL;
        delete process.env.CORS_ALLOWED_ORIGINS;

        const resolved = resolvePublicAppUrl('https://evil-phishing.com');
        assert.equal(resolved, 'https://exprest.vercel.app');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('CORS_ALLOWED_ORIGINS', originalCors);
        restoreEnv('PUBLIC_APP_URL', originalPublicUrl);
      }
    });

    it('accepts legitimate production origin header', () => {
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.PUBLIC_APP_URL;

        const resolved = resolvePublicAppUrl('https://exprest.vercel.app');
        assert.equal(resolved, 'https://exprest.vercel.app');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('PUBLIC_APP_URL', originalPublicUrl);
      }
    });

    it('accepts configured CORS origins as valid public origin header in production', () => {
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.PUBLIC_APP_URL;
        process.env.CORS_ALLOWED_ORIGINS = 'https://rail.myorg.in,https://custom.exprest.dev';

        assert.equal(resolvePublicAppUrl('https://rail.myorg.in'), 'https://rail.myorg.in');
        assert.equal(resolvePublicAppUrl('https://custom.exprest.dev'), 'https://custom.exprest.dev');
        assert.equal(resolvePublicAppUrl('https://malicious.org'), 'https://exprest.vercel.app');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('CORS_ALLOWED_ORIGINS', originalCors);
        restoreEnv('PUBLIC_APP_URL', originalPublicUrl);
      }
    });
  });

  describe('4. Startup Environment Validation', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalKey = process.env.RAILRADAR_API_KEY;
    const originalAuth = process.env.AUTH_SECRET;
    const originalJwt = process.env.SUPABASE_JWT_SECRET;
    const originalSupabaseUrl = process.env.SUPABASE_URL;
    const originalJwtIssuer = process.env.SUPABASE_JWT_ISSUER;

    it('strictly requires resolvable Supabase issuer (SUPABASE_URL or SUPABASE_JWT_ISSUER) in production', () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.RAILRADAR_API_KEY = 'valid_radar_key_12345';
        process.env.AUTH_SECRET = 'valid_auth_secret_1234567890';
        process.env.SUPABASE_JWT_SECRET = 'strong_production_supabase_jwt_secret_xyz123';
        delete process.env.SUPABASE_URL;
        delete process.env.SUPABASE_JWT_ISSUER;

        assert.throws(
          () => validateStartupEnvironment(),
          /Configuration error: Missing SUPABASE_URL or SUPABASE_JWT_ISSUER in production/
        );

        // Providing SUPABASE_URL satisfies the requirement
        process.env.SUPABASE_URL = 'https://mytenant.supabase.co';
        assert.doesNotThrow(() => validateStartupEnvironment());
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('RAILRADAR_API_KEY', originalKey);
        restoreEnv('AUTH_SECRET', originalAuth);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
        restoreEnv('SUPABASE_JWT_ISSUER', originalJwtIssuer);
      }
    });

    it('strictly rejects weak or placeholder SUPABASE_JWT_SECRET in production', () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.RAILRADAR_API_KEY = 'valid_radar_key_12345';
        process.env.AUTH_SECRET = 'valid_auth_secret_1234567890';
        process.env.SUPABASE_URL = 'https://mytenant.supabase.co';

        // Placeholder default
        process.env.SUPABASE_JWT_SECRET = 'dev_secret_change_in_prod';
        assert.throws(
          () => validateStartupEnvironment(),
          /Configuration error: Insecure SUPABASE_JWT_SECRET in production/
        );

        // Too short (<16 chars)
        process.env.SUPABASE_JWT_SECRET = 'tiny_secret';
        assert.throws(
          () => validateStartupEnvironment(),
          /Configuration error: Insecure SUPABASE_JWT_SECRET in production/
        );

        // Secure secret (>= 16 chars) passes
        process.env.SUPABASE_JWT_SECRET = 'strong_production_supabase_jwt_secret_xyz123';
        assert.doesNotThrow(() => validateStartupEnvironment());
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('RAILRADAR_API_KEY', originalKey);
        restoreEnv('AUTH_SECRET', originalAuth);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });

    it('strictly requires HTTPS URLs in production for SUPABASE_URL and PUBLIC_APP_URL', () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.RAILRADAR_API_KEY = 'valid_radar_key_12345';
        process.env.AUTH_SECRET = 'valid_auth_secret_1234567890';
        process.env.SUPABASE_JWT_SECRET = 'strong_production_supabase_jwt_secret_xyz123';

        // Insecure HTTP protocol for SUPABASE_URL in production is rejected
        process.env.SUPABASE_URL = 'http://insecure-supabase.co';
        assert.throws(
          () => validateStartupEnvironment(),
          /SUPABASE_URL must use https:\/\/ protocol in production/
        );

        // Malformed SUPABASE_URL is rejected
        process.env.SUPABASE_URL = 'not-a-valid-url';
        assert.throws(
          () => validateStartupEnvironment(),
          /Invalid SUPABASE_URL/
        );

        // Valid HTTPS SUPABASE_URL passes
        process.env.SUPABASE_URL = 'https://valid-tenant.supabase.co';

        // Insecure HTTP protocol for PUBLIC_APP_URL in production is rejected
        process.env.PUBLIC_APP_URL = 'http://insecure-app.vercel.app';
        assert.throws(
          () => validateStartupEnvironment(),
          /PUBLIC_APP_URL must use https:\/\/ protocol in production/
        );

        // Valid HTTPS PUBLIC_APP_URL passes
        process.env.PUBLIC_APP_URL = 'https://exprest.vercel.app';
        assert.doesNotThrow(() => validateStartupEnvironment());
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('RAILRADAR_API_KEY', originalKey);
        restoreEnv('AUTH_SECRET', originalAuth);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
        delete process.env.PUBLIC_APP_URL;
      }
    });

    it('getStartupDiagnostics provides safe diagnostic telemetry without secret leakage', () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.RAILRADAR_API_KEY = 'super_secret_railradar_api_key_xyz';
        process.env.AUTH_SECRET = 'super_secret_auth_secret_longer_than_16_chars';
        process.env.SUPABASE_JWT_SECRET = 'super_secret_jwt_signing_key_for_supabase';
        process.env.SUPABASE_URL = 'https://safe-project.supabase.co';
        process.env.PUBLIC_APP_URL = 'https://exprest.vercel.app';

        const diag = getStartupDiagnostics();
        assert.equal(diag.nodeEnv, 'production');
        assert.equal(diag.hasRailRadarApiKey, true);
        assert.equal(diag.hasAuthSecret, true);
        assert.equal(diag.hasSupabaseJwtSecret, true);
        assert.equal(diag.authSecretLength, 45);
        assert.equal(diag.supabaseIssuer, 'https://safe-project.supabase.co/auth/v1');
        assert.equal(diag.publicAppUrl, 'https://exprest.vercel.app');

        // Confirm string representation does NOT contain raw secret values
        const serialized = JSON.stringify(diag);
        assert.ok(!serialized.includes('super_secret_railradar_api_key_xyz'), 'Raw RAILRADAR_API_KEY must not leak');
        assert.ok(!serialized.includes('super_secret_auth_secret_longer_than_16_chars'), 'Raw AUTH_SECRET must not leak');
        assert.ok(!serialized.includes('super_secret_jwt_signing_key_for_supabase'), 'Raw SUPABASE_JWT_SECRET must not leak');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('RAILRADAR_API_KEY', originalKey);
        restoreEnv('AUTH_SECRET', originalAuth);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
        delete process.env.PUBLIC_APP_URL;
      }
    });
  });

  describe('5. JWT Verification, Secret Separation & Claims Enforcement', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalAuth = process.env.AUTH_SECRET;
    const originalJwt = process.env.SUPABASE_JWT_SECRET;
    const originalAud = process.env.SUPABASE_JWT_AUDIENCE;
    const originalIss = process.env.SUPABASE_JWT_ISSUER;
    const originalSupabaseUrl = process.env.SUPABASE_URL;

    function makeRawJwt(header: any, payload: any, secret?: string): string {
      const h = Buffer.from(JSON.stringify(header)).toString('base64url');
      const p = Buffer.from(JSON.stringify(payload)).toString('base64url');
      let sig = '';
      if (secret) {
        sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
      }
      return `${h}.${p}.${sig}`;
    }

    it('rejects HS256 tokens signed with AUTH_SECRET in production when SUPABASE_JWT_SECRET is set', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = 'https://myproject.supabase.co';
        process.env.SUPABASE_JWT_SECRET = 'prod_supabase_jwt_secret_12345678';
        process.env.AUTH_SECRET = 'prod_application_auth_secret_99999999';

        // Token signed with application AUTH_SECRET (share link secret)
        const tokenSignedWithAuthSecret = createTestToken(
          { sub: 'user_target_1' },
          { secret: process.env.AUTH_SECRET }
        );

        // Verification must strictly reject AUTH_SECRET
        const rejected = await verifyJwtToken(tokenSignedWithAuthSecret);
        assert.equal(rejected, null, 'Tokens signed with AUTH_SECRET must NOT verify as Supabase JWTs');

        // Token signed with dedicated SUPABASE_JWT_SECRET
        const tokenSignedWithJwtSecret = createTestToken(
          { sub: 'user_target_1' },
          { secret: process.env.SUPABASE_JWT_SECRET }
        );

        const accepted = await verifyJwtToken(tokenSignedWithJwtSecret);
        assert.ok(accepted, 'Token signed with SUPABASE_JWT_SECRET must verify successfully');
        assert.equal(accepted.id, 'user_target_1');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('AUTH_SECRET', originalAuth);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });

    it('fails closed when SUPABASE_JWT_SECRET is missing in production, ignoring AUTH_SECRET', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = 'https://myproject.supabase.co';
        delete process.env.SUPABASE_JWT_SECRET;
        process.env.AUTH_SECRET = 'valid_production_auth_secret_123456';

        const token = createTestToken({ sub: 'user_target_2' }, { secret: process.env.AUTH_SECRET });
        const result = await verifyJwtToken(token);
        assert.equal(result, null, 'Must fail closed in production when SUPABASE_JWT_SECRET is missing');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('AUTH_SECRET', originalAuth);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });

    it('validates audience (aud) claim strictly in production', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = 'https://myproject.supabase.co';
        process.env.SUPABASE_JWT_SECRET = 'prod_supabase_jwt_secret_12345678';
        delete process.env.SUPABASE_JWT_AUDIENCE;

        // Valid default audience 'authenticated'
        const validToken = createTestToken({ sub: 'user_aud_1', aud: 'authenticated' });
        assert.ok(await verifyJwtToken(validToken), 'aud: "authenticated" must be accepted');

        // Wrong audience
        const invalidToken = createTestToken({ sub: 'user_aud_1', aud: 'wrong-audience' });
        assert.equal(await verifyJwtToken(invalidToken), null, 'Wrong audience must be rejected');

        // Missing audience in production
        const missingAudToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { sub: 'user_aud_1', exp: Math.floor(Date.now() / 1000) + 3600, iss: 'https://myproject.supabase.co/auth/v1' },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(missingAudToken), null, 'Missing aud in production must be rejected');

        // Array audience containing 'authenticated'
        const arrayAudToken = createTestToken({
          sub: 'user_aud_1',
          aud: ['other-app', 'authenticated'],
        });
        assert.ok(await verifyJwtToken(arrayAudToken), 'Array aud containing authenticated must be accepted');

        // Array audience without 'authenticated'
        const badArrayAudToken = createTestToken({
          sub: 'user_aud_1',
          aud: ['other-app', 'guest'],
        });
        assert.equal(await verifyJwtToken(badArrayAudToken), null, 'Array aud without authenticated must be rejected');

        // Custom configured SUPABASE_JWT_AUDIENCE
        process.env.SUPABASE_JWT_AUDIENCE = 'custom-tenant-aud';
        const customToken = createTestToken({ sub: 'user_aud_1', aud: 'custom-tenant-aud' });
        assert.ok(await verifyJwtToken(customToken), 'Configured custom audience must be accepted');
        const defaultToken = createTestToken({ sub: 'user_aud_1', aud: 'authenticated' });
        assert.equal(await verifyJwtToken(defaultToken), null, 'Default aud must be rejected when custom is required');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_JWT_AUDIENCE', originalAud);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });

    it('validates issuer (iss) claim strictly when configured and fails closed when unresolvable', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_JWT_SECRET = 'prod_supabase_jwt_secret_12345678';
        process.env.SUPABASE_JWT_ISSUER = 'https://myproject.supabase.co/auth/v1';

        // Matching issuer
        const validIssToken = createTestToken({
          sub: 'user_iss_1',
          iss: 'https://myproject.supabase.co/auth/v1',
        });
        assert.ok(await verifyJwtToken(validIssToken), 'Matching issuer must be accepted');

        // Matching issuer with trailing slash in token
        const slashIssToken = createTestToken({
          sub: 'user_iss_1',
          iss: 'https://myproject.supabase.co/auth/v1/',
        });
        assert.ok(await verifyJwtToken(slashIssToken), 'Matching issuer with trailing slash must be normalized and accepted');

        // Mismatched issuer
        const wrongIssToken = createTestToken({
          sub: 'user_iss_1',
          iss: 'https://malicious-tenant.supabase.co/auth/v1',
        });
        assert.equal(await verifyJwtToken(wrongIssToken), null, 'Mismatched issuer must be rejected');

        // Missing issuer in production when configured
        const missingIssToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { sub: 'user_iss_1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(missingIssToken), null, 'Missing iss in production when expected must be rejected');

        // Fails closed in production if issuer is completely unresolvable
        delete process.env.SUPABASE_JWT_ISSUER;
        delete process.env.SUPABASE_URL;
        const unresolvableIssResult = await verifyJwtToken(validIssToken);
        assert.equal(unresolvableIssResult, null, 'Must fail closed in production if issuer cannot be resolved');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_JWT_ISSUER', originalIss);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });

    it('strictly enforces subject (sub) claim and rejects id-only fallback tokens', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = 'https://myproject.supabase.co';
        process.env.SUPABASE_JWT_SECRET = 'prod_supabase_jwt_secret_12345678';

        // Empty string sub
        const emptySubToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { sub: '', aud: 'authenticated', iss: 'https://myproject.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(emptySubToken), null, 'Empty sub must be rejected');

        // Whitespace only sub
        const whitespaceSubToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { sub: '   ', aud: 'authenticated', iss: 'https://myproject.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(whitespaceSubToken), null, 'Whitespace sub must be rejected');

        // Missing sub entirely
        const noSubToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { aud: 'authenticated', iss: 'https://myproject.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(noSubToken), null, 'Missing sub must be rejected');

        // Token with id only (no sub) MUST be rejected — no id fallback
        const idOnlyToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { id: 'user_target_fallback', aud: 'authenticated', iss: 'https://myproject.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(idOnlyToken), null, 'Tokens with "id" claim but no "sub" claim must be rejected');

        // Non-string sub
        const numSubToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { sub: 123456, aud: 'authenticated', iss: 'https://myproject.supabase.co/auth/v1', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(numSubToken), null, 'Non-string sub must be rejected');

        // Valid sub claim succeeds
        const validSubToken = createTestToken({ sub: 'user_valid_uuid_123' });
        const validRes = await verifyJwtToken(validSubToken);
        assert.ok(validRes, 'Valid string sub must verify');
        assert.equal(validRes.id, 'user_valid_uuid_123');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });

    it('strictly rejects unsupported algorithms (none, RS256, HS512)', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = 'https://myproject.supabase.co';
        process.env.SUPABASE_JWT_SECRET = 'prod_supabase_jwt_secret_12345678';

        const noneToken = makeRawJwt(
          { alg: 'none', typ: 'JWT' },
          { sub: 'user_alg_1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 }
        );
        assert.equal(await verifyJwtToken(noneToken), null, 'Algorithm "none" must be rejected');

        const rs256Token = makeRawJwt(
          { alg: 'RS256', typ: 'JWT' },
          { sub: 'user_alg_1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
          'test_secret'
        );
        assert.equal(await verifyJwtToken(rs256Token), null, 'Algorithm "RS256" must be rejected');

        const hs512Token = makeRawJwt(
          { alg: 'HS512', typ: 'JWT' },
          { sub: 'user_alg_1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
          'test_secret'
        );
        assert.equal(await verifyJwtToken(hs512Token), null, 'Algorithm "HS512" must be rejected');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });
  });

  describe('6. CORS Configuration Precedence & Origin Normalization', () => {
    it('gives CORS_ALLOWED_ORIGINS precedence over legacy CORS_ORIGINS', () => {
      const origins = getCorsAllowedOrigins({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://canonical.exprest.dev',
        CORS_ORIGINS: 'https://legacy.exprest.dev',
      });

      assert.deepEqual(origins, ['https://canonical.exprest.dev']);
      assert.ok(!origins.includes('https://legacy.exprest.dev'));
    });

    it('falls back to CORS_ORIGINS when CORS_ALLOWED_ORIGINS is unset', () => {
      const origins = getCorsAllowedOrigins({
        NODE_ENV: 'production',
        CORS_ORIGINS: 'https://legacy.exprest.dev',
      });

      assert.deepEqual(origins, ['https://legacy.exprest.dev']);
    });

    it('normalizes origins by stripping trailing slashes and spaces', () => {
      const origins = getCorsAllowedOrigins({
        NODE_ENV: 'production',
        CORS_ALLOWED_ORIGINS: 'https://app1.exprest.dev/, https://app2.exprest.dev/ ',
      });

      assert.deepEqual(origins, ['https://app1.exprest.dev', 'https://app2.exprest.dev']);
    });

    it('includes localhost and 127.0.0.1 regexes in development/test', () => {
      const origins = getCorsAllowedOrigins({ NODE_ENV: 'development' });
      const hasLocalhostRegex = origins.some((o) => o instanceof RegExp && o.test('http://localhost:3000'));
      const has127Regex = origins.some((o) => o instanceof RegExp && o.test('http://127.0.0.1:5173'));
      assert.ok(hasLocalhostRegex, 'Development origins must include localhost');
      assert.ok(has127Regex, 'Development origins must include 127.0.0.1');
    });

    it('normalizeOrigin extracts base origin and strips paths and trailing slashes', () => {
      assert.equal(normalizeOrigin('https://sub.exprest.dev/path/to/page'), 'https://sub.exprest.dev');
      assert.equal(normalizeOrigin('https://exprest.dev/'), 'https://exprest.dev');
      assert.equal(normalizeOrigin('  https://exprest.dev  '), 'https://exprest.dev');
      assert.equal(normalizeOrigin(''), '');
    });
  });

  describe('7. Route-Level Error Sanitization & Safe Public Responses', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSupabaseUrl = process.env.SUPABASE_URL;

    it('toSafeErrorMessage exposes err.message in development for debugging', () => {
      try {
        process.env.NODE_ENV = 'development';
        const err = new Error('Postgres connection failed on internal-db.aws.internal');
        assert.equal(
          toSafeErrorMessage(err, 'Generic fallback'),
          'Postgres connection failed on internal-db.aws.internal'
        );
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
      }
    });

    it('toSafeErrorMessage redacts unexpected internal errors to generic string in production', () => {
      try {
        process.env.NODE_ENV = 'production';
        const err = new Error('Postgres connection failed on internal-db.aws.internal');
        assert.equal(toSafeErrorMessage(err, 'Generic fallback'), 'Generic fallback');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
      }
    });

    it('toSafeErrorMessage preserves trusted client-facing AppError messages below 500 in production', () => {
      try {
        process.env.NODE_ENV = 'production';
        const appErr = new AppError('INVALID_TRAIN', 'Train number 99999 was not found.', 404);
        assert.equal(toSafeErrorMessage(appErr, 'Generic fallback'), 'Train number 99999 was not found.');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
      }
    });

    it('toSafeErrorMessage sanitizes AppError messages with status >= 500 in production', () => {
      try {
        process.env.NODE_ENV = 'production';
        const appErr500 = new AppError('INTERNAL_DB_CRASH', 'postgres://admin:pw@host/db crash', 500);
        assert.equal(toSafeErrorMessage(appErr500, 'Generic fallback'), 'Generic fallback');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
      }
    });

    it('verifies route catch blocks do not leak upstream secrets in production', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_URL = 'https://example.supabase.co';
        delete process.env.TRUST_PROXY;
        const app = await buildApp();

        // Simulate a route endpoint that encounters an upstream failure containing secret tokens
        app.get('/api/v1/test-upstream-leak', async () => {
          try {
            throw new Error('Upstream API request failed: Authorization: Bearer secret_live_token_abcdef123456');
          } catch (err: any) {
            return {
              error: {
                code: 'PROVIDER_TIMEOUT',
                message: toSafeErrorMessage(err, 'Upstream service is temporarily unavailable.'),
              },
            };
          }
        });

        const res = await app.inject({
          method: 'GET',
          url: '/api/v1/test-upstream-leak',
        });

        assert.equal(res.statusCode, 200);
        const body = JSON.parse(res.payload);
        assert.equal(body.error.message, 'Upstream service is temporarily unavailable.');
        assert.ok(!res.payload.includes('secret_live_token'), 'Must never leak upstream credentials in response');

        await app.close();
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('SUPABASE_URL', originalSupabaseUrl);
      }
    });
  });

  describe('8. Bounded JWKS Caching, Key Rotation & Verification', () => {
    it('parseJwks enforces EC P-256 curve, ES256 alg, and non-empty kid', () => {
      const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const validJwk = publicKey.export({ format: 'jwk' });
      validJwk.kid = 'valid-key-id-1';
      validJwk.alg = 'ES256';
      validJwk.use = 'sig';

      const validParsed = parseJwks({ keys: [validJwk] });
      assert.equal(validParsed.size, 1);
      assert.ok(validParsed.has('valid-key-id-1'));

      // Non-EC key is rejected
      const { publicKey: rsaPub } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
      const rsaJwk = rsaPub.export({ format: 'jwk' });
      rsaJwk.kid = 'rsa-key';
      assert.equal(parseJwks({ keys: [rsaJwk] }).size, 0);

      // Wrong curve is rejected
      const wrongCurveJwk = { ...validJwk, crv: 'secp256k1', kid: 'wrong-crv' };
      assert.equal(parseJwks({ keys: [wrongCurveJwk] }).size, 0);

      // Wrong algorithm is rejected
      const wrongAlgJwk = { ...validJwk, alg: 'RS256', kid: 'wrong-alg' };
      assert.equal(parseJwks({ keys: [wrongAlgJwk] }).size, 0);

      // Missing kid is rejected
      const noKidJwk = { ...validJwk, kid: '' };
      assert.equal(parseJwks({ keys: [noKidJwk] }).size, 0);
    });

    it('setTrustedJwks establishes a 10-minute cache TTL', () => {
      clearJwksCache();
      const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk = publicKey.export({ format: 'jwk' });
      jwk.kid = 'ttl-key-1';
      jwk.alg = 'ES256';

      setTrustedJwks({ keys: [jwk] });
      assert.equal(getJwksCacheSize(), 1);
      const expiresAt = getJwksCacheExpiresAt();
      const now = Date.now();
      assert.ok(expiresAt > now, 'Cache must have a future expiration timestamp');
      assert.ok(expiresAt <= now + DEFAULT_JWKS_CACHE_TTL_MS, 'Cache TTL must not exceed configured default');
      clearJwksCache();
    });

    it('replaces the key set on refresh to evict retired or revoked keys', () => {
      clearJwksCache();
      const { publicKey: key1 } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk1 = key1.export({ format: 'jwk' });
      jwk1.kid = 'active-key-v1';
      jwk1.alg = 'ES256';

      setTrustedJwks({ keys: [jwk1] });
      assert.equal(getJwksCacheSize(), 1);

      // Key rotation occurs: Key 1 is retired, Key 2 replaces it
      const { publicKey: key2 } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk2 = key2.export({ format: 'jwk' });
      jwk2.kid = 'active-key-v2';
      jwk2.alg = 'ES256';

      // Simulate full JWKS replace on refresh
      clearJwksCache();
      setTrustedJwks({ keys: [jwk2] });

      assert.equal(getJwksCacheSize(), 1);
      assert.equal(parseJwks({ keys: [jwk1] }).has('active-key-v1'), true);
      // active-key-v1 is no longer in cache
      assert.equal(getJwksCacheSize(), 1);
      clearJwksCache();
    });

    it('rejects ES256 tokens missing kid header without ambiguous single-key fallback', async () => {
      clearJwksCache();
      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk = publicKey.export({ format: 'jwk' });
      jwk.kid = 'ec-registered-key';
      jwk.alg = 'ES256';
      setTrustedJwks({ keys: [jwk] });

      // Create an ES256 token that explicitly omits the kid header
      const header = { alg: 'ES256', typ: 'JWT' }; // No kid
      const payload = { sub: 'user_nokid_1', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 };
      const hB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
      const pB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
      const data = Buffer.from(`${hB64}.${pB64}`, 'utf-8');
      const sig = crypto.sign('SHA256', data, { key: privateKey, dsaEncoding: 'ieee-p1363' });
      const tokenWithoutKid = `${hB64}.${pB64}.${sig.toString('base64url')}`;

      // Must be strictly rejected because kid is required
      const verified = await verifyJwtToken(tokenWithoutKid);
      assert.equal(verified, null, 'ES256 token without kid in header must be rejected');
      clearJwksCache();
    });

    it('successfully accepts and verifies valid ES256 token with registered kid', async () => {
      clearJwksCache();
      const token = createTestToken({ sub: 'user_es256_success' }, { alg: 'ES256' });
      const verified = await verifyJwtToken(token);
      assert.ok(verified, 'Valid ES256 token with registered kid must verify');
      assert.equal(verified.id, 'user_es256_success');
      clearJwksCache();
    });

    it('clock advancement past cache TTL triggers fresh fetch without sleeps', async () => {
      clearJwksCache();
      let simulatedTime = 1000000;
      setJwksClockForTesting(() => simulatedTime);

      const { publicKey: k1 } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk1 = k1.export({ format: 'jwk' });
      jwk1.kid = 'k-sim-1';
      jwk1.alg = 'ES256';

      let fetchCount = 0;
      setJwksFetchForTesting((async () => {
        fetchCount++;
        return new Response(JSON.stringify({ keys: [jwk1] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as any);

      process.env.SUPABASE_JWKS_URL = 'https://example.supabase.co/auth/v1/.well-known/jwks.json';

      // 1. Initial fetch at T=0
      await loadJwksIfNeeded('k-sim-1');
      assert.equal(fetchCount, 1);
      assert.ok(getTrustedKeyRecord('k-sim-1'));

      // 2. Query again within TTL (advance 5 minutes): Cache is fresh, no fetch triggered
      simulatedTime += 5 * 60 * 1000;
      await loadJwksIfNeeded('k-sim-1');
      assert.equal(fetchCount, 1, 'Cache must be reused within TTL window');

      // 3. Advance clock past 10-minute TTL (advance 6 more minutes, total 11m)
      simulatedTime += 6 * 60 * 1000;
      await loadJwksIfNeeded('k-sim-1');
      assert.equal(fetchCount, 2, 'Fresh fetch must be triggered once TTL expires');

      clearJwksCache();
      delete process.env.SUPABASE_JWKS_URL;
    });

    it('concurrent requests deduplicate and share in-flight fetch without race conditions', async () => {
      clearJwksCache();
      let simulatedTime = 2000000;
      setJwksClockForTesting(() => simulatedTime);

      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk = publicKey.export({ format: 'jwk' });
      jwk.kid = 'concurrent-key';
      jwk.alg = 'ES256';

      let fetchCount = 0;
      setJwksFetchForTesting((async () => {
        fetchCount++;
        // Simulate slight async network delay
        await new Promise((r) => setTimeout(r, 10));
        return new Response(JSON.stringify({ keys: [jwk] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as any);

      process.env.SUPABASE_JWKS_URL = 'https://example.supabase.co/auth/v1/.well-known/jwks.json';

      // Fire 5 concurrent requests simultaneously
      const results = await Promise.all([
        loadJwksIfNeeded('concurrent-key'),
        loadJwksIfNeeded('concurrent-key'),
        loadJwksIfNeeded('concurrent-key'),
        loadJwksIfNeeded('concurrent-key'),
        loadJwksIfNeeded('concurrent-key'),
      ]);

      assert.equal(fetchCount, 1, 'Concurrent requests must share a single in-flight fetch');
      assert.ok(getTrustedKeyRecord('concurrent-key'));

      clearJwksCache();
      delete process.env.SUPABASE_JWKS_URL;
    });

    it('throttles rapid fetch attempts when remote endpoint was just queried', async () => {
      clearJwksCache();
      let simulatedTime = 3000000;
      setJwksClockForTesting(() => simulatedTime);

      let fetchCount = 0;
      setJwksFetchForTesting((async () => {
        fetchCount++;
        return new Response(JSON.stringify({ keys: [] }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as any);

      process.env.SUPABASE_JWKS_URL = 'https://example.supabase.co/auth/v1/.well-known/jwks.json';

      // First attempt triggers fetch
      await loadJwksIfNeeded('unknown-key');
      assert.equal(fetchCount, 1);

      // Immediate subsequent attempt within throttle window (10s later < 30s)
      simulatedTime += 10 * 1000;
      await loadJwksIfNeeded('unknown-key');
      assert.equal(fetchCount, 1, 'Subsequent fetch within throttle interval must be suppressed');

      // Attempt after throttle window (35s later > 30s)
      simulatedTime += 25 * 1000;
      await loadJwksIfNeeded('unknown-key');
      assert.equal(fetchCount, 2, 'Fetch after throttle interval has passed must be permitted');

      clearJwksCache();
      delete process.env.SUPABASE_JWKS_URL;
    });

    it('stale-key grace period allows verification during temporary network outage', async () => {
      clearJwksCache();
      let simulatedTime = 4000000;
      setJwksClockForTesting(() => simulatedTime);

      const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk = publicKey.export({ format: 'jwk' });
      jwk.kid = 'stale-grace-key';
      jwk.alg = 'ES256';

      setTrustedJwks({ keys: [jwk] });
      assert.ok(getTrustedKeyRecord('stale-grace-key'));

      // Advance clock past 10m TTL, but within 10m stale grace (at 15 minutes)
      simulatedTime += 15 * 60 * 1000;

      // Mock remote endpoint failure
      setJwksFetchForTesting((async () => {
        throw new Error('Network timeout');
      }) as any);
      process.env.SUPABASE_JWKS_URL = 'https://example.supabase.co/auth/v1/.well-known/jwks.json';

      // Request occurs: TTL expired so it attempts fetch, fetch fails, but stale grace is active
      await loadJwksIfNeeded('stale-grace-key');
      const keyRecord = getTrustedKeyRecord('stale-grace-key');
      assert.ok(keyRecord, 'Key must be retained and returned during stale grace period');

      clearJwksCache();
      delete process.env.SUPABASE_JWKS_URL;
    });

    it('stale-key grace expiration purges keys and fails closed when outage persists', async () => {
      clearJwksCache();
      let simulatedTime = 5000000;
      setJwksClockForTesting(() => simulatedTime);

      const { publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
      const jwk = publicKey.export({ format: 'jwk' });
      jwk.kid = 'expired-grace-key';
      jwk.alg = 'ES256';

      setTrustedJwks({ keys: [jwk] });

      // Advance clock beyond TTL (10m) + stale grace (10m) + 1 second (total 21m)
      simulatedTime += 21 * 60 * 1000;

      // Fetch fails
      setJwksFetchForTesting((async () => {
        throw new Error('Supabase outage');
      }) as any);
      process.env.SUPABASE_JWKS_URL = 'https://example.supabase.co/auth/v1/.well-known/jwks.json';

      await loadJwksIfNeeded('expired-grace-key');
      const keyRecord = getTrustedKeyRecord('expired-grace-key');
      assert.equal(keyRecord, null, 'Key must be purged and null returned once stale grace expires');

      clearJwksCache();
      delete process.env.SUPABASE_JWKS_URL;
    });

    it('rejects JWKS payload exceeding maximum allowed bytes (256 KB)', async () => {
      clearJwksCache();
      const largePayload = JSON.stringify({
        keys: [],
        extra: 'X'.repeat(MAX_JWKS_PAYLOAD_BYTES + 1024),
      });

      setJwksFetchForTesting((async () => {
        return new Response(largePayload, {
          status: 200,
          headers: {
            'content-type': 'application/json',
            'content-length': String(Buffer.byteLength(largePayload)),
          },
        });
      }) as any);

      process.env.SUPABASE_JWKS_URL = 'https://example.supabase.co/auth/v1/.well-known/jwks.json';

      await loadJwksIfNeeded('oversized-key');
      assert.equal(getTrustedKeyRecord('oversized-key'), null, 'Oversized JWKS payload must be rejected');

      clearJwksCache();
      delete process.env.SUPABASE_JWKS_URL;
    });

    it('rejects JWKS response exceeding maximum allowed key count (20 keys)', async () => {
      clearJwksCache();
      const keys = [];
      for (let i = 0; i < MAX_JWKS_KEY_COUNT + 5; i++) {
        keys.push({
          kty: 'EC',
          crv: 'P-256',
          alg: 'ES256',
          use: 'sig',
          kid: `key-overflow-${i}`,
          x: 'test',
          y: 'test',
        });
      }

      setJwksFetchForTesting((async () => {
        return new Response(JSON.stringify({ keys }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }) as any);

      process.env.SUPABASE_JWKS_URL = 'https://example.supabase.co/auth/v1/.well-known/jwks.json';

      await loadJwksIfNeeded('key-overflow-0');
      assert.equal(getTrustedKeyRecord('key-overflow-0'), null, 'JWKS exceeding max key count must be rejected');

      clearJwksCache();
      delete process.env.SUPABASE_JWKS_URL;
    });
  });

  describe('9. Server-Side Sensitive Log Redaction', () => {
    it('cleanSensitiveLogText redacts connection strings, bearer tokens, and secrets', () => {
      const postgresLeak = 'Connecting to postgres://admin:super_secret_pw@db.production.aws:5432/exprest';
      const redactedPostgres = cleanSensitiveLogText(postgresLeak);
      assert.ok(!redactedPostgres.includes('super_secret_pw'));
      assert.ok(redactedPostgres.includes('postgres://[REDACTED]@[REDACTED]/exprest'));

      const postgresqlLeak = 'Connecting to postgresql://user:pass123@host:5432/db';
      assert.ok(!cleanSensitiveLogText(postgresqlLeak).includes('pass123'));

      const redisLeak = 'Connecting to redis://:mypassword@cache.internal:6379';
      assert.ok(!cleanSensitiveLogText(redisLeak).includes('mypassword'));

      const bearerLeak = 'Failed auth request Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.doNotLeakThis';
      const redactedBearer = cleanSensitiveLogText(bearerLeak);
      assert.ok(!redactedBearer.includes('doNotLeakThis'));
      assert.ok(redactedBearer.includes('Bearer [REDACTED]'));

      const secretParamLeak = 'Request params: api_key=topsecret123&token=myauthtoken456&password=password789';
      const redactedParams = cleanSensitiveLogText(secretParamLeak);
      assert.ok(!redactedParams.includes('topsecret123'));
      assert.ok(!redactedParams.includes('myauthtoken456'));
      assert.ok(!redactedParams.includes('password789'));
    });

    it('errorLogSerializer scrubs message and stack while preserving code and statusCode', () => {
      const sensitiveErr = new AppError(
        'DB_CONNECT_FAIL',
        'Failed to connect to postgres://app_user:prod_db_pw@internal.db:5432/exprest',
        500
      );

      const serialized = errorLogSerializer(sensitiveErr);
      assert.equal(serialized.type, 'AppError');
      assert.equal(serialized.code, 'DB_CONNECT_FAIL');
      assert.equal(serialized.statusCode, 500);
      assert.ok(!serialized.message.includes('prod_db_pw'));
      assert.ok(serialized.message.includes('postgres://[REDACTED]@[REDACTED]/exprest'));
      assert.ok(serialized.stack);
      assert.ok(!serialized.stack.includes('prod_db_pw'));
    });
  });
});
