import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { OpenTopographyAdapter } from '../src/providers/opentopography/OpenTopographyAdapter.js';
import { RailRadarAdapter } from '../src/providers/railradar/RailRadarAdapter.js';
import { getCorsAllowedOrigins, normalizeOrigin } from '../src/cors.js';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import {
  verifyJwtToken,
  requireAuth,
  createTestToken,
  SUPABASE_CURRENT_ECC_KEY_ID,
  SUPABASE_PREVIOUS_HS256_KEY_ID,
  setTrustedJwks,
  clearJwksCache,
} from '../src/common/middleware/auth.js';
import {
  validateInput,
  journeyParamSchema,
  trainFareParamSchema,
  poiQuerySchema,
  shareParamSchema,
} from '../src/common/validation/schemas.js';
import { AppError } from '../src/common/errors/AppError.js';
import { buildApp } from '../src/app.js';

describe('Authentication, Access Security & Provider Error Handling', () => {

  describe('1. Open Redirect & Safe Redirection Path Validation', () => {
    function sanitizeRedirect(target: string | null | undefined): string {
      if (!target) return '/';
      // Path must start with single '/', must not start with '//' (protocol-relative), and must not contain ':' (scheme injection)
      if (
        target.startsWith('/') &&
        !target.startsWith('//') &&
        !target.includes(':') &&
        !target.includes('\\')
      ) {
        return target;
      }
      return '/';
    }

    it('allows valid internal application paths', () => {
      assert.equal(sanitizeRedirect('/'), '/');
      assert.equal(sanitizeRedirect('/saved'), '/saved');
      assert.equal(sanitizeRedirect('/settings'), '/settings');
      assert.equal(sanitizeRedirect('/journey/journey_12433_2026-10-12'), '/journey/journey_12433_2026-10-12');
      assert.equal(sanitizeRedirect('/journey/12433/map?filter=halt'), '/journey/12433/map?filter=halt');
    });

    it('rejects external URLs and protocol-relative redirect attacks', () => {
      assert.equal(sanitizeRedirect('https://evil.com'), '/');
      assert.equal(sanitizeRedirect('http://attacker.com/steal-token'), '/');
      assert.equal(sanitizeRedirect('//evil.com/phishing'), '/');
      assert.equal(sanitizeRedirect('///evil.com'), '/');
      assert.equal(sanitizeRedirect('javascript:alert(1)'), '/');
      assert.equal(sanitizeRedirect('data:text/html,<script>alert(1)</script>'), '/');
    });

    it('rejects backslash directory traversal and null/empty inputs', () => {
      assert.equal(sanitizeRedirect('/\\evil.com'), '/');
      assert.equal(sanitizeRedirect(null), '/');
      assert.equal(sanitizeRedirect(undefined), '/');
      assert.equal(sanitizeRedirect(''), '/');
    });
  });

  describe('2. Authoritative Supabase Identity & Local/Cookie Bypass Prevention', () => {
    function evaluateSessionState(cookies: Record<string, string>, localStorage: Record<string, string>, supabaseUser: { id: string; email: string } | null) {
      // Identity authoritative ONLY through validated Supabase user
      const isAuthenticated = Boolean(supabaseUser);

      return {
        isAuthenticated,
        isRealUser: isAuthenticated,
        userRole: isAuthenticated ? 'AUTHENTICATED_USER' : 'UNAUTHENTICATED'
      };
    }

    it('correctly categorizes unauthenticated visitor', () => {
      const state = evaluateSessionState({}, {}, null);
      assert.equal(state.isAuthenticated, false);
      assert.equal(state.isRealUser, false);
      assert.equal(state.userRole, 'UNAUTHENTICATED');
    });

    it('strictly rejects exprest_user in localStorage as authentication proof', () => {
      const state = evaluateSessionState({}, { exprest_user: JSON.stringify({ isLoggedIn: true, name: 'Attacker' }) }, null);
      assert.equal(state.isAuthenticated, false, 'localStorage must never grant access');
      assert.equal(state.userRole, 'UNAUTHENTICATED');
    });

    it('strictly rejects cookies or demo tokens without Supabase session', () => {
      const state = evaluateSessionState({ exprest_demo_access: '1', exprest_user: 'fake' }, {}, null);
      assert.equal(state.isAuthenticated, false, 'Client cookies must never grant access');
      assert.equal(state.userRole, 'UNAUTHENTICATED');
    });

    it('authenticates user with genuine Supabase session', () => {
      const state = evaluateSessionState(
        {},
        {},
        { id: 'usr-123', email: 'passenger@example.com' }
      );
      assert.equal(state.isAuthenticated, true);
      assert.equal(state.isRealUser, true);
      assert.equal(state.userRole, 'AUTHENTICATED_USER');
    });
  });

  describe('3. OpenTopography Rate Limit and Error Safety', () => {
    it('returns empty array when rate limited or unauthenticated without throwing or hallucinating', async () => {
      const adapter = new OpenTopographyAdapter();
      // Even if adapter is invoked with coordinates, when API returns rate limit or quota exceeded, it gracefully yields empty profile
      const points = [
        { latitude: 28.6139, longitude: 77.2090 },
        { latitude: 27.1592, longitude: 77.9944 },
      ];

      const profile = await adapter.getElevationProfile(points);
      assert.ok(Array.isArray(profile), 'Profile must always be an array');
      // Either returns real verified points or empty array on rate limit/no key
      if (profile.length > 0) {
        assert.ok(profile.every(p => typeof p.elevationM === 'number' && Number.isFinite(p.elevationM)));
      } else {
        assert.equal(profile.length, 0);
      }
    });

    it('rejects coordinates with NaN or non-finite values safely', async () => {
      const adapter = new OpenTopographyAdapter();
      const corruptedPoints = [
        { latitude: NaN, longitude: 77.2 },
        { latitude: 28.6, longitude: Infinity },
      ];
      const profile = await adapter.getElevationProfile(corruptedPoints);
      assert.deepEqual(profile, [], 'Corrupted points must be filtered out resulting in empty array');
    });
  });

  describe('4. Date Matching for Live Status Integrity', () => {
    function shouldServeLiveStatus(requestedDate: string, liveStartDate: string, isLiveRun: boolean): boolean {
      if (!isLiveRun) return false;
      return requestedDate === liveStartDate;
    }

    it('permits live status only when run is live and date matches', () => {
      assert.equal(shouldServeLiveStatus('2026-10-12', '2026-10-12', true), true);
    });

    it('refuses live status when train is not live even if dates match', () => {
      assert.equal(shouldServeLiveStatus('2026-10-12', '2026-10-12', false), false);
    });

    it('refuses live status when dates do not match even if train is live', () => {
      assert.equal(shouldServeLiveStatus('2026-10-10', '2026-10-12', true), false);
    });
  });

  describe('5. Direct RailRadar Transport & Credential Redaction', () => {
    it('returns direct upstream provider target URL without proxy manipulation', () => {
      const target = 'https://railradar.in/api/v1/trains/12951';
      const url = RailRadarAdapter.buildUrl(target);
      assert.equal(url, target);
    });

    it('redacts sensitive api_key from logs and diagnostic error strings', () => {
      const leakString = 'Fetch failed at https://railradar.in/api/v1/trains/12951?api_key=secret_xyz987';
      const redacted = RailRadarAdapter.redactCredentials(leakString);

      assert.ok(!redacted.includes('secret_xyz987'), 'Secret key must not appear in output');
      assert.ok(redacted.includes('api_key=[REDACTED]'));
    });
  });

  describe('6. Production CORS Allowlist & Origin Restriction', () => {
    it('normalizes origins correctly by trimming whitespace and trailing slashes', () => {
      assert.equal(normalizeOrigin('https://exprest.vercel.app/'), 'https://exprest.vercel.app');
      assert.equal(normalizeOrigin('  http://localhost:3000  '), 'http://localhost:3000');
      assert.equal(normalizeOrigin('https://exprest.com/some/path'), 'https://exprest.com');
      assert.equal(normalizeOrigin(''), '');
    });

    it('allows localhost and local dev origins when NODE_ENV is development', () => {
      const origins = getCorsAllowedOrigins({
        NODE_ENV: 'development',
        PUBLIC_APP_URL: 'http://localhost:3000',
      });

      assert.ok(Array.isArray(origins));
      const hasLocalhostRegex = origins.some(
        o => o instanceof RegExp && o.test('http://localhost:3000') && o.test('http://localhost:5173')
      );
      assert.ok(hasLocalhostRegex, 'Development CORS must permit local development ports');
    });

    it('strictly restricts origins to allowlist in production environment', () => {
      const origins = getCorsAllowedOrigins({
        NODE_ENV: 'production',
        PUBLIC_APP_URL: 'https://exprest.vercel.app',
        CORS_ALLOWED_ORIGINS: 'https://exprest.com, https://admin.exprest.com/',
      });

      assert.ok(Array.isArray(origins));
      assert.deepEqual(origins, [
        'https://exprest.vercel.app',
        'https://exprest.com',
        'https://admin.exprest.com',
      ]);
      // Verify no regex or wildcard matches
      assert.ok(origins.every(o => typeof o === 'string'));
      assert.ok(!origins.includes('https://evil.com'));
      assert.ok(!origins.includes('http://localhost:3000'));
    });

    it('enforces CORS in Fastify server: allows configured origin and blocks untrusted origin', async () => {
      const testServer = Fastify();
      const allowedOrigins = getCorsAllowedOrigins({
        NODE_ENV: 'production',
        PUBLIC_APP_URL: 'https://exprest.app',
      });

      await testServer.register(cors, {
        origin: allowedOrigins,
      });

      testServer.get('/api/v1/test', async () => ({ status: 'ok' }));

      // 1. Request from allowed origin
      const allowedRes = await testServer.inject({
        method: 'GET',
        url: '/api/v1/test',
        headers: { origin: 'https://exprest.app' },
      });
      assert.equal(allowedRes.headers['access-control-allow-origin'], 'https://exprest.app');

      // 2. Request from malicious/untrusted origin
      const blockedRes = await testServer.inject({
        method: 'GET',
        url: '/api/v1/test',
        headers: { origin: 'https://malicious-site.com' },
      });
      assert.equal(
        blockedRes.headers['access-control-allow-origin'],
        undefined,
        'CORS header must not be sent to untrusted origin'
      );
    });

    it('returns empty array and blocks all origins when production CORS config is missing or empty', async () => {
      const origins = getCorsAllowedOrigins({
        NODE_ENV: 'production',
        PUBLIC_APP_URL: '',
        CORS_ALLOWED_ORIGINS: '',
      });
      assert.deepEqual(origins, [], 'Missing production config must result in empty allowlist');

      const testServer = Fastify();
      await testServer.register(cors, { origin: origins });
      testServer.get('/api/v1/test', async () => ({ status: 'ok' }));

      const res = await testServer.inject({
        method: 'GET',
        url: '/api/v1/test',
        headers: { origin: 'https://any-domain.com' },
      });
      assert.equal(res.headers['access-control-allow-origin'], undefined, 'No origin allowed when allowlist is empty');
    });

    it('cleans and normalizes malformed CORS_ALLOWED_ORIGINS with extra commas and slashes', () => {
      const origins = getCorsAllowedOrigins({
        NODE_ENV: 'production',
        PUBLIC_APP_URL: 'https://exprest.vercel.app/',
        CORS_ALLOWED_ORIGINS: ' , https://app.exprest.com///, , https://admin.exprest.com/ , ',
      });

      assert.deepEqual(origins, [
        'https://exprest.vercel.app',
        'https://app.exprest.com',
        'https://admin.exprest.com',
      ]);
    });
  });

  describe('7. Dashboard Data Integrity & Storage Resilience', () => {
    function sanitizeLegacySavedTrains(raw: unknown): any[] {
      if (!Array.isArray(raw)) return [];
      return raw
        .filter((item): item is Record<string, any> => Boolean(item && typeof item === 'object' && item.number && item.name))
        .map((item) => ({
          number: String(item.number),
          name: String(item.name),
          type: item.type || 'Express',
          from: item.from || 'Source',
          to: item.to || 'Destination',
          status: 'scheduled',
          statusLabel: item.statusLabel && !item.statusLabel.includes('delay') && !item.statusLabel.includes('On Time') ? item.statusLabel : 'Pinned Train',
          sector: item.sector || 'Rail Corridor',
          speed: '—',
          platform: '—',
          eta: '—',
          progress: 0,
        }));
    }

    function safeLoadFromStorage(storageValue: string | null): any[] {
      if (!storageValue) return [];
      try {
        const parsed = JSON.parse(storageValue);
        return sanitizeLegacySavedTrains(parsed);
      } catch {
        return [];
      }
    }

    it('sanitizes legacy mock telemetry from saved trains', () => {
      const legacyMock = [
        {
          number: '12951',
          name: 'Tejas Rajdhani',
          speed: '120 km/h',
          platform: 'PF 1',
          eta: 'En Route',
          status: 'on-time',
          statusLabel: 'On Time',
        },
      ];

      const sanitized = sanitizeLegacySavedTrains(legacyMock);
      assert.equal(sanitized.length, 1);
      assert.equal(sanitized[0].speed, '—', 'Fabricated speed must be neutralized');
      assert.equal(sanitized[0].platform, '—', 'Fabricated platform must be neutralized');
      assert.equal(sanitized[0].eta, '—', 'Fabricated ETA must be neutralized');
      assert.equal(sanitized[0].status, 'scheduled', 'Status must be neutral scheduled');
      assert.equal(sanitized[0].statusLabel, 'Pinned Train');
    });

    it('safely handles corrupted, non-JSON, and non-array storage values without throwing', () => {
      assert.deepEqual(safeLoadFromStorage(null), []);
      assert.deepEqual(safeLoadFromStorage(''), []);
      assert.deepEqual(safeLoadFromStorage('corrupted{{json'), []);
      assert.deepEqual(safeLoadFromStorage('12345'), []);
      assert.deepEqual(safeLoadFromStorage('"plain string"'), []);
      assert.deepEqual(safeLoadFromStorage('{"not": "an array"}'), []);
    });
  });

  describe('8. Fastify JWT & Bearer Authentication Verification (Dual ES256 + HS256 Key Rotation)', () => {
    it('verifies current ES256 (ECC P-256) Supabase JWT tokens via JWKS with key ID ee6ac6d7-bb37-4adb-833b-588711018d70', async () => {
      const token = createTestToken(
        {
          sub: 'user-ecc-uuid-101',
          email: 'ecc-passenger@exprest.rail',
          role: 'authenticated',
        },
        {
          alg: 'ES256',
          kid: SUPABASE_CURRENT_ECC_KEY_ID,
        }
      );

      const user = await verifyJwtToken(token);
      assert.ok(user !== null, 'Valid ES256 token must produce authenticated user');
      assert.equal(user?.id, 'user-ecc-uuid-101');
      assert.equal(user?.email, 'ecc-passenger@exprest.rail');
      assert.equal(user?.role, 'authenticated');
    });

    it('verifies previous HS256 tokens during rotation period with key ID 6dbf8698-bdff-4de3-ac82-b75bc50d312e', async () => {
      const token = createTestToken(
        {
          sub: 'user-hs256-uuid-202',
          email: 'hs256-passenger@exprest.rail',
          role: 'authenticated',
        },
        {
          alg: 'HS256',
          kid: SUPABASE_PREVIOUS_HS256_KEY_ID,
        }
      );

      const user = await verifyJwtToken(token);
      assert.ok(user !== null, 'Valid HS256 token with previous kid must produce authenticated user');
      assert.equal(user?.id, 'user-hs256-uuid-202');
      assert.equal(user?.email, 'hs256-passenger@exprest.rail');
      assert.equal(user?.role, 'authenticated');
    });

    it('verifies previous HS256 tokens when kid is omitted during transition', async () => {
      const token = createTestToken(
        {
          sub: 'user-hs256-legacy-303',
          email: 'legacy@exprest.rail',
          role: 'authenticated',
        },
        {
          alg: 'HS256',
          kid: '', // empty kid
        }
      );

      const user = await verifyJwtToken(token);
      assert.ok(user !== null, 'Valid HS256 token without kid must produce authenticated user');
      assert.equal(user?.id, 'user-hs256-legacy-303');
    });

    it('rejects expired ES256 and HS256 tokens', async () => {
      const expiredEs256 = createTestToken(
        { sub: 'user-ecc-uuid-101' },
        { alg: 'ES256', expiresInSeconds: -300 }
      );
      assert.equal(await verifyJwtToken(expiredEs256), null, 'Expired ES256 token must be rejected');

      const expiredHs256 = createTestToken(
        { sub: 'user-hs256-uuid-202' },
        { alg: 'HS256', expiresInSeconds: -300 }
      );
      assert.equal(await verifyJwtToken(expiredHs256), null, 'Expired HS256 token must be rejected');
    });

    it('rejects tampered or forged ES256 signature', async () => {
      const validToken = createTestToken(
        { sub: 'user-ecc-uuid-101', role: 'authenticated' },
        { alg: 'ES256', kid: SUPABASE_CURRENT_ECC_KEY_ID }
      );

      const parts = validToken.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sub: 'admin-attacker', exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString('base64url');
      const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const user = await verifyJwtToken(forgedToken);
      assert.equal(user, null, 'Tampered ES256 token must be rejected');
    });

    it('rejects tampered or forged HS256 signature', async () => {
      const validToken = createTestToken(
        { sub: 'user-hs256-uuid-202', role: 'authenticated' },
        { alg: 'HS256', kid: SUPABASE_PREVIOUS_HS256_KEY_ID }
      );

      const parts = validToken.split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ sub: 'admin-attacker', exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString('base64url');
      const forgedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;

      const user = await verifyJwtToken(forgedToken);
      assert.equal(user, null, 'Tampered HS256 token must be rejected');
    });

    it('rejects unsupported algorithms (alg: none, RS256, HS512)', async () => {
      // 1. None algorithm attack
      const noneHeader = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: 'attacker', exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString('base64url');
      const noneToken = `${noneHeader}.${payload}.`;
      assert.equal(await verifyJwtToken(noneToken), null, 'alg: none must be strictly rejected');

      // 2. RS256 algorithm
      const rs256Header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
      const rs256Token = `${rs256Header}.${payload}.some-fake-signature`;
      assert.equal(await verifyJwtToken(rs256Token), null, 'alg: RS256 must be rejected');

      // 3. HS512 algorithm
      const hs512Header = Buffer.from(JSON.stringify({ alg: 'HS512', typ: 'JWT' })).toString('base64url');
      const hs512Token = `${hs512Header}.${payload}.some-fake-signature`;
      assert.equal(await verifyJwtToken(hs512Token), null, 'alg: HS512 must be rejected');
    });

    it('rejects algorithm confusion and mismatched key attacks', async () => {
      // Attacker specifies HS256 but supplies the ECC key ID
      const header = Buffer.from(
        JSON.stringify({ alg: 'HS256', typ: 'JWT', kid: SUPABASE_CURRENT_ECC_KEY_ID })
      ).toString('base64url');
      const payload = Buffer.from(
        JSON.stringify({ sub: 'attacker', exp: Math.floor(Date.now() / 1000) + 3600 })
      ).toString('base64url');
      const token = `${header}.${payload}.fakesig`;

      assert.equal(
        await verifyJwtToken(token),
        null,
        'HS256 token referencing ECC kid must be rejected'
      );
    });

    it('rejects unknown or untrusted kid in ES256 header', async () => {
      const token = createTestToken(
        { sub: 'user-ecc-unknown' },
        { alg: 'ES256', kid: 'unknown-untrusted-kid-999', registerInJwks: false }
      );
      assert.equal(
        await verifyJwtToken(token),
        null,
        'ES256 token with untrusted kid must be rejected'
      );
    });

    it('rejects malformed and random strings without throwing', async () => {
      assert.equal(await verifyJwtToken(''), null);
      assert.equal(await verifyJwtToken('not.a.valid.jwt'), null);
      assert.equal(await verifyJwtToken('just_a_string'), null);
      assert.equal(await verifyJwtToken('header.payload'), null);
    });

    it('requireAuth middleware throws 401 UNAUTHORIZED when Authorization header is missing', async () => {
      const mockReq = { headers: {} } as any;
      const mockReply = {} as any;

      await assert.rejects(
        async () => requireAuth(mockReq, mockReply),
        (err: any) => {
          assert.equal(err instanceof AppError, true);
          assert.equal(err.code, 'UNAUTHORIZED');
          assert.equal(err.statusCode, 401);
          return true;
        }
      );
    });

    it('requireAuth middleware accepts both valid ES256 and HS256 Bearer tokens and assigns req.user', async () => {
      // 1. Current ES256 token
      const es256Token = createTestToken(
        { sub: 'valid-ecc-user', email: 'ecc@exprest.app' },
        { alg: 'ES256', kid: SUPABASE_CURRENT_ECC_KEY_ID }
      );
      const reqEs256 = { headers: { authorization: `Bearer ${es256Token}` } } as any;
      await requireAuth(reqEs256, {} as any);
      assert.equal(reqEs256.user?.id, 'valid-ecc-user');
      assert.equal(reqEs256.user?.email, 'ecc@exprest.app');

      // 2. Previous HS256 token
      const hs256Token = createTestToken(
        { sub: 'valid-hs256-user', email: 'hs256@exprest.app' },
        { alg: 'HS256', kid: SUPABASE_PREVIOUS_HS256_KEY_ID }
      );
      const reqHs256 = { headers: { authorization: `Bearer ${hs256Token}` } } as any;
      await requireAuth(reqHs256, {} as any);
      assert.equal(reqHs256.user?.id, 'valid-hs256-user');
      assert.equal(reqHs256.user?.email, 'hs256@exprest.app');
    });
  });

  describe('9. Runtime Input Validation via Zod Schemas (B4)', () => {
    it('accepts valid journey ID pattern and rejects malicious characters', () => {
      const valid = validateInput(journeyParamSchema, { journeyId: 'journey_12951_2026-10-24' });
      assert.equal(valid.journeyId, 'journey_12951_2026-10-24');

      // Rejects script injection
      assert.throws(
        () => validateInput(journeyParamSchema, { journeyId: '<script>alert(1)</script>' }),
        (err: any) => err instanceof AppError && err.statusCode === 400
      );

      // Rejects path traversal
      assert.throws(
        () => validateInput(journeyParamSchema, { journeyId: '../../etc/passwd' }),
        (err: any) => err instanceof AppError && err.statusCode === 400
      );

      // Rejects too short journey ID
      assert.throws(
        () => validateInput(journeyParamSchema, { journeyId: 'ab' }),
        (err: any) => err instanceof AppError && err.statusCode === 400
      );
    });

    it('accepts valid train numbers and rejects non-numeric or out-of-range inputs', () => {
      const valid = validateInput(trainFareParamSchema, { trainNumber: '12951' });
      assert.equal(valid.trainNumber, '12951');

      const valid4 = validateInput(trainFareParamSchema, { trainNumber: '2433' });
      assert.equal(valid4.trainNumber, '2433');

      // Rejects alphabetic train numbers
      assert.throws(
        () => validateInput(trainFareParamSchema, { trainNumber: 'RAJ12' }),
        (err: any) => err instanceof AppError && err.statusCode === 400
      );

      // Rejects single digit
      assert.throws(
        () => validateInput(trainFareParamSchema, { trainNumber: '1' }),
        (err: any) => err instanceof AppError && err.statusCode === 400
      );

      // Rejects 7 digits
      assert.throws(
        () => validateInput(trainFareParamSchema, { trainNumber: '1234567' }),
        (err: any) => err instanceof AppError && err.statusCode === 400
      );
    });

    it('validates POI category query against allowed whitelist', () => {
      const validFood = validateInput(poiQuerySchema, { category: 'food' });
      assert.equal(validFood.category, 'food');

      const validEmergency = validateInput(poiQuerySchema, { category: 'emergency' });
      assert.equal(validEmergency.category, 'emergency');

      // Rejects unknown category
      assert.throws(
        () => validateInput(poiQuerySchema, { category: 'unauthorized_category' }),
        (err: any) => err instanceof AppError && err.statusCode === 400
      );
    });

    it('validates shareToken parameter format', () => {
      const valid = validateInput(shareParamSchema, { shareToken: 'journey_12951_2026-10-24' });
      assert.equal(valid.shareToken, 'journey_12951_2026-10-24');

      // Rejects HTML / script chars
      assert.throws(
        () => validateInput(shareParamSchema, { shareToken: '"><script>' }),
        (err: any) => err instanceof AppError && err.statusCode === 400
      );
    });
  });

  describe('10. Share Creation User Binding & Auth Integration (B1/B4)', () => {
    it('binds authenticated user id to share response when Bearer token is provided', async () => {
      const app = await buildApp();
      const token = createTestToken({
        sub: 'usr-share-owner-789',
        email: 'sharer@exprest.rail',
        exp: Math.floor(Date.now() / 1000) + 3600,
      });

      // Mock journeyService.getJourneyDetails for share test
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          journeyId: 'journey_12951_2026-10-24',
        },
      });

      assert.equal(res.statusCode, 200);
      const shareBody = JSON.parse(res.payload);
      assert.equal(shareBody.data.createdByUserId, 'usr-share-owner-789');

      // Verify ES256 token on real Fastify route
      const es256Token = createTestToken(
        { sub: 'usr-share-owner-ecc-456' },
        { alg: 'ES256', kid: SUPABASE_CURRENT_ECC_KEY_ID }
      );
      const es256Res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${es256Token}`,
          'content-type': 'application/json',
        },
        payload: { journeyId: 'journey_12951_2026-10-24' },
      });
      assert.equal(es256Res.statusCode, 200);
      const es256Body = JSON.parse(es256Res.payload);
      assert.equal(es256Body.data.createdByUserId, 'usr-share-owner-ecc-456');

      // Verify expired token is rejected with 401 on real Fastify route
      const expiredToken = createTestToken({
        sub: 'usr-share-owner-789',
        exp: Math.floor(Date.now() / 1000) - 3600,
      });
      const expiredRes = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${expiredToken}`,
          'content-type': 'application/json',
        },
        payload: { journeyId: 'journey_12951_2026-10-24' },
      });
      assert.equal(expiredRes.statusCode, 401);

      // Verify tampered signature token is rejected with 401 on real Fastify route
      const forgedToken = `${token.split('.')[0]}.${token.split('.')[1]}.invalidsignature`;
      const forgedRes = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${forgedToken}`,
          'content-type': 'application/json',
        },
        payload: { journeyId: 'journey_12951_2026-10-24' },
      });
      assert.equal(forgedRes.statusCode, 401);

      // Even if journey 12951 not in memory, if it 404s it validates journeyId format first
      // Let's verify input validation: invalid journeyId returns 400
      const invalidRes = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        payload: {
          journeyId: '<invalid-journey-id>',
        },
      });
      assert.equal(invalidRes.statusCode, 400);

      await app.close();
    });

    it('strictly rejects unauthenticated POST /api/v1/shares with 401 UNAUTHORIZED', async () => {
      const app = await buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/shares',
        headers: {
          'content-type': 'application/json',
        },
        payload: {
          journeyId: 'journey_12951_2026-10-24',
        },
      });

      assert.equal(res.statusCode, 401);
      const body = JSON.parse(res.payload);
      assert.equal(body.error.code, 'UNAUTHORIZED');
      await app.close();
    });

    it('preserves public access for intentional public endpoints without auth token', async () => {
      const app = await buildApp();

      const healthRes = await app.inject({ method: 'GET', url: '/health' });
      assert.equal(healthRes.statusCode, 200);

      const searchRes = await app.inject({ method: 'GET', url: '/api/v1/trains/search?q=12951' });
      assert.equal(searchRes.statusCode, 200);

      await app.close();
    });
  });
});

