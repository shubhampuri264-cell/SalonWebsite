import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { router } from './routes/index';
import { errorHandler } from './middleware/errorHandler';
import { generalRateLimit } from './middleware/rateLimiter';

export function createApp() {
  const app = express();

  // Security headers
  app.use(helmet());

  // CORS — locked to frontend origin in prod; also permits any localhost
  // port in dev so the Vite dev server (default :5173) can call this Express
  // backend even when CLIENT_URL points at the deployed domain.
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin) return callback(null, true);
        if (origin === env.CLIENT_URL) return callback(null, true);
        if (env.NODE_ENV !== 'production' && /^https?:\/\/localhost(:\d+)?$/.test(origin)) {
          return callback(null, true);
        }
        callback(new Error('Not allowed by CORS'));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    })
  );

  // Parse JSON bodies
  app.use(express.json({ limit: '1mb' }));

  // Global rate limit
  app.use(generalRateLimit);

  // Health check (no auth, no rate limit concerns)
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });

  // API routes
  app.use('/api', router);

  // 404 handler
  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // Global error handler (must be last)
  app.use(errorHandler);

  return app;
}
