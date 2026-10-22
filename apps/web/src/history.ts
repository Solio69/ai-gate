import type { Exchange, LocalExchange } from './types'

function storageKey(sessionId: string): string {
  return `ai-gate:history:${sessionId}`
}

function isLocalExchange(value: unknown): value is LocalExchange {
  return (
    typeof value === 'object' && value !== null &&
    'id' in value && typeof value.id === 'string' &&
    'prompt' in value && typeof value.prompt === 'string' &&
    'answer' in value && typeof value.answer === 'string' &&
    'createdAt' in value && typeof value.createdAt === 'string'
  )
}

export function loadHistory(sessionId: string): LocalExchange[] {
  try {
    const raw = window.localStorage.getItem(storageKey(sessionId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter(isLocalExchange) : []
  } catch {
    return []
  }
}

export function saveExchange(exchange: Exchange): void {
  const current = loadHistory(exchange.sessionId)
  if (current.some((item) => item.id === exchange.id)) return

  const entry: LocalExchange = {
    id: exchange.id,
    prompt: exchange.prompt,
    answer: exchange.answer,
    createdAt: exchange.createdAt,
  }
  window.localStorage.setItem(storageKey(exchange.sessionId), JSON.stringify([entry, ...current]))
}
