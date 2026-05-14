const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getTableDefinition } = require('./schemaHelpers');

const USERNAME_UNSAFE_PATTERN_SQL = String.raw`U&'[\0001-\001F\007F-\009F\061C\200B-\200F\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'`;
const EMAIL_UNSAFE_PATTERN_SQL = String.raw`U&'[[:space:]\0001-\001F\007F-\009F\061C\200B-\200F\2028\2029\202A-\202E\2060\2066-\2069\FEFF]'`;
const usersTable = getTableDefinition('users');
const userIdentityMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '008_enforce_user_identity_constraints.sql'),
  'utf8',
);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

function assertUserIdentityConstraints(sql) {
  assertCheckConstraint(
    sql,
    'users_username_trimmed_check',
    'username\\s*=\\s*TRIM\\(\\s*username\\s*\\)',
  );
  assertCheckConstraint(
    sql,
    'users_username_non_blank_check',
    "username\\s*~\\s*'\\[\\^\\[:space:\\]\\]'",
  );
  assertCheckConstraint(
    sql,
    'users_username_safe_characters_check',
    `username\\s*!~\\s*${escapeRegExp(USERNAME_UNSAFE_PATTERN_SQL)}`,
  );
  assertCheckConstraint(
    sql,
    'users_email_normalized_check',
    'email\\s*=\\s*LOWER\\(\\s*TRIM\\(\\s*email\\s*\\)\\s*\\)',
  );
  assertCheckConstraint(
    sql,
    'users_email_shape_check',
    "email\\s*~\\s*'\\^\\[\\^@\\]\\+@\\[\\^@\\]\\+\\$'",
  );
  assertCheckConstraint(
    sql,
    'users_email_safe_characters_check',
    `email\\s*!~\\s*${escapeRegExp(EMAIL_UNSAFE_PATTERN_SQL)}`,
  );
}

function getRaiseExceptionStatement() {
  const match = userIdentityMigration.match(/RAISE\s+EXCEPTION[\s\S]*?;/i);

  assert.ok(match, 'Expected migration to raise an exception on invalid user identities');
  return match[0];
}

test('anki.db constrains persisted account identities to auth-layer invariants', () => {
  assert.match(usersTable, /\busername\s+VARCHAR\(50\)\s+UNIQUE\s+NOT\s+NULL\b/i);
  assert.match(usersTable, /\bemail\s+VARCHAR\(100\)\s+UNIQUE\s+NOT\s+NULL\b/i);
  assertUserIdentityConstraints(usersTable);
});

test('user identity constraint migration rejects invalid existing identities before altering users', () => {
  assert.match(userIdentityMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(userIdentityMigration, /COMMIT;\s*$/i);
  assert.match(
    userIdentityMigration,
    /LOCK\s+TABLE\s+users\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assert.match(userIdentityMigration, /\(SELECT\s+COUNT\(\*\)\s+FROM\s+invalid_user_identity\)/i);
  assert.match(userIdentityMigration, /FROM\s+users/i);
  assert.match(userIdentityMigration, /username\s+IS\s+NULL/i);
  assert.match(userIdentityMigration, /email\s+IS\s+NULL/i);
  assert.match(userIdentityMigration, /username\s+<>\s+TRIM\(username\)/i);
  assert.match(userIdentityMigration, /username\s+!~\s*'\[\^\[:space:\]\]'/i);
  assert.match(
    userIdentityMigration,
    new RegExp(`username\\s+~\\s+${escapeRegExp(USERNAME_UNSAFE_PATTERN_SQL)}`, 'i'),
  );
  assert.match(userIdentityMigration, /email\s+<>\s+LOWER\(TRIM\(email\)\)/i);
  assert.match(userIdentityMigration, /email\s+!~\s*'\^\[\^@\]\+@\[\^@\]\+\$'/i);
  assert.match(
    userIdentityMigration,
    new RegExp(`email\\s+~\\s+${escapeRegExp(EMAIL_UNSAFE_PATTERN_SQL)}`, 'i'),
  );
  assert.match(userIdentityMigration, /RAISE\s+EXCEPTION\s+'Cannot enforce user identity constraints:/i);

  assertOrdered(userIdentityMigration, /\bLOCK\s+TABLE\b/i, /\bDO\s+\$\$/i);
  assertOrdered(userIdentityMigration, /\bDO\s+\$\$/i, /\bALTER\s+TABLE\s+users\b/i);
});

test('user identity constraint migration reports deterministic ids without leaking identity values', () => {
  const raiseExceptionStatement = getRaiseExceptionStatement();
  const raiseExceptionArgs = raiseExceptionStatement.slice(
    raiseExceptionStatement.indexOf("',") + 2,
  );

  assert.match(userIdentityMigration, /\binvalid_user_identity_sample_ids\s+BIGINT\[\]/i);
  assert.match(
    userIdentityMigration,
    /\bWITH\s+invalid_user_identity\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+users/i,
  );
  assert.match(
    userIdentityMigration,
    /\binvalid_user_identity_sample\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+invalid_user_identity\s+ORDER\s+BY\s+id\s+LIMIT\s+10\s*\)/i,
  );
  assert.match(
    userIdentityMigration,
    /array_agg\(\s*id::BIGINT\s+ORDER\s+BY\s+id\s*\)/i,
  );
  assert.match(
    userIdentityMigration,
    /INTO\s+invalid_user_identity_count\s*,\s*invalid_user_identity_sample_ids/i,
  );
  assert.match(
    raiseExceptionStatement,
    /Cannot enforce user identity constraints: % user row\(s\)[\s\S]*Sample offending user id\(s\): %/i,
  );
  assert.match(
    raiseExceptionArgs,
    /invalid_user_identity_count\s*,\s*invalid_user_identity_sample_ids\s*;/i,
  );
  assert.doesNotMatch(raiseExceptionArgs, /\busername\b|\bemail\b/i);
});

test('user identity constraint migration creates bootstrap constraints idempotently', () => {
  assert.match(userIdentityMigration, /ALTER\s+COLUMN\s+username\s+SET\s+NOT\s+NULL/i);
  assert.match(userIdentityMigration, /ALTER\s+COLUMN\s+email\s+SET\s+NOT\s+NULL/i);

  for (const constraintName of [
    'users_username_trimmed_check',
    'users_username_non_blank_check',
    'users_username_safe_characters_check',
    'users_email_normalized_check',
    'users_email_shape_check',
    'users_email_safe_characters_check',
  ]) {
    assert.match(
      userIdentityMigration,
      new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${constraintName}`, 'i'),
    );
  }

  assertUserIdentityConstraints(userIdentityMigration);
  assert.doesNotMatch(userIdentityMigration, /\bUPDATE\s+users\b/i);
  assert.doesNotMatch(userIdentityMigration, /\bDELETE\s+FROM\s+users\b/i);
});
