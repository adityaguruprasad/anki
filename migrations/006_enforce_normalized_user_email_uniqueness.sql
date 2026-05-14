-- Enforce the API contract that account emails are unique after trimming
-- whitespace and ignoring case. The app normalizes emails before writes; this
-- index protects the persisted account identity boundary too.
--
-- This intentionally takes an exclusive lock and builds the index inside the
-- transaction instead of using a concurrent index build: the migration prechecks
-- duplicates and stops so operators can resolve account identity explicitly
-- rather than silently merging or deleting user data.
BEGIN;

LOCK TABLE users IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  duplicate_normalized_email_group_count BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO duplicate_normalized_email_group_count
    FROM (
      SELECT LOWER(TRIM(email)) AS normalized_email
        FROM users
       GROUP BY LOWER(TRIM(email))
      HAVING COUNT(*) > 1
    ) duplicate_user_emails;

  IF duplicate_normalized_email_group_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce normalized user email uniqueness: % duplicate normalized email group(s) exist. Merge or remove duplicate user accounts before rerunning this migration.',
      duplicate_normalized_email_group_count;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS users_normalized_email_unique_idx
  ON users ((LOWER(TRIM(email))));

COMMIT;
