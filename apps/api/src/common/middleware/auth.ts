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
 * Extracts and verifies a Bearer JWT token (e.g. from Supabase Auth or internal signing).
 * If secret is configured (AUTH_SECRET / SUPABASE_JWT_SECRET), verifies the HMAC-SHA256 signature.
 * Also checks token expiration.
 */
export function verifyJwtToken(token: string): AuthenticatedUser | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(Buffer.from(headerB64, 'base64url').toString('utf-8'));
    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

    // Verify algorithm
    if (header.alg !== 'HS256') {
      return null;
    }

    // Check expiration
    if (payload.exp && typeof payload.exp === 'number') {
      const nowSeconds = Math.floor(Date.now() / 1000);
      if (nowSeconds >= payload.exp) {
        return null;
      }
    }

    // Verify signature — fail closed in production if secret is unset
    const secret =
      process.env.SUPABASE_JWT_SECRET ||
      process.env.AUTH_SECRET ||
      (process.env.NODE_ENV !== 'production' ? 'dev_secret_change_in_prod' : undefined);

    if (!secret) {
      return null;
    }

    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(`${headerB64}.${payloadB64}`)
      .digest('base64url');

    const sigBuf = Buffer.from(signatureB64);
    const expBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    const userId = payload.sub || payload.id;
    if (!userId || typeof userId !== 'string') {
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
  req.user = verifyJwtToken(token);
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
  const user = verifyJwtToken(token);
  if (!user) {
    throw new AppError('UNAUTHORIZED', 'Invalid, expired, or untrusted authentication token.', 401, false);
  }

  req.user = user;
}

/**
 * Test utility to generate valid signed JWT tokens for integration testing.
 */
export function createTestToken(payload: Record<string, any>, secret?: string): string {
  const s = secret || process.env.SUPABASE_JWT_SECRET || process.env.AUTH_SECRET || 'dev_secret_change_in_prod';
  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', s).update(`${headerB64}.${payloadB64}`).digest('base64url');
  return `${headerB64}.${payloadB64}.${signature}`;
}
