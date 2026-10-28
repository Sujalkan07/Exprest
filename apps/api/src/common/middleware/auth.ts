import { FastifyRequest, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { AppError } from '../errors/AppError.js';

export interface AuthenticatedUser {
  id: string;
  email?: string;
  role?: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser | null;
  }
}

/**
 * Key identifiers configured for Supabase JWT signing key rotation.
 */
export const SUPABASE_CURRENT_ECC_KEY_ID = 'ee6ac6d7-bb37-4adb-833b-588711018d70';
export const SUPABASE_PREVIOUS_HS256_KEY_ID = '6dbf8698-bdff-4de3-ac82-b75bc50d312e';

/**
 * Resolves the expected JWT audience for Supabase tokens.
 * Defaults to standard Supabase access token audience 'authenticated'.
 */
export function getExpectedAudience(): string {
  return process.env.SUPABASE_JWT_AUDIENCE || 'authenticated';
}

/**
 * Resolves the expected JWT issuer from SUPABASE_JWT_ISSUER or SUPABASE_URL.
 * Normalizes trailing slashes.
 */
export function getExpectedIssuer(): string | undefined {
  if (process.env.SUPABASE_JWT_ISSUER) {
    return process.env.SUPABASE_JWT_ISSUER.trim().replace(/\/+$/, '');
  }
  const rawUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (rawUrl && rawUrl.trim() !== '') {
    return `${rawUrl.trim().replace(/\/+$/, '')}/auth/v1`;
  }
  return undefined;
}

/**
 * Resolves the dedicated Supabase JWT secret for symmetric HS256 verification.
 * In production, strictly requires SUPABASE_JWT_SECRET and NEVER falls back
 * to AUTH_SECRET or development defaults.
 */
export function getSupabaseJwtSecret(): string | undefined {
  if (process.env.SUPABASE_JWT_SECRET) {
    return process.env.SUPABASE_JWT_SECRET;
  }
  if (process.env.NODE_ENV === 'production') {
    // Fail closed: Never use AUTH_SECRET or dev secrets in production
    return undefined;
  }
  return 'dev_secret_change_in_prod';
}

interface JwkRecord {
  keyObject: crypto.KeyObject;
  alg: string;
  crv?: string;
}

export const DEFAULT_JWKS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const JWKS_FETCH_THROTTLE_MS = 30 * 1000; // 30 seconds
export const JWKS_FETCH_TIMEOUT_MS = 5000; // 5 seconds
export const MAX_STALE_GRACE_PERIOD_MS = 60 * 60 * 1000; // 1 hour

/**
 * In-memory cache for trusted Supabase JWKS public keys.
 */
let jwksCache = new Map<string, JwkRecord>();
let lastJwksFetch = 0;
let jwksCacheExpiresAt = 0;
let inFlightJwksFetch: Promise<void> | null = null;

/**
 * Validates and parses raw JWKS key entries into validated JwkRecords.
 * Enforces EC P-256 curve, ES256 algorithm, signature use, and non-empty kid.
 */
export function parseJwks(data: { keys: any[] }): Map<string, JwkRecord> {
  const result = new Map<string, JwkRecord>();
  if (!data || !Array.isArray(data.keys)) return result;

  for (const jwk of data.keys) {
    if (!jwk || typeof jwk !== 'object') continue;
    if (jwk.kty !== 'EC') continue;
    if (jwk.crv !== 'P-256' && jwk.crv !== 'prime256v1') continue;
    if (jwk.alg && jwk.alg !== 'ES256') continue;
    if (jwk.use && jwk.use !== 'sig') continue;
    const kid = jwk.kid;
    if (!kid || typeof kid !== 'string' || kid.trim() === '') continue;

    try {
      const keyObj = crypto.createPublicKey({ key: jwk, format: 'jwk' });
      result.set(kid.trim(), {
        keyObject: keyObj,
        alg: 'ES256',
        crv: jwk.crv,
      });
    } catch {
      // Ignore individual invalid JWK
    }
  }
  return result;
}

/**
 * Registers trusted JWKS keys into the in-memory cache.
 * Accepts standard JWKS payload: { keys: JwkEntry[] }.
 */
export function setTrustedJwks(jwks: { keys: any[] }): void {
  const parsed = parseJwks(jwks);
  for (const [kid, record] of parsed) {
    jwksCache.set(kid, record);
  }
  jwksCacheExpiresAt = Date.now() + DEFAULT_JWKS_CACHE_TTL_MS;
}

/**
 * Clears the trusted JWKS cache (used primarily in test suites).
 */
export function clearJwksCache(): void {
  jwksCache.clear();
  lastJwksFetch = 0;
  jwksCacheExpiresAt = 0;
  inFlightJwksFetch = null;
}

export function getJwksCacheSize(): number {
  return jwksCache.size;
}

export function getJwksCacheExpiresAt(): number {
  return jwksCacheExpiresAt;
}

/**
 * Loads JWKS from environment or remote Supabase JWKS endpoint if not already cached.
 */
export async function loadJwksIfNeeded(kid?: string): Promise<void> {
  const now = Date.now();
  const isCacheExpired = now >= jwksCacheExpiresAt;
  const isKeyMissing = kid ? !jwksCache.has(kid) : jwksCache.size === 0;

  // 1. If cache is fresh and key is present, return immediately
  if (!isCacheExpired && !isKeyMissing) {
    return;
  }

  // 2. Static JWKS provided via SUPABASE_JWKS environment variable (air-gapped / offline support)
  if (process.env.SUPABASE_JWKS && jwksCache.size === 0) {
    try {
      const parsed = JSON.parse(process.env.SUPABASE_JWKS);
      if (Array.isArray(parsed?.keys)) {
        setTrustedJwks(parsed);
      }
    } catch {
      // Ignore malformed SUPABASE_JWKS string
    }
    if (kid && jwksCache.has(kid) && !isCacheExpired) {
      return;
    }
  }

  // 3. Throttle remote JWKS network calls to prevent request storms
  if (now - lastJwksFetch < JWKS_FETCH_THROTTLE_MS) {
    return;
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const jwksUrl =
    process.env.SUPABASE_JWKS_URL ||
    (supabaseUrl ? `${supabaseUrl.replace(/\/+$/, '')}/auth/v1/.well-known/jwks.json` : null);

  if (!jwksUrl) {
    return;
  }

  // Deduplicate concurrent fetch requests
  if (inFlightJwksFetch) {
    return inFlightJwksFetch;
  }

  inFlightJwksFetch = (async () => {
    try {
      lastJwksFetch = Date.now();
      const res = await fetch(jwksUrl, {
        signal: AbortSignal.timeout(JWKS_FETCH_TIMEOUT_MS),
        headers: { Accept: 'application/json' },
      });
      if (res.ok) {
        const data: any = await res.json();
        const freshKeys = parseJwks(data);
        if (freshKeys.size > 0) {
          // Replace stale key set so retired/revoked keys stop being trusted
          jwksCache = freshKeys;
          jwksCacheExpiresAt = Date.now() + DEFAULT_JWKS_CACHE_TTL_MS;
        }
      }
    } catch {
      // Network failure: if cache exceeded max stale grace period, purge it
      if (now - (jwksCacheExpiresAt - DEFAULT_JWKS_CACHE_TTL_MS) > MAX_STALE_GRACE_PERIOD_MS) {
        jwksCache.clear();
      }
    } finally {
      inFlightJwksFetch = null;
    }
  })();

  return inFlightJwksFetch;
}

/**
 * Extracts and verifies a Bearer JWT token from Supabase Auth.
 * Supports:
 *  - Current: ECC (P-256) signed with ES256, verified via Supabase JWKS
 *  - Previous: HMAC-SHA256 signed with HS256, verified via shared secret during key rotation
 *
 * Algorithm selection is strictly enforced against an allowlist and trusted keys;
 * arbitrary or mismatched algorithms (like 'none' or cross-algorithm substitution) are rejected.
 */
export async function verifyJwtToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    let header: any;
    let payload: any;
    try {
      header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
      payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));
    } catch {
      return null;
    }

    if (!header || typeof header !== 'object' || !payload || typeof payload !== 'object') {
      return null;
    }

    // 1. Strict Algorithm Allowlist: Only ES256 and HS256 permitted
    const alg = header.alg;
    if (alg !== 'ES256' && alg !== 'HS256') {
      return null;
    }

    // 2. Validate expiration (exp)
    if (!payload.exp || typeof payload.exp !== 'number') {
      return null;
    }
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (nowSeconds >= payload.exp) {
      return null;
    }

    // 3. Validate not before (nbf) if present
    if (payload.nbf && typeof payload.nbf === 'number' && nowSeconds < payload.nbf) {
      return null;
    }

    // 4. Validate subject claim (user identity) - strictly require genuine non-empty string sub
    const userId = payload.sub;
    if (!userId || typeof userId !== 'string' || userId.trim() === '') {
      return null;
    }

    // 5. Validate audience (aud) claim
    const expectedAudience = getExpectedAudience();
    if (payload.aud !== undefined) {
      if (Array.isArray(payload.aud)) {
        if (!payload.aud.includes(expectedAudience)) {
          return null;
        }
      } else if (payload.aud !== expectedAudience) {
        return null;
      }
    } else if (process.env.NODE_ENV === 'production') {
      // In production, Supabase tokens must include the audience claim
      return null;
    }

    // 6. Validate issuer (iss) claim
    const expectedIssuer = getExpectedIssuer();
    if (process.env.NODE_ENV === 'production' && !expectedIssuer) {
      // Fail closed: In production, issuer must be resolvable to prevent cross-tenant token bypasses
      return null;
    }
    if (expectedIssuer) {
      if (!payload.iss) {
        return null;
      }
      const normalizedIss = String(payload.iss).trim().replace(/\/+$/, '');
      if (normalizedIss !== expectedIssuer) {
        return null;
      }
    }

    const dataToVerify = Buffer.from(`${headerB64}.${payloadB64}`, 'utf-8');
    const signatureBuffer = Buffer.from(signatureB64, 'base64url');

    // 7. Algorithm-specific cryptographic verification
    if (alg === 'ES256') {
      // Asymmetric verification via ECDSA P-256 public key from trusted JWKS
      const kid = header.kid;
      if (!kid || typeof kid !== 'string' || kid.trim() === '') {
        // Strict: tokens signed with ES256 must identify key via valid kid
        return null;
      }
      await loadJwksIfNeeded(kid.trim());

      const keyRecord = jwksCache.get(kid.trim());
      if (!keyRecord || keyRecord.alg !== 'ES256') {
        return null;
      }

      // Standard JWS ES256 signatures are 64 bytes (R || S)
      if (signatureBuffer.length !== 64) {
        return null;
      }

      const isValid = crypto.verify(
        'SHA256',
        dataToVerify,
        {
          key: keyRecord.keyObject,
          dsaEncoding: 'ieee-p1363',
        },
        signatureBuffer
      );

      if (!isValid) {
        return null;
      }
    } else if (alg === 'HS256') {
      // Symmetric verification via HMAC-SHA256 for previous key rotation window
      const kid = header.kid;
      const expectedPreviousKid =
        process.env.SUPABASE_PREVIOUS_KEY_ID || SUPABASE_PREVIOUS_HS256_KEY_ID;

      // If token specifies kid, it must match the previous HS256 key id
      if (kid && kid !== expectedPreviousKid) {
        return null;
      }

      const secret = getSupabaseJwtSecret();

      if (!secret) {
        // Fail closed: In production, strictly require SUPABASE_JWT_SECRET (never fall back to AUTH_SECRET)
        return null;
      }

      const expectedSignature = crypto
        .createHmac('sha256', secret)
        .update(dataToVerify)
        .digest();

      if (
        signatureBuffer.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(signatureBuffer, expectedSignature)
      ) {
        return null;
      }
    } else {
      return null;
    }

    return {
      id: userId,
      email: payload.email,
      role: payload.role || 'authenticated',
    };
  } catch {
    return null;
  }
}

/**
 * Fastify preHandler hook: Parses optional Bearer token without rejecting unauthenticated requests.
 */
export async function parseOptionalAuth(req: FastifyRequest) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    req.user = null;
    return;
  }

  const token = authHeader.slice(7).trim();
  req.user = await verifyJwtToken(token);
}

/**
 * Fastify preHandler hook: Strictly requires a valid authenticated user.
 */
export async function requireAuth(req: FastifyRequest, reply: FastifyReply) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new AppError('UNAUTHORIZED', 'Authentication required. Missing Bearer token.', 401, false);
  }

  const token = authHeader.slice(7).trim();
  const user = await verifyJwtToken(token);
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Invalid, expired, or untrusted authentication token.', 401, false);
  }

  req.user = user;
}

export interface CreateTestTokenOptions {
  alg?: 'HS256' | 'ES256';
  kid?: string;
  secret?: string;
  privateKey?: crypto.KeyObject;
  expiresInSeconds?: number;
  registerInJwks?: boolean;
}

/**
 * Test utility to generate valid signed JWT tokens for integration testing.
 * Supports both current ES256 (ECC P-256) and previous HS256 keys.
 */
export function createTestToken(
  payload: Record<string, any>,
  optionsOrSecret?: CreateTestTokenOptions | string
): string {
  const options: CreateTestTokenOptions =
    typeof optionsOrSecret === 'string'
      ? { alg: 'HS256', secret: optionsOrSecret }
      : optionsOrSecret || {};

  const alg = options.alg || 'HS256';
  const expSeconds =
    options.expiresInSeconds !== undefined
      ? options.expiresInSeconds
      : 3600;

  const defaultAudience = getExpectedAudience();
  const defaultIssuer = getExpectedIssuer();

  const fullPayload = {
    exp: Math.floor(Date.now() / 1000) + expSeconds,
    aud: defaultAudience,
    role: 'authenticated',
    ...(defaultIssuer ? { iss: defaultIssuer } : {}),
    ...payload,
  };

  if (alg === 'ES256') {
    const kid = options.kid || SUPABASE_CURRENT_ECC_KEY_ID;
    let privateKey = options.privateKey;

    if (!privateKey) {
      // Generate a temporary EC keypair and optionally register the public key in jwksCache
      const { publicKey: pub, privateKey: priv } = crypto.generateKeyPairSync('ec', {
        namedCurve: 'prime256v1',
      });
      privateKey = priv;
      if (options.registerInJwks !== false) {
        const jwk = pub.export({ format: 'jwk' });
        jwk.kid = kid;
        jwk.alg = 'ES256';
        setTrustedJwks({ keys: [jwk] });
      }
    }

    const header = { alg: 'ES256', typ: 'JWT', kid };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const data = Buffer.from(`${headerB64}.${payloadB64}`, 'utf-8');
    const signature = crypto.sign('SHA256', data, {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    });

    return `${headerB64}.${payloadB64}.${signature.toString('base64url')}`;
  } else {
    // HS256
    const kid = options.kid || SUPABASE_PREVIOUS_HS256_KEY_ID;
    const secret =
      options.secret ||
      getSupabaseJwtSecret() ||
      'dev_secret_change_in_prod';

    const header = { alg: 'HS256', typ: 'JWT', kid };
    const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
    const payloadB64 = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
    const data = Buffer.from(`${headerB64}.${payloadB64}`, 'utf-8');
    const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');

    return `${headerB64}.${payloadB64}.${signature}`;
  }
}
