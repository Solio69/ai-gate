import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Server } from 'node:http';
import { createApp } from '../src/app.ts';

let server: Server;
let baseUrl: string;

beforeAll(async () => {
  const app = createApp({ cookieSecret: 'test-cookie-secret' });
  server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
});

describe('anonymous session', () => {
  it('creates a UUID and a signed, HttpOnly session cookie', async () => {
    const response = await fetch(`${baseUrl}/api/session`);
    const body = await response.json() as { sessionId: string };
    const cookie = response.headers.get('set-cookie');

    expect(response.status).toBe(200);
    expect(body.sessionId).toMatch(/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i);
    expect(cookie).toContain('ai_gate_session=s%3A');
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('reuses a valid cookie and replaces a tampered signature', async () => {
    const first = await fetch(`${baseUrl}/api/session`);
    const firstId = (await first.json() as { sessionId: string }).sessionId;
    const cookie = first.headers.get('set-cookie')?.split(';')[0];
    if (!cookie) throw new Error('Missing session cookie');

    const repeated = await fetch(`${baseUrl}/api/session`, { headers: { Cookie: cookie } });
    expect((await repeated.json() as { sessionId: string }).sessionId).toBe(firstId);
    expect(repeated.headers.get('set-cookie')).toBeNull();

    const lastChar = cookie.at(-1);
    const tampered = `${cookie.slice(0, -1)}${lastChar === 'x' ? 'y' : 'x'}`;
    const renewed = await fetch(`${baseUrl}/api/session`, { headers: { Cookie: tampered } });
    expect((await renewed.json() as { sessionId: string }).sessionId).not.toBe(firstId);
    expect(renewed.headers.get('set-cookie')).toContain('ai_gate_session=');
  });

  it('marks the cookie Secure when the request reaches the trusted HTTPS proxy', async () => {
    const response = await fetch(`${baseUrl}/api/session`, {
      headers: { 'X-Forwarded-Proto': 'https' },
    });
    expect(response.headers.get('set-cookie')).toContain('Secure');
  });
});

describe('prompt limits', () => {
  async function postPrompt(prompt: unknown) {
    return fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
  }

  it.each(['', '   ', 'a'.repeat(501), '😀'.repeat(501)])('rejects an invalid prompt', async (prompt) => {
    const response = await postPrompt(prompt);
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_PROMPT' } });
  });

  it.each(['a'.repeat(500), '😀'.repeat(500)])('accepts exactly 500 code points', async (prompt) => {
    const response = await postPrompt(prompt);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_NOT_CONFIGURED' } });
  });

  it('returns JSON 400 for malformed JSON', async () => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{"prompt":',
    });
    expect(response.status).toBe(400);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_JSON' } });
  });
});
