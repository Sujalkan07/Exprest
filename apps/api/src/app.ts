import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import crypto from 'node:crypto';

// Load .env from process.cwd() or apps/api/.env
if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
  dotenv.config();
} else if (fs.existsSync(path.resolve(process.cwd(), 'apps/api/.env'))) {
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });
} else {
  dotenv.config();
}
import Fastify, { FastifyServerOptions, FastifyInstance, FastifyError } from 'fastify';
import net from 'node:net';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerRoutes } from './routes/index.js';
import { getCorsAllowedOrigins } from './cors.js';
import { AppError } from './common/errors/AppError.js';
import { getExpectedIssuer } from './common/middleware/auth.js';

function isValidCidr(str: string): boolean {
  const parts = str.split('/');
  if (parts.length !== 2) return false;
  const [ip, prefixStr] = parts;
  const ipType = net.isIP(ip);
  if (!ipType) return false;
  if (!/^\d+$/.test(prefixStr)) return false;
  const prefix = parseInt(prefixStr, 10);
  if (ipType === 4) return prefix >= 0 && prefix <= 32;
  if (ipType === 6) return prefix >= 0 && prefix <= 128;
  return false;
}

export function isValidIpOrSubnet(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  if (net.isIP(trimmed) !== 0) return true;
  if (isValidCidr(trimmed)) return true;
  const keywords = ['loopback', 'linklocal', 'uniquelocal'];
  return keywords.includes(trimmed.toLowerCase());
}

export function cleanSensitiveLogText(text: string): string {
  if (!text || typeof text !== 'string') return text;
  return text
    .replace(/(postgres|postgresql|redis):\/\/[^\s/@]+@[^\s/]+/gi, '$1://[REDACTED]@[REDACTED]')
    .replace(/Bearer\s+[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+\.?[A-Za-z0-9-_.+/=]*/gi, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|secret|password|token)=([A-Za-z0-9-_]+)/gi, '$1=[REDACTED]');
}

export function errorLogSerializer(error: any) {
  if (!error || typeof error !== 'object') return error;
  return {
    type: error.constructor?.name || error.name || 'Error',
    message: typeof error.message === 'string' ? cleanSensitiveLogText(error.message) : error.message,
    stack: typeof error.stack === 'string' ? cleanSensitiveLogText(error.stack) : undefined,
    code: error.code,
    statusCode: error.statusCode,
  };
}

export function resolveTrustProxy(): boolean | number | string | string[] {
  const raw = process.env.TRUST_PROXY;
  if (raw === undefined || raw === null || raw.trim() === '' || raw.trim() === 'undefined') {
    // Production default: 1 trusted hop for Render's reverse proxy layer
    // Non-production default: false (direct connection without proxy)
    return process.env.NODE_ENV === 'production' ? 1 : false;
  }

  const val = raw.trim();

  // Explicit Boolean settings
  if (val.toLowerCase() === 'true') return true;
  if (val.toLowerCase() === 'false') return false;

  // Numeric hop count: positive integer (or '0' to disable trust)
  if (/^\d+$/.test(val)) {
    const hops = parseInt(val, 10);
    if (hops === 0) return false;
    return hops;
  }

  // Comma-separated list of IPs / CIDRs / subnets
  if (val.includes(',')) {
    const list = val.split(',').map((s) => s.trim());
    if (list.length === 0 || list.some((item) => !item || !isValidIpOrSubnet(item))) {
      throw new Error(
        `Configuration error: Invalid TRUST_PROXY comma-separated list "${val}". ` +
        `Each entry must be a valid IP address, CIDR subnet, or supported keyword (loopback, linklocal, uniquelocal).`
      );
    }
    return list;
  }

  // Single IP address, CIDR subnet, or supported subnet keyword
  if (isValidIpOrSubnet(val)) {
    return val;
  }

  throw new Error(
    `Configuration error: Invalid TRUST_PROXY value "${val}". ` +
    `Supported options: "true", "false", positive integer hop count (e.g. "1"), IP address, CIDR subnet, or supported keyword (loopback, linklocal, uniquelocal).`
  );
}

export async function buildApp(opts: FastifyServerOptions = {}) {
  const isTest = process.env.NODE_ENV === 'test';

  const app: FastifyInstance = Fastify({
    bodyLimit: 64 * 1024, // 64 KB max payload limit (prevents payload flooding & memory exhaustion)
    trustProxy: resolveTrustProxy() as any,
    logger: isTest
      ? false
      : {
          level: 'info',
          redact: {
            paths: [
              'req.headers.authorization',
              'req.headers.cookie',
              'headers.authorization',
              'headers.cookie',
              'authorization',
              'cookie',
              'token',
              'password',
              'secret',
              'apiKey',
              'api_key',
              '*.authorization',
              '*.cookie',
              '*.token',
              '*.password',
              '*.secret',
              '*.apiKey',
              '*.api_key',
            ],
            censor: '[REDACTED]',
          },
          serializers: {
            err: errorLogSerializer,
          },
          transport:
            process.env.NODE_ENV === 'production'
              ? undefined
              : {
                  target: 'pino-pretty',
                },
        },
    ...opts,
  });

  const allowedOrigins = getCorsAllowedOrigins();
  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
  await app.register(helmet, { contentSecurityPolicy: false, hidePoweredBy: true });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  app.setErrorHandler((err: FastifyError | AppError | Error | any, req, reply) => {
    const isProd = process.env.NODE_ENV === 'production';
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
        ? err.statusCode
        : 500;

    // Log internal server exceptions server-side with correlation id
    if (statusCode >= 500 && req.log) {
      req.log.error({ err, reqId: req.id });
    }

    if (err instanceof AppError) {
      if (isProd && err.statusCode >= 500) {
        return reply.status(err.statusCode).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'An internal server error occurred.',
            retryable: false,
          },
          meta: {
            requestId: req.id,
            generatedAt: new Date().toISOString(),
          },
        });
      }
      return reply.status(err.statusCode).send(err.toResponse(req.id));
    }

    // Sanitize non-AppError exceptions in production
    const rawMessage =
      err && typeof err === 'object' && 'message' in err && typeof err.message === 'string'
        ? err.message
        : '';
    const safeMessage =
      isProd && statusCode >= 500
        ? 'An internal server error occurred.'
        : rawMessage || 'An unexpected error occurred.';

    return reply.status(statusCode).send({
      error: {
        code:
          (err as any)?.code ||
          (statusCode === 429
            ? 'RATE_LIMIT_EXCEEDED'
            : statusCode >= 500
              ? 'INTERNAL_ERROR'
              : 'BAD_REQUEST'),
        message: safeMessage,
        retryable: false,
      },
      meta: {
        requestId: req.id,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  app.setNotFoundHandler((req, reply) => {
    return reply.status(404).send({
      error: {
        code: 'NOT_FOUND',
        message: 'The requested resource was not found.',
        retryable: false,
      },
      meta: {
        requestId: req.id,
        generatedAt: new Date().toISOString(),
      },
    });
  });

  await registerRoutes(app);

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  return app;
}

export interface StartupDiagnostics {
  nodeEnv: string;
  trustProxy: boolean | number | string | string[];
  hasRailRadarApiKey: boolean;
  hasAuthSecret: boolean;
  authSecretLength: number;
  hasSupabaseJwtSecret: boolean;
  supabaseIssuer: string | undefined;
  corsOriginsCount: number;
  publicAppUrl: string | undefined;
}

export function getStartupDiagnostics(): StartupDiagnostics {
  const authSecret = process.env.AUTH_SECRET || '';
  const origins = getCorsAllowedOrigins();
  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    trustProxy: resolveTrustProxy(),
    hasRailRadarApiKey: Boolean(process.env.RAILRADAR_API_KEY && process.env.RAILRADAR_API_KEY.trim() !== ''),
    hasAuthSecret: Boolean(authSecret && authSecret !== 'dev_secret_change_in_prod'),
    authSecretLength: authSecret ? authSecret.length : 0,
    hasSupabaseJwtSecret: Boolean(process.env.SUPABASE_JWT_SECRET && process.env.SUPABASE_JWT_SECRET.trim() !== ''),
    supabaseIssuer: getExpectedIssuer(),
    corsOriginsCount: origins.length,
    publicAppUrl: process.env.PUBLIC_APP_URL,
  };
}

export function validateStartupEnvironment() {
  // Validate proxy configuration early so invalid TRUST_PROXY throws on startup
  resolveTrustProxy();

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.RAILRADAR_API_KEY) {
      throw new Error(
        'Configuration error: Missing required environment variable RAILRADAR_API_KEY. ' +
        'Please configure RAILRADAR_API_KEY in your deployment environment.'
      );
    }
    const authSecret = process.env.AUTH_SECRET;
    if (!authSecret || authSecret === 'dev_secret_change_in_prod' || authSecret.length < 16) {
      throw new Error(
        'Configuration error: Missing or insecure AUTH_SECRET in production. ' +
        'Please configure a secure AUTH_SECRET (at least 16 characters) in your deployment environment.'
      );
    }
    const jwtSecret = process.env.SUPABASE_JWT_SECRET;
    if (jwtSecret && (jwtSecret === 'dev_secret_change_in_prod' || jwtSecret.length < 16)) {
      throw new Error(
        'Configuration error: Insecure SUPABASE_JWT_SECRET in production. ' +
        'Please configure a secure SUPABASE_JWT_SECRET (at least 16 characters) in your deployment environment.'
      );
    }
    const issuer = getExpectedIssuer();
    if (!issuer) {
      throw new Error(
        'Configuration error: Missing SUPABASE_URL or SUPABASE_JWT_ISSUER in production. ' +
        'Production JWT verification requires a resolvable Supabase issuer to protect against token spoofing.'
      );
    }

    // Validate URL formats in production
    const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
    if (supabaseUrl && supabaseUrl.trim() !== '') {
      try {
        const parsed = new URL(supabaseUrl.trim());
        if (parsed.protocol !== 'https:' && !parsed.hostname.includes('localhost') && parsed.hostname !== '127.0.0.1') {
          throw new Error('SUPABASE_URL must use https:// protocol in production.');
        }
      } catch (e: any) {
        throw new Error(`Configuration error: Invalid SUPABASE_URL "${supabaseUrl}". ${e.message}`);
      }
    }

    const publicAppUrl = process.env.PUBLIC_APP_URL;
    if (publicAppUrl && publicAppUrl.trim() !== '') {
      try {
        const parsed = new URL(publicAppUrl.trim());
        if (parsed.protocol !== 'https:' && !parsed.hostname.includes('localhost') && parsed.hostname !== '127.0.0.1') {
          throw new Error('PUBLIC_APP_URL must use https:// protocol in production.');
        }
      } catch (e: any) {
        throw new Error(`Configuration error: Invalid PUBLIC_APP_URL "${publicAppUrl}". ${e.message}`);
      }
    }
  } else {
    if (!process.env.RAILRADAR_API_KEY) {
      console.warn(
        '[Config Warning] RAILRADAR_API_KEY is not set. Live train tracking calls to RailRadar will fail ' +
        'until RAILRADAR_API_KEY is set in your .env file.'
      );
    }
  }
}

async function main() {
  // Strict startup environment validation (P0 Production Security)
  validateStartupEnvironment();

  const diag = getStartupDiagnostics();
  console.log(
    `[Startup Diagnostics] Environment: ${diag.nodeEnv}, ` +
    `TrustProxy: ${JSON.stringify(diag.trustProxy)}, ` +
    `Issuer: ${diag.supabaseIssuer || 'none'}, ` +
    `CORS Origins: ${diag.corsOriginsCount}`
  );

  const app = await buildApp();
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Exprest API server running on port ${port}`);
}

// Only auto-start when executed directly rather than imported in tests or modules
const isDirectEntry = Boolean(
  process.argv[1] &&
  (process.argv[1].endsWith('app.ts') || process.argv[1].endsWith('app.js')) &&
  !process.argv.some((arg) => arg.includes('test'))
);

if (isDirectEntry) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
