const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { readAnkiSchema } = require('./schemaHelpers');

const schema = readAnkiSchema();
const hotPathIndexMigration = fs.readFileSync(
  path.join(__dirname, '..', 'migrations', '004_add_hot_path_indexes.sql'),
  'utf8',
);

const HOT_PATH_INDEXES = Object.freeze([
  {
    name: 'decks_user_id_created_at_id_idx',
    table: 'decks',
    columns: 'user_id\\s*,\\s*created_at\\s+DESC\\s*,\\s*id\\s+DESC',
  },
  {
    name: 'cards_deck_id_next_review_idx',
    table: 'cards',
    columns: 'deck_id\\s*,\\s*next_review\\s+ASC\\s+NULLS\\s+FIRST\\s*,\\s*id\\s+ASC',
  },
  {
    name: 'cards_deck_id_created_at_id_idx',
    table: 'cards',
    columns: 'deck_id\\s*,\\s*created_at\\s+DESC\\s*,\\s*id\\s+DESC',
  },
  {
    name: 'cards_deck_id_last_reviewed_idx',
    table: 'cards',
    columns: 'deck_id\\s*,\\s*last_reviewed',
  },
]);

function assertSchemaIndex(sql, { name, table, columns }) {
  assert.match(
    sql,
    new RegExp(`CREATE\\s+INDEX\\s+${name}\\s+ON\\s+${table}\\s*\\(\\s*${columns}\\s*\\)\\s*;`, 'i'),
  );
}

function assertIdempotentMigrationIndex(sql, { name, table, columns }) {
  assert.match(
    sql,
    new RegExp(`CREATE\\s+INDEX\\s+IF\\s+NOT\\s+EXISTS\\s+${name}\\s+ON\\s+${table}\\s*\\(\\s*${columns}\\s*\\)\\s*;`, 'i'),
  );
}

test('anki.db declares indexes for authenticated API hot paths', () => {
  HOT_PATH_INDEXES.forEach((index) => assertSchemaIndex(schema, index));
});

test('hot-path index migration backfills bootstrap indexes idempotently', () => {
  HOT_PATH_INDEXES.forEach((index) => {
    assertSchemaIndex(schema, index);
    assertIdempotentMigrationIndex(hotPathIndexMigration, index);
  });

  assert.equal(
    (hotPathIndexMigration.match(/^\s*CREATE\s+INDEX\b/gim) ?? []).length,
    HOT_PATH_INDEXES.length,
  );
  assert.doesNotMatch(hotPathIndexMigration, /\bCONCURRENTLY\b/i);
  assert.doesNotMatch(hotPathIndexMigration, /\bCREATE\s+UNIQUE\s+INDEX\b/i);
});
