import { createParser } from 'eventsource-parser';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterRequest {
  apiKey: string;
  model: string;
  prompt: string;
  fetchImpl: typeof fetch;
  signal: AbortSignal;
}

export function requestOpenRouter({ apiKey, model, prompt, fetchImpl, signal }: OpenRouterRequest) {
  return awaitOrAbort(fetchImpl(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      stream: true,
      messages: [{ role: 'user', content: prompt }],
    }),
    signal,
  }), signal);
}

export async function* readOpenRouterDeltas(response: Response, signal: AbortSignal): AsyncGenerator<string> {
  if (!response.body) throw new Error('OpenRouter returned no stream');

  const pending: string[] = [];
  let completed = false;
  const parser = createParser({
    onEvent(event) {
      if (completed) return;
      if (event.data === '[DONE]') {
        completed = true;
        return;
      }
      const payload = JSON.parse(event.data) as {
        error?: unknown;
        choices?: Array<{ delta?: { content?: unknown } }>;
      };
      if (payload.error) throw new Error('OpenRouter returned a stream error');
      const text = payload.choices?.[0]?.delta?.content;
      if (typeof text === 'string' && text.length > 0) pending.push(text);
    },
  });
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  try {
    while (!completed) {
      const next = await awaitOrAbort(reader.read(), signal);
      if (next.done) break;
      parser.feed(decoder.decode(next.value, { stream: true }));
      while (pending.length > 0) yield pending.shift()!;
    }
  } finally {
    if (signal.aborted) {
      void reader.cancel().catch(() => undefined);
    } else {
      await reader.cancel().catch(() => undefined);
    }
  }
  if (!completed) throw new Error('OpenRouter stream ended without [DONE]');
}

function awaitOrAbort<T>(work: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('OpenRouter request aborted'));

  let onAbort!: () => void;
  const aborted = new Promise<never>((_resolve, reject) => {
    onAbort = () => reject(signal.reason ?? new Error('OpenRouter request aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
  });
  return Promise.race([work, aborted]).finally(() => signal.removeEventListener('abort', onAbort));
}
