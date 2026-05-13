const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readAnkiSchema } = require('./schemaHelpers');

const ANKI_SCHEMA_PATH = path.join(__dirname, '..', 'anki.db');
const DECK_NAME_UNIQUE_INDEX = 'decks_user_id_normalized_name_unique_idx';
const DECK_NAME_UNIQUENESS_MIGRATION_PATH = path.join(
  __dirname,
  '..',
  'migrations',
  '003_enforce_deck_name_uniqueness.sql',
);
const deckNameUniquenessMigration = fs.readFileSync(
  DECK_NAME_UNIQUENESS_MIGRATION_PATH,
  'utf8',
);

function splitTopLevelSqlStatements(sql) {
  const statements = [];
  let statementStart = 0;
  let inLineComment = false;
  let inBlockComment = false;
  let inSingleQuote = false;
  let dollarQuoteDelimiter = null;

  for (let index = 0; index < sql.length; index += 1) {
    const current = sql[index];
    const next = sql[index + 1];

    if (inLineComment) {
      if (current === '\n') {
        inLineComment = false;
      }
      continue;
    }

    if (inBlockComment) {
      if (current === '*' && next === '/') {
        inBlockComment = false;
        index += 1;
      }
      continue;
    }

    if (dollarQuoteDelimiter) {
      if (sql.startsWith(dollarQuoteDelimiter, index)) {
        index += dollarQuoteDelimiter.length - 1;
        dollarQuoteDelimiter = null;
      }
      continue;
    }

    if (inSingleQuote) {
      if (current === "'" && next === "'") {
        index += 1;
        continue;
      }
      if (current === "'") {
        inSingleQuote = false;
      }
      continue;
    }

    if (current === '-' && next === '-') {
      inLineComment = true;
      index += 1;
      continue;
    }

    if (current === '/' && next === '*') {
      inBlockComment = true;
      index += 1;
      continue;
    }

    if (current === "'") {
      inSingleQuote = true;
      continue;
    }

    if (current === '$') {
      const dollarQuoteMatch = sql.slice(index).match(/^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/);
      if (dollarQuoteMatch) {
        [dollarQuoteDelimiter] = dollarQuoteMatch;
        index += dollarQuoteDelimiter.length - 1;
        continue;
      }
    }

    if (current === ';') {
      const statement = sql.slice(statementStart, index + 1).trim();
      if (statement) {
        statements.push(statement);
      }
      statementStart = index + 1;
    }
  }

  assert.equal(inSingleQuote, false, 'Expected migration string literal to be closed');
  assert.equal(inBlockComment, false, 'Expected migration block comment to be closed');
  assert.equal(
    dollarQuoteDelimiter,
    null,
    'Expected migration dollar-quoted PL/pgSQL block delimiter to be closed',
  );
  assert.match(
    sql.slice(statementStart),
    /^(?:\s|--[^\n]*(?:\n|$)|\/\*[\s\S]*?\*\/)*$/,
    'Expected migration to end after a complete top-level SQL statement',
  );

  return statements;
}

function stripLeadingLineComments(statement) {
  let stripped = statement.trimStart();

  while (stripped.startsWith('--')) {
    const newlineIndex = stripped.indexOf('\n');
    stripped = newlineIndex === -1 ? '' : stripped.slice(newlineIndex + 1).trimStart();
  }

  return stripped;
}

function assertOrdered(haystack, firstNeedle, secondNeedle) {
  const firstIndex = haystack.search(firstNeedle);
  const secondIndex = haystack.search(secondNeedle);

  assert.notEqual(firstIndex, -1, `Expected migration to contain ${firstNeedle}`);
  assert.notEqual(secondIndex, -1, `Expected migration to contain ${secondNeedle}`);
  assert.ok(firstIndex < secondIndex, `Expected ${firstNeedle} before ${secondNeedle}`);
}

function assertNormalizedDeckNameUniqueIndex(sql) {
  assert.match(
    sql,
    new RegExp(
      `CREATE\\s+UNIQUE\\s+INDEX(?:\\s+IF\\s+NOT\\s+EXISTS)?\\s+${DECK_NAME_UNIQUE_INDEX}\\s+ON\\s+decks\\s*\\(\\s*user_id\\s*,\\s*\\(\\s*LOWER\\(TRIM\\(name\\)\\)\\s*\\)\\s*\\)`,
      'i',
    ),
  );
}

test('readAnkiSchema reads anki.db before asserting the deck-name uniqueness index', () => {
  const schema = readAnkiSchema();

  assert.equal(
    schema,
    fs.readFileSync(ANKI_SCHEMA_PATH, 'utf8'),
    'Expected readAnkiSchema() to return the static anki.db bootstrap schema',
  );
  assert.notEqual(
    schema,
    deckNameUniquenessMigration,
    'Expected bootstrap schema coverage to be independent from the migration file',
  );
  assert.doesNotMatch(schema, /\bLOCK\s+TABLE\s+decks\b/i);
  assert.doesNotMatch(schema, /\bRAISE\s+EXCEPTION\s+'Cannot enforce per-user deck name uniqueness:/i);
  assertNormalizedDeckNameUniqueIndex(schema);
});

test('deck name uniqueness migration has parseable top-level transaction structure', () => {
  const statements = splitTopLevelSqlStatements(deckNameUniquenessMigration)
    .map(stripLeadingLineComments);

  assert.equal(statements.length, 5);
  assert.match(statements[0], /^BEGIN;$/i);
  assert.match(statements[1], /^LOCK\s+TABLE\s+decks\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE;$/i);
  assert.match(statements[2], /^DO\s+\$\$[\s\S]*\bDECLARE\b[\s\S]*\bBEGIN\b[\s\S]*\bEND\s+\$\$;$/i);
  assert.equal(
    (statements[2].match(/\$\$/g) || []).length,
    2,
    'Expected the PL/pgSQL block to use one balanced $$ delimiter pair',
  );
  assertNormalizedDeckNameUniqueIndex(statements[3]);
  assert.match(statements[3], /;$/);
  assert.doesNotMatch(statements[3], /\bCONCURRENTLY\b/i);
  assert.match(statements[4], /^COMMIT;$/i);
});

test('deck name uniqueness migration uses a transaction and locks decks before prechecks', () => {
  assert.match(deckNameUniquenessMigration, /^\s*(?:--[^\n]*\n)*BEGIN;\s*/i);
  assert.match(deckNameUniquenessMigration, /COMMIT;\s*$/i);
  assert.match(
    deckNameUniquenessMigration,
    /LOCK\s+TABLE\s+decks\s+IN\s+ACCESS\s+EXCLUSIVE\s+MODE/i,
  );

  assertOrdered(deckNameUniquenessMigration, /\bBEGIN;/i, /\bLOCK\s+TABLE\b/i);
  assertOrdered(deckNameUniquenessMigration, /\bLOCK\s+TABLE\b/i, /\bDO\s+\$\$/i);
  assertOrdered(deckNameUniquenessMigration, /\bDO\s+\$\$/i, /\bCREATE\s+UNIQUE\s+INDEX\b/i);
  assertOrdered(deckNameUniquenessMigration, /\bCREATE\s+UNIQUE\s+INDEX\b/i, /\bCOMMIT;/i);
});

test('deck name uniqueness migration rejects existing duplicate normalized names first', () => {
  const doBlockMatch = deckNameUniquenessMigration.match(/\bDO\s+\$\$([\s\S]*?)END\s+\$\$;/i);
  assert.ok(doBlockMatch, 'Expected migration to contain a DO $$ precheck block');
  const doBlock = doBlockMatch[0];

  assert.match(doBlock, /SELECT\s+COUNT\(\*\)[\s\S]*INTO\s+duplicate_normalized_name_group_count/i);
  assert.match(doBlock, /FROM\s+decks/i);
  assert.match(doBlock, /GROUP\s+BY\s+user_id\s*,\s*LOWER\(TRIM\(name\)\)/i);
  assert.match(doBlock, /HAVING\s+COUNT\(\*\)\s*>\s*1/i);
  assert.match(
    doBlock,
    /RAISE\s+EXCEPTION\s+'Cannot enforce per-user deck name uniqueness:/i,
  );
  assert.match(doBlock, /Rename or merge duplicate decks for each user/i);

  assertOrdered(
    deckNameUniquenessMigration,
    /GROUP\s+BY\s+user_id\s*,\s*LOWER\(TRIM\(name\)\)/i,
    /\bCREATE\s+UNIQUE\s+INDEX\b/i,
  );
});

test('deck name uniqueness migration creates the bootstrap schema index idempotently', () => {
  assertNormalizedDeckNameUniqueIndex(deckNameUniquenessMigration);
  assert.match(
    deckNameUniquenessMigration,
    new RegExp(`CREATE\\s+UNIQUE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+${DECK_NAME_UNIQUE_INDEX}`, 'i'),
  );
});

test('deck name uniqueness migration does not silently modify duplicate deck data', () => {
  assert.doesNotMatch(deckNameUniquenessMigration, /\bDELETE\s+FROM\s+decks\b/i);
  assert.doesNotMatch(deckNameUniquenessMigration, /\bUPDATE\s+decks\b/i);
});
