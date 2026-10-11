import type { Pool } from '../db/pool.js';

export type Role = 'owner' | 'viewer';

export interface DocumentSummary {
  id: string;
  title: string;
  owner_id: string;
  owner_name: string;
  role: Role;
  created_at: string;
  updated_at: string;
}

export interface DocumentRecord extends DocumentSummary {
  content: unknown;
}

const SUMMARY_COLUMNS = `d.id, d.title, d.owner_id, u.name AS owner_name, d.created_at, d.updated_at`;

/** Documents the user owns or that were shared with them (content omitted). */
export async function listForUser(pool: Pool, userId: string): Promise<DocumentSummary[]> {
  const { rows } = await pool.query<DocumentSummary>(
    `SELECT ${SUMMARY_COLUMNS},
            CASE WHEN d.owner_id = $1 THEN 'owner' ELSE s.permission END AS role
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       LEFT JOIN document_shares s ON s.document_id = d.id AND s.shared_with_user_id = $1
      WHERE d.owner_id = $1 OR s.shared_with_user_id = $1
      ORDER BY d.updated_at DESC`,
    [userId],
  );
  return rows;
}

/** Returns the document with the caller's role, or null if it doesn't exist or isn't accessible. */
export async function getForUser(pool: Pool, id: string, userId: string): Promise<DocumentRecord | null> {
  const { rows } = await pool.query<DocumentRecord>(
    `SELECT ${SUMMARY_COLUMNS}, d.content,
            CASE WHEN d.owner_id = $2 THEN 'owner' ELSE s.permission END AS role
       FROM documents d
       JOIN users u ON u.id = d.owner_id
       LEFT JOIN document_shares s ON s.document_id = d.id AND s.shared_with_user_id = $2
      WHERE d.id = $1 AND (d.owner_id = $2 OR s.shared_with_user_id = $2)`,
    [id, userId],
  );
  return rows[0] ?? null;
}

export async function create(
  pool: Pool,
  ownerId: string,
  input: { title?: string; content?: unknown },
): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO documents (owner_id, title, content)
     VALUES ($1, COALESCE($2, 'Untitled document'),
             COALESCE($3::jsonb, '{"type":"doc","content":[{"type":"paragraph"}]}'::jsonb))
     RETURNING id`,
    [ownerId, input.title ?? null, input.content === undefined ? null : JSON.stringify(input.content)],
  );
  return rows[0]!.id;
}

/** Owner-only update. Returns false if the caller doesn't own the document. */
export async function updateAsOwner(
  pool: Pool,
  id: string,
  ownerId: string,
  patch: { title?: string; content?: unknown },
): Promise<boolean> {
  const { rowCount } = await pool.query(
    `UPDATE documents
        SET title = COALESCE($3, title),
            content = COALESCE($4::jsonb, content),
            updated_at = now()
      WHERE id = $1 AND owner_id = $2`,
    [id, ownerId, patch.title ?? null, patch.content === undefined ? null : JSON.stringify(patch.content)],
  );
  return (rowCount ?? 0) > 0;
}

export async function deleteAsOwner(pool: Pool, id: string, ownerId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM documents WHERE id = $1 AND owner_id = $2', [id, ownerId]);
  return (rowCount ?? 0) > 0;
}
