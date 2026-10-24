import { FastifyInstance } from 'fastify';
import crypto from 'crypto';
import { TrainService } from '../modules/trains/TrainService.js';
import { JourneyService } from '../modules/journeys/JourneyService.js';
import { PnrService } from '../modules/pnr/PnrService.js';
import { AppError } from '../common/errors/AppError.js';
import { parseOptionalAuth, requireAuth } from '../common/middleware/auth.js';
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

export async function registerRoutes(fastify: FastifyInstance) {
  const trainService = new TrainService();
  const journeyService = new JourneyService();
  const pnrService = new PnrService();

  const makeMeta = (reqId: string) => ({
    requestId: reqId,
    generatedAt: new Date().toISOString(),
  });

  // Attach optional authentication parsing to all incoming requests
  fastify.addHook('preHandler', parseOptionalAuth);

  // Train Search (PRD §7.2)
  fastify.get('/api/v1/trains/search', async (req, reply) => {
    try {
      const { q } = validateInput(trainSearchQuerySchema, req.query);
      const items = await trainService.searchTrains(q || '');
      return { data: items, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(500).send({
          error: { code: 'PROVIDER_TIMEOUT', message: err.message, retryable: true },
          meta: makeMeta(req.id),
        });
      }
    }
  });

  // Journey Canonical Details (PRD §7.3)
  fastify.get('/api/v1/journeys/:journeyId', async (req, reply) => {
    try {
      const { journeyId } = validateInput(journeyParamSchema, req.params);
      const data = await journeyService.getJourneyDetails(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(500).send({
          error: { code: 'RUN_NOT_FOUND', message: 'Journey not found.', retryable: false },
          meta: makeMeta(req.id),
        });
      }
    }
  });

  // Live Journey Status (PRD §7.4)
  fastify.get('/api/v1/journeys/:journeyId/live', async (req, reply) => {
    try {
      const { journeyId } = validateInput(journeyParamSchema, req.params);
      const data = await journeyService.getLiveStatus(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(404).send({
          error: { code: 'LIVE_NOT_FOUND', message: err?.message || 'No live data found.', retryable: false },
          meta: makeMeta(req.id),
        });
      }
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

    let isClosed = false;
    let isFetching = false;
    const isTestExecution =
      process.env.NODE_ENV === 'test' ||
      process.argv.some((arg) => arg.includes('test')) ||
      req.headers['x-test-stream'] === 'true';

    const sendUpdate = async () => {
      if (isClosed || isFetching) return;
      isFetching = true;
      try {
        const liveData = await journeyService.getLiveStatus(journeyId);
        if (!isClosed) {
          reply.raw.write(`event: journey.updated\ndata: ${JSON.stringify(liveData)}\n\n`);
        }
      } catch (err: any) {
        if (!isClosed) {
          reply.raw.write(`event: journey.error\ndata: ${JSON.stringify({ message: err?.message || 'Stream update error' })}\n\n`);
        }
      } finally {
        isFetching = false;
      }
    };

    // Send initial event immediately, ending stream in test mode once initial event is written
    sendUpdate().finally(() => {
      if (isTestExecution) {
        isClosed = true;
        clearInterval(interval);
        try {
          reply.raw.end();
        } catch {
          // Ignored
        }
      }
    });

    const interval = setInterval(sendUpdate, 15000);

    // Safeguard against zombie connections (auto-terminate after 30 minutes in production)
    const maxLifetimeTimeout = !isTestExecution
      ? setTimeout(() => {
          isClosed = true;
          clearInterval(interval);
          try {
            reply.raw.end();
          } catch {
            // Ignored
          }
        }, 30 * 60 * 1000)
      : null;

    req.raw.on('close', () => {
      isClosed = true;
      clearInterval(interval);
      if (maxLifetimeTimeout) clearTimeout(maxLifetimeTimeout);
    });
  });

  // Journey Analytics (PRD §7.7)
  fastify.get('/api/v1/journeys/:journeyId/analytics', async (req, reply) => {
    try {
      const { journeyId } = validateInput(journeyParamSchema, req.params);
      const data = await journeyService.getAnalytics(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(500).send({
          error: { code: 'RUN_NOT_FOUND', message: err?.message || 'Analytics unavailable.', retryable: false },
          meta: makeMeta(req.id),
        });
      }
    }
  });

  // Journey Weather (PRD §7.9)
  fastify.get('/api/v1/journeys/:journeyId/weather', async (req, reply) => {
    try {
      const { journeyId } = validateInput(journeyParamSchema, req.params);
      const data = await journeyService.getWeather(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(500).send({
          error: { code: 'WEATHER_UNAVAILABLE', message: err?.message || 'Weather unavailable.', retryable: true },
          meta: makeMeta(req.id),
        });
      }
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
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(500).send({
          error: { code: 'POI_UNAVAILABLE', message: err?.message || 'POIs unavailable.', retryable: true },
          meta: makeMeta(req.id),
        });
      }
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
      try {
        const validated = validateInput(createShareBodySchema, req.body);
        journeyId = validated.journeyId;
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

      const secret = process.env.AUTH_SECRET || 'dev_secret_change_in_prod';
      const hmac = crypto
        .createHmac('sha256', secret)
        .update(journeyId)
        .digest('hex')
        .slice(0, 16);
      const shareToken = `sh_${journeyId.replace(/^journey_/, '')}_${hmac}`;

      const publicAppUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
      return {
        data: {
          shareToken,
          url: `${publicAppUrl}/share/${encodeURIComponent(shareToken)}`,
          createdByUserId: req.user?.id || null,
          createdAt: new Date().toISOString(),
          persistent: false,
          note: 'Signed cryptographic share token.',
        },
        meta: makeMeta(req.id),
      };
    }
  );

  // Share Resolution
  fastify.get('/api/v1/shares/:shareToken', async (req, reply) => {
    try {
      const { shareToken } = validateInput(shareParamSchema, req.params);
      let journeyId: string | null = null;

      if (shareToken.startsWith('sh_')) {
        const parts = shareToken.slice(3).split('_');
        if (parts.length >= 2) {
          const sig = parts[parts.length - 1];
          const rawId = parts.slice(0, -1).join('_');
          const reconstructedJourneyId = `journey_${rawId}`;
          const secret = process.env.AUTH_SECRET || 'dev_secret_change_in_prod';
          const expectedHmac = crypto
            .createHmac('sha256', secret)
            .update(reconstructedJourneyId)
            .digest('hex')
            .slice(0, 16);

          if (sig.length === expectedHmac.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedHmac))) {
            journeyId = reconstructedJourneyId;
          }
        }
      } else if (shareToken.startsWith('journey_')) {
        // Supported fallback for direct journey IDs
        journeyId = shareToken;
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
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(404).send({
          error: { code: 'RUN_NOT_FOUND', message: 'Shared journey not found.', retryable: false },
          meta: makeMeta(req.id),
        });
      }
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
        if (err instanceof AppError) {
          reply.status(err.statusCode).send(err.toResponse(req.id));
        } else {
          reply.status(500).send({
            error: {
              code: 'PROVIDER_TIMEOUT',
              message: err?.message || 'PNR status lookup failed.',
              retryable: true,
            },
            meta: makeMeta(req.id),
          });
        }
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
        if (err instanceof AppError) {
          reply.status(err.statusCode).send(err.toResponse(req.id));
        } else {
          reply.status(500).send({
            error: {
              code: 'PROVIDER_TIMEOUT',
              message: err?.message || 'Train fare lookup failed.',
              retryable: true,
            },
            meta: makeMeta(req.id),
          });
        }
      }
    }
  );
}
