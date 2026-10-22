import { afterEach, describe, expect, it, vi } from 'vitest'
import { streamChat } from '../src/api'
import type { Exchange } from '../src/types'

const exchange: Exchange = {
  id: 'f6209096-d0e4-4972-bad3-2e9a4a4da904',
  sessionId: '8f7bf237-24c1-4a79-8c94-60f67d7784be',
  prompt: 'Привет',
  answer: 'Привет, мир!',
  createdAt: '2026-10-22T10:30:00.000Z',
}

function sse(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function mockStream() {
  let controller: ReadableStreamDefaultController<Uint8Array>
  const stream = new ReadableStream<Uint8Array>({
    start(value) {
      controller = value
    },
  })
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    body: stream,
    headers: new Headers({ 'content-type': 'text/event-stream' }),
  } as Response))

  return {
    push(text: string) {
      controller.enqueue(new TextEncoder().encode(text))
    },
    pushBytes(bytes: Uint8Array) {
      controller.enqueue(bytes)
    },
    close() {
      controller.close()
    },
  }
}

afterEach(() => vi.unstubAllGlobals())

describe('потоковый API-клиент', () => {
  it('показывает delta до done и собирает UTF-8, разрезанный по сетевым чанкам', async () => {
    const stream = mockStream()
    const deltas: string[] = []
    const resultPromise = streamChat('Привет', (text) => deltas.push(text))
    void resultPromise.catch(() => {})
    const bytes = new TextEncoder().encode(sse('delta', { text: 'Привет, ' }))
    const emoji = new TextEncoder().encode(sse('delta', { text: 'мир! 😀' }))

    stream.pushBytes(bytes.slice(0, 9))
    stream.pushBytes(bytes.slice(9))
    stream.pushBytes(emoji.slice(0, 27))
    stream.pushBytes(emoji.slice(27))
    await vi.waitFor(() => expect(deltas).toEqual(['Привет, ', 'мир! 😀']))

    stream.push(sse('done', { exchange }))
    stream.close()
    await expect(resultPromise).resolves.toEqual(exchange)
    expect(fetch).toHaveBeenCalledWith('/api/chat', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ prompt: 'Привет' }),
      credentials: 'same-origin',
    }))
  })

  it('считает обрыв без done ошибкой', async () => {
    const stream = mockStream()
    const resultPromise = streamChat('Привет', () => {})
    stream.push(sse('delta', { text: 'Часть ответа' }))
    stream.close()

    await expect(resultPromise).rejects.toThrow(/прерван|заверш/i)
  })

  it('показывает сообщение потоковой ошибки', async () => {
    const stream = mockStream()
    const resultPromise = streamChat('Привет', () => {})
    stream.push(sse('error', { code: 'UPSTREAM_ERROR', message: 'Модель временно недоступна.' }))
    stream.close()

    await expect(resultPromise).rejects.toThrow('Модель временно недоступна.')
  })

  it('показывает JSON-ошибку до открытия потока', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      json: async () => ({ error: { code: 'INVALID_PROMPT', message: 'Слишком длинный запрос.' } }),
    } as Response))

    await expect(streamChat('Привет', () => {})).rejects.toThrow('Слишком длинный запрос.')
  })
})
