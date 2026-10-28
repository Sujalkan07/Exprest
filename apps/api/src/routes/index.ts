import { FastifyInstance, FastifyReply } from 'fastify';
import crypto from 'crypto';
import { TrainService } from '../modules/trains/TrainService.js';
import { JourneyService } from '../modules/journeys/JourneyService.js';
import { PnrService } from '../modules/pnr/PnrService.js';
import { AppError } from '../common/errors/AppError.js';
import { parseOptionalAuth, requireAuth } from '../common/middleware/auth.js';
import { getCorsAllowedOrigins, normalizeOrigin } from '../cors.js';
import {
  trainSearchQuerySchema,
  journeyParamSchema,
  poiQuerySchema,
  createShareBodySchema,
  shareParamSchema,
  pnrParamSchema,
  trainFareParamSchema,
  trainFareQuerySchema,
  validateInput,
} from '../common/validation/schemas.js';

export function getShareSigningSecret(): string {
  const secret = process.env.SHARE_SIGNING_SECRET || process.env.AUTH_SECRET;
  if (process.env.NODE_ENV === 'production') {
    if (!secret || secret === 'dev_secret_change_in_prod' || secret.length < 16) {
      throw new AppError(
        'INTERNAL_ERROR',
        'Secure share signing secret is not configured on the server.',
        500,
        false
      );
    }
    return secret;
  }
  return secret || 'dev_secret_change_in_prod';
}

export function resolvePublicAppUrl(originHeader?: string): string {
  const configured = process.env.PUBLIC_APP_URL?.trim();
  if (configured && !configured.includes('localhost') && !configured.includes('127.0.0.1')) {
    return configured.replace(/\/+$/, '');
  }

  if (process.env.NODE_ENV === 'production') {
    if (originHeader) {
      const allowed = getCorsAllowedOrigins();
      const normalized = normalizeOrigin(originHeader);
      const isAllowed = allowed.some((o) =>
        o instanceof RegExp ? o.test(normalized) : o === normalized
      );
      if (isAllowed) {
        return normalized;
      }
    }
    return 'https://exprest.vercel.app';
  }

  return configured ? configured.replace(/\/+$/, '') : 'http://localhost:3000';
}

/**
 * Sanitizes unexpected error messages for public client responses.
 * In production, returns a safe generic message to prevent leaking internal stack traces,
 * database errors, filesystem paths, upstream credentials, or connection details.
 * 4xx client-safe errors preserve their messages; 5xx errors are sanitized.
 */
export function toSafeErrorMessage(err: unknown, defaultMessage: string): string {
  const isProd = process.env.NODE_ENV === 'production';
  if (err instanceof AppError) {
    if (isProd && err.statusCode >= 500) {
      return defaultMessage;
    }
    return err.message;
  }
  if (isProd) {
    return defaultMessage;
  }
  return err && typeof err === 'object' && 'message' in err && typeof (err as any).message === 'string'
    ? (err as any).message
    : defaultMessage;
}

export async function registerRoutes(fastify: FastifyInstance) {
  const trainService = new TrainService();
  const journeyService = new JourneyService();
  const pnrService = new PnrService();

  const makeMeta = (reqId: string) => ({
    requestId: reqId,
    generatedAt: new Date().toISOString(),
  });

  const sendSafeError = (
    reply: FastifyReply,
    reqId: string,
    err: unknown,
    fallbackCode: string,
    fallbackMessage: string,
    defaultStatus = 500,
    retryable = false
  ) => {
    const isProd = process.env.NODE_ENV === 'production';
    if (err instanceof AppError) {
      if (isProd && err.statusCode >= 500) {
        return reply.status(err.statusCode).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: fallbackMessage,
            retryable: false,
          },
          meta: makeMeta(reqId),
        });
      }
      return reply.status(err.statusCode).send(err.toResponse(reqId));
    }
    return reply.status(defaultStatus).send({
      error: {
        code: fallbackCode,
        message: toSafeErrorMessage(err, fallbackMessage),
        retryable,
      },
      meta: makeMeta(reqId),
    });
  };

  // Attach optional authentication parsing to all incoming requests
  fastify.addHook('preHandler', parseOptionalAuth);

  // Train Search (PRD §7.2)
  fastify.get('/api/v1/trains/search', async (req, reply) => {
    try {
      const { q } = validateInput(trainSearchQuerySchema, req.query);
      const items = await trainService.searchTrains(q || '');
      return { data: items, meta: makeMeta(req.id) };
    } catch (err: any) {
      req.log.error({ err, reqId: req.id }, 'Train search provider failure');
      sendSafeError(
        reply,
        req.id,
        err,
        'PROVIDER_TIMEOUT',
        'Train search is temporarily unavailable.',
        500,
        true
      );
    }
  });

  // Journey Canonical Details (PRD §7.3)
  fastify.get('/api/v1/journeys/:journeyId', async (req, reply) => {
    try {
      const { journeyId } = validateInput(journeyParamSchema, req.params);
      const data = await journeyService.getJourneyDetails(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      req.log.error({ err, reqId: req.id }, 'Journey details lookup failure');
      sendSafeError(
        reply,
        req.id,
        err,
        'RUN_NOT_FOUND',
        'Journey details are temporarily unavailable.',
        500,
        false
      );
    }
  });

  // Live Journey Status (PRD §7.4)
  fastify.get('/api/v1/journeys/:journeyId/live', async (req, reply) => {
    try {
      const { journeyId } = validateInput(journeyParamSchema, req.params);
      const data = await journeyService.getLiveStatus(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      req.log.error({ err, reqId: req.id }, 'Live journey lookup failure');
      sendSafeError(
        reply,
        req.id,
        err,
        'PROVIDER_UNAVAILABLE',
        'Live journey tracking is temporarily unavailable.',
        500,
        false
      );
    }
  });

  // Live Stream SSE (PRD §7.5)
  fastify.get('/api/v1/journeys/:journeyId/stream', (req, reply) => {
    let journeyId: string;
    try {
      const validated = validateInput(journeyParamSchema, req.params);
      journeyId = validated.journeyId;
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(400).send({
          error: { code: 'VALIDATION_ERROR', message: 'Invalid journeyId parameter', retryable: false },
          meta: makeMeta(req.id),
        });
      }
      return;
    }

    reply.hijack();
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    // Immediate keepalive comment flushes HTTP headers to client
    reply.raw.write(':keep-alive\n\n');

    let isClosed = false;
    let isFetching = false;
    const abortController = new AbortController();

    const isTestExecution =
      process.env.NODE_ENV === 'test' ||
      process.argv.some((arg) => arg.includes('test')) ||
      (process.env.NODE_ENV !== 'production' && req.headers['x-test-stream'] === 'true');

    const sendUpdate = async () => {
      if (isClosed || isFetching || req.raw.destroyed || reply.raw.writableEnded) return;
      isFetching = true;
      try {
        const liveData = await journeyService.getLiveStatus(journeyId);
        if (!isClosed && !req.raw.destroyed && !reply.raw.writableEnded) {
          reply.raw.write(`event: journey.updated\ndata: ${JSON.stringify(liveData)}\n\n`);
        }
      } catch (err: any) {
        req.log.error({ err, reqId: req.id, journeyId }, 'SSE live telemetry stream update failure');
        if (!isClosed && !req.raw.destroyed && !reply.raw.writableEnded) {
          const safeMsg = toSafeErrorMessage(err, 'Stream update error');
          reply.raw.write(`event: journey.error\ndata: ${JSON.stringify({ message: safeMsg })}\n\n`);
        }
      } finally {
        isFetching = false;
      }
    };

    let interval: NodeJS.Timeout | null = null;
    let maxLifetimeTimeout: NodeJS.Timeout | null = null;

    const cleanup = () => {
      if (isClosed) return;
      isClosed = true;
      abortController.abort();
      if (interval) clearInterval(interval);
      if (maxLifetimeTimeout) clearTimeout(maxLifetimeTimeout);
      try {
        if (!reply.raw.writableEnded) {
          reply.raw.end();
        }
      } catch {
        // Ignored
      }
    };

    req.raw.on('close', cleanup);
    req.raw.on('aborted', cleanup);
    reply.raw.on('close', cleanup);

    // Send initial event immediately, ending stream in test mode once initial event is written
    sendUpdate().finally(() => {
      if (isTestExecution) {
        cleanup();
      }
    });

    if (!isTestExecution) {
      interval = setInterval(sendUpdate, 15000);
      // Safeguard against zombie connections (auto-terminate after 30 minutes in production)
      maxLifetimeTimeout = setTimeout(cleanup, 30 * 60 * 1000);
    }
  });

  // Journey Analytics (PRD §7.7)
  fastify.get('/api/v1/journeys/:journeyId/analytics', async (req, reply) => {
    try {
      const { journeyId } = validateInput(journeyParamSchema, req.params);
      const data = await journeyService.getAnalytics(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      req.log.error({ err, reqId: req.id }, 'Journey analytics lookup failure');
      sendSafeError(
        reply,
        req.id,
        err,
        'RUN_NOT_FOUND',
        'Analytics unavailable.',
        500,
        false
      );
    }
  });

  // Journey Weather (PRD §7.9)
  fastify.get('/api/v1/journeys/:journeyId/weather', async (req, reply) => {
    try {
      const { journeyId } = validateInput(journeyParamSchema, req.params);
      const data = await journeyService.getWeather(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      req.log.error({ err, reqId: req.id }, 'Journey weather lookup failure');
      sendSafeError(
        reply,
        req.id,
        err,
        'WEATHER_UNAVAILABLE',
        'Weather unavailable.',
        500,
        true
      );
    }
  });

  // Nearby POIs (PRD §7.11)
  fastify.get('/api/v1/journeys/:journeyId/pois', async (req, reply) => {
    try {
      const { journeyId } = validateInput(journeyParamSchema, req.params);
      const { category } = validateInput(poiQuerySchema, req.query);
      const data = await journeyService.getPois(journeyId, category);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      req.log.error({ err, reqId: req.id }, 'Journey POI lookup failure');
      sendSafeError(
        reply,
        req.id,
        err,
        'POI_UNAVAILABLE',
        'POIs unavailable.',
        500,
        true
      );
    }
  });

  // Share Creation (PRD §7.14) — Authenticated resource creation (A1)
  fastify.post(
    '/api/v1/shares',
    {
      preHandler: [requireAuth],
      config: {
        rateLimit: {
          max: 20,
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
      let journeyId: string;
      let expiresInSeconds: number | undefined;
      try {
        const validated = validateInput(createShareBodySchema, req.body);
        journeyId = validated.journeyId;
        expiresInSeconds = validated.expiresInSeconds;
      } catch (err: any) {
        if (err instanceof AppError) {
          reply.status(err.statusCode).send(err.toResponse(req.id));
        } else {
          reply.status(400).send({
            error: { code: 'INVALID_JOURNEY_ID', message: 'journeyId is required and must be valid', retryable: false },
            meta: makeMeta(req.id),
          });
        }
        return;
      }

      try {
        // Validate that the requested journey exists
        await journeyService.getJourneyDetails(journeyId);
      } catch (err: any) {
        reply.status(404).send({
          error: { code: 'RUN_NOT_FOUND', message: 'Cannot share non-existent journey', retryable: false },
          meta: makeMeta(req.id),
        });
        return;
      }

      const secret = getShareSigningSecret();
      const rawId = journeyId.replace(/^journey_/, '');
      let shareToken: string;
      let expiresAt: string | null = null;
      const isPersistent = !expiresInSeconds;

      if (expiresInSeconds) {
        const expiryEpoch = Math.floor(Date.now() / 1000) + expiresInSeconds;
        expiresAt = new Date(expiryEpoch * 1000).toISOString();
        const dataToSign = `${journeyId}:exp:${expiryEpoch}`;
        const hmac = crypto
          .createHmac('sha256', secret)
          .update(dataToSign)
          .digest('hex')
          .slice(0, 16);
        shareToken = `sh_${rawId}_exp${expiryEpoch}_${hmac}`;
      } else {
        const hmac = crypto
          .createHmac('sha256', secret)
          .update(journeyId)
          .digest('hex')
          .slice(0, 16);
        shareToken = `sh_${rawId}_${hmac}`;
      }

      const publicAppUrl = resolvePublicAppUrl(req.headers.origin);
      return {
        data: {
          shareToken,
          url: `${publicAppUrl}/share/${encodeURIComponent(shareToken)}`,
          createdByUserId: req.user?.id || null,
          createdAt: new Date().toISOString(),
          expiresAt,
          persistent: isPersistent,
          note: isPersistent
            ? 'Signed cryptographic share token.'
            : `Time-limited cryptographic share token expiring at ${expiresAt}.`,
        },
        meta: makeMeta(req.id),
      };
    }
  );

  // Share Resolution (Strictly requires valid cryptographic signed share token; direct journey IDs are rejected)
  fastify.get('/api/v1/shares/:shareToken', async (req, reply) => {
    try {
      const { shareToken } = validateInput(shareParamSchema, req.params);
      let journeyId: string | null = null;

      // Strictly accept only signed share tokens starting with 'sh_'
      if (shareToken.startsWith('sh_')) {
        const rest = shareToken.slice(3);
        const parts = rest.split('_');

        if (parts.length >= 2) {
          const sig = parts[parts.length - 1];
          const middleParts = parts.slice(0, -1);
          const secret = getShareSigningSecret();

          // Check for expiring token pattern: _exp<timestamp>
          const lastPart = middleParts[middleParts.length - 1];
          const expMatch = lastPart?.match(/^exp(\d+)$/);

          if (expMatch) {
            const expiryEpoch = parseInt(expMatch[1], 10);
            const nowEpoch = Math.floor(Date.now() / 1000);
            if (nowEpoch > expiryEpoch) {
              reply.status(404).send({
                error: {
                  code: 'RUN_NOT_FOUND',
                  message: 'Invalid, tampered, or expired share token.',
                  retryable: false,
                },
                meta: makeMeta(req.id),
              });
              return;
            }

            const rawId = middleParts.slice(0, -1).join('_');
            const reconstructedJourneyId = `journey_${rawId}`;
            const dataToSign = `${reconstructedJourneyId}:exp:${expiryEpoch}`;
            const expectedHmac = crypto
              .createHmac('sha256', secret)
              .update(dataToSign)
              .digest('hex')
              .slice(0, 16);

            const sigBuf = Buffer.from(sig, 'utf-8');
            const expectedBuf = Buffer.from(expectedHmac, 'utf-8');

            if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
              journeyId = reconstructedJourneyId;
            }
          } else {
            // Persistent token
            const rawId = middleParts.join('_');
            const reconstructedJourneyId = `journey_${rawId}`;
            const expectedHmac = crypto
              .createHmac('sha256', secret)
              .update(reconstructedJourneyId)
              .digest('hex')
              .slice(0, 16);

            const sigBuf = Buffer.from(sig, 'utf-8');
            const expectedBuf = Buffer.from(expectedHmac, 'utf-8');

            if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
              journeyId = reconstructedJourneyId;
            }
          }
        }
      }

      if (!journeyId) {
        reply.status(404).send({
          error: {
            code: 'RUN_NOT_FOUND',
            message: 'Invalid, tampered, or expired share token.',
            retryable: false,
          },
          meta: makeMeta(req.id),
        });
        return;
      }

      const data = await journeyService.getJourneyDetails(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      req.log.error({ err, reqId: req.id }, 'Shared journey details lookup failure');
      sendSafeError(
        reply,
        req.id,
        err,
        'RUN_NOT_FOUND',
        'Shared journey details are temporarily unavailable.',
        500,
        false
      );
    }
  });

  // PNR Status Lookup with dedicated strict rate limit (10 lookups / min / IP)
  fastify.get(
    '/api/v1/pnr/:pnr',
    {
      config: {
        rateLimit: {
          max: 10,
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
      try {
        const { pnr } = validateInput(pnrParamSchema, req.params, 'INVALID_PNR');
        const data = await pnrService.getPnrStatus(pnr);
        return { data, meta: makeMeta(req.id) };
      } catch (err: any) {
        req.log.error({ err, reqId: req.id }, 'PNR lookup failure');
        sendSafeError(
          reply,
          req.id,
          err,
          'PROVIDER_TIMEOUT',
          'PNR status lookup failed.',
          500,
          true
        );
      }
    }
  );

  // Train Fare Lookup with dedicated rate limit (30 requests / min / IP)
  fastify.get(
    '/api/v1/trains/:trainNumber/fare',
    {
      config: {
        rateLimit: {
          max: 30,
          timeWindow: '1 minute',
        },
      },
    },
    async (req, reply) => {
      try {
        const { trainNumber } = validateInput(trainFareParamSchema, req.params);
        const { from, to, date, class: classCode, quota } = validateInput(
          trainFareQuerySchema,
          req.query
        );
        const data = await pnrService.getTrainFare(
          trainNumber,
          from || '',
          to || '',
          date,
          classCode,
          quota
        );
        return { data, meta: makeMeta(req.id) };
      } catch (err: any) {
        req.log.error({ err, reqId: req.id }, 'Train fare lookup failure');
        sendSafeError(
          reply,
          req.id,
          err,
          'PROVIDER_TIMEOUT',
          'Train fare lookup failed.',
          500,
          true
        );
      }
    }
  );
}
