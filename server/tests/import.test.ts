import { readFile } from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, setupTestApp } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
let headers: Record<string, string>;
beforeAll(async () => {
  ctx = await setupTestApp();
  headers = (await login(ctx.app, 'alice@example.com')).headers;
});
afterAll(async () => {
  await ctx.app.close();
  await ctx.pool.end();
});

function upload(filename: string, data: Buffer | string) {
  const boundary = '----draftlytest';
  const body = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/octet-stream\r\n\r\n`),
    Buffer.isBuffer(data) ? data : Buffer.from(data),
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return ctx.app.inject({
    method: 'POST',
    url: '/api/documents/import',
    headers: { ...headers, 'content-type': `multipart/form-data; boundary=${boundary}` },
    payload: body,
  });
}

const nodeTypes = (doc: { content: { type: string }[] }) => doc.content.map((n) => n.type);
const marksOf = (doc: unknown) => JSON.stringify(doc).match(/"type":"(bold|italic|underline)"/g) ?? [];

describe('file import', () => {
  it('imports .txt into paragraphs and persists it as an editable document', async () => {
    const res = await upload('notes.txt', 'First paragraph\n\nSecond <b>paragraph</b>');
    expect(res.statusCode).toBe(201);
    const doc = res.json().document;
    expect(doc.title).toBe('notes');
    expect(doc.role).toBe('owner');
    expect(nodeTypes(doc.content)).toEqual(['paragraph', 'paragraph']);
    expect(JSON.stringify(doc.content)).toContain('Second <b>paragraph</b>'); // escaped, not parsed as HTML

    const fetched = await ctx.app.inject({ method: 'GET', url: `/api/documents/${doc.id}`, headers });
    expect(fetched.json().document.content).toEqual(doc.content);
  });

  it('imports Markdown formatting (headings, bold, italic, lists) instead of raw text', async () => {
    const res = await upload('readme.md', '# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\n1. a\n2. b\n');
    expect(res.statusCode).toBe(201);
    const { content } = res.json().document;
    expect(nodeTypes(content)).toEqual(['heading', 'paragraph', 'bulletList', 'orderedList']);
    expect(content.content[0].attrs.level).toBe(1);
    expect(marksOf(content)).toEqual(['"type":"bold"', '"type":"italic"']);
    expect(JSON.stringify(content)).not.toContain('**');
  });

  it('strips scripts from Markdown/HTML input', async () => {
    const res = await upload('x.md', 'Hello\n\n<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>');
    expect(res.statusCode).toBe(201);
    expect(JSON.stringify(res.json().document.content)).not.toMatch(/script|onerror/);
  });

  it('imports .docx headings and inline formatting', async () => {
    const res = await upload('report.docx', await readFile(new URL('./fixtures/sample.docx', import.meta.url)));
    expect(res.statusCode).toBe(201);
    const { content, title } = res.json().document;
    expect(title).toBe('report');
    expect(nodeTypes(content)).toEqual(['heading', 'paragraph']);
    expect(marksOf(content)).toEqual(['"type":"bold"', '"type":"italic"']);
  });

  it('rejects unsupported types, empty files, binary text and fake docx with clear errors', async () => {
    const unsupported = await upload('image.png', 'data');
    expect(unsupported.statusCode).toBe(415);
    expect(unsupported.json().error.message).toMatch(/Supported types/);

    expect((await upload('empty.txt', '')).statusCode).toBe(400);
    expect((await upload('blank.txt', '  \n\n  ')).statusCode).toBe(400);
    expect((await upload('bin.txt', Buffer.from([0x68, 0x00, 0x69]))).statusCode).toBe(400);

    const fake = await upload('fake.docx', 'this is not a zip');
    expect(fake.statusCode).toBe(400);
    expect(fake.json().error.code).toBe('IMPORT_FAILED');

    const corrupt = await upload('corrupt.docx', Buffer.from('PK\x03\x04garbage-not-really-a-zip'));
    expect(corrupt.statusCode).toBe(400);
  });

  it('rejects requests without a file and unauthenticated uploads', async () => {
    const none = await ctx.app.inject({ method: 'POST', url: '/api/documents/import', headers, payload: {} });
    expect(none.statusCode).toBe(400);
    const anon = await ctx.app.inject({ method: 'POST', url: '/api/documents/import' });
    expect(anon.statusCode).toBe(401);
  });

  it('rejects files over the size limit', async () => {
    const res = await upload('big.txt', Buffer.alloc(5 * 1024 * 1024 + 10, 'a'));
    expect(res.statusCode).toBe(413);
  });
});
