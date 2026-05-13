-- Enforce persisted scheduling metadata invariants used by calculateNextReview.
-- Legacy rows are normalized instead of deleted because these values are
-- derived review metadata, not user-authored card content.
BEGIN;

LOCK TABLE cards IN ACCESS EXCLUSIVE MODE;

UPDATE cards
   SET interval = CASE
         WHEN interval IS NULL OR interval < 1 THEN 1
         ELSE interval
       END,
       review_count = CASE
         WHEN review_count IS NULL OR review_count < 0 THEN 0
         ELSE review_count
       END,
       ease_factor = CASE
         WHEN ease_factor IS NULL OR ease_factor < 1.3 THEN 1.3
         ELSE ease_factor
       END
 WHERE interval IS NULL
    OR interval < 1
    OR review_count IS NULL
    OR review_count < 0
    OR ease_factor IS NULL
    OR ease_factor < 1.3;

ALTER TABLE cards
  ALTER COLUMN interval SET DEFAULT 1,
  ALTER COLUMN review_count SET DEFAULT 0,
  ALTER COLUMN ease_factor SET DEFAULT 2.5,
  ALTER COLUMN interval SET NOT NULL,
  ALTER COLUMN review_count SET NOT NULL,
  ALTER COLUMN ease_factor SET NOT NULL,
  DROP CONSTRAINT IF EXISTS cards_interval_min_check,
  DROP CONSTRAINT IF EXISTS cards_review_count_non_negative_check,
  DROP CONSTRAINT IF EXISTS cards_ease_factor_min_check,
  ADD CONSTRAINT cards_interval_min_check CHECK (interval >= 1),
  ADD CONSTRAINT cards_review_count_non_negative_check CHECK (review_count >= 0),
  ADD CONSTRAINT cards_ease_factor_min_check CHECK (ease_factor >= 1.3);

COMMIT;
