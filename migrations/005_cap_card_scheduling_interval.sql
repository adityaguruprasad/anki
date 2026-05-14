-- Cap review intervals so scheduler output stays within the app-supported
-- scheduling horizon and cannot produce invalid review timestamps.
BEGIN;

LOCK TABLE cards IN ACCESS EXCLUSIVE MODE;

UPDATE cards
   SET interval = 36500
 WHERE interval > 36500;

ALTER TABLE cards
  DROP CONSTRAINT IF EXISTS cards_interval_max_check,
  ADD CONSTRAINT cards_interval_max_check CHECK (interval <= 36500);

COMMIT;
