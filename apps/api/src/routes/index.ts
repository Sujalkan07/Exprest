import { FastifyInstance } from 'fastify';
import { TrainService } from '../modules/trains/TrainService.js';
import { JourneyService } from '../modules/journeys/JourneyService.js';
import { PnrService } from '../modules/pnr/PnrService.js';
import { AppError } from '../common/errors/AppError.js';

export async function registerRoutes(fastify: FastifyInstance) {
  const trainService = new TrainService();
  const journeyService = new JourneyService();
  const pnrService = new PnrService();

  const makeMeta = (reqId: string) => ({
    requestId: reqId,
    generatedAt: new Date().toISOString()
  });

  // Train Search (PRD §7.2)
  fastify.get('/api/v1/trains/search', async (req, reply) => {
    const { q } = req.query as { q?: string };
    try {
      const items = await trainService.searchTrains(q || '');
      return { data: items, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(500).send({
          error: { code: 'PROVIDER_TIMEOUT', message: err.message, retryable: true },
          meta: makeMeta(req.id)
        });
      }
    }
  });

  // Journey Canonical Details (PRD §7.3)
  fastify.get('/api/v1/journeys/:journeyId', async (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    try {
      const data = await journeyService.getJourneyDetails(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(500).send({
          error: { code: 'RUN_NOT_FOUND', message: 'Journey not found.', retryable: false },
          meta: makeMeta(req.id)
        });
      }
    }
  });

  // Live Journey Status (PRD §7.4)
  fastify.get('/api/v1/journeys/:journeyId/live', async (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    try {
      const data = await journeyService.getLiveStatus(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(404).send({
          error: { code: 'LIVE_NOT_FOUND', message: err?.message || 'No live data found.', retryable: false },
          meta: makeMeta(req.id)
        });
      }
    }
  });

  // Live Stream SSE (PRD §7.5)
  fastify.get('/api/v1/journeys/:journeyId/stream', (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    let isClosed = false;
    let isFetching = false;

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

    // Send initial event immediately
    sendUpdate();

    const interval = setInterval(sendUpdate, 15000);

    req.raw.on('close', () => {
      isClosed = true;
      clearInterval(interval);
    });
  });

  // Journey Analytics (PRD §7.7)
  fastify.get('/api/v1/journeys/:journeyId/analytics', async (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    try {
      const data = await journeyService.getAnalytics(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(500).send({
          error: { code: 'RUN_NOT_FOUND', message: err?.message || 'Analytics unavailable.', retryable: false },
          meta: makeMeta(req.id)
        });
      }
    }
  });

  // Journey Weather (PRD §7.9)
  fastify.get('/api/v1/journeys/:journeyId/weather', async (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    try {
      const data = await journeyService.getWeather(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      if (err instanceof AppError) {
        reply.status(err.statusCode).send(err.toResponse(req.id));
      } else {
        reply.status(500).send({
          error: { code: 'WEATHER_UNAVAILABLE', message: err?.message || 'Weather unavailable.', retryable: true },
          meta: makeMeta(req.id)
        });
      }
    }
  });

  // Nearby POIs (PRD §7.11)
  fastify.get('/api/v1/journeys/:journeyId/pois', async (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    const { category } = req.query as { category?: string };
    try {
      const data = await journeyService.getPois(journeyId, category);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      reply.status(500).send({
        error: { code: 'POI_UNAVAILABLE', message: err?.message || 'POIs unavailable.', retryable: true },
        meta: makeMeta(req.id)
      });
    }
  });

  // Share Creation (PRD §7.14)
  fastify.post('/api/v1/shares', async (req, reply) => {
    const { journeyId } = (req.body as { journeyId?: string }) || {};
    if (!journeyId) {
      reply.status(400).send({
        error: { code: 'INVALID_JOURNEY_ID', message: 'journeyId is required', retryable: false },
        meta: makeMeta(req.id)
      });
      return;
    }

    try {
      // Validate that the requested journey exists
      await journeyService.getJourneyDetails(journeyId);
    } catch (err: any) {
      reply.status(404).send({
        error: { code: 'RUN_NOT_FOUND', message: 'Cannot share non-existent journey', retryable: false },
        meta: makeMeta(req.id)
      });
      return;
    }

    const publicAppUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
    return {
      data: {
        shareToken: journeyId,
        url: `${publicAppUrl}/share/${encodeURIComponent(journeyId)}`,
        createdAt: new Date().toISOString(),
        persistent: false,
        note: 'Direct link to journey. Persistent custom tokens require database configuration.'
      },
      meta: makeMeta(req.id)
    };
  });

  // Share Resolution
  fastify.get('/api/v1/shares/:shareToken', async (req, reply) => {
    const { shareToken } = req.params as { shareToken: string };
    try {
      // If the shareToken is or contains a journeyId, resolve it directly
      const journeyId = shareToken.startsWith('journey_') ? shareToken : null;
      if (!journeyId) {
        reply.status(404).send({
          error: {
            code: 'RUN_NOT_FOUND',
            message: 'Custom share token not found. Persistent share links require database configuration.',
            retryable: false
          },
          meta: makeMeta(req.id)
        });
        return;
      }

      const data = await journeyService.getJourneyDetails(journeyId);
      return { data, meta: makeMeta(req.id) };
    } catch (err: any) {
      reply.status(404).send({
        error: { code: 'RUN_NOT_FOUND', message: 'Shared journey not found.', retryable: false },
        meta: makeMeta(req.id)
      });
    }
  });

  // PNR Status Lookup
  fastify.get('/api/v1/pnr/:pnr', async (req, reply) => {
    const { pnr } = req.params as { pnr: string };
    try {
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
  });

  // Train Fare Lookup
  fastify.get('/api/v1/trains/:trainNumber/fare', async (req, reply) => {
    const { trainNumber } = req.params as { trainNumber: string };
    const { from, to, date, class: classCode, quota } = req.query as {
      from?: string;
      to?: string;
      date?: string;
      class?: string;
      quota?: string;
    };
    try {
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
  });
}
