-- Enforce creation timestamps required by card browsing order and cursor stability.
-- Existing NULL rows are rejected instead of guessed because created_at is a
-- historical lifecycle value and should be backfilled intentionally.
BEGIN;

LOCK TABLE cards IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  invalid_card_created_at_count BIGINT;
  invalid_card_created_at_sample_ids BIGINT[];
BEGIN
  WITH invalid_card_created_at AS (
    SELECT id
      FROM cards
     WHERE created_at IS NULL
  ),
  invalid_card_created_at_sample AS (
    SELECT id
      FROM invalid_card_created_at
     ORDER BY id
     LIMIT 10
  )
  SELECT
      (SELECT COUNT(*) FROM invalid_card_created_at),
      COALESCE(
        (SELECT array_agg(id::BIGINT ORDER BY id) FROM invalid_card_created_at_sample),
        ARRAY[]::BIGINT[]
      )
    INTO invalid_card_created_at_count, invalid_card_created_at_sample_ids;

  IF invalid_card_created_at_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce card created-at constraints: % card row(s) have NULL created_at. Sample offending card id(s): %. Backfill creation timestamps intentionally before rerunning this migration.',
      invalid_card_created_at_count,
      invalid_card_created_at_sample_ids;
  END IF;
END $$;

ALTER TABLE cards
  ALTER COLUMN created_at SET NOT NULL;

COMMIT;
