# Проверка спецификации 002-vercel-deployment

Дата: 2026-10-22. Репозиторий: `D:\Pet-projects\ai-gate`, ветка `main`. Статусы ниже описывают только фактически выполненные проверки. Ключ OpenRouter и строка подключения к БД не выводились.

| Проверка | Статус | Результат |
| --- | --- | --- |
| Spec Kit: `check-prerequisites.ps1` с `SPECIFY_FEATURE=002-vercel-deployment` | Passed | Предпосылки новой спецификации доступны; работа в `main` — явное указание пользователя. |
| Read-only `$speckit-analyze`, затем отдельное сохранение `analysis.md` | Passed | После исправления замечаний итоговый отчёт: 7/7 требований и 5/5 критериев покрыты, критических несогласованностей нет. |
| `package.json` и `vercel.json` через `ConvertFrom-Json` | Passed | Vite собирает `apps/web/dist`; `vercel-build` компилирует API, `includeFiles` включает `apps/api/dist/**` в Functions. |
| `npm run typecheck --workspaces` | Passed | API и web без ошибок TypeScript. |
| `npm run build --workspaces` | Passed | API скомпилирован; Vite собрал интерфейс в `apps/web/dist`. |
| Изолированный runtime smoke до исправления (Red) | Passed | Тест без исходных `.ts` файлов завершился `ERR_MODULE_NOT_FOUND` на `apps/api/src/vercel.ts`, воспроизведя ошибку Vercel. |
| `npm run test:vercel-runtime` после исправления (Green) | Passed | `vercel-build` создал JS в `dist`; обе функции импортируются из изолированного runtime-снимка без исходного TypeScript. |
| `node --check api/session.js` и `api/chat.js` | Passed | Синтаксических ошибок в двух Vercel entrypoint нет. |
| Поиск имён `OPENROUTER_API_KEY`, `COOKIE_SECRET`, `DATABASE_URL` в `apps/web/dist` | Passed | Совпадений в клиентской сборке нет; фактические значения секретов не читались. |
| `npm test --workspaces` против локальной PostgreSQL | Passed | После исправления выполнено нами: 24 API и 23 web теста прошли. Ранее пользователь также сообщил об успешном прогоне. |
| Локальный запрос к настоящему OpenRouter и сохранение в PostgreSQL | Passed (сообщено пользователем) | Пользователь увидел ответ и выполнил SQL-запрос: последние строки в `exchanges` содержат ответы ненулевой длины (в том числе 1089 и 2403 символа). |
| Управляемый SSE в существующих API-тестах | Passed | API suite пройден после исправления; браузерный сценарий с управляемым upstream ранее записан в `docs/04-local-run.md`. Реальный облачный поток ещё не проверен. |
| Локальный reload и две независимые сессии | Passed | Управляемый локальный браузерный сценарий подтвердил reload и разные `session_id` для двух клиентов; проверка с настоящей моделью отдельно не проводилась. |
| Первый Production deployment на Vercel Hobby | Failed | Статический UI опубликовался, но `GET /api/session` вернул 500 `FUNCTION_INVOCATION_FAILED`; Runtime Logs показали `ERR_MODULE_NOT_FOUND` для `apps/api/src/vercel.ts`. |
| Повторный Production deployment с исправленной Function | Passed | После публикации `12b654d` публичный `GET /api/session` вернул 200 и ID сессии; cookie содержит `HttpOnly` и `Secure`. |
| Облачная PostgreSQL Free | Passed | По действиям пользователя: Neon Free подключён к Production, `DATABASE_URL` виден в Vercel, а Query показал таблицу `exchanges` и индекс `exchanges_session_created_id_idx`. |
| Публичный запрос после подключения Neon и повторного Production deployment | Passed | Пользователь сообщил, что открыл опубликованный сайт и получил ответ на короткий запрос без ошибки. |
| Облачная проверка `delta` до `done`, ровно одной полной строки в БД, reload и инкогнито | NotRun | Поток по частям, содержимое облачной строки, восстановление истории и отдельная сессия пока не подтверждены. |
| Ранний git diff --cached --check, просмотр staged diff и поиск секретов | Passed | Перед первым коммитом 002 проверены файлы спецификации и связанной реализации; ошибок формата и значений секретов не обнаружено. README тогда не входил в коммит. |
| Проверка документации после публикации | Passed | Проверены 18 относительных ссылок в README и связанных docs, `git diff --check` и отсутствие значений секретов в документационном diff. Прикладной код не менялся; тесты повторно не запускались. |

Коммиты `08538d5` и `12b654d` опубликованы в `origin/main`. После исправления `/api/session` ответил 200; Neon подключён, таблица и индекс созданы, пользователь подтвердил ответ в публичной версии. Поток по частям, облачная строка и история ещё ожидают отдельной приёмки. README обновлён по запросу пользователя после публикации.
