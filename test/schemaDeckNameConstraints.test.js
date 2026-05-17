const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getTableDefinition } = require('./schemaHelpers');

const DECK_NAME_UNSAFE_PATTERN_SQL = String.raw`U&'[\0001-\001F\007F-\009F\061C\200B\200E\200F\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'`;
const DECK_NAME_TRIM_CHARACTERS_SQL = String.raw`U&'\0020\0009\000A\000B\000C\000D\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF'`;
const decksTable = getTableDefinition('decks');
const deckNameConstraintsMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '009_enforce_deck_name_constraints.sql'),
  'utf8',
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function deckNameBtrimPattern() {
  return `BTRIM\\(\\s*name\\s*,\\s*${escapeRegExp(DECK_NAME_TRIM_CHARACTERS_SQL)}\\s*\\)`;
}

function assertOrdered(haystack, firstNeedle, secondNeedle) {
  const firstIndex = haystack.search(firstNeedle);
  const secondIndex = haystack.search(secondNeedle);

  assert.notEqual(firstIndex, -1, `Expected SQL to contain ${firstNeedle}`);
  assert.notEqual(secondIndex, -1, `Expected SQL to contain ${secondNeedle}`);
  assert.ok(firstIndex < secondIndex, `Expected ${firstNeedle} before ${secondNeedle}`);
}

function assertCheckConstraint(sql, constraintName, expressionPattern) {
  assert.match(
    sql,
    new RegExp(
      `CONSTRAINT\\s+${constraintName}\\s+CHECK\\s*\\(\\s*${expressionPattern}\\s*\\)`,
      'i',
    ),
  );
}

function assertDeckNameConstraints(sql) {
  assertCheckConstraint(
    sql,
    'decks_name_trimmed_check',
    `name\\s*=\\s*${deckNameBtrimPattern()}`,
  );
  assertCheckConstraint(
    sql,
    'decks_name_non_blank_check',
    `${deckNameBtrimPattern()}\\s*<>\\s*''`,
  );
  assertCheckConstraint(
    sql,
    'decks_name_safe_characters_check',
    `name\\s*!~\\s*${escapeRegExp(DECK_NAME_UNSAFE_PATTERN_SQL)}`,
  );
}

function getRaiseExceptionStatement() {
  const match = deckNameConstraintsMigration.match(/RAISE\s+EXCEPTION[\s\S]*?;/i);

  assert.ok(match, 'Expected migration to raise an exception on invalid deck names');
  return match[0];
}

test('anki.db constrains persisted deck names to API invariants', () => {
  assert.match(decksTable, /\bname\s+VARCHAR\(100\)\s+NOT\s+NULL\b/i);
  assertDeckNameConstraints(decksTable);
});

test('deck name constraint migration rejects invalid existing names before altering decks', () => {
  assert.match(deckNameConstraintsMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(deckNameConstraintsMigration, /COMMIT;\s*$/i);
  assert.match(
    deckNameConstraintsMigration,
    /LOCK\s+TABLE\s+decks\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assert.match(deckNameConstraintsMigration, /\(SELECT\s+COUNT\(\*\)\s+FROM\s+invalid_deck_name\)/i);
  assert.match(deckNameConstraintsMigration, /FROM\s+decks/i);
  assert.match(deckNameConstraintsMigration, /name\s+IS\s+NULL/i);
  assert.match(
    deckNameConstraintsMigration,
    new RegExp(
      `name\\s+<>\\s+${deckNameBtrimPattern()}`,
      'i',
    ),
  );
  assert.match(
    deckNameConstraintsMigration,
    new RegExp(`${deckNameBtrimPattern()}\\s*=\\s*''`, 'i'),
  );
  assert.match(
    deckNameConstraintsMigration,
    new RegExp(`name\\s+~\\s+${escapeRegExp(DECK_NAME_UNSAFE_PATTERN_SQL)}`, 'i'),
  );
  assert.match(deckNameConstraintsMigration, /RAISE\s+EXCEPTION\s+'Cannot enforce deck name constraints:/i);

  assertOrdered(deckNameConstraintsMigration, /\bLOCK\s+TABLE\b/i, /\bDO\s+\$\$/i);
  assertOrdered(deckNameConstraintsMigration, /\bDO\s+\$\$/i, /\bALTER\s+TABLE\s+decks\b/i);
});

test('deck name constraint migration rejects Unicode-trimmed blank names', () => {
  assert.match(
    DECK_NAME_TRIM_CHARACTERS_SQL,
    /\\2000/,
    'Expected deck-name trim characters to include a non-ASCII Unicode trim character',
  );
  assert.match(
    DECK_NAME_UNSAFE_PATTERN_SQL,
    /\\200B/,
    'Expected deck-name unsafe characters to reject zero-width space',
  );
  assert.match(
    DECK_NAME_UNSAFE_PATTERN_SQL,
    /\\200E\\200F/,
    'Expected deck-name unsafe characters to preserve existing left-to-right and right-to-left mark rejection',
  );
  assert.match(
    DECK_NAME_UNSAFE_PATTERN_SQL,
    /\\2060/,
    'Expected deck-name unsafe characters to reject word joiner',
  );
  assert.doesNotMatch(
    DECK_NAME_UNSAFE_PATTERN_SQL,
    /\\200B-\\200F|\\200C|\\200D/,
    'Expected deck-name unsafe characters to allow zero-width non-joiner and zero-width joiner',
  );
  assert.match(
    deckNameConstraintsMigration,
    new RegExp(`OR\\s+${deckNameBtrimPattern()}\\s*=\\s*''`, 'i'),
  );
  assert.doesNotMatch(deckNameConstraintsMigration, /name\s+!~\s*'\[\^\[:space:\]\]'/i);
  assert.doesNotMatch(deckNameConstraintsMigration, /decks_name_non_blank_check\s+CHECK\s*\(\s*name\s+~\s*'\[\^\[:space:\]\]'/i);
});

test('deck name constraint migration reports deterministic ids without leaking names', () => {
  const raiseExceptionStatement = getRaiseExceptionStatement();
  const raiseExceptionArgs = raiseExceptionStatement.slice(
    raiseExceptionStatement.indexOf("',") + 2,
  );

  assert.match(deckNameConstraintsMigration, /\binvalid_deck_name_sample_ids\s+BIGINT\[\]/i);
  assert.match(
    deckNameConstraintsMigration,
    /\bWITH\s+invalid_deck_name\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+decks/i,
  );
  assert.match(
    deckNameConstraintsMigration,
    /\binvalid_deck_name_sample\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+invalid_deck_name\s+ORDER\s+BY\s+id\s+LIMIT\s+10\s*\)/i,
  );
  assert.match(
    deckNameConstraintsMigration,
    /array_agg\(\s*id::BIGINT\s+ORDER\s+BY\s+id\s*\)/i,
  );
  assert.match(
    deckNameConstraintsMigration,
    /INTO\s+invalid_deck_name_count\s*,\s*invalid_deck_name_sample_ids/i,
  );
  assert.match(
    raiseExceptionStatement,
    /Cannot enforce deck name constraints: % deck row\(s\)[\s\S]*Sample offending deck id\(s\): %/i,
  );
  assert.match(
    raiseExceptionArgs,
    /invalid_deck_name_count\s*,\s*invalid_deck_name_sample_ids\s*;/i,
  );
  assert.doesNotMatch(raiseExceptionArgs, /\bname\b/i);
});

test('deck name constraint migration creates bootstrap constraints idempotently', () => {
  assert.match(deckNameConstraintsMigration, /ALTER\s+COLUMN\s+name\s+SET\s+NOT\s+NULL/i);

  for (const constraintName of [
    'decks_name_trimmed_check',
    'decks_name_non_blank_check',
    'decks_name_safe_characters_check',
  ]) {
    assert.match(
      deckNameConstraintsMigration,
      new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${constraintName}`, 'i'),
    );
  }

  assertDeckNameConstraints(deckNameConstraintsMigration);
  assert.doesNotMatch(deckNameConstraintsMigration, /\bUPDATE\s+decks\b/i);
  assert.doesNotMatch(deckNameConstraintsMigration, /\bDELETE\s+FROM\s+decks\b/i);
});
