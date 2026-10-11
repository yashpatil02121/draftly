import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { login, PASSWORD, setupTestApp } from './helpers.js';

let ctx: Awaited<ReturnType<typeof setupTestApp>>;
beforeAll(async () => {
  ctx = await setupTestApp();
});
afterAll(async () => {
  await ctx.app.close();
  await ctx.pool.end();
});

describe('auth', () => {
  it('logs in a seeded user and returns the current user from /me', async () => {
    const { headers } = await login(ctx.app, 'alice@example.com');
    const me = await ctx.app.inject({ method: 'GET', url: '/api/auth/me', headers });
    expect(me.statusCode).toBe(200);
    expect(me.json().user.email).toBe('alice@example.com');
    expect(me.json().user.password_hash).toBeUndefined();
  });

  it('rejects a wrong password and an unknown email with the same error', async () => {
    const bad = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'alice@example.com', password: 'nope' } });
    const unknown = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'nobody@example.com', password: PASSWORD } });
    expect(bad.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(bad.json()).toEqual(unknown.json());
  });

  it('rejects malformed login bodies with a validation error', async () => {
    const res = await ctx.app.inject({ method: 'POST', url: '/api/auth/login', payload: { email: 'not-an-email' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('requires a valid token on protected routes', async () => {
    expect((await ctx.app.inject({ method: 'GET', url: '/api/documents' })).statusCode).toBe(401);
    const forged = await ctx.app.inject({ method: 'GET', url: '/api/documents', headers: { authorization: 'Bearer abc.def.ghi' } });
    expect(forged.statusCode).toBe(401);
  });
});
