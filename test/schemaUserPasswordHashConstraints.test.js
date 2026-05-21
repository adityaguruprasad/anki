const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { AUTH_PASSWORD_HASH_MAX_LENGTH } = require('../auth');
const { getTableDefinition } = require('./schemaHelpers');

const PASSWORD_HASH_UNSAFE_PATTERN_SQL = String.raw`U&'[\0001-\001F\007F-\009F\00A0\061C\1680\2000-\200A\200B-\200F\2028\2029\202A-\202E\202F\205F\2060\2066-\2069\3000\FEFF]'`;
const PASSWORD_HASH_ECMASCRIPT_TRIM_WHITESPACE_SQL_ESCAPES = [
  String.raw`\00A0`,
  String.raw`\1680`,
  String.raw`\2000-\200A`,
  String.raw`\202F`,
  String.raw`\205F`,
  String.raw`\3000`,
];
const PASSWORD_HASH_EXISTING_UNSAFE_SQL_ESCAPES = [
  String.raw`\0001-\001F`,
  String.raw`\007F-\009F`,
  String.raw`\061C`,
  String.raw`\200B-\200F`,
  String.raw`\2028`,
  String.raw`\2029`,
  String.raw`\202A-\202E`,
  String.raw`\2060`,
  String.raw`\2066-\2069`,
  String.raw`\FEFF`,
];
const usersTable = getTableDefinition('users');
const userPasswordHashMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '014_enforce_user_password_hash_constraints.sql'),
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

function assertPasswordHashConstraints(sql) {
  assert.match(
    sql,
    /CONSTRAINT\s+users_password_hash_non_blank_check\s+CHECK\s*\(\s*password_hash\s*~\s*'\[\^\[:space:\]\]'\s*\)/i,
  );
  assert.match(
    sql,
    new RegExp(
      `CONSTRAINT\\s+users_password_hash_safe_characters_check\\s+CHECK\\s*\\(\\s*password_hash\\s*!~\\s*${escapeRegExp(PASSWORD_HASH_UNSAFE_PATTERN_SQL)}\\s*\\)`,
      'i',
    ),
  );
  assert.match(
    sql,
    new RegExp(
      `CONSTRAINT\\s+users_password_hash_max_length_check\\s+CHECK\\s*\\(\\s*char_length\\(\\s*password_hash\\s*\\)\\s*<=\\s*${AUTH_PASSWORD_HASH_MAX_LENGTH}\\s*\\)`,
      'i',
    ),
  );
}

function getRaiseExceptionStatement() {
  const match = userPasswordHashMigration.match(/RAISE\s+EXCEPTION[\s\S]*?;/i);

  assert.ok(match, 'Expected migration to raise an exception on invalid user password hashes');
  return match[0];
}

test('anki.db constrains persisted password hashes to auth-layer invariants', () => {
  assert.match(
    usersTable,
    new RegExp(`\\bpassword_hash\\s+VARCHAR\\(${AUTH_PASSWORD_HASH_MAX_LENGTH}\\)\\s+NOT\\s+NULL\\b`, 'i'),
  );
  assertPasswordHashConstraints(usersTable);
});

test('user password-hash migration rejects invalid existing hashes before altering users', () => {
  assert.match(userPasswordHashMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(userPasswordHashMigration, /COMMIT;\s*$/i);
  assert.match(
    userPasswordHashMigration,
    /LOCK\s+TABLE\s+users\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assert.match(userPasswordHashMigration, /\(SELECT\s+COUNT\(\*\)\s+FROM\s+invalid_user_password_hash\)/i);
  assert.match(userPasswordHashMigration, /FROM\s+users/i);
  assert.match(userPasswordHashMigration, /password_hash\s+IS\s+NULL/i);
  assert.match(userPasswordHashMigration, /password_hash\s+!~\s*'\[\^\[:space:\]\]'/i);
  assert.match(
    userPasswordHashMigration,
    new RegExp(`char_length\\(\\s*password_hash\\s*\\)\\s*>\\s*${AUTH_PASSWORD_HASH_MAX_LENGTH}`, 'i'),
  );
  assert.match(
    userPasswordHashMigration,
    new RegExp(`password_hash\\s+~\\s+${escapeRegExp(PASSWORD_HASH_UNSAFE_PATTERN_SQL)}`, 'i'),
  );
  assert.match(userPasswordHashMigration, /RAISE\s+EXCEPTION\s+'Cannot enforce user password hash constraints:/i);

  assertOrdered(userPasswordHashMigration, /\bLOCK\s+TABLE\b/i, /\bDO\s+\$\$/i);
  assertOrdered(userPasswordHashMigration, /\bDO\s+\$\$/i, /\bALTER\s+TABLE\s+users\b/i);
});

test('password-hash unsafe pattern covers ECMAScript trim whitespace', () => {
  for (const escapeSequence of PASSWORD_HASH_ECMASCRIPT_TRIM_WHITESPACE_SQL_ESCAPES) {
    assert.match(
      PASSWORD_HASH_UNSAFE_PATTERN_SQL,
      new RegExp(escapeRegExp(escapeSequence)),
      `Expected password-hash unsafe characters to reject ${escapeSequence}`,
    );
  }

  for (const escapeSequence of PASSWORD_HASH_EXISTING_UNSAFE_SQL_ESCAPES) {
    assert.match(
      PASSWORD_HASH_UNSAFE_PATTERN_SQL,
      new RegExp(escapeRegExp(escapeSequence)),
      `Expected password-hash unsafe characters to preserve ${escapeSequence}`,
    );
  }
});

test('user password-hash migration reports deterministic ids without leaking hash values', () => {
  const raiseExceptionStatement = getRaiseExceptionStatement();
  const raiseExceptionArgs = raiseExceptionStatement.slice(
    raiseExceptionStatement.indexOf("',") + 2,
  );

  assert.match(userPasswordHashMigration, /\binvalid_user_credential_sample_ids\s+BIGINT\[\]/i);
  assert.match(
    userPasswordHashMigration,
    /\bWITH\s+invalid_user_password_hash\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+users/i,
  );
  assert.match(
    userPasswordHashMigration,
    /\binvalid_user_password_hash_sample\s+AS\s*\(\s*SELECT\s+id\s+FROM\s+invalid_user_password_hash\s+ORDER\s+BY\s+id\s+LIMIT\s+10\s*\)/i,
  );
  assert.match(
    userPasswordHashMigration,
    /array_agg\(\s*id::BIGINT\s+ORDER\s+BY\s+id\s*\)/i,
  );
  assert.match(
    userPasswordHashMigration,
    /INTO\s+invalid_user_credential_count\s*,\s*invalid_user_credential_sample_ids/i,
  );
  assert.match(
    raiseExceptionStatement,
    /Cannot enforce user password hash constraints: % user row\(s\)[\s\S]*Sample offending user id\(s\): %/i,
  );
  assert.match(
    raiseExceptionArgs,
    /invalid_user_credential_count\s*,\s*invalid_user_credential_sample_ids\s*;/i,
  );
  assert.doesNotMatch(raiseExceptionArgs, /\bpassword_hash\b|\bpassword\b/i);
});

test('user password-hash migration creates bootstrap constraints idempotently', () => {
  assert.match(userPasswordHashMigration, /ALTER\s+COLUMN\s+password_hash\s+SET\s+NOT\s+NULL/i);

  for (const constraintName of [
    'users_password_hash_non_blank_check',
    'users_password_hash_safe_characters_check',
    'users_password_hash_max_length_check',
  ]) {
    assert.match(
      userPasswordHashMigration,
      new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${constraintName}`, 'i'),
    );
  }

  assertPasswordHashConstraints(userPasswordHashMigration);
  assert.doesNotMatch(userPasswordHashMigration, /\bUPDATE\s+users\b/i);
  assert.doesNotMatch(userPasswordHashMigration, /\bDELETE\s+FROM\s+users\b/i);
});
