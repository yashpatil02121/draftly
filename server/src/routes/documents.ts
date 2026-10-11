import type { FastifyInstance } from 'fastify';
import type { Pool } from '../db/pool.js';
import { forbidden, HttpError, notFound } from '../errors.js';
import { importFile, MAX_IMPORT_BYTES } from '../services/importer.js';
import * as docs from '../repositories/documents.js';
import { createDocumentBody, idParams, updateDocumentBody } from '../schemas/index.js';

export function documentRoutes(pool: Pool) {
  return async (app: FastifyInstance) => {
    app.addHook('preHandler', app.authenticate);

    app.get('/api/documents', async (req) => ({ documents: await docs.listForUser(pool, req.user.sub) }));

    app.post('/api/documents', async (req, reply) => {
      const body = createDocumentBody.parse(req.body ?? {});
      const id = await docs.create(pool, req.user.sub, body);
      const document = await docs.getForUser(pool, id, req.user.sub);
      return reply.code(201).send({ document });
    });

    app.post('/api/documents/import', async (req, reply) => {
      if (!req.isMultipart()) throw new HttpError(400, 'IMPORT_FAILED', 'Send the file as multipart/form-data in a "file" field.');
      const file = await req.file();
      if (!file) throw new HttpError(400, 'IMPORT_FAILED', 'No file was uploaded.');
      let buffer: Buffer;
      try {
        buffer = await file.toBuffer();
      } catch {
        throw new HttpError(413, 'IMPORT_FAILED', `File is too large. The limit is ${MAX_IMPORT_BYTES / 1024 / 1024} MB.`);
      }
      const imported = await importFile(file.filename, buffer);
      const id = await docs.create(pool, req.user.sub, imported);
      return reply.code(201).send({ document: await docs.getForUser(pool, id, req.user.sub) });
    });

    app.get('/api/documents/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      const document = await docs.getForUser(pool, id, req.user.sub);
      if (!document) throw notFound('Document'); // 404 for both missing and inaccessible, so ids can't be probed
      return { document };
    });

    app.patch('/api/documents/:id', async (req) => {
      const { id } = idParams.parse(req.params);
      const patch = updateDocumentBody.parse(req.body);
      const existing = await docs.getForUser(pool, id, req.user.sub);
      if (!existing) throw notFound('Document');
      if (existing.role !== 'owner') throw forbidden('Only the owner can edit this document');
      await docs.updateAsOwner(pool, id, req.user.sub, patch);
      return { document: await docs.getForUser(pool, id, req.user.sub) };
    });

    app.delete('/api/documents/:id', async (req, reply) => {
      const { id } = idParams.parse(req.params);
      const existing = await docs.getForUser(pool, id, req.user.sub);
      if (!existing) throw notFound('Document');
      if (existing.role !== 'owner') throw forbidden('Only the owner can delete this document');
      await docs.deleteAsOwner(pool, id, req.user.sub);
      return reply.code(204).send();
    });
  };
}
