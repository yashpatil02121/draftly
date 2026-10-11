import { isDeepStrictEqual } from 'node:util';

// End-to-end smoke test against a running deployment.
// Usage: node scripts/smoke.mjs <base-url> <demo-password>
// Creates a throwaway document as Alice, exercises import + sharing + revocation, then deletes it.
const [base = 'http://localhost:3001', password = process.env.DEMO_PASSWORD] = process.argv.slice(2);
if (!password) throw new Error('Provide the demo password as the 2nd argument or DEMO_PASSWORD env var');

let failures = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : `  ${extra}`}`);
  if (!ok) failures++;
};

async function call(token, method, path, body, raw) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  if (body && !raw) headers['content-type'] = 'application/json';
  const res = await fetch(base + path, { method, headers, body: raw ? body : body && JSON.stringify(body) });
  const text = await res.text();
  return { status: res.status, json: text ? JSON.parse(text) : null };
}
const login = async (email) => {
  const r = await call(null, 'POST', '/api/auth/login', { email, password });
  if (r.status !== 200) throw new Error(`Login failed for ${email}: ${r.status}`);
  return { token: r.json.token, user: r.json.user };
};

const alice = await login('alice@example.com');
const bob = await login('bob@example.com');
check('login as alice and bob', true);

const created = await call(alice.token, 'POST', '/api/documents', { title: 'Smoke test doc' });
const id = created.json.document.id;
check('create document', created.status === 201);

const content = { type: 'doc', content: [{ type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Hi' }] }] };
check('save rich content', (await call(alice.token, 'PATCH', `/api/documents/${id}`, { title: 'Smoke renamed', content })).status === 200);
const reread = await call(alice.token, 'GET', `/api/documents/${id}`);
check('content + title persisted', reread.json.document.title === 'Smoke renamed' && isDeepStrictEqual(reread.json.document.content, content));  // structural compare: JSONB doesn't preserve key order

const form = new FormData();
form.append('file', new Blob(['# Imported\n\nSome **bold** text'], { type: 'text/markdown' }), 'smoke.md');
const imported = await fetch(`${base}/api/documents/import`, { method: 'POST', headers: { authorization: `Bearer ${alice.token}` }, body: form });
const importedJson = await imported.json();
check('import markdown', imported.status === 201 && importedJson.document.content.content[0].type === 'heading');
const badForm = new FormData();
badForm.append('file', new Blob(['x']), 'bad.exe');
check('reject unsupported file type', (await fetch(`${base}/api/documents/import`, { method: 'POST', headers: { authorization: `Bearer ${alice.token}` }, body: badForm })).status === 415);

check('bob cannot see unshared doc', (await call(bob.token, 'GET', `/api/documents/${id}`)).status === 404);
check('share with bob', (await call(alice.token, 'POST', `/api/documents/${id}/shares`, { userId: bob.user.id })).status === 201);
const bobRead = await call(bob.token, 'GET', `/api/documents/${id}`);
check('bob can read as viewer', bobRead.status === 200 && bobRead.json.document.role === 'viewer');
check('bob cannot edit (403)', (await call(bob.token, 'PATCH', `/api/documents/${id}`, { title: 'x' })).status === 403);
check('bob cannot delete (403)', (await call(bob.token, 'DELETE', `/api/documents/${id}`)).status === 403);
check('revoke access', (await call(alice.token, 'DELETE', `/api/documents/${id}/shares/${bob.user.id}`)).status === 204);
check('bob denied after revoke (404)', (await call(bob.token, 'GET', `/api/documents/${id}`)).status === 404);

await call(alice.token, 'DELETE', `/api/documents/${id}`);
await call(alice.token, 'DELETE', `/api/documents/${importedJson.document.id}`);
console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll checks passed');
process.exit(failures ? 1 : 0);
