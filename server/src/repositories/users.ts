import type { Pool } from '../db/pool.js';

export interface User {
  id: string;
  name: string;
  email: string;
}

export interface UserWithHash extends User {
  password_hash: string;
}

export async function findByEmail(pool: Pool, email: string): Promise<UserWithHash | null> {
  const { rows } = await pool.query<UserWithHash>(
    'SELECT id, name, email, password_hash FROM users WHERE email = $1',
    [email],
  );
  return rows[0] ?? null;
}

export async function findById(pool: Pool, id: string): Promise<User | null> {
  const { rows } = await pool.query<User>('SELECT id, name, email FROM users WHERE id = $1', [id]);
  return rows[0] ?? null;
}
