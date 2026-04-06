-- Extend user_flowers to be the single source of truth for cross-device sync.
-- Full flower params are stored as JSONB so the frontend never needs the Go
-- backend running just to display the flowers list.

ALTER TABLE public.user_flowers
  ADD COLUMN IF NOT EXISTS params JSONB,
  ADD COLUMN IF NOT EXISTS generation_word TEXT,
  ADD COLUMN IF NOT EXISTS is_minted BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS token_uri TEXT;
