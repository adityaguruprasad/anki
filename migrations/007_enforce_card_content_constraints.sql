-- Enforce the card content invariants already required by the API.
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
     WHERE front_content IS NULL
        OR back_content IS NULL
        OR front_content !~ '[^[:space:]]'
        OR back_content !~ '[^[:space:]]'
        OR char_length(front_content) > 10000
        OR char_length(back_content) > 10000
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
    RAISE EXCEPTION 'Cannot enforce card content constraints: % card row(s) have blank or over-length front/back content. Sample offending card id(s): %. Repair or remove invalid card content intentionally before rerunning this migration.',
      invalid_card_content_count,
      invalid_card_content_sample_ids;
  END IF;
END $$;

-- The preflight above rejects NULL content before SET NOT NULL; NOT NULL
-- complements the non-blank CHECK constraints below.
ALTER TABLE cards
  ALTER COLUMN front_content SET NOT NULL,
  ALTER COLUMN back_content SET NOT NULL,
  DROP CONSTRAINT IF EXISTS cards_front_content_non_blank_check,
  DROP CONSTRAINT IF EXISTS cards_back_content_non_blank_check,
  DROP CONSTRAINT IF EXISTS cards_front_content_max_length_check,
  DROP CONSTRAINT IF EXISTS cards_back_content_max_length_check,
  ADD CONSTRAINT cards_front_content_non_blank_check CHECK (front_content ~ '[^[:space:]]'),
  ADD CONSTRAINT cards_back_content_non_blank_check CHECK (back_content ~ '[^[:space:]]'),
  ADD CONSTRAINT cards_front_content_max_length_check CHECK (char_length(front_content) <= 10000),
  ADD CONSTRAINT cards_back_content_max_length_check CHECK (char_length(back_content) <= 10000);

COMMIT;
