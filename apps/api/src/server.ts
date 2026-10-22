import { createApp } from './app.ts';

const cookieSecret = process.env.COOKIE_SECRET;
if (!cookieSecret) {
  throw new Error('COOKIE_SECRET is required. Add it to the local .env file.');
}

const port = Number(process.env.PORT ?? 3001);
const host = '127.0.0.1';
const app = createApp({
  cookieSecret,
  apiKey: process.env.OPENROUTER_API_KEY,
  model: process.env.OPENROUTER_MODEL,
  databaseUrl: process.env.DATABASE_URL,
});

const server = app.listen(port, host, (error) => {
  if (error) {
    throw error;
  }
  process.stdout.write(`API listening on http://${host}:${port}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => server.close());
}
