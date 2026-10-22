import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { existsSync } from 'node:fs';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { createApp } from '../src/app.ts';

const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));
if (!process.env.DATABASE_URL && existsSync(envPath)) process.loadEnvFile(envPath);
const databaseUrl = process.env.DATABASE_URL;
const { Pool } = pg;
const encoder = new TextEncoder();
const servers: Server[] = [];
const ownedSessionIds: string[] = [];
let pool: pg.Pool;

function upstreamResponse(body: string) {
  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(body));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
}

async function startApp(fetchImpl: typeof fetch, connectionString = databaseUrl) {
  const app = createApp({
    cookieSecret: 'integration-test-cookie-secret',
    apiKey: 'fake-key',
    databaseUrl: connectionString,
    fetchImpl,
  });
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  return `http://127.0.0.1:${address.port}`;
}

async function createSession(baseUrl: string) {
  const response = await fetch(`${baseUrl}/api/session`);
  const { sessionId } = await response.json() as { sessionId: string };
  const cookie = response.headers.get('set-cookie')?.split(';')[0];
  if (!cookie) throw new Error('Missing signed session cookie');
  ownedSessionIds.push(sessionId);
  return { sessionId, cookie };
}

async function sendPrompt(baseUrl: string, cookie: string, prompt: string) {
  return fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({ prompt, sessionId: '00000000-0000-4000-8000-000000000000' }),
  });
}

describe.skipIf(!databaseUrl)('PostgreSQL exchanges', () => {
  beforeAll(async () => {
    pool = new Pool({ connectionString: databaseUrl });
    // Fail setup explicitly if PostgreSQL or the schema is unavailable; that is not a behavioral Red.
    await pool.query('SELECT 1 FROM exchanges LIMIT 0');
  });

  afterAll(async () => {
    await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
      server.closeAllConnections();
      server.close((error) => error ? reject(error) : resolve());
    })));
    if (ownedSessionIds.length > 0) {
      await pool.query('DELETE FROM exchanges WHERE session_id = ANY($1::uuid[])', [ownedSessionIds]);
    }
    await pool.end();
  });

  it('inserts one complete row for each of two anonymous sessions', async () => {
    const fetchImpl = vi.fn(async () => upstreamResponse(
      'data: {"choices":[{"delta":{"content":"complete answer"}}]}\n\ndata: [DONE]\n\n',
    )) as typeof fetch;
    const baseUrl = await startApp(fetchImpl);
    const first = await createSession(baseUrl);
    const second = await createSession(baseUrl);
    expect(first.sessionId).not.toBe(second.sessionId);

    for (const [session, prompt] of [[first, 'question one'], [second, 'question two']] as const) {
      const response = await sendPrompt(baseUrl, session.cookie, prompt);
      expect(response.status).toBe(200);
      const body = await response.text();
      const data = body.match(/event: done\ndata: (.+)\n\n/)?.[1];
      expect(data, body).toBeDefined();
      const exchange = (JSON.parse(data!) as { exchange: {
        id: string; sessionId: string; prompt: string; answer: string; createdAt: string;
      } }).exchange;
      expect(exchange).toMatchObject({ sessionId: session.sessionId, prompt, answer: 'complete answer' });
      expect(Number.isNaN(Date.parse(exchange.createdAt))).toBe(false);
      const rows = await pool.query(
        'SELECT id, session_id, prompt, answer FROM exchanges WHERE session_id = $1',
        [session.sessionId],
      );
      expect(rows.rows).toHaveLength(1);
      expect(rows.rows[0]).toMatchObject({
        id: exchange.id, session_id: session.sessionId, prompt, answer: 'complete answer',
      });
    }
  });

  it('does not insert a partial answer if upstream closes without [DONE]', async () => {
    const fetchImpl = vi.fn(async () => upstreamResponse(
      'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n',
    )) as typeof fetch;
    const baseUrl = await startApp(fetchImpl);
    const session = await createSession(baseUrl);
    const response = await sendPrompt(baseUrl, session.cookie, 'interrupted request');
    const body = await response.text();
    expect(body).toContain('event: error');
    expect(body).not.toContain('event: done');
    const rows = await pool.query('SELECT id FROM exchanges WHERE session_id = $1', [session.sessionId]);
    expect(rows.rows).toHaveLength(0);
  });

  it('emits an error without a done event when PostgreSQL rejects a write', async () => {
    const readOnlyUrl = new URL(databaseUrl!);
    readOnlyUrl.searchParams.set('options', '-c default_transaction_read_only=on');
    const fetchImpl = vi.fn(async () => upstreamResponse(
      'data: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: [DONE]\n\n',
    )) as typeof fetch;
    const baseUrl = await startApp(fetchImpl, readOnlyUrl.toString());
    const session = await createSession(baseUrl);
    const response = await sendPrompt(baseUrl, session.cookie, 'read only request');
    const body = await response.text();
    expect(body).toContain('event: error');
    expect(body).toContain('"code":"PERSISTENCE_ERROR"');
    expect(body).not.toContain('event: done');
    const rows = await pool.query('SELECT id FROM exchanges WHERE session_id = $1', [session.sessionId]);
    expect(rows.rows).toHaveLength(0);
  });
});
