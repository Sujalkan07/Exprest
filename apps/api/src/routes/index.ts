import { FastifyInstance } from 'fastify';
import { TrainService } from '../modules/trains/TrainService.js';
import { JourneyService } from '../modules/journeys/JourneyService.js';
import { AppError } from '../common/errors/AppError.js';

export async function registerRoutes(fastify: FastifyInstance) {
  const trainService = new TrainService();
  const journeyService = new JourneyService();

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
    const data = await journeyService.getLiveStatus(journeyId);
    return { data, meta: makeMeta(req.id) };
  });

  // Live Stream SSE (PRD §7.5)
  fastify.get('/api/v1/journeys/:journeyId/stream', (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');

    const interval = setInterval(async () => {
      const liveData = await journeyService.getLiveStatus(journeyId);
      reply.raw.write(`event: journey.updated\ndata: ${JSON.stringify(liveData)}\n\n`);
    }, 15000);

    req.raw.on('close', () => {
      clearInterval(interval);
    });
  });

  // Journey Analytics (PRD §7.7)
  fastify.get('/api/v1/journeys/:journeyId/analytics', async (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    const data = await journeyService.getAnalytics(journeyId);
    return { data, meta: makeMeta(req.id) };
  });

  // Journey Weather (PRD §7.9)
  fastify.get('/api/v1/journeys/:journeyId/weather', async (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    const data = await journeyService.getWeather(journeyId);
    return { data, meta: makeMeta(req.id) };
  });

  // Nearby POIs (PRD §7.11)
  fastify.get('/api/v1/journeys/:journeyId/pois', async (req, reply) => {
    const { journeyId } = req.params as { journeyId: string };
    const { category } = req.query as { category?: string };
    const data = await journeyService.getPois(journeyId, category);
    return { data, meta: makeMeta(req.id) };
  });

  // Share Creation (PRD §7.14)
  fastify.post('/api/v1/shares', async (req, reply) => {
    const { journeyId } = req.body as { journeyId: string };
    const shareToken = `shr_${Math.random().toString(36).substring(2, 10)}`;
    const publicAppUrl = process.env.PUBLIC_APP_URL || 'http://localhost:3000';
    return {
      data: {
        shareToken,
        url: `${publicAppUrl}/share/${shareToken}`,
        createdAt: new Date().toISOString()
      },
      meta: makeMeta(req.id)
    };
  });
}
