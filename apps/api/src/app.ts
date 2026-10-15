import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Load .env from process.cwd() or apps/api/.env
if (fs.existsSync(path.resolve(process.cwd(), '.env'))) {
  dotenv.config();
} else if (fs.existsSync(path.resolve(process.cwd(), 'apps/api/.env'))) {
  dotenv.config({ path: path.resolve(process.cwd(), 'apps/api/.env') });
} else {
  dotenv.config();
}
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { registerRoutes } from './routes/index.js';
import { getCorsAllowedOrigins } from './cors.js';

const app = Fastify({
  logger: {
    level: 'info',
    transport: {
      target: 'pino-pretty'
    }
  }
});

async function main() {
  // Startup environment validation (Section 4)
  if (!process.env.RAILRADAR_API_KEY) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Configuration error: Missing required environment variable RAILRADAR_API_KEY. ' +
        'Please configure RAILRADAR_API_KEY in your deployment environment.'
      );
    } else {
      console.warn(
        '[Config Warning] RAILRADAR_API_KEY is not set. Live train tracking calls to RailRadar will fail ' +
        'until RAILRADAR_API_KEY is set in your .env file.'
      );
    }
  }

  const allowedOrigins = getCorsAllowedOrigins();
  await app.register(cors, {
    origin: allowedOrigins,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  });
  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(rateLimit, { max: 100, timeWindow: '1 minute' });

  await registerRoutes(app);

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
  await app.listen({ port, host: '0.0.0.0' });
  console.log(`Exprest API server running on port ${port}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
