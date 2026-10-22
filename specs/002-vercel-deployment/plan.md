# Implementation Plan: Публикация AI Gate на Vercel

**Branch**: `main` | **Date**: 2026-10-22 | **Spec**: [spec.md](spec.md)

**Input**: опубликованное приложение с существующим UI/API, потоковым ответом, серверной записью в PostgreSQL и бесплатными тарифами.

## Summary

Один проект Vercel отдаёт собранный Vite-интерфейс и запускает два существующих API-маршрута как Node Functions. Серверная логика Express переиспользуется, локальный `server.ts` остаётся для разработки. PostgreSQL подключается как управляемый ресурс через Vercel Marketplace. Настройка секретов и проверка публичной ссылки выполняются без вывода значений в Git и чат.

## Technical Context

**Language/Version**: TypeScript, Node.js 24+  
**Primary Dependencies**: существующие Express 5, Vite 8, React 19, `pg` 8; новых библиотек не требуется  
**Storage**: прежняя таблица PostgreSQL `exchanges`; браузерный `localStorage`  
**Testing**: Vitest API/web, TypeScript, Vite/tsc build, локальная и опубликованная ручная приёмка  
**Target Platform**: Vercel Hobby, Node Functions с Fluid Compute, управляемая PostgreSQL Free  
**Project Type**: npm workspaces `apps/api` и `apps/web`  
**Performance Goals**: передача фрагментов ответа сразу по мере прихода от OpenRouter  
**Constraints**: OpenRouter timeout 120 секунд, секреты только на сервере, без платного тарифа  
**Scale/Scope**: демонстрация тестового задания для небольшого числа проверяющих

## Constitution Check

- **Согласованный минимальный объём**: изменения ограничены публикацией; UI и контракт ответа остаются прежними.
- **Секреты и анонимная сессия**: переменные окружения Functions, прежняя подписанная cookie, никакого ключа в Vite.
- **Тесты до реализации поведения**: существующее поведение не меняется; новые entrypoint и `vercel.json` являются адаптером/конфигурацией, поэтому проверяются сборкой и HTTP smoke test. Если потребуется изменить поведение API, сначала добавить падающий тест.
- **Понятная документация**: отдельное `docs/05-vercel-deploy.md` и Spec Kit артефакты.
- **Проверенный локальный запуск**: запустить применимые проверки и записать статусы; облачный сценарий пометить NotRun до фактической публикации.

Повторная проверка после проектирования: нарушений не выявлено; схема данных и публичный HTTP-контракт не меняются.

## Project Structure

### Documentation (this feature)

```text
specs/002-vercel-deployment/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/api.md
├── tasks.md
├── analysis.md
├── verification.md
└── checklists/requirements.md
```

### Source Code (repository root)

```text
api/
├── chat.js             # Vercel entrypoint POST /api/chat
└── session.js          # Vercel entrypoint GET /api/session
apps/api/src/
├── app.ts              # прежняя бизнес-логика Express
├── server.ts           # прежний локальный listener
└── vercel.ts           # общий экземпляр Express для Vercel
apps/web/               # без изменения поведения
vercel.json             # сборка Vite и включение собранного API в Functions
db/init.sql            # существующая схема, применяется в облачной БД
docs/05-vercel-deploy.md
```

**Structure Decision**: корневой `api/` соответствует файловым маршрутам Vercel. JS-entrypoint импортируют собранный `apps/api/dist/vercel.js`; скрипт `vercel-build` создаёт `dist` до упаковки Functions, а `includeFiles` включает его в них. `apps/api/src/server.ts` остаётся точкой локального запуска. Корневой проект Vercel собирает `apps/web/dist`.

## Phase 0: Research

Решения и альтернативы записаны в [research.md](research.md): Vite + Node Functions в одном проекте, управляемая PostgreSQL и переменные окружения. Публичный UI остаётся на том же origin, поэтому клиентские пути и cookie не меняются.

## Phase 1: Design & Contracts

- [Модель данных](data-model.md): таблица не меняется, облачная копия создаётся из `db/init.sql`.
- [Контракт API](contracts/api.md): прежние `/api/session` и `/api/chat` без изменения тела/событий.
- [Пошаговая публикация](quickstart.md): действия в Vercel, бесплатная БД, секреты, SQL, проверка.
- `AGENTS.md` ссылается на этот план.

## Test-first and verification plan

Адаптер Vercel и конфигурация не вводят новое прикладное поведение. После первого Production deployment выявлена ошибка упаковки: скомпилированная Function импортировала отсутствующий исходный `.ts` файл. Добавлена осмысленная проверка `npm run test:vercel-runtime`: она воспроизвела `ERR_MODULE_NOT_FOUND` до исправления (Red) и проверяет импорт из изолированного runtime-снимка после сборки (Green). Проверить, что `npm run typecheck --workspaces` и `npm run build --workspaces` проходят после изменений, что `api/` содержит только нужные Functions, что `vercel.json` указывает на реальный `apps/web/dist`, а `git diff --check` чист. Существующие `npm test --workspaces` запускать только против локальной тестовой PostgreSQL: интеграционные тесты пишут и удаляют строки.

Если обнаружится необходимость изменить cookie, streaming, обработку ошибки или запись в БД, сначала добавить поведенческий API-тест и получить падение именно по этому требованию (Red), затем минимально исправить код (Green) и повторить затронутые тесты после рефакторинга.

Финальная проверка: локальный прогон тестов, типизация, сборка и локальный сквозной HTTP/браузерный сценарий с PostgreSQL и настоящим OpenRouter; управляемый SSE отдельно подтверждается существующим API-тестом. Пользователь ранее просил не запускать dev-серверы за неё: дать точные команды для самостоятельного прогона, получить результат и записать его; до этого статус NotRun. После настройки Vercel — HTTP/браузерная проверка `/api/session`, части ответа до `done`, строки БД, reload и окна инкогнито. Невыполненные проверки честно помечать NotRun/Blocked в `verification.md`. Просмотреть diff и отсутствие секретов перед коммитом.
