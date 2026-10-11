import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { Pool } from '../db/pool.js';
import { forbidden, HttpError, notFound } from '../errors.js';
import * as docs from '../repositories/documents.js';
import * as shares from '../repositories/shares.js';
import * as users from '../repositories/users.js';
import { idParams } from '../schemas/index.js';

const shareBody = z.object({ userId: z.string().uuid() });
const shareParams = z.object({ id: z.string().uuid(), userId: z.string().uuid() });

export function sharingRoutes(pool: Pool) {
  return async (app: FastifyInstance) => {
    app.addHook('preHandler', app.authenticate);

    /** Loads the document and requires the caller to own it. Non-owners can't even learn who it's shared with. */
    async function requireOwner(req: FastifyRequest, id: string) {
      const doc = await docs.getForUser(pool, id, req.user.sub);
      if (!doc) throw notFound('Document');
      if (doc.role !== 'owner') throw forbidden('Only the owner can manage sharing');
      return doc;
    }

    app.get('/api/users', async (req) => ({ users: await shares.listOtherUsers(pool, req.user.sub) }));

    app.get('/api/documents/:id/shares', async (req) => {
      const { id } = idParams.parse(req.params);
      await requireOwner(req, id);
      return { shares: await shares.listShares(pool, id) };
    });

    app.post('/api/documents/:id/shares', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const { userId } = shareBody.parse(req.body);
      await requireOwner(req, id);
      if (userId === req.user.sub) throw new HttpError(400, 'INVALID_SHARE', 'You already own this document');
      if (!(await users.findById(pool, userId))) throw notFound('User');
      await shares.addShare(pool, id, userId);
      return reply.code(201).send({ shares: await shares.listShares(pool, id) });
    });

    app.delete('/api/documents/:id/shares/:userId', async (req, reply) => {
      const { id, userId } = shareParams.parse(req.params);
      await requireOwner(req, id);
      if (!(await shares.removeShare(pool, id, userId))) throw notFound('Share');
      return reply.code(204).send();
    });
  };
}
