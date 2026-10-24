import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { buildApp } from '../src/app.js';
import { createTestToken } from '../src/common/middleware/auth.js';

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

    try {
      process.env.NODE_ENV = 'production';
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
      process.env.NODE_ENV = originalEnv;
      process.env.AUTH_SECRET = originalSecret;
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
    await app.close();
  });
});
