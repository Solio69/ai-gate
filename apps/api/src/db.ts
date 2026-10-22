import pg from 'pg';

export interface NewExchange {
  sessionId: string;
  prompt: string;
  answer: string;
}

export interface Exchange extends NewExchange {
  id: string;
  createdAt: string;
}

export type SaveExchange = (exchange: NewExchange) => Promise<Exchange>;

export function createPostgresSaveExchange(databaseUrl: string): SaveExchange {
  const pool = new pg.Pool({ connectionString: databaseUrl, allowExitOnIdle: true });

  return async ({ sessionId, prompt, answer }) => {
    const result = await pool.query<{
      id: string;
      session_id: string;
      prompt: string;
      answer: string;
      created_at: Date;
    }>(
      `INSERT INTO exchanges (session_id, prompt, answer)
       VALUES ($1, $2, $3)
       RETURNING id, session_id, prompt, answer, created_at`,
      [sessionId, prompt, answer],
    );
    const row = result.rows[0];
    if (!row) throw new Error('PostgreSQL did not return the inserted exchange');
    return {
      id: row.id,
      sessionId: row.session_id,
      prompt: row.prompt,
      answer: row.answer,
      createdAt: row.created_at.toISOString(),
    };
  };
}
