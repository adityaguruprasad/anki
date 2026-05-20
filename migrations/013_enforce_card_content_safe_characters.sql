-- Enforce the card content safe-character invariant already required by the API.
-- Existing invalid rows are rejected instead of rewritten because front/back
-- content is user-authored study material and needs operator review.
BEGIN;

LOCK TABLE cards IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  invalid_card_content_count BIGINT;
  invalid_card_content_sample_ids BIGINT[];
BEGIN
  WITH invalid_card_content AS (
    SELECT id
      FROM cards
     WHERE front_content ~ U&'[\061C\200B\200E\200F\202A-\202E\2060\2066-\2069\FEFF]'
        OR back_content ~ U&'[\061C\200B\200E\200F\202A-\202E\2060\2066-\2069\FEFF]'
  ),
  invalid_card_content_sample AS (
    SELECT id
      FROM invalid_card_content
     ORDER BY id
     LIMIT 10
  )
  SELECT
      (SELECT COUNT(*) FROM invalid_card_content),
      COALESCE(
        (SELECT array_agg(id::BIGINT ORDER BY id) FROM invalid_card_content_sample),
        ARRAY[]::BIGINT[]
      )
    INTO invalid_card_content_count, invalid_card_content_sample_ids;

  IF invalid_card_content_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce card content safe-character constraints: % card row(s) contain invisible formatting characters. Sample offending card id(s): %. Repair card content intentionally before rerunning this migration.',
      invalid_card_content_count,
      invalid_card_content_sample_ids;
  END IF;
END $$;

ALTER TABLE cards
  DROP CONSTRAINT IF EXISTS cards_front_content_safe_characters_check,
  DROP CONSTRAINT IF EXISTS cards_back_content_safe_characters_check,
  ADD CONSTRAINT cards_front_content_safe_characters_check CHECK (
    front_content !~ U&'[\061C\200B\200E\200F\202A-\202E\2060\2066-\2069\FEFF]'
  ),
  ADD CONSTRAINT cards_back_content_safe_characters_check CHECK (
    back_content !~ U&'[\061C\200B\200E\200F\202A-\202E\2060\2066-\2069\FEFF]'
  );

COMMIT;
