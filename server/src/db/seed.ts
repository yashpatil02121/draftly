import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import { loadConfig } from '../config.js';
import { createPool, type Pool } from './pool.js';

export const DEMO_USERS = [
  { name: 'Alice Owner', email: 'alice@example.com' },
  { name: 'Bob Recipient', email: 'bob@example.com' },
  { name: 'Carol Reviewer', email: 'carol@example.com' },
];

/** Idempotent: inserts demo users, or resets their password if they already exist. */
export async function seedUsers(pool: Pool, password: string, bcryptCost = 10): Promise<void> {
  const hash = await bcrypt.hash(password, bcryptCost);
  for (const u of DEMO_USERS) {
    await pool.query(
      `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
       ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name, password_hash = EXCLUDED.password_hash`,
      [u.name, u.email, hash],
    );
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const config = loadConfig();
  const pool = createPool(config.DATABASE_URL, { ssl: config.DATABASE_SSL });
  seedUsers(pool, config.DEMO_PASSWORD)
    .then(() => console.log(`Seeded: ${DEMO_USERS.map((u) => u.email).join(', ')}`))
    .catch((err) => {
      console.error(err.message);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
