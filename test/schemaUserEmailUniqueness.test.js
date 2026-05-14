const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { getTableDefinition, readAnkiSchema } = require('./schemaHelpers');

const USER_EMAIL_UNIQUE_INDEX = 'users_normalized_email_unique_idx';
const userEmailUniquenessMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '006_enforce_normalized_user_email_uniqueness.sql'),
  'utf8',
);

function assertOrdered(haystack, firstNeedle, secondNeedle) {
  const firstIndex = haystack.search(firstNeedle);
  const secondIndex = haystack.search(secondNeedle);

  assert.notEqual(firstIndex, -1, `Expected migration to contain ${firstNeedle}`);
  assert.notEqual(secondIndex, -1, `Expected migration to contain ${secondNeedle}`);
  assert.ok(firstIndex < secondIndex, `Expected ${firstNeedle} before ${secondNeedle}`);
}

function assertNormalizedUserEmailUniqueIndex(sql) {
  assert.match(
    sql,
    new RegExp(
      `CREATE\\s+UNIQUE\\s+INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${USER_EMAIL_UNIQUE_INDEX}\\s+ON\\s+users\\s*\\(\\s*\\(\\s*LOWER\\s*\\(\\s*TRIM\\s*\\(\\s*email\\s*\\)\\s*\\)\\s*\\)\\s*\\)`,
      'i',
    ),
  );
}

test('anki.db enforces normalized user email uniqueness for new databases', () => {
  const schema = readAnkiSchema();

  assert.match(
    getTableDefinition('users'),
    /\bemail\s+VARCHAR\(100\)\s+UNIQUE\s+NOT\s+NULL\b/i,
  );
  assertNormalizedUserEmailUniqueIndex(schema);
  assert.doesNotMatch(schema, /\bLOCK\s+TABLE\s+users\b/i);
  assert.doesNotMatch(schema, /\bRAISE\s+EXCEPTION\s+'Cannot enforce normalized user email uniqueness:/i);
});

test('normalized user email uniqueness migration prechecks duplicates before indexing', () => {
  const doBlockMatch = userEmailUniquenessMigration.match(/\bDO\s+\$\$([\s\S]*?)END\s+\$\$;/i);
  assert.ok(doBlockMatch, 'Expected migration to contain a DO $$ precheck block');
  const doBlock = doBlockMatch[0];

  assert.match(userEmailUniquenessMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(userEmailUniquenessMigration, /COMMIT;\s*$/i);
  assert.match(
    userEmailUniquenessMigration,
    /LOCK\s+TABLE\s+users\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assert.match(doBlock, /SELECT\s+COUNT\(\*\)[\s\S]*INTO\s+duplicate_normalized_email_group_count/i);
  assert.match(doBlock, /FROM\s+users/i);
  assert.match(doBlock, /GROUP\s+BY\s+LOWER\(TRIM\(email\)\)/i);
  assert.match(doBlock, /HAVING\s+COUNT\(\*\)\s*>\s*1/i);
  assert.match(
    doBlock,
    /RAISE\s+EXCEPTION\s+'Cannot enforce normalized user email uniqueness:/i,
  );
  assert.match(doBlock, /Merge or remove duplicate user accounts/i);

  assertOrdered(userEmailUniquenessMigration, /\bBEGIN;/i, /\bLOCK\s+TABLE\b/i);
  assertOrdered(userEmailUniquenessMigration, /\bLOCK\s+TABLE\b/i, /\bDO\s+\$\$/i);
  assertOrdered(userEmailUniquenessMigration, /\bDO\s+\$\$/i, /\bCREATE\s+UNIQUE\s+INDEX\b/i);
  assertOrdered(userEmailUniquenessMigration, /\bCREATE\s+UNIQUE\s+INDEX\b/i, /\bCOMMIT;/i);
});

test('normalized user email uniqueness migration creates the bootstrap index idempotently', () => {
  assertNormalizedUserEmailUniqueIndex(userEmailUniquenessMigration);
  assert.match(
    userEmailUniquenessMigration,
    new RegExp(`CREATE\\s+UNIQUE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+${USER_EMAIL_UNIQUE_INDEX}`, 'i'),
  );
});

test('normalized user email uniqueness migration does not silently modify account data', () => {
  assert.doesNotMatch(userEmailUniquenessMigration, /\bDELETE\s+FROM\s+users\b/i);
  assert.doesNotMatch(userEmailUniquenessMigration, /\bUPDATE\s+users\b/i);
});
