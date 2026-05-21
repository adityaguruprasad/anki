-- Enforce the auth-layer password hash invariants in persisted credential data.
-- Takes an ACCESS EXCLUSIVE lock on users; schedule accordingly.
-- Existing invalid rows are rejected instead of rewritten because password
-- verifiers need an explicit reset/remediation path.
BEGIN;

LOCK TABLE users IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  invalid_user_credential_count BIGINT;
  invalid_user_credential_sample_ids BIGINT[];
BEGIN
  WITH invalid_user_password_hash AS (
    SELECT id
      FROM users
     WHERE password_hash IS NULL
        OR password_hash !~ '[^[:space:]]'
        OR char_length(password_hash) > 100
        OR password_hash ~ U&'[\0001-\001F\007F-\009F\00A0\061C\1680\2000-\200A\200B-\200F\2028\2029\202A-\202E\202F\205F\2060\2066-\2069\3000\FEFF]'
  ),
  invalid_user_password_hash_sample AS (
    SELECT id
      FROM invalid_user_password_hash
     ORDER BY id
     LIMIT 10
  )
  SELECT
      (SELECT COUNT(*) FROM invalid_user_password_hash),
      COALESCE(
        (SELECT array_agg(id::BIGINT ORDER BY id) FROM invalid_user_password_hash_sample),
        ARRAY[]::BIGINT[]
      )
    INTO invalid_user_credential_count, invalid_user_credential_sample_ids;

  IF invalid_user_credential_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce user password hash constraints: % user row(s) have missing, blank, unsafe, or over-length password hashes. Sample offending user id(s): %. Reset affected passwords or remove accounts intentionally before rerunning this migration.',
      invalid_user_credential_count,
      invalid_user_credential_sample_ids;
  END IF;
END $$;

ALTER TABLE users
  ALTER COLUMN password_hash SET NOT NULL,
  DROP CONSTRAINT IF EXISTS users_password_hash_non_blank_check,
  DROP CONSTRAINT IF EXISTS users_password_hash_safe_characters_check,
  DROP CONSTRAINT IF EXISTS users_password_hash_max_length_check,
  ADD CONSTRAINT users_password_hash_non_blank_check CHECK (password_hash ~ '[^[:space:]]'),
  ADD CONSTRAINT users_password_hash_safe_characters_check CHECK (
    password_hash !~ U&'[\0001-\001F\007F-\009F\00A0\061C\1680\2000-\200A\200B-\200F\2028\2029\202A-\202E\202F\205F\2060\2066-\2069\3000\FEFF]'
  ),
  ADD CONSTRAINT users_password_hash_max_length_check CHECK (char_length(password_hash) <= 100);

COMMIT;
