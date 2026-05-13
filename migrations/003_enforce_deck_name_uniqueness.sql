-- Enforce the API contract that each user cannot have duplicate deck names
-- after trimming whitespace and ignoring case. The app already depends on this
-- index for atomic create conflicts.
--
-- This intentionally takes an exclusive lock and builds the index inside the
-- transaction instead of using a concurrent index build: the migration prechecks
-- duplicates and stops so operators can resolve user deck data explicitly rather
-- than silently renaming, merging, or deleting it.
BEGIN;

LOCK TABLE decks IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  duplicate_normalized_name_group_count BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO duplicate_normalized_name_group_count
    FROM (
      SELECT user_id, LOWER(TRIM(name)) AS normalized_name
        FROM decks
       GROUP BY user_id, LOWER(TRIM(name))
      HAVING COUNT(*) > 1
    ) duplicate_deck_names;

  IF duplicate_normalized_name_group_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce per-user deck name uniqueness: % duplicate normalized deck name group(s) exist. Rename or merge duplicate decks for each user before rerunning this migration.',
      duplicate_normalized_name_group_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS decks_user_id_normalized_name_unique_idx
  ON decks (user_id, (LOWER(TRIM(name))));

COMMIT;
