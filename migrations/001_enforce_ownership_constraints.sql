-- Enforce the app's ownership chain: users own decks, and decks own cards.
-- ON DELETE CASCADE is intentional so future account deletion/account erasure
-- removes the user's personal learning content through users -> decks -> cards.
BEGIN;

LOCK TABLE users, decks, cards IN ACCESS EXCLUSIVE MODE;

DO $$
DECLARE
  decks_without_owner_count BIGINT;
  decks_missing_owner_count BIGINT;
  cards_without_deck_count BIGINT;
  cards_missing_deck_count BIGINT;
BEGIN
  SELECT COUNT(*)
    INTO decks_without_owner_count
    FROM decks
   WHERE user_id IS NULL;

  IF decks_without_owner_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce decks.user_id NOT NULL: % deck row(s) have no user_id. Assign each deck to an existing users.id or remove those rows intentionally before rerunning this migration.',
      decks_without_owner_count;
  END IF;

  SELECT COUNT(*)
    INTO decks_missing_owner_count
    FROM decks d
   WHERE d.user_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM users u
        WHERE u.id = d.user_id
     );

  IF decks_missing_owner_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce decks.user_id foreign key: % deck row(s) reference a missing users.id. Assign each deck to an existing users.id or remove those rows intentionally before rerunning this migration.',
      decks_missing_owner_count;
  END IF;

  SELECT COUNT(*)
    INTO cards_without_deck_count
    FROM cards
   WHERE deck_id IS NULL;

  IF cards_without_deck_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce cards.deck_id NOT NULL: % card row(s) have no deck_id. Assign each card to an existing decks.id or remove those rows intentionally before rerunning this migration.',
      cards_without_deck_count;
  END IF;

  SELECT COUNT(*)
    INTO cards_missing_deck_count
    FROM cards c
   WHERE c.deck_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
         FROM decks d
        WHERE d.id = c.deck_id
     );

  IF cards_missing_deck_count > 0 THEN
    RAISE EXCEPTION 'Cannot enforce cards.deck_id foreign key: % card row(s) reference a missing decks.id. Assign each card to an existing decks.id or remove those rows intentionally before rerunning this migration.',
      cards_missing_deck_count;
  END IF;
END $$;

ALTER TABLE decks
  DROP CONSTRAINT IF EXISTS decks_user_id_fkey,
  ADD CONSTRAINT decks_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  ALTER COLUMN user_id SET NOT NULL;

ALTER TABLE cards
  DROP CONSTRAINT IF EXISTS cards_deck_id_fkey,
  ADD CONSTRAINT cards_deck_id_fkey
    FOREIGN KEY (deck_id) REFERENCES decks(id) ON DELETE CASCADE,
  ALTER COLUMN deck_id SET NOT NULL;

COMMIT;
