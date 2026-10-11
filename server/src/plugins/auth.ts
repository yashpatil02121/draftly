import fjwt from '@fastify/jwt';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { unauthorized } from '../errors.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: { sub: string };
    user: { sub: string };
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest) => Promise<void>;
  }
}

/** Registers JWT verification and an `authenticate` pre-handler. The user id always comes from the signed token. */
export function registerAuth(app: FastifyInstance, secret: string) {
  app.register(fjwt, { secret, sign: { expiresIn: '8h' } });
  app.decorate('authenticate', async (req: FastifyRequest) => {
    try {
      await req.jwtVerify();
    } catch {
      throw unauthorized('Missing or invalid token');
    }
  });
}
