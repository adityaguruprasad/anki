-- Enforce that completed reviews schedule the next review after the review time.
-- Existing invalid rows are repaired from derived scheduling metadata so the
-- invariant can be enforced without deleting user-authored card content.
BEGIN;

LOCK TABLE cards IN ACCESS EXCLUSIVE MODE;

UPDATE cards
   SET next_review = last_reviewed + (GREATEST(interval, 1) * INTERVAL '1 day')
 WHERE last_reviewed IS NOT NULL
   AND next_review IS NOT NULL
   AND next_review <= last_reviewed;

ALTER TABLE cards
  DROP CONSTRAINT IF EXISTS cards_review_temporal_order_check,
  ADD CONSTRAINT cards_review_temporal_order_check CHECK (
    next_review IS NULL OR last_reviewed IS NULL OR next_review > last_reviewed
  );

COMMIT;
