const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getTableDefinition, readAnkiSchema } = require('./schemaHelpers');

const ownershipMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '001_enforce_ownership_constraints.sql'),
  'utf8',
);

function getDoBlock(sql) {
  const doBlockMatch = sql.match(/\bDO\s+\$\$([\s\S]*?)END\s+\$\$;/i);
  assert.ok(doBlockMatch, 'Expected migration to contain a DO $$ precheck block');

  return doBlockMatch[0];
}

function assertOrdered(haystack, firstNeedle, secondNeedle) {
  const firstIndex = haystack.search(firstNeedle);
  const secondIndex = haystack.search(secondNeedle);

  assert.notEqual(firstIndex, -1, `Expected migration to contain ${firstNeedle}`);
  assert.notEqual(secondIndex, -1, `Expected migration to contain ${secondNeedle}`);
  assert.ok(firstIndex < secondIndex, `Expected ${firstNeedle} before ${secondNeedle}`);
}

test('ownership cascade intent is documented in migration and canonical schema', () => {
  const schema = readAnkiSchema();

  assert.match(ownershipMigration, /users own decks, and decks own cards/i);
  assert.match(ownershipMigration, /ON DELETE CASCADE is intentional/i);
  assert.match(ownershipMigration, /account deletion\/account erasure/i);
  assert.match(schema, /Users own decks; the cascade supports future account erasure/i);
  assert.match(schema, /Decks own cards; deleting a deck removes its card content/i);
});

test('anki.db requires persisted decks and cards to keep ownership foreign keys with cascading owners', () => {
  assert.match(
    getTableDefinition('decks'),
    /\buser_id\s+INTEGER\s+NOT\s+NULL\s+CONSTRAINT\s+decks_user_id_fkey\s+REFERENCES\s+users\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE\b/i,
  );

  assert.match(
    getTableDefinition('cards'),
    /\bdeck_id\s+INTEGER\s+NOT\s+NULL\s+CONSTRAINT\s+cards_deck_id_fkey\s+REFERENCES\s+decks\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE\b/i,
  );
});

test('anki.db has no incomplete ownership reference chains', () => {
  const referenceLines = readAnkiSchema()
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/,$/, ''))
    .filter((line) => /\bREFERENCES\b/i.test(line));

  assert.deepEqual(referenceLines, [
    'user_id INTEGER NOT NULL CONSTRAINT decks_user_id_fkey REFERENCES users(id) ON DELETE CASCADE',
    'deck_id INTEGER NOT NULL CONSTRAINT cards_deck_id_fkey REFERENCES decks(id) ON DELETE CASCADE',
  ]);
});

test('ownership migration uses a transaction and locks ownership tables before prechecks', () => {
  assert.match(ownershipMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(ownershipMigration, /COMMIT;\s*$/i);
  assert.match(
    ownershipMigration,
    /LOCK\s+TABLE\s+users\s*,\s*decks\s*,\s*cards\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assertOrdered(ownershipMigration, /\bBEGIN;/i, /\bLOCK\s+TABLE\b/i);
  assertOrdered(ownershipMigration, /\bLOCK\s+TABLE\b/i, /\bDO\s+\$\$/i);
  assertOrdered(ownershipMigration, /\bDO\s+\$\$/i, /\bALTER\s+TABLE\s+decks\b/i);
  assertOrdered(ownershipMigration, /\bALTER\s+TABLE\s+cards\b/i, /\bCOMMIT;/i);
});

test('ownership migration fails before NOT NULL when existing ownership links are missing', () => {
  const doBlock = getDoBlock(ownershipMigration);

  assert.match(
    doBlock,
    /RAISE\s+EXCEPTION\s+'Cannot enforce decks\.user_id NOT NULL:/i,
  );
  assert.match(
    doBlock,
    /RAISE\s+EXCEPTION\s+'Cannot enforce cards\.deck_id NOT NULL:/i,
  );
  assert.match(doBlock, /SELECT\s+COUNT\(\*\)[\s\S]*FROM\s+decks[\s\S]*WHERE\s+user_id\s+IS\s+NULL/i);
  assert.match(doBlock, /SELECT\s+COUNT\(\*\)[\s\S]*FROM\s+cards[\s\S]*WHERE\s+deck_id\s+IS\s+NULL/i);

  assertOrdered(
    ownershipMigration,
    /WHERE\s+user_id\s+IS\s+NULL/i,
    /ALTER\s+TABLE\s+decks[\s\S]*ALTER\s+COLUMN\s+user_id\s+SET\s+NOT\s+NULL/i,
  );
  assertOrdered(
    ownershipMigration,
    /WHERE\s+deck_id\s+IS\s+NULL/i,
    /ALTER\s+TABLE\s+cards[\s\S]*ALTER\s+COLUMN\s+deck_id\s+SET\s+NOT\s+NULL/i,
  );
});

test('ownership migration rejects orphaned ownership references with actionable errors', () => {
  const doBlock = getDoBlock(ownershipMigration);

  assert.match(
    doBlock,
    /RAISE\s+EXCEPTION\s+'Cannot enforce decks\.user_id foreign key:/i,
  );
  assert.match(
    doBlock,
    /RAISE\s+EXCEPTION\s+'Cannot enforce cards\.deck_id foreign key:/i,
  );
  assert.match(doBlock, /reference a missing users\.id/i);
  assert.match(doBlock, /reference a missing decks\.id/i);
  assert.match(doBlock, /NOT\s+EXISTS\s*\([\s\S]*FROM\s+users\s+u[\s\S]*WHERE\s+u\.id\s*=\s*d\.user_id/i);
  assert.match(doBlock, /NOT\s+EXISTS\s*\([\s\S]*FROM\s+decks\s+d[\s\S]*WHERE\s+d\.id\s*=\s*c\.deck_id/i);

  assertOrdered(
    ownershipMigration,
    /NOT\s+EXISTS\s*\([\s\S]*FROM\s+users\s+u[\s\S]*WHERE\s+u\.id\s*=\s*d\.user_id/i,
    /ALTER\s+TABLE\s+decks[\s\S]*ADD\s+CONSTRAINT\s+decks_user_id_fkey/i,
  );
  assertOrdered(
    ownershipMigration,
    /NOT\s+EXISTS\s*\([\s\S]*FROM\s+decks\s+d[\s\S]*WHERE\s+d\.id\s*=\s*c\.deck_id/i,
    /ALTER\s+TABLE\s+cards[\s\S]*ADD\s+CONSTRAINT\s+cards_deck_id_fkey/i,
  );
});

test('ownership migration recreates foreign keys with explicit cascading ownership policy', () => {
  assert.match(
    ownershipMigration,
    /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+decks_user_id_fkey/i,
  );
  assert.match(
    ownershipMigration,
    /DROP\s+CONSTRAINT\s+IF\s+EXISTS\s+cards_deck_id_fkey/i,
  );
  assert.match(
    ownershipMigration,
    /ADD\s+CONSTRAINT\s+decks_user_id_fkey\s+FOREIGN\s+KEY\s*\(\s*user_id\s*\)\s+REFERENCES\s+users\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i,
  );
  assert.match(
    ownershipMigration,
    /ADD\s+CONSTRAINT\s+cards_deck_id_fkey\s+FOREIGN\s+KEY\s*\(\s*deck_id\s*\)\s+REFERENCES\s+decks\s*\(\s*id\s*\)\s+ON\s+DELETE\s+CASCADE/i,
  );
});

test('ownership migration does not silently delete or backfill orphaned rows', () => {
  assert.doesNotMatch(ownershipMigration, /\bDELETE\s+FROM\s+(?:decks|cards)\b/i);
  assert.doesNotMatch(ownershipMigration, /\bUPDATE\s+decks\b[\s\S]*\bSET\s+user_id\b/i);
  assert.doesNotMatch(ownershipMigration, /\bUPDATE\s+cards\b[\s\S]*\bSET\s+deck_id\b/i);
});

test('anki.db and ownership migration use matching ownership constraint names', () => {
  const schema = readAnkiSchema();

  for (const constraintName of ['decks_user_id_fkey', 'cards_deck_id_fkey']) {
    assert.match(schema, new RegExp(`CONSTRAINT\\s+${constraintName}\\b`, 'i'));
    assert.match(ownershipMigration, new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${constraintName}\\b`, 'i'));
    assert.match(ownershipMigration, new RegExp(`ADD\\s+CONSTRAINT\\s+${constraintName}\\b`, 'i'));
  }
});
