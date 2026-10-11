import bcrypt from 'bcryptjs';
import type { FastifyInstance } from 'fastify';
import type { Pool } from '../db/pool.js';
import { unauthorized } from '../errors.js';
import * as users from '../repositories/users.js';
import { loginBody } from '../schemas/index.js';

// Compared against when the email is unknown so response timing doesn't reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10);

export function authRoutes(pool: Pool) {
  return async (app: FastifyInstance) => {
    app.post('/api/auth/login', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req) => {
      const { email, password } = loginBody.parse(req.body);
      const user = await users.findByEmail(pool, email);
      const ok = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
      if (!user || !ok) throw unauthorized('Invalid email or password');
      const token = app.jwt.sign({ sub: user.id });
      return { token, user: { id: user.id, name: user.name, email: user.email } };
    });

    app.get('/api/auth/me', { preHandler: app.authenticate }, async (req) => {
      const user = await users.findById(pool, req.user.sub);
      if (!user) throw unauthorized('User no longer exists');
      return { user };
    });
  };
}
