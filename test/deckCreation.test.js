const test = require('node:test');
const assert = require('node:assert/strict');

const { createDeck } = require('../apiHandlers');
const {
  DECK_NAME_VALIDATION_ERROR_CODES,
  MAX_DECK_NAME_LENGTH,
  validateDeckName,
} = require('../deckNameValidation');
const { getVarcharColumnLength } = require('./schemaHelpers');

function createRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

function createDb(results) {
  let index = 0;
  return {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      const next = results[index++];
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
  };
}

test('validateDeckName rejects invalid name types', () => {
  assert.deepEqual(validateDeckName(123), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.NON_STRING,
    error: 'Invalid deck name: must be a string',
  });
  assert.deepEqual(validateDeckName(null), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.NON_STRING,
    error: 'Invalid deck name: must be a string',
  });
  assert.deepEqual(validateDeckName({}), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.NON_STRING,
    error: 'Invalid deck name: must be a string',
  });
});

test('validateDeckName rejects blank names after trim', () => {
  assert.deepEqual(validateDeckName('   '), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.BLANK,
    error: 'Invalid deck name: cannot be blank',
  });
});

test('validateDeckName rejects over-length names', () => {
  const longName = 'a'.repeat(MAX_DECK_NAME_LENGTH + 1);
  assert.deepEqual(validateDeckName(longName), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.TOO_LONG,
    error: `Invalid deck name: must be at most ${MAX_DECK_NAME_LENGTH} characters`,
  });
});

test('validateDeckName stays aligned with the decks.name column length', () => {
  const columnLength = getVarcharColumnLength('decks', 'name');

  assert.equal(MAX_DECK_NAME_LENGTH, columnLength);
  assert.equal(validateDeckName('a'.repeat(columnLength)).ok, true);
  assert.deepEqual(validateDeckName('a'.repeat(columnLength + 1)), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.TOO_LONG,
    error: `Invalid deck name: must be at most ${columnLength} characters`,
  });
});

test('POST /api/decks returns 409 when a case-insensitive duplicate exists', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = { body: { name: ' spanish ' }, user: { userId: 'user-1' } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Deck name already exists for this user' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1', 'spanish']);
});

test('POST /api/decks returns 400 when validation fails', async () => {
  const db = createDb([]);
  const req = { body: { name: '   ' }, user: { userId: 'user-1' } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid deck name: cannot be blank' });
  assert.equal(db.calls.length, 0);
});

test('POST /api/decks inserts trimmed name and returns 201', async () => {
  const createdRow = { id: 22, user_id: 'user-1', name: 'Spanish' };
  const db = createDb([{ rowCount: 1, rows: [createdRow] }]);
  const req = { body: { name: '  Spanish  ' }, user: { userId: 'user-1' } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, createdRow);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1', 'Spanish']);
});
