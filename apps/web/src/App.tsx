import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { getSession, streamChat } from './api'
import { loadHistory, saveExchange } from './history'
import type { LocalExchange } from './types'

function countCodePoints(value: string): number {
  return Array.from(value.trim()).length
}

function HistoryItem({ item }: { item: LocalExchange }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li className="history-item">
      <div className="history-item-heading">
        <h3 className="history-prompt">{item.prompt}</h3>
        <button
          type="button"
          className="history-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Свернуть' : 'Развернуть'}
        </button>
      </div>
      {expanded && (
        <>
          <div className="history-answer markdown-body">
            <ReactMarkdown skipHtml>{item.answer}</ReactMarkdown>
          </div>
          <time dateTime={item.createdAt}>
            {new Date(item.createdAt).toLocaleString('ru-RU')}
          </time>
        </>
      )}
    </li>
  )
}

export default function App() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [prompt, setPrompt] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [answer, setAnswer] = useState('')
  const [isSending, setIsSending] = useState(false)
  const sendingRef = useRef(false)
  const [history, setHistory] = useState<LocalExchange[]>([])

  useEffect(() => {
    let active = true

    getSession().then(
      (id) => {
        if (active) {
          setSessionId(id)
          setHistory(loadHistory(id))
        }
      },
      (error: unknown) => {
        if (active) {
          setSessionError(error instanceof Error ? error.message : 'Не удалось открыть сессию.')
        }
      },
    )

    return () => {
      active = false
    }
  }, [])

  const promptLength = countCodePoints(prompt)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sendingRef.current) return
    const normalizedPrompt = prompt.trim()
    const length = countCodePoints(normalizedPrompt)

    if (length === 0) {
      setValidationError('Введите запрос перед отправкой.')
      return
    }
    if (length > 500) {
      setValidationError('Запрос должен содержать не более 500 символов.')
      return
    }
    if (!sessionId) return

    sendingRef.current = true
    setValidationError(null)
    setRequestError(null)
    setAnswer('')
    setIsSending(true)

    try {
      const result = await streamChat(normalizedPrompt, (text) => {
        setAnswer((current) => current + text)
      })
      setAnswer(result.answer)
      setPrompt((current) => current === prompt ? '' : current)
      if (result.sessionId !== sessionId) setSessionId(result.sessionId)
      try {
        saveExchange(result)
        setHistory(loadHistory(result.sessionId))
      } catch {
        setRequestError('Ответ получен, но не удалось сохранить локальную историю.')
      }
    } catch (error) {
      setRequestError(error instanceof Error ? error.message : 'Не удалось получить ответ.')
    } finally {
      sendingRef.current = false
      setIsSending(false)
    }
  }

  function handlePromptKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (!sendingRef.current) event.currentTarget.form?.requestSubmit()
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="eyebrow">Минимальный AI-гейт</p>
          <h1>AI Gate</h1>
          <p className="app-intro">Задайте вопрос без регистрации и следите за ответом в реальном времени.</p>
        </div>
        <span className="session-badge">Анонимная сессия</span>
      </header>
      {sessionError && <p role="alert">{sessionError}</p>}
      {!sessionId && !sessionError && <p role="status">Открываем анонимную сессию…</p>}
      {sessionId && (
        <div className="workspace">
          <div className="chat-panel">
            <form onSubmit={handleSubmit} className="prompt-form">
              <label htmlFor="prompt">Ваш запрос</label>
              <p className="field-hint">Один короткий вопрос — до 500 символов. Enter — отправить, Shift+Enter — новая строка.</p>
              <textarea
                id="prompt"
                value={prompt}
                onKeyDown={handlePromptKeyDown}
                onChange={(event) => {
                  setPrompt(event.target.value)
                  setValidationError(null)
                }}
                aria-invalid={validationError !== null}
                placeholder="Например: предложи три идеи для поста"
                rows={5}
              />
              <div className="form-footer">
                <p className={promptLength > 500 ? 'character-count over-limit' : 'character-count'} aria-live="polite">
                  {promptLength} из 500 символов
                </p>
                <button type="submit" disabled={isSending}>
                  {isSending ? 'Генерируется…' : 'Отправить'}
                </button>
              </div>
              {validationError && <p role="alert" className="error-message">{validationError}</p>}
            </form>

            <div className="response-panel">
              <div className="response-heading">
                <h2>Ответ ИИ</h2>
                {isSending && <span className="streaming-badge">Поступает ответ</span>}
              </div>
              {requestError && <p role="alert" className="error-message">{requestError}</p>}
              {answer ? (
                <section aria-label="Ответ ИИ" aria-live="polite" className="response-text markdown-body">
                  <ReactMarkdown skipHtml>{answer}</ReactMarkdown>
                </section>
              ) : (
                <p className="response-placeholder">
                  {isSending ? 'Ожидаем первый фрагмент ответа…' : 'Здесь появится ответ на ваш запрос.'}
                </p>
              )}
            </div>
          </div>

          <aside aria-label="История" className="history-panel">
            <div className="history-heading">
              <h2>История</h2>
              <span>{history.length}</span>
            </div>
            <p className="history-hint">Завершённые ответы этой сессии хранятся в вашем браузере.</p>
            {history.length === 0 ? (
              <p className="history-empty">Пока нет завершённых запросов.</p>
            ) : (
              <ul className="history-list">
                {history.map((item) => <HistoryItem key={item.id} item={item} />)}
              </ul>
            )}
          </aside>
        </div>
      )}
    </main>
  )
}
