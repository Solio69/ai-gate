import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';

const COOKIE_NAME = 'ai_gate_session';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function getOrCreateSessionId(request: Request, response: Response): string {
  const existing = request.signedCookies?.[COOKIE_NAME];
  if (typeof existing === 'string' && UUID_V4.test(existing)) return existing;

  const sessionId = randomUUID();
  response.cookie(COOKIE_NAME, sessionId, {
    signed: true,
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: request.secure,
  });
  return sessionId;
}
