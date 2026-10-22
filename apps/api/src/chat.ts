import type { RequestHandler } from 'express';
import type { SaveExchange } from './db.ts';
import { getOrCreateSessionId } from './session.ts';
import { readOpenRouterDeltas, requestOpenRouter } from './openrouter.ts';

export interface ChatDependencies {
  apiKey?: string;
  model: string;
  fetchImpl: typeof fetch;
  saveExchange?: SaveExchange;
  timeoutMs: number;
}

export function createChatHandler(dependencies: ChatDependencies): RequestHandler {
  return async (request, response) => {
    const sessionId = getOrCreateSessionId(request, response);
    const prompt = typeof request.body?.prompt === 'string' ? request.body.prompt.trim() : '';
    const promptLength = Array.from(prompt).length;
    if (promptLength < 1 || promptLength > 500) {
      response.status(400).json({
        error: { code: 'INVALID_PROMPT', message: 'Введите запрос длиной от 1 до 500 символов.' },
      });
      return;
    }
    if (!dependencies.apiKey || !dependencies.saveExchange) {
      response.status(503).json({
        error: { code: 'SERVICE_NOT_CONFIGURED', message: 'Сервис временно недоступен.' },
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error('OpenRouter timed out')), dependencies.timeoutMs);
    let disconnected = false;
    response.on('close', () => {
      if (!response.writableEnded) {
        disconnected = true;
        controller.abort();
      }
    });

    try {
      let upstream: Response;
      try {
        upstream = await requestOpenRouter({
          apiKey: dependencies.apiKey,
          model: dependencies.model,
          prompt,
          fetchImpl: dependencies.fetchImpl,
          signal: controller.signal,
        });
      } catch {
        if (!disconnected) response.status(502).json({
          error: { code: 'UPSTREAM_ERROR', message: 'Не удалось получить ответ модели. Повторите попытку.' },
        });
        return;
      }
      if (disconnected) return;
      if (!upstream.ok || !upstream.body) {
        response.status(502).json({
          error: { code: 'UPSTREAM_ERROR', message: 'Не удалось получить ответ модели. Повторите попытку.' },
        });
        return;
      }

      response.status(200);
      response.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
      response.setHeader('Cache-Control', 'no-cache');
      response.flushHeaders();

      let answer = '';
      try {
        for await (const text of readOpenRouterDeltas(upstream, controller.signal)) {
          if (disconnected) return;
          answer += text;
          sendEvent(response, 'delta', { text });
        }
      } catch {
        if (!disconnected) {
          sendEvent(response, 'error', {
            code: 'UPSTREAM_ERROR', message: 'Поток ответа прервался. Повторите попытку.',
          });
          response.end();
        }
        return;
      }

      clearTimeout(timeout);
      if (disconnected) return;
      if (!answer.trim()) {
        sendEvent(response, 'error', {
          code: 'EMPTY_RESPONSE', message: 'Модель вернула пустой ответ. Повторите попытку.',
        });
        response.end();
        return;
      }

      try {
        const exchange = await dependencies.saveExchange({ sessionId, prompt, answer });
        if (!disconnected) {
          sendEvent(response, 'done', { exchange });
          response.end();
        }
      } catch {
        if (!disconnected) {
          sendEvent(response, 'error', {
            code: 'PERSISTENCE_ERROR', message: 'Не удалось сохранить ответ. Повторите попытку.',
          });
          response.end();
        }
      }
    } finally {
      clearTimeout(timeout);
    }
  };
}

function sendEvent(response: Parameters<RequestHandler>[1], name: string, data: unknown) {
  response.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
}
