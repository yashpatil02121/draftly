import type { Pool } from '../db/pool.js';

export interface Share {
  user_id: string;
  name: string;
  email: string;
  permission: 'viewer';
  created_at: string;
}

export async function listShares(pool: Pool, documentId: string): Promise<Share[]> {
  const { rows } = await pool.query<Share>(
    `SELECT u.id AS user_id, u.name, u.email, s.permission, s.created_at
       FROM document_shares s JOIN users u ON u.id = s.shared_with_user_id
      WHERE s.document_id = $1
      ORDER BY s.created_at`,
    [documentId],
  );
  return rows;
}

/** Idempotent: sharing again with the same user is a no-op. */
export async function addShare(pool: Pool, documentId: string, userId: string): Promise<void> {
  await pool.query(
    `INSERT INTO document_shares (document_id, shared_with_user_id) VALUES ($1, $2)
     ON CONFLICT (document_id, shared_with_user_id) DO NOTHING`,
    [documentId, userId],
  );
}

export async function removeShare(pool: Pool, documentId: string, userId: string): Promise<boolean> {
  const { rowCount } = await pool.query(
    'DELETE FROM document_shares WHERE document_id = $1 AND shared_with_user_id = $2',
    [documentId, userId],
  );
  return (rowCount ?? 0) > 0;
}

/** Everyone except the caller: the demo user directory used by the share dialog. */
export async function listOtherUsers(pool: Pool, userId: string) {
  const { rows } = await pool.query<{ id: string; name: string; email: string }>(
    'SELECT id, name, email FROM users WHERE id <> $1 ORDER BY name',
    [userId],
  );
  return rows;
}
