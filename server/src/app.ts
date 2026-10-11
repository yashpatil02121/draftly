import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify from 'fastify';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZodError } from 'zod';
import type { Config } from './config.js';
import type { Pool } from './db/pool.js';
import { HttpError } from './errors.js';
import { registerAuth } from './plugins/auth.js';
import { authRoutes } from './routes/auth.js';
import { documentRoutes } from './routes/documents.js';
import { sharingRoutes } from './routes/sharing.js';
import { MAX_IMPORT_BYTES } from './services/importer.js';

// Built React app, served by this server in production (one deployable, no CORS needed).
const CLIENT_DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist');

export function buildApp(pool: Pool, config: Pick<Config, 'JWT_SECRET' | 'CORS_ORIGIN'>, opts: { logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 5 * 1024 * 1024, trustProxy: true });
  const serveClient = existsSync(path.join(CLIENT_DIST, 'index.html'));

  app.register(cors, { origin: config.CORS_ORIGIN.split(',').map((o) => o.trim()), methods: ['GET', 'POST', 'PATCH', 'DELETE'] });
  app.register(multipart, { limits: { fileSize: MAX_IMPORT_BYTES, files: 1 } });
  app.register(rateLimit, { global: false }); // applied per-route (login)
  registerAuth(app, config.JWT_SECRET);
  if (serveClient) app.register(fastifyStatic, { root: CLIENT_DIST, wildcard: false });

  // Consistent error shape: { error: { code, message, details? } }
  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(400).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        },
      });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: { code: err.code, message: err.message, details: err.details } });
    }
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) {
      return reply.code(status).send({ error: { code: 'BAD_REQUEST', message: (err as Error).message } });
    }
    app.log.error(err);
    return reply.code(500).send({ error: { code: 'INTERNAL', message: 'Something went wrong' } });
  });
  app.setNotFoundHandler((req, reply) => {
    // Client-side routes (e.g. /docs/:id) fall back to the SPA shell so refreshing a nested route works.
    if (serveClient && req.method === 'GET' && !req.url.startsWith('/api/')) return reply.sendFile('index.html');
    return reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found' } });
  });

  app.get('/api/health', async () => ({ status: 'ok' }));
  app.register(authRoutes(pool));
  app.register(documentRoutes(pool));
  app.register(sharingRoutes(pool));

  return app;
}
