import express from 'express';
import cookieParser from 'cookie-parser';
import { createChatHandler } from './chat.ts';
import { createPostgresSaveExchange, type SaveExchange } from './db.ts';
import { getOrCreateSessionId } from './session.ts';
import type { NextFunction, Request, Response } from 'express';

export interface AppDependencies {
  cookieSecret: string;
  apiKey?: string;
  model?: string;
  databaseUrl?: string;
  fetchImpl?: typeof fetch;
  saveExchange?: SaveExchange;
  timeoutMs?: number;
}

export function createApp(dependencies: AppDependencies) {
  if (!dependencies.cookieSecret?.trim()) {
    throw new Error('COOKIE_SECRET is required to sign anonymous sessions.');
  }

  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '8kb' }));
  app.use(cookieParser(dependencies.cookieSecret));

  app.get('/api/session', (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.json({ sessionId: getOrCreateSessionId(request, response) });
  });

  app.post('/api/chat', createChatHandler({
    apiKey: dependencies.apiKey,
    model: dependencies.model?.trim() || 'openrouter/free',
    fetchImpl: dependencies.fetchImpl ?? fetch,
    timeoutMs: dependencies.timeoutMs ?? 120_000,
    saveExchange: dependencies.saveExchange ?? (dependencies.databaseUrl?.trim()
      ? createPostgresSaveExchange(dependencies.databaseUrl)
      : undefined),
  }));

  app.use((error: unknown, _request: Request, response: Response, next: NextFunction) => {
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.too.large') {
      response.status(413).json({
        error: { code: 'PAYLOAD_TOO_LARGE', message: 'Слишком большой запрос.' },
      });
      return;
    }
    if (typeof error === 'object' && error !== null && 'type' in error && error.type === 'entity.parse.failed') {
      response.status(400).json({
        error: { code: 'INVALID_JSON', message: 'Некорректный JSON в запросе.' },
      });
      return;
    }
    next(error);
  });

  return app;
}
