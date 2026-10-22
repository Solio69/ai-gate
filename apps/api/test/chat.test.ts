import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { createApp, type AppDependencies } from '../src/app.ts';
import type { Exchange, NewExchange } from '../src/db.ts';

const exchangeId = '356e964b-b6a5-49bd-94e0-81183e8326c7';
const createdAt = '2026-10-22T10:30:00.000Z';
const openServers: Server[] = [];
const encoder = new TextEncoder();

afterEach(async () => {
  await Promise.all(openServers.splice(0).map((server) => new Promise<void>((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => error ? reject(error) : resolve());
  })));
});

async function startApp(dependencies: Partial<AppDependencies> = {}) {
  const app = createApp({
    cookieSecret: 'test-cookie-secret',
    apiKey: 'test-openrouter-key',
    ...dependencies,
  });
  const server = await new Promise<Server>((resolve) => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  openServers.push(server);
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Expected a TCP address');
  return `http://127.0.0.1:${address.port}`;
}

function upstreamResponse(...chunks: string[]) {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
      controller.close();
    },
  });
  return new Response(stream, {
    status: 200,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

function postChat(baseUrl: string, prompt = 'Hello') {
  return fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt }),
  });
}

function parseEvents(body: string) {
  return body.split('\n\n').filter(Boolean).map((frame) => {
    const event = frame.match(/^event: (.+)$/m)?.[1];
    const data = frame.match(/^data: (.+)$/m)?.[1];
    return { event, data: data ? JSON.parse(data) as unknown : undefined };
  });
}

describe('OpenRouter to client SSE', () => {
  it('accepts 500 code points even when JSON escaping makes the body larger than 2 KB', async () => {
    const prompt = '\u0000'.repeat(500);
    const saveExchange = vi.fn(async (exchange: NewExchange) => ({ ...exchange, id: exchangeId, createdAt }));
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(JSON.parse(String(init?.body)).messages[0].content).toBe(prompt);
      return upstreamResponse('data: {"choices":[{"delta":{"content":"ok"}}]}\n\ndata: [DONE]\n\n');
    }) as typeof fetch;
    const baseUrl = await startApp({ fetchImpl, saveExchange });

    const response = await postChat(baseUrl, prompt);
    expect(response.status).toBe(200);
    expect(parseEvents(await response.text()).at(-1)).toMatchObject({ event: 'done' });
    expect(saveExchange).toHaveBeenCalledWith(expect.objectContaining({ prompt }));
  });

  it('returns a JSON 413 for bodies beyond the request limit', async () => {
    const baseUrl = await startApp();
    const response = await postChat(baseUrl, 'x'.repeat(9000));
    expect(response.status).toBe(413);
    expect(response.headers.get('content-type')).toContain('application/json');
    expect(await response.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
  });

  it('streams split upstream frames and sends done only after persistence', async () => {
    let saveStarted!: () => void;
    const saving = new Promise<void>((resolve) => { saveStarted = resolve; });
    let releaseSave!: (exchange: Exchange) => void;
    const captured: NewExchange[] = [];
    const saveExchange = vi.fn((exchange: NewExchange) => {
      captured.push(exchange);
      saveStarted();
      return new Promise<Exchange>((resolve) => { releaseSave = resolve; });
    });
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-openrouter-key');
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: 'openrouter/free',
        stream: true,
        messages: [{ role: 'user', content: 'Hello' }],
      });
      return upstreamResponse(
        'data: {"choices":[{"delta":{"content":"Hel',
        'lo"}}]}\n\n: OPENROUTER PROCESSING\n\n',
        'data: {"choices":[{"delta":{"content":" world"}}]}\n\n',
        'data: {"choices":[{"delta":{"content":""},"finish_reason":"stop"}]}\n\n',
        'data: [DONE]\n\n',
      );
    }) as typeof fetch;
    const baseUrl = await startApp({ fetchImpl, saveExchange });

    const response = await postChat(baseUrl);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/event-stream');
    expect(response.headers.get('set-cookie')).toContain('ai_gate_session=');
    const reader = response.body?.getReader();
    if (!reader) throw new Error('Missing SSE body');
    const first = await reader.read();
    const firstText = new TextDecoder().decode(first.value);
    expect(firstText).toContain('event: delta');
    await saving;
    expect(firstText).not.toContain('event: done');
    expect(captured).toMatchObject([{ prompt: 'Hello', answer: 'Hello world' }]);

    releaseSave({ ...captured[0], id: exchangeId, createdAt });
    let body = firstText;
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      body += new TextDecoder().decode(chunk.value);
    }
    const events = parseEvents(body);
    expect(events.map(({ event }) => event)).toEqual(['delta', 'delta', 'done']);
    expect(events[0].data).toEqual({ text: 'Hello' });
    expect(events[1].data).toEqual({ text: ' world' });
    expect(events[2].data).toEqual({ exchange: { ...captured[0], id: exchangeId, createdAt } });
    expect(saveExchange).toHaveBeenCalledTimes(1);
  });

  it('returns JSON 502 before SSE when upstream rejects the request', async () => {
    const saveExchange = vi.fn();
    const fetchImpl = vi.fn(async () => new Response('{}', { status: 429 })) as typeof fetch;
    const baseUrl = await startApp({ fetchImpl, saveExchange });
    const response = await postChat(baseUrl);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } });
    expect(saveExchange).not.toHaveBeenCalled();
  });

  it.each([
    ['provider error', 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: {"error":{"message":"failed"}}\n\n', 'UPSTREAM_ERROR'],
    ['interrupted stream', 'data: {"choices":[{"delta":{"content":"partial"}}]}\n\n', 'UPSTREAM_ERROR'],
    ['empty answer', 'data: [DONE]\n\n', 'EMPTY_RESPONSE'],
  ])('emits error without saving on %s', async (_case, stream, code) => {
    const saveExchange = vi.fn();
    const fetchImpl = vi.fn(async () => upstreamResponse(stream)) as typeof fetch;
    const baseUrl = await startApp({ fetchImpl, saveExchange });
    const response = await postChat(baseUrl);
    expect(response.status).toBe(200);
    const events = parseEvents(await response.text());
    expect(events.at(-1)).toEqual({ event: 'error', data: expect.objectContaining({ code }) });
    expect(events.some(({ event }) => event === 'done')).toBe(false);
    expect(saveExchange).not.toHaveBeenCalled();
  });

  it('emits PERSISTENCE_ERROR and no done if saving fails', async () => {
    const saveExchange = vi.fn(async () => { throw new Error('database unavailable'); });
    const fetchImpl = vi.fn(async () => upstreamResponse(
      'data: {"choices":[{"delta":{"content":"complete"}}]}\n\n',
      'data: [DONE]\n\n',
    )) as typeof fetch;
    const baseUrl = await startApp({ fetchImpl, saveExchange });
    const response = await postChat(baseUrl);
    const events = parseEvents(await response.text());
    expect(events.map(({ event }) => event)).toEqual(['delta', 'error']);
    expect(events[1].data).toMatchObject({ code: 'PERSISTENCE_ERROR' });
  });

  it('returns JSON 503 when persistence is not configured', async () => {
    const fetchImpl = vi.fn(async () => upstreamResponse('data: [DONE]\n\n')) as typeof fetch;
    const baseUrl = await startApp({ fetchImpl });
    const response = await postChat(baseUrl);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { code: 'SERVICE_NOT_CONFIGURED' } });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('aborts a pending upstream request and returns JSON 502 at the deadline', async () => {
    let upstreamSignal: AbortSignal | undefined;
    const saveExchange = vi.fn();
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal as AbortSignal;
      await new Promise((resolve) => setTimeout(resolve, 200));
      return new Response('{}', { status: 429 });
    }) as typeof fetch;
    const baseUrl = await startApp({ fetchImpl, saveExchange, timeoutMs: 25 });

    const response = await postChat(baseUrl);
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ error: { code: 'UPSTREAM_ERROR' } });
    expect(upstreamSignal?.aborted).toBe(true);
    expect(saveExchange).not.toHaveBeenCalled();
  });

  it('aborts a stalled upstream stream and emits error without saving', async () => {
    let upstreamSignal: AbortSignal | undefined;
    let upstreamTimer: ReturnType<typeof setTimeout>;
    const saveExchange = vi.fn(async (exchange: NewExchange) => ({ ...exchange, id: exchangeId, createdAt }));
    const fetchImpl = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      upstreamSignal = init?.signal as AbortSignal;
      return new Response(new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'));
          upstreamTimer = setTimeout(() => {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          }, 200);
        },
        cancel() { clearTimeout(upstreamTimer); },
      }), { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
    }) as typeof fetch;
    const baseUrl = await startApp({ fetchImpl, saveExchange, timeoutMs: 25 });

    const response = await postChat(baseUrl);
    expect(response.status).toBe(200);
    const events = parseEvents(await response.text());
    expect(events.map(({ event }) => event)).toEqual(['delta', 'error']);
    expect(events[1].data).toMatchObject({ code: 'UPSTREAM_ERROR' });
    expect(upstreamSignal?.aborted).toBe(true);
    expect(saveExchange).not.toHaveBeenCalled();
  });
});
