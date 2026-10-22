import { createApp } from './app.ts';

const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  throw new Error('COOKIE_SECRET is required. Set it in Vercel Environment Variables.');
}

const app = createApp({
  cookieSecret,
  apiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.OPENROUTER_MODEL,
  databaseUrl: process.env.DATABASE_URL,
});

export default app;
