const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getTableDefinition } = require('./schemaHelpers');

const MAX_CARD_CONTENT_LENGTH = 10000;
const cardsTable = getTableDefinition('cards');
const cardContentMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '007_enforce_card_content_constraints.sql'),
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
  const match = cardContentMigration.match(/RAISE\s+EXCEPTION[\s\S]*?;/i);

  assert.ok(match, 'Expected migration to raise an exception on invalid card content');
  return match[0];
}

function assertNonBlankContentConstraint(sql, columnName) {
  assert.match(
    sql,
    new RegExp(
      `CONSTRAINT\\s+cards_${columnName}_non_blank_check\\s+CHECK\\s*\\(\\s*${columnName}\\s*~\\s*'\\[\\^\\[:space:\\]\\]'\\s*\\)`,
      'i',
    ),
  );
}

function assertMaxLengthContentConstraint(sql, columnName) {
  assert.match(
    sql,
    new RegExp(
      `CONSTRAINT\\s+cards_${columnName}_max_length_check\\s+CHECK\\s*\\(\\s*char_length\\(\\s*${columnName}\\s*\\)\\s*<=\\s*${MAX_CARD_CONTENT_LENGTH}\\s*\\)`,
      'i',
    ),
  );
}

test('anki.db constrains persisted card content to API invariants', () => {
  assert.match(cardsTable, /\bfront_content\s+TEXT\s+NOT\s+NULL\b/i);
  assert.match(cardsTable, /\bback_content\s+TEXT\s+NOT\s+NULL\b/i);

  for (const columnName of ['front_content', 'back_content']) {
    assertNonBlankContentConstraint(cardsTable, columnName);
    assertMaxLengthContentConstraint(cardsTable, columnName);
  }
});

test('card content constraint migration rejects invalid existing content before altering cards', () => {
  assert.match(cardContentMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(cardContentMigration, /COMMIT;\s*$/i);
  assert.match(
    cardContentMigration,
    /LOCK\s+TABLE\s+cards\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assert.match(cardContentMigration, /\(SELECT\s+COUNT\(\*\)\s+FROM\s+invalid_card_content\)/i);
  assert.match(cardContentMigration, /FROM\s+cards/i);
  assert.match(cardContentMigration, /front_content\s+IS\s+NULL/i);
  assert.match(cardContentMigration, /back_content\s+IS\s+NULL/i);
  assert.match(cardContentMigration, /front_content\s+!~\s*'\[\^\[:space:\]\]'/i);
  assert.match(cardContentMigration, /back_content\s+!~\s*'\[\^\[:space:\]\]'/i);
  assert.match(
    cardContentMigration,
    new RegExp(`char_length\\(\\s*front_content\\s*\\)\\s*>\\s*${MAX_CARD_CONTENT_LENGTH}`, 'i'),
  );
  assert.match(
    cardContentMigration,
    new RegExp(`char_length\\(\\s*back_content\\s*\\)\\s*>\\s*${MAX_CARD_CONTENT_LENGTH}`, 'i'),
  );
  assert.match(cardContentMigration, /RAISE\s+EXCEPTION\s+'Cannot enforce card content constraints:/i);

  assertOrdered(cardContentMigration, /\bLOCK\s+TABLE\b/i, /\bDO\s+\$\$/i);
  assertOrdered(cardContentMigration, /\bDO\s+\$\$/i, /\bALTER\s+TABLE\s+cards\b/i);
  assert.doesNotMatch(cardContentMigration, /\bUPDATE\s+cards\b/i);
  assert.doesNotMatch(cardContentMigration, /\bDELETE\s+FROM\s+cards\b/i);
});

test('card content constraint migration reports deterministic invalid card id sample', () => {
  const raiseExceptionStatement = getRaiseExceptionStatement();
  const raiseExceptionArgs = raiseExceptionStatement.slice(
    raiseExceptionStatement.indexOf("',") + 2,
  );

  assert.match(cardContentMigration, /\binvalid_card_content_sample_ids\s+BIGINT\[\]/i);
  assert.match(
    cardContentMigration,
    /\bWITH\s+invalid_card_content\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+cards/i,
  );
  assert.match(
    cardContentMigration,
    /\binvalid_card_content_sample\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+invalid_card_content\s+ORDER\s+BY\s+id\s+LIMIT\s+10\s*\)/i,
  );
  assert.match(
    cardContentMigration,
    /array_agg\(\s*id::BIGINT\s+ORDER\s+BY\s+id\s*\)/i,
  );
  assert.match(
    cardContentMigration,
    /INTO\s+invalid_card_content_count\s*,\s*invalid_card_content_sample_ids/i,
  );

  assert.match(
    raiseExceptionStatement,
    /Cannot enforce card content constraints: % card row\(s\)[\s\S]*Sample offending card id\(s\): %/i,
  );
  assert.match(
    raiseExceptionArgs,
    /invalid_card_content_count\s*,\s*invalid_card_content_sample_ids\s*;/i,
  );
  assert.doesNotMatch(raiseExceptionArgs, /\bfront_content\b|\bback_content\b/i);
});

test('card content constraint migration creates the bootstrap schema constraints idempotently', () => {
  for (const columnName of ['front_content', 'back_content']) {
    assert.match(
      cardContentMigration,
      new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+cards_${columnName}_non_blank_check`, 'i'),
    );
    assert.match(
      cardContentMigration,
      new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+cards_${columnName}_max_length_check`, 'i'),
    );
    assertNonBlankContentConstraint(cardContentMigration, columnName);
    assertMaxLengthContentConstraint(cardContentMigration, columnName);
  }
});
