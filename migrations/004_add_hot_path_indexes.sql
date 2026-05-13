-- Backfill the query-support indexes that are present in the bootstrap schema
-- for existing databases upgraded through migrations.
--
-- These regular idempotent index builds are friendly to migration runners that
-- wrap SQL files in a transaction. They may take normal PostgreSQL index-build
-- locks while each missing index is created.
CREATE INDEX IF NOT EXISTS decks_user_id_created_at_id_idx
  ON decks (user_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS cards_deck_id_next_review_idx
  ON cards (deck_id, next_review ASC NULLS FIRST, id ASC);

CREATE INDEX IF NOT EXISTS cards_deck_id_created_at_id_idx
  ON cards (deck_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS cards_deck_id_last_reviewed_idx
  ON cards (deck_id, last_reviewed);
