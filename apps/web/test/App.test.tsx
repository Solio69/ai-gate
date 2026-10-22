import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import App from '../src/App'
import * as api from '../src/api'
import type { Exchange } from '../src/types'

vi.mock('../src/api', () => ({
  getSession: vi.fn(),
  streamChat: vi.fn(),
}))

const sessionId = '8f7bf237-24c1-4a79-8c94-60f67d7784be'

function exchange(prompt: string): Exchange {
  return {
    id: 'f6209096-d0e4-4972-bad3-2e9a4a4da904',
    sessionId,
    prompt,
    answer: 'Готовый ответ',
    createdAt: '2026-10-22T10:30:00.000Z',
  }
}

beforeEach(() => {
  window.localStorage.clear()
  vi.mocked(api.getSession).mockResolvedValue(sessionId)
  vi.mocked(api.streamChat).mockImplementation(async (prompt) => exchange(prompt))
})

afterEach(() => {
  cleanup()
})

describe('анонимная форма', () => {
  it('показывает форму без входа после получения сессии', async () => {
    render(<App />)

    expect(await screen.findByRole('textbox', { name: /запрос/i })).not.toBeNull()
    expect(screen.getByRole('button', { name: /отправить/i })).not.toBeNull()
    expect(api.getSession).toHaveBeenCalledOnce()
  })

  it('объясняет отказ для пустого запроса и не вызывает API', async () => {
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /отправить/i }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/введите запрос/i)
    expect(api.streamChat).not.toHaveBeenCalled()
  })

  it('обрезает пробелы и отправляет 500 Unicode-символов', async () => {
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    const prompt = '😀'.repeat(500)
    fireEvent.change(input, { target: { value: `  ${prompt}  ` } })
    fireEvent.click(screen.getByRole('button', { name: /отправить/i }))

    await waitFor(() => expect(api.streamChat).toHaveBeenCalledWith(prompt, expect.any(Function)))
  })

  it('отклоняет 501 Unicode-символ с объяснением', async () => {
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: '😀'.repeat(501) } })
    fireEvent.click(screen.getByRole('button', { name: /отправить/i }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/500/i)
    expect(api.streamChat).not.toHaveBeenCalled()
  })
})

describe('ответ ИИ', () => {
  it('показывает частичный текст до завершения потока', async () => {
    let finish!: (result: Exchange) => void
    vi.mocked(api.streamChat).mockImplementation((_prompt, onDelta) => {
      onDelta('Первая часть')
      return new Promise<Exchange>((resolve) => {
        finish = resolve
      })
    })
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: /отправить/i }))

    await waitFor(() => {
      expect(screen.getByRole('region', { name: /ответ ИИ/i }).textContent).toContain('Первая часть')
    })
    finish(exchange('Привет'))
    await waitFor(() => {
      expect(screen.getByRole('region', { name: /ответ ИИ/i }).textContent).toContain('Готовый ответ')
    })
  })

  it('показывает ошибку и не обозначает частичный ответ завершённым', async () => {
    vi.mocked(api.streamChat).mockImplementation(async (_prompt, onDelta) => {
      onDelta('Часть ответа')
      throw new Error('Поток оборвался.')
    })
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: /отправить/i }))

    expect((await screen.findByRole('alert')).textContent).toMatch(/Поток оборвался/i)
    expect(screen.getByRole('region', { name: /ответ ИИ/i }).textContent).toContain('Часть ответа')
  })
})

describe('история текущей сессии', () => {
  it('сохраняет пару только после done и восстанавливает её после reload', async () => {
    let finish!: (result: Exchange) => void
    vi.mocked(api.streamChat).mockImplementation(() => new Promise<Exchange>((resolve) => {
      finish = resolve
    }))
    const view = render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: /отправить/i }))

    expect(window.localStorage.getItem(`ai-gate:history:${sessionId}`)).toBeNull()
    finish(exchange('Привет'))
    await waitFor(() => {
      expect(window.localStorage.getItem(`ai-gate:history:${sessionId}`)).not.toBeNull()
    })
    view.unmount()
    render(<App />)

    const history = await screen.findByRole('complementary', { name: /история/i })
    await waitFor(() => expect(within(history).getByText('Готовый ответ')).not.toBeNull())
  })

  it('новой сессии показывает только её локальные пары', async () => {
    const newSessionId = '49be1182-ef71-4f20-9dfb-62f40920c5e2'
    window.localStorage.setItem(`ai-gate:history:${sessionId}`, JSON.stringify([
      { id: 'old', prompt: 'Старый вопрос', answer: 'Старый ответ', createdAt: '2026-10-22T10:00:00.000Z' },
    ]))
    window.localStorage.setItem(`ai-gate:history:${newSessionId}`, JSON.stringify([
      { id: 'new', prompt: 'Новый вопрос', answer: 'Новый ответ', createdAt: '2026-10-22T10:01:00.000Z' },
    ]))
    vi.mocked(api.getSession).mockResolvedValue(newSessionId)
    render(<App />)

    const history = await screen.findByRole('complementary', { name: /история/i })
    await waitFor(() => expect(within(history).getByText('Новый ответ')).not.toBeNull())
    expect(within(history).queryByText('Старый ответ')).toBeNull()
  })

  it('при ошибке не сохраняет частичный ответ как завершённый', async () => {
    vi.mocked(api.streamChat).mockImplementation(async (_prompt, onDelta) => {
      onDelta('Неполный ответ')
      throw new Error('Поток оборвался.')
    })
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: 'Привет' } })
    fireEvent.click(screen.getByRole('button', { name: /отправить/i }))

    await screen.findByRole('alert')
    expect(window.localStorage.getItem(`ai-gate:history:${sessionId}`)).toBeNull()
  })
})
