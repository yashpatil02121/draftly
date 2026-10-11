import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, setupTestApp } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
type Session = Awaited<ReturnType<typeof login>>;
let alice: Session, bob: Session, carol: Session;

beforeAll(async () => {
  ctx = await setupTestApp();
  alice = await login(ctx.app, 'alice@example.com');
  bob = await login(ctx.app, 'bob@example.com');
  carol = await login(ctx.app, 'carol@example.com');
});
afterAll(async () => {
  await ctx.app.close();
  await ctx.pool.end();
});

const call = (s: Session, method: 'GET' | 'POST' | 'PATCH' | 'DELETE', url: string, payload?: object) =>
  ctx.app.inject({ method, url, headers: s.headers, payload });

async function newDoc(title = 'Shared doc') {
  return (await call(alice, 'POST', '/api/documents', { title })).json().document.id as string;
}

describe('sharing and authorization', () => {
  it('full lifecycle: share -> recipient reads -> cannot write -> revoke -> access denied', async () => {
    const id = await newDoc();

    // Before sharing: invisible to Bob.
    expect((await call(bob, 'GET', `/api/documents/${id}`)).statusCode).toBe(404);

    // Owner shares.
    const shared = await call(alice, 'POST', `/api/documents/${id}/shares`, { userId: bob.user.id });
    expect(shared.statusCode).toBe(201);
    expect(shared.json().shares.map((s: { email: string }) => s.email)).toEqual(['bob@example.com']);

    // Bob sees it listed as shared (viewer) and can read it.
    const list = (await call(bob, 'GET', '/api/documents')).json().documents;
    expect(list.find((d: { id: string }) => d.id === id)).toMatchObject({ role: 'viewer', owner_name: 'Alice Owner' });
    const read = await call(bob, 'GET', `/api/documents/${id}`);
    expect(read.statusCode).toBe(200);
    expect(read.json().document.role).toBe('viewer');

    // Bob cannot edit, rename, delete, or manage sharing.
    expect((await call(bob, 'PATCH', `/api/documents/${id}`, { title: 'hacked' })).statusCode).toBe(403);
    expect((await call(bob, 'PATCH', `/api/documents/${id}`, { content: { type: 'doc', content: [] } })).statusCode).toBe(403);
    expect((await call(bob, 'DELETE', `/api/documents/${id}`)).statusCode).toBe(403);
    expect((await call(bob, 'GET', `/api/documents/${id}/shares`)).statusCode).toBe(403);
    expect((await call(bob, 'POST', `/api/documents/${id}/shares`, { userId: carol.user.id })).statusCode).toBe(403);
    expect((await call(bob, 'DELETE', `/api/documents/${id}/shares/${bob.user.id}`)).statusCode).toBe(403);
    expect((await call(alice, 'GET', `/api/documents/${id}`)).json().document.title).toBe('Shared doc');

    // Carol never got access.
    expect((await call(carol, 'GET', `/api/documents/${id}`)).statusCode).toBe(404);

    // Owner revokes; Bob immediately loses access.
    expect((await call(alice, 'DELETE', `/api/documents/${id}/shares/${bob.user.id}`)).statusCode).toBe(204);
    expect((await call(bob, 'GET', `/api/documents/${id}`)).statusCode).toBe(404);
    const after = (await call(bob, 'GET', '/api/documents')).json().documents;
    expect(after.some((d: { id: string }) => d.id === id)).toBe(false);
  });

  it('sharing is idempotent and the owner can list current shares', async () => {
    const id = await newDoc();
    await call(alice, 'POST', `/api/documents/${id}/shares`, { userId: bob.user.id });
    await call(alice, 'POST', `/api/documents/${id}/shares`, { userId: bob.user.id });
    const shares = (await call(alice, 'GET', `/api/documents/${id}/shares`)).json().shares;
    expect(shares).toHaveLength(1);
  });

  it('validates share requests', async () => {
    const id = await newDoc();
    expect((await call(alice, 'POST', `/api/documents/${id}/shares`, { userId: alice.user.id })).statusCode).toBe(400); // self
    expect((await call(alice, 'POST', `/api/documents/${id}/shares`, { userId: 'nope' })).statusCode).toBe(400);
    expect((await call(alice, 'POST', `/api/documents/${id}/shares`, { userId: '00000000-0000-4000-8000-000000000000' })).statusCode).toBe(404);
    expect((await call(alice, 'DELETE', `/api/documents/${id}/shares/${carol.user.id}`)).statusCode).toBe(404); // never shared
    expect((await call(carol, 'POST', `/api/documents/${id}/shares`, { userId: bob.user.id })).statusCode).toBe(404); // not even visible
  });

  it('deleting a document removes its shares and the directory excludes the caller', async () => {
    const id = await newDoc();
    await call(alice, 'POST', `/api/documents/${id}/shares`, { userId: bob.user.id });
    await call(alice, 'DELETE', `/api/documents/${id}`);
    expect((await call(bob, 'GET', `/api/documents/${id}`)).statusCode).toBe(404);
    const { rows } = await ctx.pool.query('SELECT 1 FROM document_shares WHERE document_id = $1', [id]);
    expect(rows).toHaveLength(0);

    const dir = (await call(alice, 'GET', '/api/users')).json().users;
    expect(dir.map((u: { email: string }) => u.email).sort()).toEqual(['bob@example.com', 'carol@example.com']);
    expect(dir[0].password_hash).toBeUndefined();
  });
});
