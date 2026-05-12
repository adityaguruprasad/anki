const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ANKI_SCHEMA_PATH = path.join(__dirname, '..', 'anki.db');

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function readAnkiSchema() {
  const schemaBuffer = fs.readFileSync(ANKI_SCHEMA_PATH);
  assert.equal(
    schemaBuffer.includes(0),
    false,
    'Expected anki.db to be a SQL text schema, but it appears to be binary',
  );

  return schemaBuffer.toString('utf8');
}

function getTableDefinition(tableName) {
  const tablePattern = escapeRegExp(tableName);
  const tableMatch = readAnkiSchema().match(
    new RegExp(`CREATE\\s+TABLE\\s+${tablePattern}\\s*\\(([\\s\\S]*?)\\);`, 'i'),
  );
  assert.ok(tableMatch, `Expected ${tableName} table schema to exist`);

  return tableMatch[1];
}

function getVarcharColumnLength(tableName, columnName) {
  const columnPattern = escapeRegExp(columnName);
  const columnMatch = getTableDefinition(tableName).match(
    new RegExp(`\\b${columnPattern}\\s+VARCHAR\\((\\d+)\\)(?:\\s|,|$)`, 'i'),
  );
  assert.ok(columnMatch, `Expected ${tableName}.${columnName} to declare a VARCHAR length`);

  return Number(columnMatch[1]);
}

module.exports = {
  readAnkiSchema,
  getVarcharColumnLength,
};
