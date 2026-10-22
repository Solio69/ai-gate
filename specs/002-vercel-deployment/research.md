# Research: публикация на Vercel

## Решение 1: один проект для UI и API

**Decision**: корень репозитория — Root Directory проекта Vercel; Vite строит `apps/web/dist`, корневые `api/session.ts` и `api/chat.ts` становятся Node Functions. Существующий Express `createApp` переиспользуется.

**Rationale**: один HTTPS-origin оставляет `/api/*`, signed cookie и клиентские запросы без CORS и дополнительного прокси. Vercel официально поддерживает Functions рядом с Vite. [Vite](https://vercel.com/docs/frameworks/frontend/vite), [Node Functions](https://vercel.com/docs/functions/runtimes/node-js), [Express](https://vercel.com/docs/frameworks/backend/express).

**Alternatives considered**: два Vercel-проекта для web/API требуют маршрутизации между ними; Vercel Services поддерживают одно имя, но ещё Beta и добавляют конфигурацию. Для минимального тестового результата выбран файловый `api/`.

## Решение 2: PostgreSQL через Vercel Marketplace

**Decision**: подключить бесплатную управляемую PostgreSQL (рекомендуется Neon Free) в проекте Vercel; применить существующий `db/init.sql` в SQL Editor. Использовать предоставленный `DATABASE_URL` и встроенный pooling URL.

**Rationale**: локальный Docker недоступен удалённым Functions; собственного Vercel Postgres больше нет, Marketplace автоматически подключает переменные окружения. [Postgres](https://vercel.com/docs/postgres), [Marketplace Storage](https://vercel.com/docs/marketplace-storage), [Neon](https://vercel.com/marketplace/neon).

**Alternatives considered**: собственный сервер PostgreSQL или другой managed-provider требуют больше ручной инфраструктуры. Локальную БД оставляем для разработки.

## Решение 3: поток и время выполнения

**Decision**: оставить Express SSE `res.write`/`res.end`, не вводя другой протокол. На новом проекте проверить Fluid Compute и фактический лимит функции относительно таймаута OpenRouter 120 секунд.

**Rationale**: Vercel поддерживает поток в Node Function; Fluid Compute на Hobby допускает длительные запросы, но успешность конкретного приложения подтверждается тестовым деплоем. [Streaming](https://vercel.com/docs/functions/streaming-functions), [лимиты](https://vercel.com/docs/functions/limitations).

**Alternatives considered**: буферизация полного ответа нарушила бы согласованный streaming; отдельный backend усложнил бы деплой.

## Решение 4: секреты и бесплатные тарифы

**Decision**: `COOKIE_SECRET` и `OPENROUTER_API_KEY` вводятся в Vercel Environment Variables; `OPENROUTER_MODEL` остаётся на бесплатном маршруте `openrouter/free`; платные тарифы и автопополнение не подключать.

**Rationale**: браузер не получает секреты, отдельные окружения Vercel применяются к новым деплоям. Бесплатные тарифы имеют лимиты. [Environment Variables](https://vercel.com/docs/environment-variables), [OpenRouter Free](https://openrouter.ai/pricing/), [Vercel Hobby](https://vercel.com/docs/plans/hobby).
