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
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerRoutes } from './routes/index.js';
import { getCorsAllowedOrigins } from './cors.js';
import { AppError } from './common/errors/AppError.js';

export function resolveTrustProxy(): boolean | string | string[] {
  if (process.env.TRUST_PROXY === 'true') return true;
  if (process.env.TRUST_PROXY === 'false') return false;
  if (process.env.TRUST_PROXY) {
    if (process.env.TRUST_PROXY.includes(',')) {
      return process.env.TRUST_PROXY.split(',').map((s) => s.trim());
    }
    return process.env.TRUST_PROXY;
  }
  return process.env.NODE_ENV === 'production';
}

export async function buildApp(opts: FastifyServerOptions = {}) {
  const isTest = process.env.NODE_ENV === 'test';

  const app: FastifyInstance = Fastify({
    trustProxy: resolveTrustProxy(),
    logger: isTest
      ? false
      : {
          level: 'info',
          transport: {
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
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(err.toResponse(req.id));
    }
    const statusCode =
      err && typeof err === 'object' && 'statusCode' in err && typeof err.statusCode === 'number'
        ? err.statusCode
        : 500;
    const isProd = process.env.NODE_ENV === 'production';

    // Log internal server exceptions server-side with correlation id
    if (statusCode >= 500 && req.log) {
      req.log.error(err);
    }

    // Sanitize error messages in production to prevent internal detail disclosure
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
        code: (err as any)?.code || 'INTERNAL_ERROR',
        message: safeMessage,
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

export function validateStartupEnvironment() {
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
