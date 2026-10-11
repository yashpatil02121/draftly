import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, setupTestApp, share } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.app.close();
  await ctx.pool.end();
});

const richContent = {
  type: 'doc',
  content: [
    { type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] },
    {
      type: 'paragraph',
      content: [
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' and ' },
        { type: 'text', text: 'underlined', marks: [{ type: 'underline' }] },
      ],
    },
    { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'item' }] }] }] },
  ],
};

async function createDoc(headers: Record<string, string>, payload: object = {}) {
  const res = await ctx.app.inject({ method: 'POST', url: '/api/documents', headers, payload });
  return res;
}

describe('document CRUD and persistence', () => {
  it('creates a document with defaults, renames it, and round-trips rich-text JSON unchanged', async () => {
    const { headers } = await login(ctx.app, 'alice@example.com');
    const created = await createDoc(headers);
    expect(created.statusCode).toBe(201);
    const doc = created.json().document;
    expect(doc.title).toBe('Untitled document');
    expect(doc.role).toBe('owner');

    const patch = await ctx.app.inject({
      method: 'PATCH', url: `/api/documents/${doc.id}`, headers,
      payload: { title: 'Quarterly plan', content: richContent },
    });
    expect(patch.statusCode).toBe(200);

    const fetched = await ctx.app.inject({ method: 'GET', url: `/api/documents/${doc.id}`, headers });
    expect(fetched.json().document.title).toBe('Quarterly plan');
    expect(fetched.json().document.content).toEqual(richContent);
  });

  it('lists only the caller\'s documents, without content', async () => {
    const alice = await login(ctx.app, 'alice@example.com');
    const carol = await login(ctx.app, 'carol@example.com');
    await createDoc(alice.headers, { title: 'Alice list doc' });
    const list = await ctx.app.inject({ method: 'GET', url: '/api/documents', headers: carol.headers });
    expect(list.json().documents.some((d: { title: string }) => d.title === 'Alice list doc')).toBe(false);
    const aliceList = await ctx.app.inject({ method: 'GET', url: '/api/documents', headers: alice.headers });
    expect(aliceList.json().documents[0].content).toBeUndefined();
  });

  it('validates input: empty title, bad content shape, empty patch, bad id', async () => {
    const { headers } = await login(ctx.app, 'alice@example.com');
    const id = (await createDoc(headers)).json().document.id;
    const patch = (payload: object) => ctx.app.inject({ method: 'PATCH', url: `/api/documents/${id}`, headers, payload });
    expect((await patch({ title: '   ' })).statusCode).toBe(400);
    expect((await patch({ content: { type: 'paragraph' } })).statusCode).toBe(400);
    expect((await patch({})).statusCode).toBe(400);
    expect((await ctx.app.inject({ method: 'GET', url: '/api/documents/not-a-uuid', headers })).statusCode).toBe(400);
  });

  it('hides other users\' documents (404) and blocks their writes', async () => {
    const alice = await login(ctx.app, 'alice@example.com');
    const bob = await login(ctx.app, 'bob@example.com');
    const id = (await createDoc(alice.headers)).json().document.id;
    expect((await ctx.app.inject({ method: 'GET', url: `/api/documents/${id}`, headers: bob.headers })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'PATCH', url: `/api/documents/${id}`, headers: bob.headers, payload: { title: 'hijack' } })).statusCode).toBe(404);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/documents/${id}`, headers: bob.headers })).statusCode).toBe(404);
  });

  it('lets a viewer read but not edit or delete; owner can delete', async () => {
    const alice = await login(ctx.app, 'alice@example.com');
    const bob = await login(ctx.app, 'bob@example.com');
    const id = (await createDoc(alice.headers, { title: 'Shared' })).json().document.id;
    await share(ctx.pool, id, bob.user.id);

    const read = await ctx.app.inject({ method: 'GET', url: `/api/documents/${id}`, headers: bob.headers });
    expect(read.statusCode).toBe(200);
    expect(read.json().document.role).toBe('viewer');
    const bobList = await ctx.app.inject({ method: 'GET', url: '/api/documents', headers: bob.headers });
    expect(bobList.json().documents.find((d: { id: string }) => d.id === id).role).toBe('viewer');

    expect((await ctx.app.inject({ method: 'PATCH', url: `/api/documents/${id}`, headers: bob.headers, payload: { title: 'x' } })).statusCode).toBe(403);
    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/documents/${id}`, headers: bob.headers })).statusCode).toBe(403);

    expect((await ctx.app.inject({ method: 'DELETE', url: `/api/documents/${id}`, headers: alice.headers })).statusCode).toBe(204);
    expect((await ctx.app.inject({ method: 'GET', url: `/api/documents/${id}`, headers: alice.headers })).statusCode).toBe(404);
  });
});
