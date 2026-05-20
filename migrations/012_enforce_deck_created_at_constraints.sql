-- Enforce creation timestamps required by deck ordering and response contracts.
-- Existing NULL rows are rejected instead of guessed because created_at is a
-- historical lifecycle value and should be backfilled intentionally.
BEGIN;

LOCK TABLE decks IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  invalid_deck_created_at_count BIGINT;
  invalid_deck_created_at_sample_ids BIGINT[];
BEGIN
  WITH invalid_deck_created_at AS (
    SELECT id
      FROM decks
     WHERE created_at IS NULL
  ),
  invalid_deck_created_at_sample AS (
    SELECT id
      FROM invalid_deck_created_at
     ORDER BY id
     LIMIT 10
  )
  SELECT
      (SELECT COUNT(*) FROM invalid_deck_created_at),
      COALESCE(
        (SELECT array_agg(id::BIGINT ORDER BY id) FROM invalid_deck_created_at_sample),
        ARRAY[]::BIGINT[]
      )
    INTO invalid_deck_created_at_count, invalid_deck_created_at_sample_ids;

  IF invalid_deck_created_at_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce deck created-at constraints: % deck row(s) have NULL created_at. Sample offending deck id(s): %. Backfill creation timestamps intentionally before rerunning this migration.',
      invalid_deck_created_at_count,
      invalid_deck_created_at_sample_ids;
  END IF;
END $$;

ALTER TABLE decks
  ALTER COLUMN created_at SET NOT NULL;

COMMIT;
