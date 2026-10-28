import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp, validateStartupEnvironment } from '../src/app.js';
import { createTestToken } from '../src/common/middleware/auth.js';
import { getShareSigningSecret, resolvePublicAppUrl } from '../src/routes/index.js';

function restoreEnv(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}

describe('Share Link Security & Cryptographic Validation Suite', () => {
  const secret = process.env.AUTH_SECRET || 'dev_secret_change_in_prod';
  const journeyId = 'journey_12951_2026-10-24';
  const rawId = journeyId.replace(/^journey_/, '');
  const validHmac = crypto
    .createHmac('sha256', secret)
    .update(journeyId)
    .digest('hex')
    .slice(0, 16);
  const validToken = `sh_${rawId}_${validHmac}`;

  it('1. Valid signed token resolves the intended journey snapshot', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/shares/${validToken}`,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.ok(body.data, 'Should return journey data');
    assert.equal(body.data.train.number, '12951');
    await app.close();
  });

  it('2. Invalid signature on a valid journey format is strictly rejected with 404', async () => {
    const app = await buildApp();
    const invalidSigToken = `sh_${rawId}_0000111122223333`;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/shares/${invalidSigToken}`,
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'RUN_NOT_FOUND');
    assert.equal(body.error.message, 'Invalid, tampered, or expired share token.');
    await app.close();
  });

  it('3. Tampered journey ID with mismatched signature is strictly rejected with 404', async () => {
    const app = await buildApp();
    // Use validHmac from 12951 with a different train number 12952
    const tamperedToken = `sh_12952_2026-10-24_${validHmac}`;
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/shares/${tamperedToken}`,
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'RUN_NOT_FOUND');
    await app.close();
  });

  it('4. Truncated or malformed share tokens are rejected with 404 or 400', async () => {
    const app = await buildApp();
    const testCases = [
      'sh_12951',
      'sh__sig',
      'sh_12951_shortsig',
      'invalid-token-without-prefix',
    ];

    for (const token of testCases) {
      const res = await app.inject({
        method: 'GET',
        url: `/api/v1/shares/${token}`,
      });
      assert.ok(res.statusCode === 404 || res.statusCode === 400, `Token ${token} should be rejected`);
      const body = JSON.parse(res.payload);
      assert.ok(body.error, 'Should return error object');
    }
    await app.close();
  });

  it('5. Direct unsigned journey ID is strictly rejected (no unsigned bypass)', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/shares/${journeyId}`,
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'RUN_NOT_FOUND');
    assert.equal(body.error.message, 'Invalid, tampered, or expired share token.');
    await app.close();
  });

  it('6. Unknown journey with syntactically valid signature produces safe 404', async () => {
    const app = await buildApp();
    const nonExistentJourney = 'journey_99999_2026-10-24';
    const nonExistentRaw = '99999_2026-10-24';
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(nonExistentJourney)
      .digest('hex')
      .slice(0, 16);
    const signedToken = `sh_${nonExistentRaw}_${hmac}`;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/shares/${signedToken}`,
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'RUN_NOT_FOUND');
    await app.close();
  });

  it('7. Unauthenticated share creation is strictly rejected with 401', async () => {
    const app = await buildApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/shares',
      headers: { 'content-type': 'application/json' },
      payload: { journeyId },
    });

    assert.equal(res.statusCode, 401);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'UNAUTHORIZED');
    await app.close();
  });

  it('8. Share creation for invalid/non-existent journey is rejected with 404', async () => {
    const app = await buildApp();
    const token = createTestToken({ sub: 'user_123' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/shares',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { journeyId: 'journey_99999_2026-10-24' },
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'RUN_NOT_FOUND');
    await app.close();
  });

  it('9. Missing or weak signing secret in production causes 500 configuration failure', async () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.AUTH_SECRET;
    const originalJwtSecret = process.env.SUPABASE_JWT_SECRET;
    const originalSupabaseUrl = process.env.SUPABASE_URL;

    try {
      process.env.NODE_ENV = 'production';
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_JWT_SECRET = 'valid_production_supabase_jwt_secret_test_123';
      process.env.AUTH_SECRET = 'dev_secret_change_in_prod'; // Weak / default secret

      const app = await buildApp();
      const token = createTestToken({ sub: 'user_123' });

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: { journeyId },
      });

      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res.payload);
      assert.equal(body.error.code, 'INTERNAL_ERROR');
      await app.close();
    } finally {
      restoreEnv('NODE_ENV', originalEnv);
      restoreEnv('AUTH_SECRET', originalSecret);
      restoreEnv('SUPABASE_JWT_SECRET', originalJwtSecret);
      restoreEnv('SUPABASE_URL', originalSupabaseUrl);
    }
  });

  it('10. Valid share link format matches sh_<train>_<date>_<hmac16>', async () => {
    const app = await buildApp();
    const token = createTestToken({ sub: 'user_123' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/shares',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { journeyId },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.match(body.data.shareToken, /^sh_\d{4,5}_\d{4}-\d{2}-\d{2}_[a-f0-9]{16}$/);
    assert.ok(body.data.url.includes(encodeURIComponent(body.data.shareToken)));
    assert.equal(body.data.persistent, true);
    assert.equal(body.data.expiresAt, null);
    await app.close();
  });

  it('11. validateStartupEnvironment strictly fails on missing or weak AUTH_SECRET in production', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalSecret = process.env.AUTH_SECRET;
    const originalKey = process.env.RAILRADAR_API_KEY;
    const originalJwtSecret = process.env.SUPABASE_JWT_SECRET;
    const originalSupabaseUrl = process.env.SUPABASE_URL;

    try {
      process.env.NODE_ENV = 'production';
      process.env.RAILRADAR_API_KEY = 'test_key';
      process.env.SUPABASE_URL = 'https://example.supabase.co';
      process.env.SUPABASE_JWT_SECRET = 'valid_production_supabase_jwt_secret_test_123';

      // Missing AUTH_SECRET
      delete process.env.AUTH_SECRET;
      assert.throws(() => validateStartupEnvironment(), /Missing or insecure AUTH_SECRET in production/);

      // Default secret
      process.env.AUTH_SECRET = 'dev_secret_change_in_prod';
      assert.throws(() => validateStartupEnvironment(), /Missing or insecure AUTH_SECRET in production/);

      // Too short (< 16 chars)
      process.env.AUTH_SECRET = 'short_secret';
      assert.throws(() => validateStartupEnvironment(), /Missing or insecure AUTH_SECRET in production/);

      // Secure secret >= 16 chars passes
      process.env.AUTH_SECRET = 'a_very_secure_production_secret_key_12345';
      assert.doesNotThrow(() => validateStartupEnvironment());
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.AUTH_SECRET = originalSecret;
      process.env.RAILRADAR_API_KEY = originalKey;
      process.env.SUPABASE_JWT_SECRET = originalJwtSecret;
      process.env.SUPABASE_URL = originalSupabaseUrl;
    }
  });

  it('12. Separate SHARE_SIGNING_SECRET overrides AUTH_SECRET for link signing', async () => {
    const originalShareSecret = process.env.SHARE_SIGNING_SECRET;
    const originalAuthSecret = process.env.AUTH_SECRET;

    try {
      process.env.AUTH_SECRET = 'general_auth_secret_1234567890';
      process.env.SHARE_SIGNING_SECRET = 'dedicated_share_secret_9876543210';

      const resolved = getShareSigningSecret();
      assert.equal(resolved, 'dedicated_share_secret_9876543210');
    } finally {
      process.env.SHARE_SIGNING_SECRET = originalShareSecret;
      process.env.AUTH_SECRET = originalAuthSecret;
    }
  });

  it('13. Creating a share link with expiresInSeconds produces an expiring token', async () => {
    const app = await buildApp();
    const token = createTestToken({ sub: 'user_123' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/shares',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { journeyId, expiresInSeconds: 3600 },
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.match(body.data.shareToken, /^sh_\d{4,5}_\d{4}-\d{2}-\d{2}_exp\d+_[a-f0-9]{16}$/);
    assert.equal(body.data.persistent, false);
    assert.ok(body.data.expiresAt, 'Should have expiresAt ISO timestamp');
    await app.close();
  });

  it('14. Resolving a valid unexpired expiring share token succeeds', async () => {
    const app = await buildApp();
    const token = createTestToken({ sub: 'user_123' });

    // Create an expiring link valid for 1 hour
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/v1/shares',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      payload: { journeyId, expiresInSeconds: 3600 },
    });
    const { shareToken } = JSON.parse(createRes.payload).data;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/shares/${shareToken}`,
    });

    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.payload);
    assert.equal(body.data.journeyId, journeyId);
    await app.close();
  });

  it('15. Expired share token is strictly rejected with 404', async () => {
    const app = await buildApp();
    const secret = getShareSigningSecret();
    const pastEpoch = Math.floor(Date.now() / 1000) - 300; // 5 minutes ago
    const dataToSign = `${journeyId}:exp:${pastEpoch}`;
    const hmac = crypto
      .createHmac('sha256', secret)
      .update(dataToSign)
      .digest('hex')
      .slice(0, 16);
    const expiredToken = `sh_${rawId}_exp${pastEpoch}_${hmac}`;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/shares/${expiredToken}`,
    });

    assert.equal(res.statusCode, 404);
    const body = JSON.parse(res.payload);
    assert.equal(body.error.code, 'RUN_NOT_FOUND');
    assert.equal(body.error.message, 'Invalid, tampered, or expired share token.');
    await app.close();
  });

  it('16. resolvePublicAppUrl never emits localhost:3000 in production', () => {
    const originalEnv = process.env.NODE_ENV;
    const originalUrl = process.env.PUBLIC_APP_URL;

    try {
      process.env.NODE_ENV = 'production';

      // Unset PUBLIC_APP_URL falls back to production domain, not localhost
      delete process.env.PUBLIC_APP_URL;
      assert.equal(resolvePublicAppUrl(), 'https://exprest.vercel.app');

      // Localhost in PUBLIC_APP_URL is overridden in production
      process.env.PUBLIC_APP_URL = 'http://localhost:3000';
      assert.equal(resolvePublicAppUrl(), 'https://exprest.vercel.app');

      // Valid custom public domain is preserved
      process.env.PUBLIC_APP_URL = 'https://exprest.com';
      assert.equal(resolvePublicAppUrl(), 'https://exprest.com');
    } finally {
      process.env.NODE_ENV = originalEnv;
      process.env.PUBLIC_APP_URL = originalUrl;
    }
  });

  it('17. Multi-instance consistency: identical AUTH_SECRET resolves links across instances', async () => {
    const testSecret = 'shared_production_secret_test_12345';
    const originalSecret = process.env.AUTH_SECRET;

    try {
      process.env.AUTH_SECRET = testSecret;

      // Instance 1 creates a token
      const app1 = await buildApp();
      const token = createTestToken({ sub: 'user_123' });
      const createRes = await app1.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: { journeyId },
      });
      const { shareToken } = JSON.parse(createRes.payload).data;
      await app1.close();

      // Instance 2 (different instance, same secret) resolves the token
      const app2 = await buildApp();
      const resolveRes = await app2.inject({
        method: 'GET',
        url: `/api/v1/shares/${shareToken}`,
      });
      assert.equal(resolveRes.statusCode, 200);
      const body = JSON.parse(resolveRes.payload);
      assert.equal(body.data.journeyId, journeyId);
      await app2.close();
    } finally {
      restoreEnv('AUTH_SECRET', originalSecret);
    }
  });
});
