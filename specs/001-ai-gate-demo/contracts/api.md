# HTTP API и потоковые события

Базовый адрес при локальной разработке: браузер обращается к `/api` на адресе Vite; dev proxy передаёт запросы Express API. Cookie отправляется браузером автоматически. Все JSON-ответы имеют `Content-Type: application/json; charset=utf-8`.

## `GET /api/session`

**Назначение:** получить или восстановить анонимную сессию до чтения локальной истории. Регистрация не требуется.

- При отсутствии, повреждении или истечении cookie сервер создаёт новый случайный UUID и отправляет подписанную cookie `ai_gate_session` с `HttpOnly`, `SameSite=Lax`, `Path=/`; при HTTPS также `Secure`.
- Корректная cookie сохраняет прежний ID после обновления страницы.
- Ответ `200 OK`, `Cache-Control: no-store`:

```json
{"sessionId":"8f7bf237-24c1-4a79-8c94-60f67d7784be"}
```

`sessionId` нужен для ключа `localStorage`. Сам по себе он не является подтверждением права на серверную сессию: сервер проверяет подпись cookie.

## `POST /api/chat`

**Тело запроса:**

```json
{"prompt":"Предложи три идеи для поста"}
```

Сервер обрезает пробелы по краям и принимает от 1 до 500 Unicode code points. Поле `sessionId` в теле не используется. При отсутствии действительной cookie сервер создаёт новую так же, как в `GET /api/session`.

### Успешный поток

Ответ: `200 OK`, `Content-Type: text/event-stream; charset=utf-8`, `Cache-Control: no-cache`. Тело содержит SSE-события в UTF-8; каждое событие отделено пустой строкой.

```text
event: delta
data: {"text":"Первая "}

event: delta
data: {"text":"идея..."}

event: done
data: {"exchange":{"id":"f6209096-d0e4-4972-bad3-2e9a4a4da904","sessionId":"8f7bf237-24c1-4a79-8c94-60f67d7784be","prompt":"Предложи три идеи для поста","answer":"Первая идея...","createdAt":"2026-10-22T10:30:00.000Z"}}

```

`delta` появляется по мере получения текста от OpenRouter. `done` отправляется **один раз и только после успешной записи полной пары в PostgreSQL**. Клиент добавляет запись в `localStorage` только после `done` и под ключом указанного `sessionId`. Пустые чанки не создают событий `delta`.

### Ошибки

До открытия SSE-потока сервер может ответить JSON:

| HTTP | `code` | Условие |
|---|---|---|
| `400` | `INVALID_PROMPT` | Пустой запрос или длина больше 500 символов |
| `400` | `INVALID_JSON` | Некорректный JSON в теле запроса |
| `413` | `PAYLOAD_TOO_LARGE` | Размер тела JSON больше 8 КБ |
| `503` | `SERVICE_NOT_CONFIGURED` | Нет обязательных серверных переменных окружения |
| `502` | `UPSTREAM_ERROR` | OpenRouter отклонил запрос или не ответил за 120 секунд до открытия потока |

Формат JSON-ошибки:

```json
{"error":{"code":"INVALID_PROMPT","message":"Введите запрос длиной от 1 до 500 символов."}}
```

После открытия SSE-потока HTTP-статус уже не меняется. При ошибке сервер отправляет одно завершающее событие:

```text
event: error
data: {"code":"PERSISTENCE_ERROR","message":"Не удалось сохранить ответ. Повторите попытку."}

```

Допустимые коды потоковой ошибки: `UPSTREAM_ERROR`, `EMPTY_RESPONSE`, `PERSISTENCE_ERROR`. Текст, полученный до `error`, может оставаться на экране с отметкой о сбое, но не попадает в завершённую историю. При обрыве соединения без `done` клиент также считает запрос неуспешным. Ожидание OpenRouter ограничено 120 секундами на весь вызов и поток; истечение срока после открытия потока даёт `UPSTREAM_ERROR`.

## Вызов OpenRouter из API

API вызывает `POST https://openrouter.ai/api/v1/chat/completions` с серверным заголовком `Authorization: Bearer <OPENROUTER_API_KEY>` и телом вида:

```json
{"model":"openrouter/free","stream":true,"messages":[{"role":"user","content":"Предложи три идеи для поста"}]}
```

Модель берётся из `OPENROUTER_MODEL`, если значение задано. Прошлая история модели не передаётся: согласовано только её хранение и показ. Сервер разбирает upstream SSE через `eventsource-parser`, берёт текстовые `choices[0].delta.content` и отправляет клиенту собственный стабильный контракт `delta` / `done` / `error`. Источник: [OpenRouter Chat Completions API](https://openrouter.ai/docs/api/api-reference/chat/send-chat-completion-request).
