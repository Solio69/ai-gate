CREATE TABLE IF NOT EXISTS exchanges (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id uuid NOT NULL,
    prompt text NOT NULL CHECK (char_length(prompt) BETWEEN 1 AND 500),
    answer text NOT NULL CHECK (char_length(answer) > 0),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS exchanges_session_created_id_idx
    ON exchanges (session_id, created_at, id);
