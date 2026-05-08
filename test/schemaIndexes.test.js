const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const schema = fs.readFileSync(path.join(__dirname, '..', 'anki.db'), 'utf8');

test('anki.db declares indexes for authenticated API hot paths', () => {
  assert.match(
    schema,
    /CREATE\s+INDEX\s+decks_user_id_created_at_id_idx\s+ON\s+decks\s*\(\s*user_id\s*,\s*created_at\s+DESC\s*,\s*id\s+DESC\s*\)\s*;/i
  );

  assert.match(
    schema,
    /CREATE\s+INDEX\s+cards_deck_id_next_review_idx\s+ON\s+cards\s*\(\s*deck_id\s*,\s*next_review\s*\)\s*;/i
  );

  assert.match(
    schema,
    /CREATE\s+INDEX\s+cards_deck_id_last_reviewed_idx\s+ON\s+cards\s*\(\s*deck_id\s*,\s*last_reviewed\s*\)\s*;/i
  );
});
