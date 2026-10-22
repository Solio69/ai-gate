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
    await waitFor(() => expect(within(history).getByText('Привет')).not.toBeNull())
    expect(within(history).queryByText('Готовый ответ')).toBeNull()
    fireEvent.click(within(history).getByRole('button', { name: 'Развернуть' }))
    expect(within(history).getByText('Готовый ответ')).not.toBeNull()
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
    await waitFor(() => expect(within(history).getByText('Новый вопрос')).not.toBeNull())
    expect(within(history).queryByText('Старый вопрос')).toBeNull()
    expect(within(history).queryByText('Новый ответ')).toBeNull()
    fireEvent.click(within(history).getByRole('button', { name: 'Развернуть' }))
    expect(within(history).getByText('Новый ответ')).not.toBeNull()
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

describe('управление формой с клавиатуры', () => {
  it('Enter отправляет один запрос и очищает поле после успешного ответа', async () => {
    let finish!: (result: Exchange) => void
    vi.mocked(api.streamChat).mockImplementation(() => new Promise<Exchange>((resolve) => {
      finish = resolve
    }))
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: 'Привет' } })

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(api.streamChat).toHaveBeenCalledOnce())
    expect((input as HTMLTextAreaElement).value).toBe('Привет')

    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    expect(api.streamChat).toHaveBeenCalledOnce()

    finish(exchange('Привет'))
    await waitFor(() => expect((input as HTMLTextAreaElement).value).toBe(''))
    expect(screen.getByRole('region', { name: /ответ ИИ/i }).textContent).toContain('Готовый ответ')
  })

  it('Shift+Enter оставляет возможность новой строки и не отправляет запрос', async () => {
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: 'Первая строка' } })

    const allowedDefault = fireEvent.keyDown(input, { key: 'Enter', code: 'Enter', shiftKey: true })

    expect(allowedDefault).toBe(true)
    expect(api.streamChat).not.toHaveBeenCalled()
  })

  it('сохраняет запрос при ошибке и новый текст, набранный во время ответа', async () => {
    vi.mocked(api.streamChat).mockRejectedValueOnce(new Error('Поток оборвался.'))
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: 'Первый вопрос' } })
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })

    await screen.findByRole('alert')
    expect((input as HTMLTextAreaElement).value).toBe('Первый вопрос')

    let finish!: (result: Exchange) => void
    vi.mocked(api.streamChat).mockImplementationOnce(() => new Promise<Exchange>((resolve) => {
      finish = resolve
    }))
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' })
    await waitFor(() => expect(api.streamChat).toHaveBeenCalledTimes(2))
    fireEvent.change(input, { target: { value: 'Следующий вопрос' } })

    finish(exchange('Первый вопрос'))
    await waitFor(() => expect(screen.getByRole('region', { name: /ответ ИИ/i }).textContent).toContain('Готовый ответ'))
    expect((input as HTMLTextAreaElement).value).toBe('Следующий вопрос')
  })
})

describe('сворачивание ответов в истории', () => {
  it('показывает только заголовок и кнопку для короткого ответа; дата видна после раскрытия', async () => {
    window.localStorage.setItem('ai-gate:history:' + sessionId, JSON.stringify([exchange('Вопрос')]))
    render(<App />)
    const history = await screen.findByRole('complementary', { name: /история/i })
    const heading = await within(history).findByRole('heading', { name: 'Вопрос' })
    const item = heading.closest('li')!
    const toggle = within(item).getByRole('button', { name: 'Развернуть' })

    expect(heading.parentElement?.contains(toggle)).toBe(true)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(item).queryByText('Готовый ответ')).toBeNull()
    expect(item.querySelector('time')).toBeNull()

    fireEvent.click(toggle)
    expect(within(item).getByText('Готовый ответ')).not.toBeNull()
    expect(item.querySelector('time')?.dateTime).toBe('2026-10-22T10:30:00.000Z')
    expect(within(item).getByRole('button', { name: 'Свернуть' }).getAttribute('aria-expanded')).toBe('true')

    fireEvent.click(within(item).getByRole('button', { name: 'Свернуть' }))
    expect(within(item).queryByText('Готовый ответ')).toBeNull()
    expect(item.querySelector('time')).toBeNull()
  })

  it('скрывает весь длинный Markdown без текстового фрагмента и снова сворачивает после reload', async () => {
    const longAnswer = '### Архивный ответ\n\n' + 'текст '.repeat(40) + '\n\n**Конец**'
    window.localStorage.setItem('ai-gate:history:' + sessionId, JSON.stringify([
      { ...exchange('Длинный вопрос'), answer: longAnswer },
    ]))
    const view = render(<App />)
    const history = await screen.findByRole('complementary', { name: /история/i })
    const prompt = await within(history).findByRole('heading', { name: 'Длинный вопрос' })
    const item = prompt.closest('li')!

    expect(item.textContent).not.toContain('Архивный ответ')
    expect(item.textContent).not.toContain('###')
    expect(item.querySelector('time')).toBeNull()
    fireEvent.click(within(item).getByRole('button', { name: 'Развернуть' }))
    expect(within(item).getByRole('heading', { name: 'Архивный ответ' }).tagName).toBe('H3')
    expect(within(item).getByText('Конец').tagName).toBe('STRONG')
    expect(item.textContent).toContain('текст')
    expect(item.querySelector('time')).not.toBeNull()

    view.unmount()
    render(<App />)
    const restoredHistory = await screen.findByRole('complementary', { name: /история/i })
    const restoredPrompt = await within(restoredHistory).findByRole('heading', { name: 'Длинный вопрос' })
    const restoredItem = restoredPrompt.closest('li')!
    expect(within(restoredItem).getByRole('button', { name: 'Развернуть' }).getAttribute('aria-expanded')).toBe('false')
    expect(restoredItem.textContent).not.toContain('Архивный ответ')
    expect(restoredItem.querySelector('time')).toBeNull()
  })

  it('раскрывает две карточки независимо', async () => {
    window.localStorage.setItem('ai-gate:history:' + sessionId, JSON.stringify([
      { ...exchange('Первый вопрос'), answer: 'Первый ответ' },
      { ...exchange('Второй вопрос'), id: 'f4e5843b-e52d-4c2b-91c0-8a4dcfd28842', answer: 'Второй ответ' },
    ]))
    render(<App />)
    const history = await screen.findByRole('complementary', { name: /история/i })
    const first = (await within(history).findByRole('heading', { name: 'Первый вопрос' })).closest('li')!
    const second = within(history).getByRole('heading', { name: 'Второй вопрос' }).closest('li')!

    fireEvent.click(within(first).getByRole('button', { name: 'Развернуть' }))
    expect(within(first).getByText('Первый ответ')).not.toBeNull()
    expect(within(second).queryByText('Второй ответ')).toBeNull()
    expect(within(second).getByRole('button', { name: 'Развернуть' }).getAttribute('aria-expanded')).toBe('false')

    fireEvent.click(within(second).getByRole('button', { name: 'Развернуть' }))
    fireEvent.click(within(first).getByRole('button', { name: 'Свернуть' }))
    expect(within(first).queryByText('Первый ответ')).toBeNull()
    expect(within(second).getByText('Второй ответ')).not.toBeNull()
  })
})

describe('Markdown в ответе', () => {
  it('показывает разметку текущего ответа и не создаёт HTML-элемент из сырого текста', async () => {
    vi.mocked(api.streamChat).mockImplementation(async (prompt) => ({
      ...exchange(prompt),
      answer: '**Жирный** и [ссылка](https://example.com)' + '\n\n' + '- пункт' + '\n\n' + '<img src=x onerror=alert(1)>',
    }))
    render(<App />)
    const input = await screen.findByRole('textbox', { name: /запрос/i })
    fireEvent.change(input, { target: { value: 'Вопрос' } })
    fireEvent.click(screen.getByRole('button', { name: /отправить/i }))

    const response = await screen.findByRole('region', { name: /ответ ИИ/i })
    await waitFor(() => expect(within(response).getByText('Жирный').tagName).toBe('STRONG'))
    expect(within(response).getByRole('link', { name: 'ссылка' }).getAttribute('href')).toBe('https://example.com')
    expect(response.querySelector('li')?.textContent).toBe('пункт')
    expect(response.querySelector('img')).toBeNull()
  })

  it('форматирует полный ответ истории после раскрытия', async () => {
    const longAnswer = '**Архив** ' + 'текст '.repeat(40)
    window.localStorage.setItem('ai-gate:history:' + sessionId, JSON.stringify([
      { ...exchange('Вопрос'), answer: longAnswer },
    ]))
    render(<App />)
    const history = await screen.findByRole('complementary', { name: /история/i })
    fireEvent.click(await within(history).findByRole('button', { name: 'Развернуть' }))

    expect(within(history).getByText('Архив').tagName).toBe('STRONG')
    expect(within(history).getByText('Архив').closest('p')?.textContent).toContain('текст')
  })
})