-- Enforce the auth-layer account identity invariants in persisted user data.
-- Existing invalid rows are rejected instead of rewritten because usernames and
-- emails identify accounts and need operator review before any normalization.
BEGIN;

LOCK TABLE users IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  invalid_user_identity_count BIGINT;
  invalid_user_identity_sample_ids BIGINT[];
BEGIN
  WITH invalid_user_identity AS (
    SELECT id
      FROM users
     WHERE username IS NULL
        OR email IS NULL
        OR username <> TRIM(username)
        OR username !~ '[^[:space:]]'
        OR username ~ U&'[\0001-\001F\007F-\009F\061C\200B-\200F\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'
        OR email <> LOWER(TRIM(email))
        OR email !~ '^[^@]+@[^@]+$'
        OR email ~ U&'[[:space:]\0001-\001F\007F-\009F\061C\200B-\200F\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'
  ),
  invalid_user_identity_sample AS (
    SELECT id
      FROM invalid_user_identity
     ORDER BY id
     LIMIT 10
  )
  SELECT
      (SELECT COUNT(*) FROM invalid_user_identity),
      COALESCE(
        (SELECT array_agg(id::BIGINT ORDER BY id) FROM invalid_user_identity_sample),
        ARRAY[]::BIGINT[]
      )
    INTO invalid_user_identity_count, invalid_user_identity_sample_ids;

  IF invalid_user_identity_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce user identity constraints: % user row(s) have blank, unsafe, malformed, or unnormalized username/email values. Sample offending user id(s): %. Repair account identity data intentionally before rerunning this migration.',
      invalid_user_identity_count,
      invalid_user_identity_sample_ids;
  END IF;
END $$;

ALTER TABLE users
  ALTER COLUMN username SET NOT NULL,
  ALTER COLUMN email SET NOT NULL,
  DROP CONSTRAINT IF EXISTS users_username_trimmed_check,
  DROP CONSTRAINT IF EXISTS users_username_non_blank_check,
  DROP CONSTRAINT IF EXISTS users_username_safe_characters_check,
  DROP CONSTRAINT IF EXISTS users_email_normalized_check,
  DROP CONSTRAINT IF EXISTS users_email_shape_check,
  DROP CONSTRAINT IF EXISTS users_email_safe_characters_check,
  ADD CONSTRAINT users_username_trimmed_check CHECK (username = TRIM(username)),
  ADD CONSTRAINT users_username_non_blank_check CHECK (username ~ '[^[:space:]]'),
  ADD CONSTRAINT users_username_safe_characters_check CHECK (
    username !~ U&'[\0001-\001F\007F-\009F\061C\200B-\200F\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'
  ),
  ADD CONSTRAINT users_email_normalized_check CHECK (email = LOWER(TRIM(email))),
  ADD CONSTRAINT users_email_shape_check CHECK (email ~ '^[^@]+@[^@]+$'),
  ADD CONSTRAINT users_email_safe_characters_check CHECK (
    email !~ U&'[[:space:]\0001-\001F\007F-\009F\061C\200B-\200F\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'
  );

COMMIT;
