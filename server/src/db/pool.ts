import pg from 'pg';

export type Pool = pg.Pool;

export function createPool(connectionString: string, opts: { ssl?: boolean } = {}): Pool {
  return new pg.Pool({ connectionString, max: 10, ssl: opts.ssl ? { rejectUnauthorized: false } : undefined });
}
