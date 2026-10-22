import { beforeEach, describe, expect, it } from 'vitest'
import { loadHistory, saveExchange } from '../src/history'
import type { Exchange } from '../src/types'

const firstSession = '8f7bf237-24c1-4a79-8c94-60f67d7784be'
const secondSession = '49be1182-ef71-4f20-9dfb-62f40920c5e2'
const exchange: Exchange = {
  id: 'f6209096-d0e4-4972-bad3-2e9a4a4da904',
  sessionId: firstSession,
  prompt: 'Привет',
  answer: 'Готовый ответ',
  createdAt: '2026-10-22T10:30:00.000Z',
}

beforeEach(() => window.localStorage.clear())

describe('локальная история', () => {
  it('сохраняет завершённую пару под ключом текущей сессии', () => {
    saveExchange(exchange)

    expect(JSON.parse(window.localStorage.getItem(`ai-gate:history:${firstSession}`) ?? 'null')).toEqual([
      {
        id: exchange.id,
        prompt: exchange.prompt,
        answer: exchange.answer,
        createdAt: exchange.createdAt,
      },
    ])
    expect(loadHistory(firstSession)).toHaveLength(1)
    expect(loadHistory(secondSession)).toEqual([])
  })

  it('читает ранее сохранённые записи после обновления страницы', () => {
    window.localStorage.setItem(`ai-gate:history:${firstSession}`, JSON.stringify([
      { id: exchange.id, prompt: exchange.prompt, answer: exchange.answer, createdAt: exchange.createdAt },
    ]))

    expect(loadHistory(firstSession)[0]?.answer).toBe('Готовый ответ')
  })

  it('не ломает интерфейс из-за повреждённого JSON', () => {
    window.localStorage.setItem(`ai-gate:history:${firstSession}`, '{broken')

    expect(loadHistory(firstSession)).toEqual([])
  })
})
