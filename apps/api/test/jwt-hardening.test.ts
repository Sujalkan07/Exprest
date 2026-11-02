import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import {
  verifyJwtToken,
  requireAuth,
  createTestToken,
  SUPABASE_CURRENT_ECC_KEY_ID,
  SUPABASE_PREVIOUS_HS256_KEY_ID,
  setTrustedJwks,
  clearJwksCache,
  setJwksClockForTesting,
  setJwksFetchForTesting,
  getTrustedKeyRecord,
  MAX_JWKS_KEY_COUNT,
  MAX_JWKS_PAYLOAD_BYTES,
} from '../src/common/middleware/auth.js';
import { AppError } from '../src/common/errors/AppError.js';

describe('Phase 1 — Explicit JWT Authentication & Authorization Hardening Suite', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    clearJwksCache();
    setJwksClockForTesting(null);
    setJwksFetchForTesting(null);
    process.env.SUPABASE_JWT_SECRET = 'test_secret_for_jwt_hardening_suite_32chars';
    process.env.SUPABASE_JWT_AUDIENCE = 'authenticated';
    process.env.SUPABASE_URL = 'https://test-project.supabase.co';
    delete process.env.SUPABASE_JWT_ISSUER;
  });

  afterEach(() => {
    clearJwksCache();
    setJwksClockForTesting(null);
    setJwksFetchForTesting(null);
    process.env = { ...origEnv };
  });

  // 1. Valid authenticated JWT
  it('1. accepts valid authenticated JWT (ES256 & HS256) with role=authenticated', async () => {
    const es256Token = createTestToken({ sub: 'user-valid-es256', role: 'authenticated' }, { alg: 'ES256' });
    const userEs256 = await verifyJwtToken(es256Token);
    assert.ok(userEs256, 'ES256 token must be accepted');
    assert.equal(userEs256?.id, 'user-valid-es256');
    assert.equal(userEs256?.role, 'authenticated');

    const hs256Token = createTestToken({ sub: 'user-valid-hs256', role: 'authenticated' }, { alg: 'HS256' });
    const userHs256 = await verifyJwtToken(hs256Token);
    assert.ok(userHs256, 'HS256 token must be accepted');
    assert.equal(userHs256?.id, 'user-valid-hs256');
    assert.equal(userHs256?.role, 'authenticated');
  });

  // 2. Expired JWT
  it('2. strictly rejects expired JWT tokens', async () => {
    const expiredToken = createTestToken({ sub: 'user-expired', role: 'authenticated' }, { expiresInSeconds: -60 });
    const user = await verifyJwtToken(expiredToken);
    assert.equal(user, null, 'Expired token must return null');
  });

  // 3. Invalid signature
  it('3. strictly rejects tokens with tampered or invalid signatures', async () => {
    const validToken = createTestToken({ sub: 'user-tampered', role: 'authenticated' });
    const parts = validToken.split('.');
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8')), sub: 'attacker' })
    ).toString('base64url');
    const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
    const user = await verifyJwtToken(tamperedToken);
    assert.equal(user, null, 'Tampered token payload must fail signature check');
  });

  // 4. Wrong issuer
  it('4. strictly rejects tokens with incorrect or untrusted issuer', async () => {
    const wrongIssToken = createTestToken({
      sub: 'user-wrong-iss',
      role: 'authenticated',
      iss: 'https://attacker.supabase.co/auth/v1',
    });
    const user = await verifyJwtToken(wrongIssToken);
    assert.equal(user, null, 'Token with untrusted issuer must be rejected');
  });

  // 5. Wrong audience
  it('5. strictly rejects tokens with wrong audience', async () => {
    const wrongAudToken = createTestToken({
      sub: 'user-wrong-aud',
      role: 'authenticated',
      aud: 'different-audience',
    });
    const user = await verifyJwtToken(wrongAudToken);
    assert.equal(user, null, 'Token with wrong audience must be rejected');
  });

  // 6. Missing subject
  it('6. strictly rejects tokens with missing or empty subject (sub)', async () => {
    const missingSub = createTestToken({ sub: '', role: 'authenticated' });
    assert.equal(await verifyJwtToken(missingSub), null, 'Empty string sub must be rejected');

    const nullSub = createTestToken({ sub: null as any, role: 'authenticated' });
    assert.equal(await verifyJwtToken(nullSub), null, 'Null sub must be rejected');
  });

  // 7. Missing role
  it('7. strictly rejects tokens with missing role (no implicit authenticated fallback)', async () => {
    const tokenNoRole = createTestToken({ sub: 'user-no-role', role: undefined });
    // Manually ensure role is omitted
    const parts = tokenNoRole.split('.');
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf-8'));
    delete payload.role;
    const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString('utf-8'));
    const secret = process.env.SUPABASE_JWT_SECRET!;
    const newHeaderB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const newPayloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const newSig = crypto.createHmac('sha256', secret).update(`${newHeaderB64}.${newPayloadB64}`).digest('base64url');
    const customToken = `${newHeaderB64}.${newPayloadB64}.${newSig}`;

    const user = await verifyJwtToken(customToken);
    assert.equal(user, null, 'Token missing role must be rejected without fallback');
  });

  // 8. service_role token
  it('8. strictly rejects service_role tokens from ordinary user endpoints', async () => {
    const serviceRoleToken = createTestToken({ sub: 'service-account', role: 'service_role' });
    const user = await verifyJwtToken(serviceRoleToken);
    assert.equal(user, null, 'service_role token must be rejected from user auth');
  });

  // 9. anon role token
  it('9. strictly rejects anon role tokens from authenticated user endpoints', async () => {
    const anonToken = createTestToken({ sub: 'anon-visitor', role: 'anon' });
    const user = await verifyJwtToken(anonToken);
    assert.equal(user, null, 'anon token must be rejected from authenticated user endpoints');
  });

  // 10. Unknown role
  it('10. strictly rejects unexpected or arbitrary unknown roles', async () => {
    const superAdminToken = createTestToken({ sub: 'user-fake-admin', role: 'super_admin' });
    assert.equal(await verifyJwtToken(superAdminToken), null, 'super_admin role token must be rejected');

    const arbitraryRoleToken = createTestToken({ sub: 'user-client-role', role: 'client_admin' });
    assert.equal(await verifyJwtToken(arbitraryRoleToken), null, 'arbitrary role token must be rejected');
  });

  // 11. Invalid algorithm
  it('11. strictly rejects invalid or permissive algorithms (none, HS384, RS256, etc.)', async () => {
    const headerNone = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
    const payload = Buffer.from(
      JSON.stringify({
        sub: 'user-none-alg',
        role: 'authenticated',
        exp: Math.floor(Date.now() / 1000) + 3600,
        aud: 'authenticated',
        iss: 'https://test-project.supabase.co/auth/v1',
      })
    ).toString('base64url');
    const noneToken = `${headerNone}.${payload}.`;
    assert.equal(await verifyJwtToken(noneToken), null, 'Algorithm none must be rejected');

    const headerRs256 = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
    const rsToken = `${headerRs256}.${payload}.invalidsig`;
    assert.equal(await verifyJwtToken(rsToken), null, 'Unsupported algorithm RS256 must be rejected');
  });

  // 12. JWKS rotation
  it('12. handles JWKS rotation and authenticates tokens signed with rotated keys', async () => {
    const kidOld = 'kid-rotation-old';
    const kidNew = 'kid-rotation-new';

    const { publicKey: pubOld, privateKey: privOld } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const { publicKey: pubNew, privateKey: privNew } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });

    const jwkOld = pubOld.export({ format: 'jwk' });
    jwkOld.kid = kidOld;
    jwkOld.alg = 'ES256';
    jwkOld.use = 'sig';

    const jwkNew = pubNew.export({ format: 'jwk' });
    jwkNew.kid = kidNew;
    jwkNew.alg = 'ES256';
    jwkNew.use = 'sig';

    // Seed initial key
    setTrustedJwks({ keys: [jwkOld] });
    assert.ok(getTrustedKeyRecord(kidOld));

    // Rotate keys
    setTrustedJwks({ keys: [jwkOld, jwkNew] });
    assert.ok(getTrustedKeyRecord(kidOld));
    assert.ok(getTrustedKeyRecord(kidNew));

    const tokenNew = createTestToken(
      { sub: 'user-rotated-key', role: 'authenticated' },
      { alg: 'ES256', kid: kidNew, privateKey: privNew, registerInJwks: false }
    );
    const userNew = await verifyJwtToken(tokenNew);
    assert.ok(userNew, 'Token signed with newly rotated key must verify');
    assert.equal(userNew?.id, 'user-rotated-key');
  });

  // 13. Retired key
  it('13. rejects tokens signed with retired/evicted keys when stale grace period elapses', async () => {
    let mockTime = 1_000_000;
    setJwksClockForTesting(() => mockTime);

    const kidRetired = 'kid-retired-test';
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    jwk.kid = kidRetired;
    jwk.alg = 'ES256';
    jwk.use = 'sig';

    setTrustedJwks({ keys: [jwk] });

    const token = createTestToken(
      { sub: 'user-retired-key', role: 'authenticated' },
      { alg: 'ES256', kid: kidRetired, privateKey, registerInJwks: false }
    );
    assert.ok(await verifyJwtToken(token), 'Initially valid key verifies');

    // Advance beyond cache TTL (10m) + stale grace period (10m) = 21m
    mockTime += 21 * 60 * 1000;

    const userPastGrace = await verifyJwtToken(token);
    assert.equal(userPastGrace, null, 'Retired key past stale grace period must fail closed');
  });

  // 14. Unknown key ID
  it('14. handles unknown key ID gracefully without uncaught exceptions or infinite requests', async () => {
    let fetchCount = 0;
    setJwksFetchForTesting(async () => {
      fetchCount++;
      return new Response(JSON.stringify({ keys: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const unknownKidToken = createTestToken(
      { sub: 'user-unknown-kid', role: 'authenticated' },
      { alg: 'ES256', kid: 'non-existent-kid', registerInJwks: false }
    );

    const user1 = await verifyJwtToken(unknownKidToken);
    assert.equal(user1, null, 'Unknown key ID token must return null');
    assert.equal(fetchCount, 1, 'Initial request triggered fetch attempt');

    // Second call within throttle window must not trigger another fetch
    const user2 = await verifyJwtToken(unknownKidToken);
    assert.equal(user2, null);
    assert.equal(fetchCount, 1, 'Throttling prevented redundant outbound fetch for unknown kid');
  });

  // 15. JWKS endpoint timeout
  it('15. handles JWKS endpoint timeout gracefully and fails closed', async () => {
    setJwksFetchForTesting(async () => {
      const err = new Error('The operation was aborted due to timeout');
      err.name = 'TimeoutError';
      throw err;
    });

    const token = createTestToken(
      { sub: 'user-timeout-test', role: 'authenticated' },
      { alg: 'ES256', kid: 'kid-will-timeout', registerInJwks: false }
    );

    const user = await verifyJwtToken(token);
    assert.equal(user, null, 'Timeout during JWKS fetch must fail closed to null');
  });

  // 16. Concurrent JWKS requests
  it('16. deduplicates concurrent in-flight JWKS requests safely', async () => {
    let networkFetches = 0;
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const jwk = publicKey.export({ format: 'jwk' });
    const testKid = 'kid-concurrent-test';
    jwk.kid = testKid;
    jwk.alg = 'ES256';
    jwk.use = 'sig';

    setJwksFetchForTesting(async () => {
      networkFetches++;
      // Simulate network latency
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ keys: [jwk] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const token = createTestToken(
      { sub: 'user-concurrent-success', role: 'authenticated' },
      { alg: 'ES256', kid: testKid, privateKey, registerInJwks: false }
    );

    // Launch 5 concurrent verification requests
    const results = await Promise.all([
      verifyJwtToken(token),
      verifyJwtToken(token),
      verifyJwtToken(token),
      verifyJwtToken(token),
      verifyJwtToken(token),
    ]);

    for (const r of results) {
      assert.ok(r, 'All concurrent requests must resolve successfully');
      assert.equal(r?.id, 'user-concurrent-success');
    }
    assert.equal(networkFetches, 1, 'Deduplication must ensure exactly one in-flight fetch');
  });

  // 17. Malformed JWT payload
  it('17. strictly rejects malformed JWT payload strings', async () => {
    assert.equal(await verifyJwtToken('not.a.valid.jwt'), null);
    assert.equal(await verifyJwtToken('header.bad_base64!@#.sig'), null);
    assert.equal(await verifyJwtToken(''), null);
    assert.equal(await verifyJwtToken(null as any), null);
    assert.equal(await verifyJwtToken(undefined as any), null);
  });

  // 18. Oversized JWKS response
  it('18. strictly rejects oversized JWKS responses exceeding size limits', async () => {
    const hugeKeys = [];
    for (let i = 0; i < MAX_JWKS_KEY_COUNT + 10; i++) {
      hugeKeys.push({ kty: 'EC', crv: 'P-256', alg: 'ES256', kid: `kid-${i}` });
    }

    setJwksFetchForTesting(async () => {
      return new Response(JSON.stringify({ keys: hugeKeys }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    const token = createTestToken(
      { sub: 'user-oversized-test', role: 'authenticated' },
      { alg: 'ES256', kid: 'kid-1', registerInJwks: false }
    );

    const user = await verifyJwtToken(token);
    assert.equal(user, null, 'Oversized JWKS key count must fail parsing and fail closed');
  });
});
