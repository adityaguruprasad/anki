-- Enforce the API-layer deck name invariants in persisted deck data.
-- Existing invalid rows are rejected instead of rewritten because deck names
-- are user-authored labels and need operator review before normalization.
BEGIN;

LOCK TABLE decks IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  invalid_deck_name_count BIGINT;
  invalid_deck_name_sample_ids BIGINT[];
BEGIN
  WITH invalid_deck_name AS (
    SELECT id
      FROM decks
     WHERE name IS NULL
        OR name <> BTRIM(name, U&'\0020\0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
        OR BTRIM(name, U&'\0020\0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') = ''
        OR name ~ U&'[\0001-\001F\007F-\009F\061C\200B\200E\200F\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'
  ),
  invalid_deck_name_sample AS (
    SELECT id
      FROM invalid_deck_name
     ORDER BY id
     LIMIT 10
  )
  SELECT
      (SELECT COUNT(*) FROM invalid_deck_name),
      COALESCE(
        (SELECT array_agg(id::BIGINT ORDER BY id) FROM invalid_deck_name_sample),
        ARRAY[]::BIGINT[]
      )
    INTO invalid_deck_name_count, invalid_deck_name_sample_ids;

  IF invalid_deck_name_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce deck name constraints: % deck row(s) have blank, unsafe, or untrimmed names. Sample offending deck id(s): %. Repair deck names intentionally before rerunning this migration.',
      invalid_deck_name_count,
      invalid_deck_name_sample_ids;
  END IF;
END $$;

ALTER TABLE decks
  ALTER COLUMN name SET NOT NULL,
  DROP CONSTRAINT IF EXISTS decks_name_trimmed_check,
  DROP CONSTRAINT IF EXISTS decks_name_non_blank_check,
  DROP CONSTRAINT IF EXISTS decks_name_safe_characters_check,
  ADD CONSTRAINT decks_name_trimmed_check CHECK (
    name = BTRIM(name, U&'\0020\0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF')
  ),
  ADD CONSTRAINT decks_name_non_blank_check CHECK (
    BTRIM(name, U&'\0020\0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF') <> ''
  ),
  ADD CONSTRAINT decks_name_safe_characters_check CHECK (
    name !~ U&'[\0001-\001F\007F-\009F\061C\200B\200E\200F\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'
  );

COMMIT;
