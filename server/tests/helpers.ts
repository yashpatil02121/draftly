import 'dotenv/config';
import { buildApp } from '../src/app.js';
import { createPool, type Pool } from '../src/db/pool.js';
import { runMigrations } from '../src/db/migrate.js';
import { seedUsers } from '../src/db/seed.js';

export const PASSWORD = 'test-pass-123';

export async function setupTestApp() {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set (see .env.example)');
  const pool = createPool(url);
  await runMigrations(pool);
  await pool.query('TRUNCATE document_shares, documents, users RESTART IDENTITY CASCADE');
  await seedUsers(pool, PASSWORD, 4);
  const app = buildApp(pool, { JWT_SECRET: 'test-secret-test-secret-test-secret-1234', CORS_ORIGIN: 'http://localhost:5173' });
  await app.ready();
  return { app, pool };
}

export async function login(app: Awaited<ReturnType<typeof setupTestApp>>['app'], email: string) {
  const res = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: PASSWORD } });
  const body = res.json();
  return { token: body.token as string, headers: { authorization: `Bearer ${body.token}` }, user: body.user };
}

export async function share(pool: Pool, documentId: string, userId: string) {
  await pool.query('INSERT INTO document_shares (document_id, shared_with_user_id) VALUES ($1, $2)', [documentId, userId]);
}
