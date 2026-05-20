const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getTableDefinition } = require('./schemaHelpers');

const decksTable = getTableDefinition('decks');
const deckCreatedAtMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '012_enforce_deck_created_at_constraints.sql'),
  'utf8',
);

function assertOrdered(haystack, firstNeedle, secondNeedle) {
  const firstIndex = haystack.search(firstNeedle);
  const secondIndex = haystack.search(secondNeedle);

  assert.notEqual(firstIndex, -1, `Expected SQL to contain ${firstNeedle}`);
  assert.notEqual(secondIndex, -1, `Expected SQL to contain ${secondNeedle}`);
  assert.ok(firstIndex < secondIndex, `Expected ${firstNeedle} before ${secondNeedle}`);
}

function getRaiseExceptionStatement() {
  const match = deckCreatedAtMigration.match(/RAISE\s+EXCEPTION[\s\S]*?;/i);

  assert.ok(match, 'Expected migration to raise an exception on invalid deck created_at values');
  return match[0];
}

test('anki.db requires deck created_at for deck ordering and response contracts', () => {
  assert.match(
    decksTable,
    /\bcreated_at\s+TIMESTAMP\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP\b/i,
  );
});

test('deck created-at migration rejects NULL timestamps before altering decks', () => {
  assert.match(deckCreatedAtMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(deckCreatedAtMigration, /COMMIT;\s*$/i);
  assert.match(
    deckCreatedAtMigration,
    /LOCK\s+TABLE\s+decks\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assert.match(deckCreatedAtMigration, /\(SELECT\s+COUNT\(\*\)\s+FROM\s+invalid_deck_created_at\)/i);
  assert.match(deckCreatedAtMigration, /FROM\s+decks/i);
  assert.match(deckCreatedAtMigration, /created_at\s+IS\s+NULL/i);
  assert.match(
    deckCreatedAtMigration,
    /RAISE\s+EXCEPTION\s+'Cannot enforce deck created-at constraints:/i,
  );

  assertOrdered(deckCreatedAtMigration, /\bLOCK\s+TABLE\b/i, /\bDO\s+\$\$/i);
  assertOrdered(deckCreatedAtMigration, /created_at\s+IS\s+NULL/i, /ALTER\s+TABLE\s+decks/i);
  assertOrdered(deckCreatedAtMigration, /\bDO\s+\$\$/i, /ALTER\s+TABLE\s+decks/i);
  assert.doesNotMatch(deckCreatedAtMigration, /\bUPDATE\s+decks\b/i);
  assert.doesNotMatch(deckCreatedAtMigration, /\bDELETE\s+FROM\s+decks\b/i);
});

test('deck created-at migration reports deterministic ids without leaking deck names', () => {
  const raiseExceptionStatement = getRaiseExceptionStatement();
  const raiseExceptionArgs = raiseExceptionStatement.slice(
    raiseExceptionStatement.indexOf("',") + 2,
  );

  assert.match(deckCreatedAtMigration, /\binvalid_deck_created_at_sample_ids\s+BIGINT\[\]/i);
  assert.match(
    deckCreatedAtMigration,
    /\bWITH\s+invalid_deck_created_at\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+decks/i,
  );
  assert.match(
    deckCreatedAtMigration,
    /\binvalid_deck_created_at_sample\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+invalid_deck_created_at\s+ORDER\s+BY\s+id\s+LIMIT\s+10\s*\)/i,
  );
  assert.match(
    deckCreatedAtMigration,
    /array_agg\(\s*id::BIGINT\s+ORDER\s+BY\s+id\s*\)/i,
  );
  assert.match(
    deckCreatedAtMigration,
    /INTO\s+invalid_deck_created_at_count\s*,\s*invalid_deck_created_at_sample_ids/i,
  );
  assert.match(
    raiseExceptionStatement,
    /Cannot enforce deck created-at constraints: % deck row\(s\)[\s\S]*Sample offending deck id\(s\): %/i,
  );
  assert.match(
    raiseExceptionArgs,
    /invalid_deck_created_at_count\s*,\s*invalid_deck_created_at_sample_ids\s*;/i,
  );
  assert.doesNotMatch(raiseExceptionArgs, /\bname\b|\bdescription\b/i);
});

test('deck created-at migration creates the bootstrap schema invariant idempotently', () => {
  assert.match(
    deckCreatedAtMigration,
    /ALTER\s+COLUMN\s+created_at\s+SET\s+NOT\s+NULL/i,
  );
});
