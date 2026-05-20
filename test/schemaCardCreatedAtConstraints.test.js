const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getTableDefinition } = require('./schemaHelpers');

const cardsTable = getTableDefinition('cards');
const cardCreatedAtMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '011_enforce_card_created_at_constraints.sql'),
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
  const match = cardCreatedAtMigration.match(/RAISE\s+EXCEPTION[\s\S]*?;/i);

  assert.ok(match, 'Expected migration to raise an exception on invalid card created_at values');
  return match[0];
}

test('anki.db requires card created_at for browse ordering and cursors', () => {
  assert.match(
    cardsTable,
    /\bcreated_at\s+TIMESTAMP\s+NOT\s+NULL\s+DEFAULT\s+CURRENT_TIMESTAMP\b/i,
  );
});

test('card created-at migration rejects NULL timestamps before altering cards', () => {
  assert.match(cardCreatedAtMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(cardCreatedAtMigration, /COMMIT;\s*$/i);
  assert.match(
    cardCreatedAtMigration,
    /LOCK\s+TABLE\s+cards\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assert.match(cardCreatedAtMigration, /\(SELECT\s+COUNT\(\*\)\s+FROM\s+invalid_card_created_at\)/i);
  assert.match(cardCreatedAtMigration, /FROM\s+cards/i);
  assert.match(cardCreatedAtMigration, /created_at\s+IS\s+NULL/i);
  assert.match(
    cardCreatedAtMigration,
    /RAISE\s+EXCEPTION\s+'Cannot enforce card created-at constraints:/i,
  );

  assertOrdered(cardCreatedAtMigration, /\bLOCK\s+TABLE\b/i, /\bDO\s+\$\$/i);
  assertOrdered(cardCreatedAtMigration, /created_at\s+IS\s+NULL/i, /ALTER\s+TABLE\s+cards/i);
  assertOrdered(cardCreatedAtMigration, /\bDO\s+\$\$/i, /ALTER\s+TABLE\s+cards/i);
  assert.doesNotMatch(cardCreatedAtMigration, /\bUPDATE\s+cards\b/i);
  assert.doesNotMatch(cardCreatedAtMigration, /\bDELETE\s+FROM\s+cards\b/i);
});

test('card created-at migration reports deterministic ids without leaking card content', () => {
  const raiseExceptionStatement = getRaiseExceptionStatement();
  const raiseExceptionArgs = raiseExceptionStatement.slice(
    raiseExceptionStatement.indexOf("',") + 2,
  );

  assert.match(cardCreatedAtMigration, /\binvalid_card_created_at_sample_ids\s+BIGINT\[\]/i);
  assert.match(
    cardCreatedAtMigration,
    /\bWITH\s+invalid_card_created_at\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+cards/i,
  );
  assert.match(
    cardCreatedAtMigration,
    /\binvalid_card_created_at_sample\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+invalid_card_created_at\s+ORDER\s+BY\s+id\s+LIMIT\s+10\s*\)/i,
  );
  assert.match(
    cardCreatedAtMigration,
    /array_agg\(\s*id::BIGINT\s+ORDER\s+BY\s+id\s*\)/i,
  );
  assert.match(
    cardCreatedAtMigration,
    /INTO\s+invalid_card_created_at_count\s*,\s*invalid_card_created_at_sample_ids/i,
  );
  assert.match(
    raiseExceptionStatement,
    /Cannot enforce card created-at constraints: % card row\(s\)[\s\S]*Sample offending card id\(s\): %/i,
  );
  assert.match(
    raiseExceptionArgs,
    /invalid_card_created_at_count\s*,\s*invalid_card_created_at_sample_ids\s*;/i,
  );
  assert.doesNotMatch(raiseExceptionArgs, /\bfront_content\b|\bback_content\b/i);
});

test('card created-at migration creates the bootstrap schema invariant idempotently', () => {
  assert.match(
    cardCreatedAtMigration,
    /ALTER\s+COLUMN\s+created_at\s+SET\s+NOT\s+NULL/i,
  );
});
