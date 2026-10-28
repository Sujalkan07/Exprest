import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Fastify from 'fastify';
import { buildApp, resolveTrustProxy, validateStartupEnvironment } from '../src/app.js';
import { resolvePublicAppUrl, toSafeErrorMessage } from '../src/routes/index.js';
import { AppError } from '../src/common/errors/AppError.js';
import {
  verifyJwtToken,
  createTestToken,
  getExpectedAudience,
  getExpectedIssuer,
  getSupabaseJwtSecret,
  clearJwksCache,
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

    it('defaults to true (trust proxy hops) in production when TRUST_PROXY is unset', () => {
      try {
        delete process.env.TRUST_PROXY;
        process.env.NODE_ENV = 'production';
        assert.equal(resolveTrustProxy(), true);
      } finally {
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('NODE_ENV', originalNodeEnv);
      }
    });

    it('honors explicit boolean-like strings for TRUST_PROXY', () => {
      try {
        process.env.TRUST_PROXY = 'true';
        assert.equal(resolveTrustProxy(), true);

        process.env.TRUST_PROXY = '1';
        assert.equal(resolveTrustProxy(), true);

        process.env.TRUST_PROXY = 'false';
        assert.equal(resolveTrustProxy(), false);

        process.env.TRUST_PROXY = '0';
        assert.equal(resolveTrustProxy(), false);
      } finally {
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('NODE_ENV', originalNodeEnv);
      }
    });

    it('honors IP and subnet values or comma-separated lists for TRUST_PROXY', () => {
      try {
        process.env.TRUST_PROXY = '127.0.0.1';
        assert.equal(resolveTrustProxy(), '127.0.0.1');

        process.env.TRUST_PROXY = '10.0.0.1, 10.0.0.2';
        assert.deepEqual(resolveTrustProxy(), ['10.0.0.1', '10.0.0.2']);
      } finally {
        restoreEnv('TRUST_PROXY', originalTrustProxy);
        restoreEnv('NODE_ENV', originalNodeEnv);
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
    const originalEnv = process.env.NODE_ENV;
    const originalTrustProxy = process.env.TRUST_PROXY;

    it('sanitizes 500 error messages to generic string in production', async () => {
      try {
        process.env.NODE_ENV = 'production';
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
      }
    });

    it('preserves client-facing AppError messages below 500 in production', async () => {
      try {
        process.env.NODE_ENV = 'production';
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
      }
    });
  });

  describe('5. JWT Verification, Secret Separation & Claims Enforcement', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalAuth = process.env.AUTH_SECRET;
    const originalJwt = process.env.SUPABASE_JWT_SECRET;
    const originalAud = process.env.SUPABASE_JWT_AUDIENCE;
    const originalIss = process.env.SUPABASE_JWT_ISSUER;

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
      }
    });

    it('fails closed when SUPABASE_JWT_SECRET is missing in production, ignoring AUTH_SECRET', async () => {
      try {
        process.env.NODE_ENV = 'production';
        delete process.env.SUPABASE_JWT_SECRET;
        process.env.AUTH_SECRET = 'valid_production_auth_secret_123456';

        const token = createTestToken({ sub: 'user_target_2' }, { secret: process.env.AUTH_SECRET });
        const result = await verifyJwtToken(token);
        assert.equal(result, null, 'Must fail closed in production when SUPABASE_JWT_SECRET is missing');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('AUTH_SECRET', originalAuth);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
      }
    });

    it('validates audience (aud) claim strictly in production', async () => {
      try {
        process.env.NODE_ENV = 'production';
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
          { sub: 'user_aud_1', exp: Math.floor(Date.now() / 1000) + 3600 },
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
      }
    });

    it('validates issuer (iss) claim strictly when configured', async () => {
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
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
        restoreEnv('SUPABASE_JWT_ISSUER', originalIss);
      }
    });

    it('strictly rejects missing or invalid subject (sub) claim', async () => {
      try {
        process.env.NODE_ENV = 'production';
        process.env.SUPABASE_JWT_SECRET = 'prod_supabase_jwt_secret_12345678';

        // Empty string sub
        const emptySubToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { sub: '', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(emptySubToken), null, 'Empty sub must be rejected');

        // Whitespace only sub
        const whitespaceSubToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { sub: '   ', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(whitespaceSubToken), null, 'Whitespace sub must be rejected');

        // Missing sub entirely
        const noSubToken = makeRawJwt(
          { alg: 'HS256', typ: 'JWT', kid: SUPABASE_PREVIOUS_HS256_KEY_ID },
          { aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 },
          process.env.SUPABASE_JWT_SECRET
        );
        assert.equal(await verifyJwtToken(noSubToken), null, 'Missing sub must be rejected');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
        restoreEnv('SUPABASE_JWT_SECRET', originalJwt);
      }
    });

    it('strictly rejects unsupported algorithms (none, RS256, HS512)', async () => {
      try {
        process.env.NODE_ENV = 'production';
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

    it('toSafeErrorMessage preserves trusted client-facing AppError messages in production', () => {
      try {
        process.env.NODE_ENV = 'production';
        const appErr = new AppError('INVALID_TRAIN', 'Train number 99999 was not found.', 404);
        assert.equal(toSafeErrorMessage(appErr, 'Generic fallback'), 'Train number 99999 was not found.');
      } finally {
        restoreEnv('NODE_ENV', originalEnv);
      }
    });

    it('verifies route catch blocks do not leak upstream secrets in production', async () => {
      try {
        process.env.NODE_ENV = 'production';
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
      }
    });
  });
});
