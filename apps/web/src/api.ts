import { createParser } from 'eventsource-parser'
import type { Exchange } from './types'

export async function getSession(): Promise<string> {
  const response = await fetch('/api/session', {
    credentials: 'same-origin',
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error('Не удалось открыть анонимную сессию. Попробуйте ещё раз.')
  }

  const data: unknown = await response.json()
  if (
    typeof data !== 'object' ||
    data === null ||
    !('sessionId' in data) ||
    typeof data.sessionId !== 'string'
  ) {
    throw new Error('Сервер вернул некорректную сессию.')
  }

  return data.sessionId
}

export async function streamChat(
  prompt: string,
  onDelta: (text: string) => void,
): Promise<Exchange> {
  let response: Response
  try {
    response = await fetch('/api/chat', {
      method: 'POST',
      credentials: 'same-origin',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({ prompt }),
    })
  } catch {
    throw new Error('Не удалось соединиться с сервером. Повторите попытку.')
  }

  if (!response.ok) {
    let message = 'Не удалось обработать запрос. Повторите попытку.'
    try {
      const data: unknown = await response.json()
      if (
        typeof data === 'object' && data !== null &&
        'error' in data && typeof data.error === 'object' && data.error !== null &&
        'message' in data.error && typeof data.error.message === 'string'
      ) {
        message = data.error.message
      }
    } catch {
      // An upstream proxy may return a non-JSON error page.
    }
    throw new Error(message)
  }

  if (!response.body) {
    throw new Error('Сервер не открыл поток ответа.')
  }

  let completed: Exchange | null = null
  let streamError: string | null = null
  const parser = createParser({
    maxBufferSize: 1024 * 1024,
    onError() {
      streamError = 'Получен некорректный поток ответа.'
    },
    onEvent(event) {
      try {
        const data: unknown = JSON.parse(event.data)
        if (event.event === 'delta') {
          if (
            typeof data !== 'object' || data === null ||
            !('text' in data) || typeof data.text !== 'string'
          ) {
            throw new Error('Некорректный фрагмент ответа.')
          }
          if (data.text) onDelta(data.text)
        } else if (event.event === 'done') {
          if (
            typeof data !== 'object' || data === null ||
            !('exchange' in data) || !isExchange(data.exchange)
          ) {
            throw new Error('Некорректное завершение ответа.')
          }
          completed = data.exchange
        } else if (event.event === 'error') {
          if (
            typeof data !== 'object' || data === null ||
            !('message' in data) || typeof data.message !== 'string'
          ) {
            throw new Error('Некорректная ошибка ответа.')
          }
          streamError = data.message
        }
      } catch (error) {
        streamError = error instanceof Error ? error.message : 'Некорректный поток ответа.'
      }
    },
  })

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  try {
    while (true) {
      const part = await reader.read()
      if (part.done) {
        parser.feed(decoder.decode())
        parser.reset({ consume: true })
        break
      }
      parser.feed(decoder.decode(part.value, { stream: true }))
      if (completed || streamError) break
    }
  } catch {
    if (!streamError) streamError = 'Поток ответа прерван до завершения.'
  } finally {
    await reader.cancel().catch(() => {})
  }

  if (streamError) throw new Error(streamError)
  if (!completed) throw new Error('Поток ответа прерван до завершения.')
  return completed
}

function isExchange(value: unknown): value is Exchange {
  return (
    typeof value === 'object' && value !== null &&
    'id' in value && typeof value.id === 'string' &&
    'sessionId' in value && typeof value.sessionId === 'string' &&
    'prompt' in value && typeof value.prompt === 'string' &&
    'answer' in value && typeof value.answer === 'string' &&
    'createdAt' in value && typeof value.createdAt === 'string'
  )
}
