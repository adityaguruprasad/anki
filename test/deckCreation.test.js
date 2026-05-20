const test = require('node:test');
const assert = require('node:assert/strict');

const { createDeck } = require('../apiHandlers');
const {
  DECK_NAME_VALIDATION_ERROR_CODES,
  MAX_DECK_NAME_LENGTH,
  validateDeckName,
} = require('../deckNameValidation');
const { getVarcharColumnLength } = require('./schemaHelpers');

const UNSAFE_DECK_NAME_ERROR =
  'Invalid deck name: cannot contain line breaks, control characters, or invisible formatting characters';

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

test('validateDeckName preserves ordinary trimmed Unicode names', () => {
  assert.deepEqual(
    validateDeckName('  Fran\u00e7ais \u65e5\u672c\u8a9e \u0627\u0644\u0639\u0631\u0628\u064a\u0629 101  '),
    {
      ok: true,
      value: 'Fran\u00e7ais \u65e5\u672c\u8a9e \u0627\u0644\u0639\u0631\u0628\u064a\u0629 101',
    },
  );
});

test('validateDeckName preserves zero width joiner and non-joiner as ordinary text', () => {
  assert.deepEqual(validateDeckName('Biology\u200c\u200d101'), {
    ok: true,
    value: 'Biology\u200c\u200d101',
  });
});

test('validateDeckName rejects embedded invisible and control characters after trim', () => {
  assert.deepEqual(validateDeckName('\n\tBiology 101\t\n'), {
    ok: true,
    value: 'Biology 101',
  });

  for (const [name, description] of [
    ['Biology\n101', 'line feed'],
    ['Biology\t101', 'tab'],
    ['Biology\r101', 'carriage return'],
    ['Biology\u0000101', 'NUL'],
    ['Biology\u007f101', 'DEL'],
    ['Biology\u0085101', 'C1 next line'],
    ['Biology\u009f101', 'C1 application program command'],
    ['Biology\u2028101', 'Unicode line separator'],
    ['Biology\u2029101', 'Unicode paragraph separator'],
    ['Biology\u061c101', 'Arabic letter mark'],
    ['Biology\u200b101', 'zero width space'],
    ['Biology\u200e101', 'left-to-right mark'],
    ['Biology\u202e101', 'right-to-left override'],
    ['Biology\u2060101', 'word joiner'],
    ['Biology\u2066101', 'left-to-right isolate'],
    ['Biology\uFEFF101', 'zero-width no-break space'],
  ]) {
    assert.deepEqual(
      validateDeckName(name),
      {
        ok: false,
        code: DECK_NAME_VALIDATION_ERROR_CODES.UNSAFE_CHARACTERS,
        error: UNSAFE_DECK_NAME_ERROR,
      },
      description,
    );
  }
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
  const req = { body: { name: ' spanish ' }, user: { userId: 1 } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Deck name already exists for this user' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [1, 'spanish']);
});

test('POST /api/decks returns 400 when validation fails', async () => {
  const db = createDb([]);
  const invalidCases = [
    ['   ', 'Invalid deck name: cannot be blank'],
    ['Biology\n101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u200b101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u202e101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u2060101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\uFEFF101', UNSAFE_DECK_NAME_ERROR],
  ];

  for (const [name, error] of invalidCases) {
    const req = { body: { name }, user: { userId: 1 } };
    const res = createRes();

    await createDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
  }
  assert.equal(db.calls.length, 0);
});

test('POST /api/decks inserts trimmed name and returns 201', async () => {
  const createdRow = {
    id: 22,
    user_id: 1,
    name: 'Spanish',
    description: null,
    created_at: '2026-05-08T00:00:00.000Z',
  };
  const db = createDb([{ rowCount: 1, rows: [createdRow] }]);
  const req = { body: { name: '  Spanish  ' }, user: { userId: 1 } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, createdRow);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [1, 'Spanish']);
});
