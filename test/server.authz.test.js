const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createCard,
  createDeck,
  deleteCard,
  deleteDeck,
  getCardsByDeck,
  getDecks,
  getStats,
  getSchedulingInsights,
  getDueCardsByDeck,
  renameDeck,
  submitStudySession,
  isValidQuality,
  validatePositiveIntegerIdentifier,
  updateCard,
} = require('../apiHandlers');
const { getVarcharColumnLength, readAnkiSchema } = require('./schemaHelpers');

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

function createTransactionDb(results) {
  let index = 0;
  const calls = [];
  const client = {
    released: false,
    async query(sql, params) {
      calls.push({ sql, params });
      if (/^\s*(BEGIN|COMMIT|ROLLBACK)\s*$/i.test(sql)) {
        return { rowCount: 0, rows: [] };
      }

      const next = results[index++];
      if (next instanceof Error) {
        throw next;
      }
      return next;
    },
    release() {
      this.released = true;
    },
  };

  return {
    calls,
    client,
    connectCalls: 0,
    async connect() {
      this.connectCalls += 1;
      return client;
    },
  };
}

function addUnexpectedConnect(db) {
  db.connectCalls = 0;
  db.connect = async () => {
    db.connectCalls += 1;
    throw new Error('db.connect should not be called');
  };
  return db;
}

const EXPECTED_PUBLIC_CARD_READ_FIELDS = Object.freeze([
  'id',
  'deck_id',
  'front_content',
  'back_content',
  'created_at',
  'last_reviewed',
  'next_review',
  'interval',
  'review_count',
  'ease_factor',
]);
const EXPECTED_PUBLIC_DECK_READ_FIELDS = Object.freeze([
  'id',
  'user_id',
  'name',
  'description',
  'created_at',
]);

function createCardReadRow(overrides = {}) {
  return {
    id: 1,
    deck_id: 42,
    front_content: 'Front',
    back_content: 'Back',
    created_at: '2026-05-08T12:00:00.000Z',
    last_reviewed: null,
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 1,
    review_count: 0,
    ease_factor: 2.5,
    ...overrides,
  };
}

function assertExplicitPublicCardReadSelect(sql) {
  const selectMatch = /\bSELECT\b/i.exec(sql);
  const fromMatch = /\bFROM\s+decks\s+d\b/i.exec(sql);
  assert.ok(selectMatch, 'expected SQL to contain SELECT');
  assert.ok(fromMatch, 'expected card read SQL to select from decks d');

  const selectClause = sql.slice(selectMatch.index + selectMatch[0].length, fromMatch.index);
  assert.doesNotMatch(selectClause, /\bc\.\*/i);

  for (const field of EXPECTED_PUBLIC_CARD_READ_FIELDS) {
    assert.match(
      selectClause,
      new RegExp(`(?:^|,)\\s*c\\.${field}\\s*(?:,|$)`, 'i'),
      `expected card read SELECT to include explicit c.${field}`,
    );
  }
}

function assertExplicitPublicDeckReadSelect(sql) {
  const selectMatch = /\bSELECT\b/i.exec(sql);
  const fromMatch = /\bFROM\s+decks\s+d\b/i.exec(sql);
  assert.ok(selectMatch, 'expected SQL to contain SELECT');
  assert.ok(fromMatch, 'expected deck read SQL to select from decks d');

  const selectClause = sql.slice(selectMatch.index + selectMatch[0].length, fromMatch.index);
  assert.doesNotMatch(selectClause, /\bd\.\*/i);

  for (const field of EXPECTED_PUBLIC_DECK_READ_FIELDS) {
    assert.match(
      selectClause,
      new RegExp(`(?:^|,)\\s*d\\.${field}\\s*(?:,|$)`, 'i'),
      `expected deck read SELECT to include explicit d.${field}`,
    );
  }
}

function assertExplicitPublicDeckReturning(sql) {
  const returningMatch = /\bRETURNING\b/i.exec(sql);
  assert.ok(returningMatch, 'expected SQL to contain RETURNING');

  const returningClause = sql.slice(returningMatch.index + returningMatch[0].length);
  assert.doesNotMatch(returningClause, /\*/);

  for (const field of EXPECTED_PUBLIC_DECK_READ_FIELDS) {
    assert.match(
      returningClause,
      new RegExp(`(?:^|,)\\s*(?:d\\.)?${field}\\s*(?:,|\\)|$)`, 'i'),
      `expected deck RETURNING to include explicit ${field}`,
    );
  }
}

function assertDuePredicate(sql, tableAlias = 'c') {
  assert.match(
    sql,
    new RegExp(`\\b${tableAlias}\\.next_review IS NULL\\s+OR\\s+${tableAlias}\\.next_review <= NOW\\(\\)`, 'i'),
  );
}

function assertStudySessionCardReadSql(sql) {
  const selectMatch = /\bSELECT\b/i.exec(sql);
  const fromMatch = /\bFROM\s+cards\s+c\b/i.exec(sql);
  assert.ok(selectMatch, 'expected study-session card read SQL to contain SELECT');
  assert.ok(fromMatch, 'expected study-session card read SQL to read from cards c');

  const selectClause = sql.slice(selectMatch.index + selectMatch[0].length, fromMatch.index);
  assert.doesNotMatch(selectClause, /\bc\.\*/i);
  for (const field of EXPECTED_PUBLIC_CARD_READ_FIELDS) {
    assert.match(
      selectClause,
      new RegExp(`(?:^|,)\\s*c\\.${field}\\s*(?:,|$)`, 'i'),
      `expected study-session card read SELECT to include explicit c.${field}`,
    );
  }

  assert.match(sql, /AS "__is_due"/);
  assert.match(sql, /JOIN\s+decks\s+d\s+ON\s+d\.id\s+=\s+c\.deck_id/i);
  assert.match(sql, /WHERE\s+c\.id\s+=\s+\$1/i);
  assert.match(sql, /d\.user_id\s+=\s+\$2/i);
  assert.match(sql, /FOR\s+UPDATE\s+OF\s+c/i);
  assertDuePredicate(sql);
  assert.doesNotMatch(sql, /\bSELECT\s+c\.\*/i);
}

function assertStudySessionUpdateSql(sql) {
  assert.match(sql, /WITH\s+target\s+AS\s*\(/i);
  assert.match(sql, /SELECT\s+c\.id\s+FROM\s+cards\s+c/i);
  assert.match(sql, /JOIN\s+decks\s+d\s+ON\s+d\.id\s+=\s+c\.deck_id/i);
  assert.match(sql, /WHERE\s+c\.id\s+=\s+\$5/i);
  assert.match(sql, /d\.user_id\s+=\s+\$6/i);
  assert.match(sql, /FOR\s+UPDATE\s+OF\s+c/i);
  assert.match(sql, /updated\s+AS\s*\(\s*UPDATE\s+cards/i);
  assert.match(sql, /last_reviewed\s+=\s+\$1/i);
  assert.match(sql, /next_review\s+=\s+\$2/i);
  assert.match(sql, /interval\s+=\s+\$3/i);
  assert.match(sql, /ease_factor\s+=\s+\$4/i);
  assert.match(sql, /review_count\s+=\s+COALESCE\s*\(\s*review_count\s*,\s*0\s*\)\s*\+\s*1/i);
  assert.match(sql, /WHERE\s+id\s+=\s+\$5/i);
  assert.match(sql, /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+target/i);
  assert.match(sql, /target\.id\s+=\s+cards\.id/i);
  assertDuePredicate(sql, 'cards');
  assert.match(sql, /TRUE\s+AS\s+"__updated"/i);
  assert.match(sql, /UNION\s+ALL/i);
  assert.match(sql, /UNION\s+ALL\s+SELECT\s+NULL\s+AS\s+id[\s\S]*?NULL\s+AS\s+last_reviewed[\s\S]*?FALSE\s+AS\s+"__updated"[\s\S]*?FROM\s+target/i);
  assert.match(sql, /FALSE\s+AS\s+"__updated"/i);
  assert.match(sql, /WHERE\s+NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+updated\s*\)/i);
}

function assertDeleteDeckAtomicSql(sql) {
  assert.match(sql, /WITH\s+target\s+AS\s*\(/i);
  assert.match(sql, /SELECT\s+id\s+FROM\s+decks/i);
  assert.match(sql, /WHERE\s+id\s+=\s+\$1\s+AND\s+user_id\s+=\s+\$2/i);
  assert.match(sql, /deleted_cards\s+AS\s*\(\s*DELETE\s+FROM\s+cards\s+c/i);
  assert.match(sql, /USING\s+target/i);
  assert.match(sql, /WHERE\s+c\.deck_id\s+=\s+target\.id/i);
  assert.match(sql, /deleted_deck\s+AS\s*\(\s*DELETE\s+FROM\s+decks\s+d/i);
  assert.match(sql, /WHERE\s+d\.id\s+=\s+target\.id/i);
  assert.match(sql, /SELECT\s+COUNT\(\*\)\s+FROM\s+deleted_cards/i);
  assert.match(sql, /RETURNING\s+d\.id/i);
  assert.match(sql, /SELECT\s+id\s+FROM\s+deleted_deck/i);
  assert.doesNotMatch(sql, /\bBEGIN\b|\bCOMMIT\b|\bROLLBACK\b/i);
}

test('POST /api/decks returns 400 for invalid deck name and skips db query', async () => {
  const deckNameColumnLength = getVarcharColumnLength('decks', 'name');
  const invalidCases = [
    [undefined, 'Invalid deck name: must be a string'],
    [null, 'Invalid deck name: must be a string'],
    [42, 'Invalid deck name: must be a string'],
    ['', 'Invalid deck name: cannot be blank'],
    ['   ', 'Invalid deck name: cannot be blank'],
    ['Biology\n101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u0085101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u2028101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u200b101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u202e101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u2060101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\uFEFF101', UNSAFE_DECK_NAME_ERROR],
    [
      'a'.repeat(deckNameColumnLength + 1),
      `Invalid deck name: must be at most ${deckNameColumnLength} characters`,
    ],
  ];

  for (const [name, error] of invalidCases) {
    const db = createDb([]);
    const req = { body: { name }, user: { userId: 'user-1' } };
    const res = createRes();

    await createDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
    assert.equal(db.calls.length, 0);
  }
});

test('POST /api/decks returns 409 for duplicate user deck name with one query', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = { body: { name: ' Biology ' }, user: { userId: 'user-1' } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Deck name already exists for this user' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1', 'Biology']);
});

test('POST /api/decks creates normalized deck with one query', async () => {
  const deck = {
    id: 12,
    user_id: 'user-1',
    name: 'Biology',
    description: null,
    created_at: '2026-05-08T00:00:00.000Z',
  };
  const db = createDb([{ rowCount: 1, rows: [{ ...deck, private_note: 'do not expose' }] }]);
  const req = { body: { name: ' Biology ' }, user: { userId: 'user-1' } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, deck);
  assert.equal(Object.hasOwn(res.body, 'private_note'), false);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1', 'Biology']);
  assertExplicitPublicDeckReturning(db.calls[0].sql);
});

test('POST /api/decks returns 500 when the inserted row is missing deck response fields', async (t) => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: 12, user_id: 'user-1', name: 'Biology', description: null }],
    },
  ]);
  const req = { body: { name: 'Biology' }, user: { userId: 'user-1' } };
  const res = createRes();
  t.mock.method(console, 'error', () => {});

  await createDeck(req, res, db);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1', 'Biology']);
});

test('POST /api/decks fails closed when the insert result cardinality is malformed', async (t) => {
  const createdDeck = {
    id: 12,
    user_id: 'user-1',
    name: 'Biology',
    description: null,
    created_at: '2026-05-08T00:00:00.000Z',
  };
  const malformedResults = [
    { rowCount: 1, rows: [] },
    { rowCount: 0, rows: [createdDeck] },
    { rowCount: 2, rows: [createdDeck] },
    { rowCount: 1, rows: [createdDeck, { ...createdDeck, id: 13 }] },
    { rowCount: 2, rows: [createdDeck, { ...createdDeck, id: 13 }] },
  ];
  t.mock.method(console, 'error', () => {});

  for (const result of malformedResults) {
    const db = createDb([result]);
    const req = { body: { name: 'Biology' }, user: { userId: 'user-1' } };
    const res = createRes();

    await createDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, ['user-1', 'Biology']);
  }
});

test('POST /api/decks uses atomic conflict handling for duplicate deck names', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: 12, user_id: 'user-1', name: 'Biology', description: null, created_at: '2026-05-08T00:00:00.000Z' }],
    },
  ]);
  const req = { body: { name: 'Biology' }, user: { userId: 'user-1' } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /INSERT\s+INTO\s+decks\s+\(user_id,\s+name\)/i);
  assert.match(db.calls[0].sql, /VALUES\s*\(\$1,\s*\$2\)/i);
  assert.match(db.calls[0].sql, /ON\s+CONFLICT\s*\(\s*user_id\s*,\s*\(\s*LOWER\(TRIM\(name\)\)\s*\)\s*\)\s+DO\s+NOTHING/i);
  assertExplicitPublicDeckReturning(db.calls[0].sql);
  assert.doesNotMatch(db.calls[0].sql, /RETURNING\s+\*/i);
  assert.doesNotMatch(db.calls[0].sql, /NOT\s+EXISTS/i);
});

test('PATCH /api/decks/:deckId returns 400 for invalid deckId and skips db query', async () => {
  const invalidDeckIds = [
    undefined,
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -5 ',
    0,
    -2,
    1.3,
    '2147483648',
    2147483648,
    '9007199254740992',
  ];

  for (const deckId of invalidDeckIds) {
    const db = createDb([]);
    const req = { params: { deckId }, body: { name: 'Renamed' }, user: { userId: 'user-1' } };
    const res = createRes();

    await renameDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid deckId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
  }
});

test('PATCH /api/decks/:deckId returns 400 for invalid deck name and skips db query', async () => {
  const deckNameColumnLength = getVarcharColumnLength('decks', 'name');
  const invalidCases = [
    [undefined, 'Invalid deck name: must be a string'],
    [null, 'Invalid deck name: must be a string'],
    [42, 'Invalid deck name: must be a string'],
    ['', 'Invalid deck name: cannot be blank'],
    ['   ', 'Invalid deck name: cannot be blank'],
    ['Biology\n101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u0085101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u200b101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u2029101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u2066101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\u2060101', UNSAFE_DECK_NAME_ERROR],
    ['Biology\uFEFF101', UNSAFE_DECK_NAME_ERROR],
    [
      'a'.repeat(deckNameColumnLength + 1),
      `Invalid deck name: must be at most ${deckNameColumnLength} characters`,
    ],
  ];

  for (const [name, error] of invalidCases) {
    const db = createDb([]);
    const req = { params: { deckId: '42' }, body: { name }, user: { userId: 'user-1' } };
    const res = createRes();

    await renameDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
    assert.equal(db.calls.length, 0);
  }
});

test('PATCH /api/decks/:deckId renames an owned deck with one atomic query', async () => {
  const deck = {
    id: 42,
    user_id: 'user-1',
    name: 'Organic Chemistry',
    description: null,
    created_at: '2026-05-08T00:00:00.000Z',
  };
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ deckExists: true, duplicateExists: false, deck: { ...deck, private_note: 'do not expose' } }],
    },
  ]);
  const req = { params: { deckId: '42' }, body: { name: ' Organic Chemistry ' }, user: { userId: 'user-1' } };
  const res = createRes();

  await renameDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, deck);
  assert.equal(Object.hasOwn(res.body, 'private_note'), false);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Organic Chemistry']);
  assert.match(db.calls[0].sql, /WITH\s+target\s+AS/i);
  assert.match(db.calls[0].sql, /UPDATE\s+decks\s+d/i);
  assert.match(db.calls[0].sql, /SET\s+name\s+=\s+\$3/i);
  assert.match(db.calls[0].sql, /WHERE\s+id\s+=\s+\$1\s+AND\s+user_id\s+=\s+\$2/i);
  assert.match(db.calls[0].sql, /LOWER\(TRIM\(name\)\)\s+=\s+LOWER\(TRIM\(\$3\)\)/i);
  assert.match(db.calls[0].sql, /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+duplicate\s*\)/i);
  assertExplicitPublicDeckReturning(db.calls[0].sql);
  assert.doesNotMatch(db.calls[0].sql, /RETURNING\s+d\.\*/i);
});

test('PATCH /api/decks/:deckId returns 500 when the renamed row is missing deck response fields', async (t) => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{
        deckExists: true,
        duplicateExists: false,
        deck: { id: 42, user_id: 'user-1', name: 'Organic Chemistry', description: null },
      }],
    },
  ]);
  const req = { params: { deckId: '42' }, body: { name: 'Organic Chemistry' }, user: { userId: 'user-1' } };
  const res = createRes();
  t.mock.method(console, 'error', () => {});

  await renameDeck(req, res, db);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Organic Chemistry']);
});

test('PATCH /api/decks/:deckId fails closed when the rename control result is malformed', async (t) => {
  const deck = {
    id: 42,
    user_id: 'user-1',
    name: 'Organic Chemistry',
    description: null,
    created_at: '2026-05-08T00:00:00.000Z',
  };
  const successControlRow = { deckExists: true, duplicateExists: false, deck };
  const malformedResults = [
    { rowCount: 0, rows: [] },
    { rowCount: 2, rows: [successControlRow, successControlRow] },
    { rowCount: 1, rows: [{ deckExists: 'true', duplicateExists: false, deck }] },
    { rowCount: 1, rows: [{ deckExists: true, duplicateExists: 'false', deck }] },
    { rowCount: 1, rows: [{ duplicateExists: false, deck }] },
    { rowCount: 1, rows: [{ deckExists: false, duplicateExists: false, deck }] },
    { rowCount: 1, rows: [{ deckExists: true, duplicateExists: true, deck }] },
    { rowCount: 1, rows: [{ deckExists: true, duplicateExists: false, deck: null }] },
  ];
  t.mock.method(console, 'error', () => {});

  for (const result of malformedResults) {
    const db = createDb([result]);
    const req = { params: { deckId: '42' }, body: { name: 'Organic Chemistry' }, user: { userId: 'user-1' } };
    const res = createRes();

    await renameDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Organic Chemistry']);
  }
});

test('PATCH /api/decks/:deckId returns 404 for missing or unowned deck', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ deckExists: false, duplicateExists: true, deck: null }],
    },
  ]);
  const req = { params: { deckId: '42' }, body: { name: 'Biology' }, user: { userId: 'user-1' } };
  const res = createRes();

  await renameDeck(req, res, db);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Deck not found' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Biology']);
});

test('PATCH /api/decks/:deckId returns 409 for duplicate normalized deck name', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ deckExists: true, duplicateExists: true, deck: null }],
    },
  ]);
  const req = { params: { deckId: '42' }, body: { name: ' biology ' }, user: { userId: 'user-1' } };
  const res = createRes();

  await renameDeck(req, res, db);

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Deck name already exists for this user' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'biology']);
  assert.match(db.calls[0].sql, /user_id\s+=\s+\$2/i);
  assert.match(db.calls[0].sql, /id\s+<>\s+\$1/i);
  assert.match(db.calls[0].sql, /LOWER\(TRIM\(name\)\)\s+=\s+LOWER\(TRIM\(\$3\)\)/i);
});

test('anki.db enforces unique normalized deck names per user', () => {
  const schema = readAnkiSchema();

  assert.match(schema, /CREATE\s+UNIQUE\s+INDEX\s+\S+\s+ON\s+decks\s*\(\s*user_id\s*,\s*\(\s*LOWER\(TRIM\(name\)\)\s*\)\s*\)/i);
});

test('GET /api/decks returns decks with one user-scoped aggregate query', async () => {
  const db = createDb([
    {
      rowCount: 2,
      rows: [
        { id: 1, user_id: 'user-1', name: 'Biology', description: null, created_at: '2026-05-08', totalCards: '10', dueCards: '3', private_note: 'do not expose' },
        { id: 2, user_id: 'user-1', name: 'Math', description: 'Algebra', created_at: '2026-05-08', totalCards: '4', dueCards: '0', private_note: 'do not expose' },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  await getDecks(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [
    { id: 1, user_id: 'user-1', name: 'Biology', description: null, created_at: '2026-05-08', totalCards: 10, dueCards: 3 },
    { id: 2, user_id: 'user-1', name: 'Math', description: 'Algebra', created_at: '2026-05-08', totalCards: 4, dueCards: 0 },
  ]);
  assert.equal(Object.hasOwn(res.body[0], 'private_note'), false);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1']);
  assertExplicitPublicDeckReadSelect(db.calls[0].sql);
  assert.match(db.calls[0].sql, /FROM decks d/);
  assert.match(db.calls[0].sql, /LEFT JOIN cards c ON c\.deck_id = d\.id/);
  assert.match(db.calls[0].sql, /WHERE d\.user_id = \$1/);
  assert.match(db.calls[0].sql, /GROUP BY d\.id/);
  assert.match(db.calls[0].sql, /ORDER BY d\.created_at DESC,\s*d\.id DESC/);
  assert.match(db.calls[0].sql, /COUNT\(c\.id\) AS "totalCards"/);
  assert.match(db.calls[0].sql, /COUNT\(c\.id\) FILTER \(WHERE/i);
  assertDuePredicate(db.calls[0].sql);
  assert.match(db.calls[0].sql, /AS "dueCards"/);
});

test('GET /api/decks preserves empty decks with zero counts', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [
        { id: 3, user_id: 'user-1', name: 'Empty', description: null, created_at: '2026-05-08', totalCards: '0', dueCards: '0' },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  await getDecks(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [
    { id: 3, user_id: 'user-1', name: 'Empty', description: null, created_at: '2026-05-08', totalCards: 0, dueCards: 0 },
  ]);
  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /LEFT JOIN cards c/);
});

test('GET /api/decks converts aggregate strings to numbers', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [
        { id: 4, user_id: 'user-1', name: 'Chemistry', totalCards: '12', dueCards: '5' },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  await getDecks(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [
    { id: 4, user_id: 'user-1', name: 'Chemistry', totalCards: 12, dueCards: 5 },
  ]);
  assert.equal(typeof res.body[0].totalCards, 'number');
  assert.equal(typeof res.body[0].dueCards, 'number');
});

test('GET /api/decks normalizes safe aggregate count representations', async () => {
  const db = createDb([
    {
      rowCount: 3,
      rows: [
        { id: 5, user_id: 'user-1', name: 'String Counts', totalCards: '12', dueCards: '2' },
        { id: 6, user_id: 'user-1', name: 'BigInt Counts', totalCards: 12n, dueCards: 2n },
        { id: 7, user_id: 'user-1', name: 'Number Counts', totalCards: 12, dueCards: 2 },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  await getDecks(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [
    { id: 5, user_id: 'user-1', name: 'String Counts', totalCards: 12, dueCards: 2 },
    { id: 6, user_id: 'user-1', name: 'BigInt Counts', totalCards: 12, dueCards: 2 },
    { id: 7, user_id: 'user-1', name: 'Number Counts', totalCards: 12, dueCards: 2 },
  ]);
  assert.equal(db.calls.length, 1);
});

test('GET /api/decks fails closed when the deck-list query result shape is malformed', async (t) => {
  const validRow = {
    id: 7,
    user_id: 'user-1',
    name: 'Biology',
    description: null,
    created_at: '2026-05-08',
    totalCards: '3',
    dueCards: '1',
  };
  const malformedResults = [
    null,
    { rowCount: 0, rows: [validRow] },
    { rowCount: 2, rows: [validRow] },
    { rowCount: 1, rows: [validRow, { ...validRow, id: 8 }] },
    { rowCount: '1', rows: [validRow] },
    { rowCount: -1, rows: [] },
    { rowCount: 1 },
    { rowCount: 1, rows: { ...validRow } },
  ];
  t.mock.method(console, 'error', () => {});

  for (const result of malformedResults) {
    const db = createDb([result]);
    const req = { user: { userId: 'user-1' } };
    const res = createRes();

    await getDecks(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, ['user-1']);
  }
});

test('GET /api/decks fails closed when a deck-list row is missing or cannot use required response fields', async (t) => {
  const malformedRows = [
    { id: 7, totalCards: '3', dueCards: '1' },
    { id: 7, name: 'Biology', dueCards: '1' },
    { id: 7, name: 'Biology', totalCards: '3' },
    { id: 'deck-7', name: 'Biology', totalCards: '3', dueCards: '1' },
    { id: 7, name: '', totalCards: '3', dueCards: '1' },
    { id: 7, name: '   ', totalCards: '3', dueCards: '1' },
    { id: 7, name: null, totalCards: '3', dueCards: '1' },
    { id: 7, name: 'Biology', totalCards: '1e3', dueCards: '1' },
    { id: 7, name: 'Biology', totalCards: Number.MAX_SAFE_INTEGER + 1, dueCards: 0 },
    { id: 7, name: 'Biology', totalCards: '9007199254740992', dueCards: 0 },
    { id: 7, name: 'Biology', totalCards: 1, dueCards: 2 },
  ];
  t.mock.method(console, 'error', () => {});

  for (const row of malformedRows) {
    const db = createDb([{ rowCount: 1, rows: [row] }]);
    const req = { user: { userId: 'user-1' } };
    const res = createRes();

    await getDecks(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, ['user-1']);
  }
});

test('GET /api/decks returns 500 when the db query fails', async () => {
  const db = createDb([new Error('db unavailable')]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();
  const originalError = console.error;
  console.error = () => {};

  try {
    await getDecks(req, res, db);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1']);
});

test('DELETE /api/decks/:deckId returns 400 for invalid deckId and skips db query', async () => {
  const invalidDeckIds = [
    undefined,
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -5 ',
    0,
    -2,
    1.3,
    '2147483648',
    2147483648,
    '9007199254740992',
  ];

  for (const deckId of invalidDeckIds) {
    const db = addUnexpectedConnect(createDb([]));
    const req = { params: { deckId }, user: { userId: 'user-1' } };
    const res = createRes();

    await deleteDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid deckId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
    assert.equal(db.connectCalls, 0);
  }
});

test('DELETE /api/decks/:deckId deletes scoped cards and deck with one atomic query', async () => {
  const db = addUnexpectedConnect(createDb([
    { rowCount: 1, rows: [{ id: 42 }] },
  ]));
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await deleteDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(db.calls.length, 1);
  assert.equal(db.connectCalls, 0);
  assert.deepEqual(db.calls[0].params, [42, 'user-1']);
  assertDeleteDeckAtomicSql(db.calls[0].sql);
});

test('DELETE /api/decks/:deckId returns 500 when the atomic delete result is missing the returned deck row', async (t) => {
  const db = addUnexpectedConnect(createDb([
    { rowCount: 1, rows: [] },
  ]));
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();
  t.mock.method(console, 'error', () => {});

  await deleteDeck(req, res, db);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.calls.length, 1);
  assert.equal(db.connectCalls, 0);
  assert.deepEqual(db.calls[0].params, [42, 'user-1']);
  assertDeleteDeckAtomicSql(db.calls[0].sql);
});

test('DELETE /api/decks/:deckId fails closed when the atomic delete cardinality is malformed', async (t) => {
  const malformedResults = [
    { rowCount: 0, rows: [{ id: 42 }] },
    { rowCount: 2, rows: [{ id: 42 }] },
    { rowCount: 1, rows: [{ id: 42 }, { id: 43 }] },
    { rowCount: 2, rows: [{ id: 42 }, { id: 43 }] },
  ];
  t.mock.method(console, 'error', () => {});

  for (const result of malformedResults) {
    const db = addUnexpectedConnect(createDb([result]));
    const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
    const res = createRes();

    await deleteDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.equal(db.connectCalls, 0);
    assert.deepEqual(db.calls[0].params, [42, 'user-1']);
    assertDeleteDeckAtomicSql(db.calls[0].sql);
  }
});

test('DELETE /api/decks/:deckId fails closed when the atomic delete result has an impossible deck id', async (t) => {
  const malformedRows = [
    { id: null },
    { id: 'deck-42' },
    { id: 0 },
    { id: -1 },
    { id: 2147483648 },
  ];
  t.mock.method(console, 'error', () => {});

  for (const row of malformedRows) {
    const db = addUnexpectedConnect(createDb([
      { rowCount: 1, rows: [row] },
    ]));
    const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
    const res = createRes();

    await deleteDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.equal(db.connectCalls, 0);
    assert.deepEqual(db.calls[0].params, [42, 'user-1']);
    assertDeleteDeckAtomicSql(db.calls[0].sql);
  }
});

test('DELETE /api/decks/:deckId returns 404 for missing or unowned deck', async () => {
  const db = addUnexpectedConnect(createDb([
    { rowCount: 0, rows: [] },
  ]));
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await deleteDeck(req, res, db);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Deck not found' });
  assert.equal(db.calls.length, 1);
  assert.equal(db.connectCalls, 0);
  assert.deepEqual(db.calls[0].params, [42, 'user-1']);
  assertDeleteDeckAtomicSql(db.calls[0].sql);
});

test('DELETE /api/decks/:deckId returns 500 when the atomic delete query fails', async () => {
  const db = addUnexpectedConnect(createDb([
    new Error('delete failed'),
  ]));
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();
  const originalError = console.error;
  console.error = () => {};

  try {
    await deleteDeck(req, res, db);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.calls.length, 1);
  assert.equal(db.connectCalls, 0);
  assert.deepEqual(db.calls[0].params, [42, 'user-1']);
  assertDeleteDeckAtomicSql(db.calls[0].sql);
});

test('isValidQuality accepts only integers from 0 to 5', () => {
  assert.equal(isValidQuality(0), true);
  assert.equal(isValidQuality(5), true);
  assert.equal(isValidQuality(3), true);
  assert.equal(isValidQuality(-1), false);
  assert.equal(isValidQuality(6), false);
  assert.equal(isValidQuality(3.5), false);
  assert.equal(isValidQuality('3'), false);
});

test('validatePositiveIntegerIdentifier accepts only positive integer-like values', () => {
  const maxPostgresSerialId = 2147483647;

  assert.deepEqual(
    validatePositiveIntegerIdentifier(5, 'deckId'),
    { ok: true, value: 5 }
  );
  assert.deepEqual(
    validatePositiveIntegerIdentifier(maxPostgresSerialId, 'deckId'),
    { ok: true, value: maxPostgresSerialId }
  );
  assert.deepEqual(
    validatePositiveIntegerIdentifier(' 42 ', 'deckId'),
    { ok: true, value: 42 }
  );
  assert.deepEqual(
    validatePositiveIntegerIdentifier(` ${maxPostgresSerialId} `, 'deckId'),
    { ok: true, value: maxPostgresSerialId }
  );
  assert.deepEqual(
    validatePositiveIntegerIdentifier('00042', 'deckId'),
    { ok: true, value: 42 }
  );

  const invalidValues = [
    undefined,
    null,
    '',
    '  ',
    'abc',
    '1.2',
    '1e2',
    0,
    -1,
    1.5,
    maxPostgresSerialId + 1,
    `${maxPostgresSerialId + 1}`,
    Number.MAX_SAFE_INTEGER,
    `${Number.MAX_SAFE_INTEGER}`,
    Number.MAX_SAFE_INTEGER + 1,
    `${Number.MAX_SAFE_INTEGER + 1}`,
    '10000000000000000',
    '9007199254740993',
    '9'.repeat(1000),
  ];
  for (const value of invalidValues) {
    assert.deepEqual(
      validatePositiveIntegerIdentifier(value, 'deckId'),
      { ok: false, error: 'Invalid deckId: must be a positive integer' }
    );
  }
});

test('GET /api/cards/:deckId returns 400 for invalid deckId and skips db query', async () => {
  const invalidDeckIds = [
    undefined,
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -5 ',
    0,
    -2,
    1.3,
    '2147483648',
    2147483648,
    '9007199254740992',
  ];

  for (const deckId of invalidDeckIds) {
    const db = createDb([]);
    const req = { params: { deckId }, user: { userId: 'user-1' } };
    const res = createRes();

    await getDueCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid deckId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
  }
});

test('GET /api/decks/:deckId/cards returns 400 for invalid deckId and skips db query', async () => {
  const invalidDeckIds = [
    undefined,
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -5 ',
    0,
    -2,
    1.3,
    '2147483648',
    2147483648,
    '9007199254740992',
  ];

  for (const deckId of invalidDeckIds) {
    const db = createDb([]);
    const req = { params: { deckId }, user: { userId: 'user-1' } };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid deckId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
  }
});

test('GET /api/decks/:deckId/cards returns 404 for missing or unowned deck', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Deck not found for user' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
});

test('GET /api/decks/:deckId/cards fails closed when the list query result shape is malformed', async (t) => {
  const validRow = {
    ...createCardReadRow({
      id: 3,
      deck_id: 42,
      front_content: 'Future card',
      back_content: 'Answer',
      created_at: '2026-05-08T13:00:00.000Z',
      next_review: '2026-05-20T12:00:00.000Z',
    }),
    __cursor_created_at: '2026-05-08T13:00:00.000000Z',
    __owned_deck_id: 42,
  };
  const malformedResults = [
    null,
    { rowCount: 0, rows: [validRow] },
    { rowCount: 2, rows: [validRow] },
    { rowCount: 1, rows: [validRow, { ...validRow, id: 4 }] },
    { rowCount: '1', rows: [validRow] },
    { rowCount: -1, rows: [] },
    { rowCount: 1 },
    { rowCount: 1, rows: { ...validRow } },
  ];
  t.mock.method(console, 'error', () => {});

  for (const result of malformedResults) {
    const db = createDb([result]);
    const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
  }
});

test('GET /api/decks/:deckId/cards returns empty page for owned empty deck', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: null, __owned_deck_id: 42 }],
    },
  ]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards: [], nextCursor: null });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
});

test('GET /api/decks/:deckId/cards fails closed when rows are not anchored to the requested deck', async (t) => {
  const card = createCardReadRow({
    id: 3,
    deck_id: 42,
    front_content: 'Future card',
    back_content: 'Answer',
    created_at: '2026-05-08T13:00:00.000Z',
    next_review: '2026-05-20T12:00:00.000Z',
  });
  const malformedRows = [
    { id: null },
    { id: null, __owned_deck_id: 41 },
    { ...card, deck_id: 41, __cursor_created_at: '2026-05-08T13:00:00.000000Z', __owned_deck_id: 42 },
    { ...card, __cursor_created_at: '2026-05-08T13:00:00.000000Z', __owned_deck_id: 41 },
  ];
  t.mock.method(console, 'error', () => {});

  for (const row of malformedRows) {
    const db = createDb([{ rowCount: 1, rows: [row] }]);
    const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
  }
});

test('GET /api/decks/:deckId/cards returns default-limited owned deck cards newest first', async () => {
  const cards = [
    createCardReadRow({
      id: 3,
      deck_id: 42,
      front_content: 'Future card',
      back_content: 'Answer',
      created_at: '2026-05-08T13:00:00.000Z',
      next_review: '2026-05-20T12:00:00.000Z',
    }),
    createCardReadRow({
      id: 2,
      deck_id: 42,
      front_content: 'Due card',
      back_content: 'Answer',
      created_at: '2026-05-08T12:00:00.000Z',
      next_review: '2026-05-07T12:00:00.000Z',
    }),
  ];
  const db = createDb([
    {
      rowCount: 2,
      rows: cards.map((card) => ({
        ...card,
        private_note: 'do not expose',
        __cursor_created_at: card.created_at.replace('.000Z', '.000000Z'),
        __owned_deck_id: 42,
      })),
    },
  ]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards, nextCursor: null });
  assert.equal(Object.hasOwn(res.body.cards[0], '__owned_deck_id'), false);
  assert.equal(Object.hasOwn(res.body.cards[0], '__cursor_created_at'), false);
  assert.equal(Object.hasOwn(res.body.cards[0], 'private_note'), false);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
});

test('GET /api/decks/:deckId/cards fails closed when a card row violates read response invariants', async (t) => {
  const validCard = createCardReadRow({
    id: 3,
    deck_id: 42,
    front_content: 'Future card',
    back_content: 'Answer',
    created_at: '2026-05-08T13:00:00.000Z',
    next_review: '2026-05-20T12:00:00.000Z',
  });
  const rowWithoutFrontContent = { ...validCard };
  delete rowWithoutFrontContent.front_content;
  const malformedRows = [
    { ...validCard, id: 'card-3' },
    { ...validCard, deck_id: 'deck-42' },
    rowWithoutFrontContent,
    { ...validCard, back_content: '   ' },
    { ...validCard, created_at: 'not-a-date' },
    { ...validCard, next_review: 'not-a-date' },
    { ...validCard, interval: 0 },
    { ...validCard, ease_factor: 1.29 },
    { ...validCard, review_count: -1 },
  ];
  t.mock.method(console, 'error', () => {});

  for (const row of malformedRows) {
    const db = createDb([
      {
        rowCount: 1,
        rows: [{ ...row, __cursor_created_at: '2026-05-08T13:00:00.000000Z', __owned_deck_id: 42 }],
      },
    ]);
    const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
  }
});

test('GET /api/decks/:deckId/cards uses one user-scoped ordered browse query with default limit', async () => {
  const db = createDb([{ rowCount: 1, rows: [{ id: null, __owned_deck_id: 42 }] }]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
  assertExplicitPublicCardReadSelect(db.calls[0].sql);
  assert.match(db.calls[0].sql, /to_char\(c\.created_at,\s*'YYYY-MM-DD"T"HH24:MI:SS\.US"Z"'\)\s+AS\s+"__cursor_created_at"/);
  assert.match(db.calls[0].sql, /FROM decks d\s+LEFT JOIN cards c/i);
  assert.match(db.calls[0].sql, /ON c\.deck_id = d\.id/i);
  assert.match(db.calls[0].sql, /WHERE d\.id = \$1 AND d\.user_id = \$2/);
  assert.match(db.calls[0].sql, /ORDER BY c\.created_at DESC,\s*c\.id DESC/);
  assert.match(db.calls[0].sql, /\bLIMIT \$3/);
  assert.doesNotMatch(db.calls[0].sql, /c\.next_review <= NOW\(\)/);
  assert.doesNotMatch(db.calls[0].sql, /LIMIT\s+50/);
});

test('GET /api/decks/:deckId/cards returns next cursor only when limit plus one row exists', async () => {
  const createdAt = new Date('2026-05-08T13:00:00.000Z');
  const card = createCardReadRow({
    id: 3,
    deck_id: 42,
    front_content: 'Future card',
    back_content: 'Answer',
    created_at: createdAt,
    next_review: '2026-05-20T12:00:00.000Z',
  });
  const extraCard = createCardReadRow({
    id: 2,
    deck_id: 42,
    front_content: 'Extra card',
    back_content: 'Answer',
    created_at: new Date('2026-05-08T12:00:00.000Z'),
    next_review: '2026-05-19T12:00:00.000Z',
  });
  const db = createDb([
    {
      rowCount: 2,
      rows: [
        { ...card, __cursor_created_at: '2026-05-08T13:00:00.123456Z', __owned_deck_id: 42 },
        { ...extraCard, __cursor_created_at: '2026-05-08T12:00:00.000000Z', __owned_deck_id: 42 },
      ],
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: { limit: '1' },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    cards: [card],
    nextCursor: {
      cursorCreatedAt: '2026-05-08T13:00:00.123456Z',
      cursorId: 3,
      beforeCreatedAt: '2026-05-08T13:00:00.123456Z',
      beforeId: 3,
    },
  });
  assert.equal(Object.hasOwn(res.body.cards[0], '__cursor_created_at'), false);
  assert.equal(Object.hasOwn(res.body.cards[0], '__owned_deck_id'), false);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 2]);
  assert.match(db.calls[0].sql, /\bLIMIT \$3/);
  assert.doesNotMatch(db.calls[0].sql, /LIMIT\s+1/);
});

test('GET /api/decks/:deckId/cards fails closed when next cursor metadata is malformed', async (t) => {
  const baseCard = createCardReadRow({
    id: 3,
    deck_id: 42,
    front_content: 'Future card',
    back_content: 'Answer',
    created_at: new Date('2026-05-08T13:00:00.000Z'),
    next_review: '2026-05-20T12:00:00.000Z',
  });
  const extraCard = createCardReadRow({
    id: 2,
    deck_id: 42,
    front_content: 'Extra card',
    back_content: 'Answer',
    created_at: new Date('2026-05-08T12:00:00.000Z'),
    next_review: '2026-05-19T12:00:00.000Z',
    __cursor_created_at: '2026-05-08T12:00:00.000000Z',
    __owned_deck_id: 42,
  });
  const malformedPageRows = [
    { ...baseCard, __owned_deck_id: 42 },
    { ...baseCard, __cursor_created_at: 'not-a-date', __owned_deck_id: 42 },
    { ...baseCard, id: 'card-3', __cursor_created_at: '2026-05-08T13:00:00.000000Z', __owned_deck_id: 42 },
  ];
  t.mock.method(console, 'error', () => {});

  for (const pageRow of malformedPageRows) {
    const db = createDb([
      {
        rowCount: 2,
        rows: [pageRow, extraCard],
      },
    ]);
    const req = {
      params: { deckId: '42' },
      query: { limit: '1' },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [42, 'user-1', 2]);
  }
});

test('GET /api/decks/:deckId/cards omits next cursor when only limit rows are returned', async () => {
  const card = createCardReadRow({
    id: 3,
    deck_id: 42,
    front_content: 'Future card',
    back_content: 'Answer',
    created_at: new Date('2026-05-08T13:00:00.000Z'),
    next_review: '2026-05-20T12:00:00.000Z',
  });
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ ...card, __cursor_created_at: '2026-05-08T13:00:00.123456Z', __owned_deck_id: 42 }],
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: { limit: '1' },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards: [card], nextCursor: null });
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 2]);
  assert.match(db.calls[0].sql, /\bLIMIT \$3/);
  assert.doesNotMatch(db.calls[0].sql, /LIMIT\s+1/);
});

test('GET /api/decks/:deckId/cards returns 400 for invalid limit and skips db query', async () => {
  const invalidLimits = [
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -5 ',
    0,
    -2,
    1.3,
    ['1'],
    '101',
    101,
    '9007199254740992',
  ];

  for (const limit of invalidLimits) {
    const db = createDb([]);
    const req = {
      params: { deckId: '42' },
      query: { limit },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid limit: must be a positive integer no greater than 100' });
    assert.equal(db.calls.length, 0);
  }
});

test('GET /api/decks/:deckId/cards returns 400 for non-string q and skips db query', async () => {
  const invalidQueries = [
    { q: ['bio'] },
    { q: null },
    { q: 42 },
    { q: true },
  ];

  for (const query of invalidQueries) {
    const db = createDb([]);
    const req = {
      params: { deckId: '42' },
      query,
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid q: must be a string' });
    assert.equal(db.calls.length, 0);
  }
});

test('GET /api/decks/:deckId/cards returns 400 for q with null bytes and skips db query', async () => {
  const db = createDb([]);
  const req = {
    params: { deckId: '42' },
    query: { q: 'front\u0000back' },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid q: cannot contain null bytes' });
  assert.equal(db.calls.length, 0);
});

test('GET /api/decks/:deckId/cards treats whitespace q like an omitted q', async () => {
  const db = createDb([{ rowCount: 1, rows: [{ id: null, __owned_deck_id: 42 }] }]);
  const req = {
    params: { deckId: '42' },
    query: { q: '   ' },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards: [], nextCursor: null });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
  assert.doesNotMatch(db.calls[0].sql, /POSITION\(/i);
  assert.match(db.calls[0].sql, /\bLIMIT \$3/);
});

test('GET /api/decks/:deckId/cards returns 400 for over-length q and skips db query', async () => {
  const db = createDb([]);
  const req = {
    params: { deckId: '42' },
    query: { q: ` ${'a'.repeat(201)} ` },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid q: must be 200 characters or fewer' });
  assert.equal(db.calls.length, 0);
});

test('GET /api/decks/:deckId/cards filters q against front and back content with parameterized SQL', async () => {
  const card = createCardReadRow({
    id: 3,
    deck_id: 42,
    front_content: 'Cell division',
    back_content: 'Mitosis',
    created_at: '2026-05-08T13:00:00.000Z',
    next_review: '2026-05-20T12:00:00.000Z',
  });
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ ...card, __cursor_created_at: '2026-05-08T13:00:00.000000Z', __owned_deck_id: 42 }],
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: { q: '  Mito  ' },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards: [card], nextCursor: null });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Mito', 51]);
  assert.match(
    db.calls[0].sql,
    /POSITION\(LOWER\(\$3\) IN LOWER\(c\.front_content\)\) > 0\s+OR POSITION\(LOWER\(\$3\) IN LOWER\(c\.back_content\)\) > 0/i
  );
  assert.match(db.calls[0].sql, /ORDER BY c\.created_at DESC,\s*c\.id DESC\s+LIMIT \$4/);
  assert.doesNotMatch(db.calls[0].sql, /Mito/);
});

test('GET /api/decks/:deckId/cards returns empty page for owned deck with no q matches', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: null, __owned_deck_id: 42 }],
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: { q: 'absent' },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards: [], nextCursor: null });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'absent', 51]);
});

test('GET /api/decks/:deckId/cards returns 400 for invalid cursor and skips db query', async () => {
  const invalidCursors = [
    {
      query: { beforeCreatedAt: '2026-05-08T13:00:00.000Z' },
      error: 'Invalid cursor: created-at and id values must be provided together',
    },
    {
      query: { beforeId: '3' },
      error: 'Invalid cursor: created-at and id values must be provided together',
    },
    {
      query: { cursorCreatedAt: '2026-05-08T13:00:00.000Z' },
      error: 'Invalid cursor: created-at and id values must be provided together',
    },
    {
      query: { cursorId: '3' },
      error: 'Invalid cursor: created-at and id values must be provided together',
    },
    {
      query: { beforeCreatedAt: 'not-a-date', beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: '', beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: '   ', beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: null, beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: true, beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: 2026, beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: '2026', beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: '2026-05-08', beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: '2026-05-08T13:00:00', beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: '2026-05-08T13:00:00.1234567Z', beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: '2026-02-31T13:00:00.000Z', beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: ['2026-05-08T13:00:00.000Z'], beforeId: '3' },
      error: 'Invalid beforeCreatedAt: must be a valid date',
    },
    {
      query: { beforeCreatedAt: '2026-05-08T13:00:00.000Z', beforeId: '0' },
      error: 'Invalid beforeId: must be a positive integer',
    },
    {
      query: { beforeCreatedAt: '2026-05-08T13:00:00.000Z', beforeId: '2147483648' },
      error: 'Invalid beforeId: must be a positive integer',
    },
    {
      query: { beforeCreatedAt: '2026-05-08T13:00:00.000Z', beforeId: ['3'] },
      error: 'Invalid beforeId: must be a positive integer',
    },
    {
      query: { cursorCreatedAt: 'not-a-date', cursorId: '3' },
      error: 'Invalid cursorCreatedAt: must be a valid date',
    },
    {
      query: { cursorCreatedAt: `2026-05-08T13:00:00.${'1'.repeat(200)}Z`, cursorId: '3' },
      error: 'Invalid cursorCreatedAt: must be a valid date',
    },
    {
      query: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: '0' },
      error: 'Invalid cursorId: must be a positive integer',
    },
    {
      query: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: 2147483648 },
      error: 'Invalid cursorId: must be a positive integer',
    },
  ];

  for (const { query, error } of invalidCursors) {
    const db = createDb([]);
    const req = {
      params: { deckId: '42' },
      query,
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
    assert.equal(db.calls.length, 0);
  }
});

test('GET /api/decks/:deckId/cards rejects mixed cursor parameter families before db access', async () => {
  const mixedCursors = [
    { beforeCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: '3' },
    { cursorCreatedAt: '2026-05-08T13:00:00.000Z', beforeId: '3' },
  ];

  for (const query of mixedCursors) {
    const db = createDb([]);
    const req = {
      params: { deckId: '42' },
      query,
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: 'Invalid cursor: use either beforeCreatedAt/beforeId or cursorCreatedAt/cursorId, not both',
    });
    assert.equal(db.calls.length, 0);
  }
});

test('GET /api/decks/:deckId/cards accepts nextCursor round-trip with both cursor families', async () => {
  const card = createCardReadRow({
    id: 2,
    deck_id: 42,
    front_content: 'Older card',
    back_content: 'Answer',
    created_at: '2026-05-08T12:00:00.000Z',
    next_review: '2026-05-19T12:00:00.000Z',
  });
  const nextCursor = {
    cursorCreatedAt: '2026-05-08T13:00:00.123456Z',
    cursorId: 3,
    beforeCreatedAt: '2026-05-08T13:00:00.123456Z',
    beforeId: '3',
  };
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ ...card, __cursor_created_at: '2026-05-08T12:00:00.000000Z', __owned_deck_id: 42 }],
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: { limit: '2', ...nextCursor },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards: [card], nextCursor: null });
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].params[2], '2026-05-08T13:00:00.123456Z');
  assert.equal(db.calls[0].params[3], 3);
});

test('GET /api/decks/:deckId/cards rejects conflicting complete cursor families before db access', async () => {
  const conflictingCursors = [
    {
      beforeCreatedAt: '2026-05-08T13:00:00.000Z',
      beforeId: '3',
      cursorCreatedAt: '2026-05-08T13:00:00.001Z',
      cursorId: '3',
    },
    {
      beforeCreatedAt: '2026-05-08T13:00:00.000Z',
      beforeId: '3',
      cursorCreatedAt: '2026-05-08T13:00:00.000Z',
      cursorId: '4',
    },
  ];

  for (const query of conflictingCursors) {
    const db = createDb([]);
    const req = {
      params: { deckId: '42' },
      query,
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await getCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, {
      error: 'Invalid cursor: beforeCreatedAt/beforeId and cursorCreatedAt/cursorId must match when both are provided',
    });
    assert.equal(db.calls.length, 0);
  }
});

test('GET /api/decks/:deckId/cards applies keyset cursor with parameterized SQL', async () => {
  const card = createCardReadRow({
    id: 2,
    deck_id: 42,
    front_content: 'Older card',
    back_content: 'Answer',
    created_at: '2026-05-08T12:00:00.000Z',
    next_review: '2026-05-19T12:00:00.000Z',
  });
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ ...card, __cursor_created_at: '2026-05-08T12:00:00.000000Z', __owned_deck_id: 42 }],
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: {
      limit: '2',
      beforeCreatedAt: '2026-05-08T13:00:00.000Z',
      beforeId: '3',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards: [card], nextCursor: null });
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].params[0], 42);
  assert.equal(db.calls[0].params[1], 'user-1');
  assert.equal(db.calls[0].params[2], '2026-05-08T13:00:00.000Z');
  assert.equal(db.calls[0].params[3], 3);
  assert.equal(db.calls[0].params[4], 3);
  assert.match(
    db.calls[0].sql,
    /LEFT JOIN cards c\s+ON c\.deck_id = d\.id\s+AND \(\s+c\.created_at < \$3\s+OR \(c\.created_at = \$3 AND c\.id < \$4\)\s+\)/i
  );
  assert.match(db.calls[0].sql, /ORDER BY c\.created_at DESC,\s*c\.id DESC\s+LIMIT \$5/);
  assert.doesNotMatch(db.calls[0].sql, /2026-05-08T13:00:00\.000Z/);
  assert.doesNotMatch(db.calls[0].sql, /beforeId/);
});

test('GET /api/decks/:deckId/cards applies q and cursor with round-trippable cursor params', async () => {
  const card = createCardReadRow({
    id: 2,
    deck_id: 42,
    front_content: 'Older card',
    back_content: 'Mito answer',
    created_at: '2026-05-08T12:00:00.000Z',
    next_review: '2026-05-19T12:00:00.000Z',
  });
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ ...card, __cursor_created_at: '2026-05-08T12:00:00.000000Z', __owned_deck_id: 42 }],
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: {
      limit: '2',
      q: 'mito',
      cursorCreatedAt: '2026-05-08T13:00:00.000Z',
      cursorId: '3',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards: [card], nextCursor: null });
  assert.deepEqual(db.calls[0].params, [
    42,
    'user-1',
    '2026-05-08T13:00:00.000Z',
    3,
    'mito',
    3,
  ]);
  assert.match(db.calls[0].sql, /c\.created_at < \$3\s+OR \(c\.created_at = \$3 AND c\.id < \$4\)/);
  assert.match(db.calls[0].sql, /POSITION\(LOWER\(\$5\) IN LOWER\(c\.front_content\)\) > 0/i);
  assert.match(db.calls[0].sql, /ORDER BY c\.created_at DESC,\s*c\.id DESC\s+LIMIT \$6/);
  assert.doesNotMatch(db.calls[0].sql, /mito/);
});

test('GET /api/decks/:deckId/cards accepts cursorCreatedAt and cursorId aliases', async () => {
  const card = createCardReadRow({
    id: 2,
    deck_id: 42,
    front_content: 'Older card',
    back_content: 'Answer',
    created_at: '2026-05-08T12:00:00.000Z',
    next_review: '2026-05-19T12:00:00.000Z',
  });
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ ...card, __cursor_created_at: '2026-05-08T12:00:00.000000Z', __owned_deck_id: 42 }],
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: {
      limit: '2',
      cursorCreatedAt: '2026-05-08T13:00:00.000Z',
      cursorId: '3',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { cards: [card], nextCursor: null });
  assert.equal(db.calls[0].params[2], '2026-05-08T13:00:00.000Z');
  assert.equal(db.calls[0].params[3], 3);
});

test('GET /api/cards/:deckId returns 400 for invalid limit and skips db query', async () => {
  const invalidLimits = [
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -5 ',
    0,
    -2,
    1.3,
    ['1'],
    '9007199254740992',
  ];

  for (const limit of invalidLimits) {
    const db = createDb([]);
    const req = {
      params: { deckId: '42' },
      query: { limit },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await getDueCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid limit: must be a positive integer no greater than 100' });
    assert.equal(db.calls.length, 0);
  }
});

test('GET /api/cards/:deckId returns 400 for oversized limit and skips db query', async () => {
  for (const limit of ['101', 101]) {
    const db = createDb([]);
    const req = {
      params: { deckId: '42' },
      query: { limit },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await getDueCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid limit: must be a positive integer no greater than 100' });
    assert.equal(db.calls.length, 0);
  }
});

test('GET /api/cards/:deckId returns 400 for duplicate limit params and skips db query', async () => {
  const db = createDb([]);
  const req = {
    params: { deckId: '42' },
    query: { limit: ['1', '2'] },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getDueCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid limit: must be a positive integer no greater than 100' });
  assert.equal(db.calls.length, 0);
});

test('GET /api/cards/:deckId returns 404 when deck is not owned by user', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getDueCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Deck not found for user' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 100]);
  assert.match(db.calls[0].sql, /WHERE d\.id = \$1 AND d\.user_id = \$2/);
  assertDuePredicate(db.calls[0].sql);
  assert.match(db.calls[0].sql, /ORDER BY c\.next_review ASC NULLS FIRST,\s*c\.id ASC\s+LIMIT \$3/);
});

test('GET /api/cards/:deckId fails closed when the due-card query result shape is malformed', async (t) => {
  const validRow = {
    ...createCardReadRow({
      id: 11,
      deck_id: 42,
      front_content: 'Due card',
      back_content: 'Answer',
      next_review: '2026-05-08T12:00:00.000Z',
    }),
    __owned_deck_id: 42,
  };
  const malformedResults = [
    null,
    { rowCount: 0, rows: [validRow] },
    { rowCount: 2, rows: [validRow] },
    { rowCount: 1, rows: [validRow, { ...validRow, id: 12 }] },
    { rowCount: '1', rows: [validRow] },
    { rowCount: -1, rows: [] },
    { rowCount: 1 },
    { rowCount: 1, rows: { ...validRow } },
  ];
  t.mock.method(console, 'error', () => {});

  for (const result of malformedResults) {
    const db = createDb([result]);
    const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
    const res = createRes();

    await getDueCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [42, 'user-1', 100]);
  }
});

test('GET /api/cards/:deckId returns unscheduled and past-due cards with a parameterized default limit when limit is omitted', async () => {
  const unscheduledCard = createCardReadRow({
    id: 1,
    front_content: 'Unscheduled card',
    next_review: null,
  });
  const pastDueCard = createCardReadRow({
    id: 2,
    front_content: 'Past due card',
    next_review: '2026-05-08T12:00:00.000Z',
  });
  const dueCards = [unscheduledCard, pastDueCard];
  const db = createDb([
    {
      rowCount: 2,
      rows: dueCards.map((card) => ({
        ...card,
        private_note: 'do not expose',
        __owned_deck_id: 42,
      })),
    },
  ]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getDueCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, dueCards);
  assert.deepEqual(res.body[0], unscheduledCard);
  assert.deepEqual(res.body[1], pastDueCard);
  assert.equal(Object.hasOwn(res.body[0], '__owned_deck_id'), false);
  assert.equal(Object.hasOwn(res.body[0], 'private_note'), false);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 100]);
  assertExplicitPublicCardReadSelect(db.calls[0].sql);
  assert.match(db.calls[0].sql, /LEFT JOIN cards c/);
  assertDuePredicate(db.calls[0].sql);
  assert.match(db.calls[0].sql, /WHERE d\.id = \$1 AND d\.user_id = \$2/);
  assert.match(db.calls[0].sql, /ORDER BY c\.next_review ASC NULLS FIRST,\s*c\.id ASC\s+LIMIT \$3/);
  assert.equal(db.calls[0].sql.match(/\bLIMIT\b/g)?.length, 1);
  assert.doesNotMatch(db.calls[0].sql, /LIMIT\s+100/);
});

test('GET /api/cards/:deckId prioritizes unscheduled due cards when limiting study fetches', async () => {
  const unscheduledCard = createCardReadRow({
    id: 9,
    front_content: 'Unscheduled card',
    next_review: null,
  });
  const scheduledDueCard = createCardReadRow({
    id: 10,
    front_content: 'Scheduled due card',
    next_review: '2026-05-08T12:00:00.000Z',
  });
  const dueCards = [unscheduledCard, scheduledDueCard];
  const db = createDb([
    {
      rowCount: 2,
      rows: dueCards.map((card) => ({ ...card, __owned_deck_id: 42 })),
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: { limit: '2' },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getDueCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, dueCards);
  assert.equal(res.body[0].next_review, null);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 2]);
  assert.match(db.calls[0].sql, /ORDER BY c\.next_review ASC NULLS FIRST,\s*c\.id ASC\s+LIMIT \$3/);
});

test('GET /api/cards/:deckId accepts boundary limit with a parameterized limit', async () => {
  const dueCard = createCardReadRow({
    id: 1,
    front_content: 'Boundary due card',
    next_review: '2026-05-07T12:00:00.000Z',
  });
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ ...dueCard, __owned_deck_id: 42 }],
    },
  ]);
  const req = {
    params: { deckId: '42' },
    query: { limit: '100' },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await getDueCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, [dueCard]);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 100]);
  assertDuePredicate(db.calls[0].sql);
  assert.match(db.calls[0].sql, /ORDER BY c\.next_review ASC NULLS FIRST,\s*c\.id ASC\s+LIMIT \$3/);
  assert.doesNotMatch(db.calls[0].sql, /LIMIT\s+100/);
});

test('GET /api/cards/:deckId returns empty array for owned deck with no due cards', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ id: null, __owned_deck_id: 42 }],
    },
  ]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getDueCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, []);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 100]);
  assert.match(db.calls[0].sql, /ORDER BY c\.next_review ASC NULLS FIRST,\s*c\.id ASC\s+LIMIT \$3/);
});

test('GET /api/cards/:deckId fails closed when rows are not anchored to the requested deck', async (t) => {
  const dueCard = createCardReadRow({
    id: 11,
    deck_id: 42,
    front_content: 'Due card',
    back_content: 'Answer',
    next_review: '2026-05-08T12:00:00.000Z',
  });
  const malformedRows = [
    { id: null },
    { id: null, __owned_deck_id: 41 },
    { ...dueCard, deck_id: 41, __owned_deck_id: 42 },
    { ...dueCard, __owned_deck_id: 41 },
  ];
  t.mock.method(console, 'error', () => {});

  for (const row of malformedRows) {
    const db = createDb([{ rowCount: 1, rows: [row] }]);
    const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
    const res = createRes();

    await getDueCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [42, 'user-1', 100]);
  }
});

test('GET /api/cards/:deckId fails closed when a due-card row violates read response invariants', async (t) => {
  const validDueCard = createCardReadRow({
    id: 11,
    deck_id: 42,
    front_content: 'Due card',
    back_content: 'Answer',
    next_review: '2026-05-08T12:00:00.000Z',
  });
  const rowWithoutBackContent = { ...validDueCard };
  delete rowWithoutBackContent.back_content;
  const malformedRows = [
    { ...validDueCard, id: 'card-11' },
    { ...validDueCard, deck_id: 0 },
    { ...validDueCard, front_content: '' },
    rowWithoutBackContent,
    { ...validDueCard, last_reviewed: 'not-a-date' },
    { ...validDueCard, interval: 36501 },
    { ...validDueCard, ease_factor: Number.NaN },
    { ...validDueCard, review_count: 1.5 },
  ];
  t.mock.method(console, 'error', () => {});

  for (const row of malformedRows) {
    const db = createDb([
      {
        rowCount: 1,
        rows: [{ ...row, __owned_deck_id: 42 }],
      },
    ]);
    const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
    const res = createRes();

    await getDueCardsByDeck(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [42, 'user-1', 100]);
  }
});

test('POST /api/cards creates a card in an owned deck with one atomic insert-select query', async () => {
  const createdCard = {
    id: 77,
    deck_id: 42,
    front_content: 'Capital of France?',
    back_content: 'Paris',
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 1,
    ease_factor: 2.5,
    review_count: 0,
  };
  const db = createDb([{ rowCount: 1, rows: [{ ...createdCard, private_note: 'do not expose' }] }]);
  const req = {
    body: {
      deckId: '42',
      frontContent: '  Capital of France?  ',
      backContent: '  Paris  ',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await createCard(req, res, db);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, createdCard);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Capital of France?', 'Paris']);
  assert.match(db.calls[0].sql, /INSERT\s+INTO\s+cards\s*\(/i);
  assert.match(db.calls[0].sql, /deck_id,\s*front_content,\s*back_content,\s*next_review,\s*interval,\s*ease_factor,\s*review_count/i);
  assert.match(db.calls[0].sql, /SELECT\s+d\.id,\s*\$3,\s*\$4,\s*NOW\(\),\s*1,\s*2\.5,\s*0/i);
  assert.match(db.calls[0].sql, /FROM\s+decks\s+d/i);
  assert.match(db.calls[0].sql, /WHERE\s+d\.id\s+=\s+\$1\s+AND\s+d\.user_id\s+=\s+\$2/i);
  assert.match(
    db.calls[0].sql,
    /RETURNING\s+id,\s+deck_id,\s+front_content,\s+back_content,\s+next_review,\s+interval,\s+ease_factor,\s+review_count/i
  );
  assert.doesNotMatch(db.calls[0].sql, /RETURNING\s+\*/i);
  assert.doesNotMatch(db.calls[0].sql, /INSERT[\s\S]+VALUES/i);
});

test('POST /api/cards returns 500 when the inserted row is missing mutation response fields', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{
        id: 77,
        deck_id: 42,
        front_content: 'Capital of France?',
        back_content: 'Paris',
        next_review: '2026-05-08T12:00:00.000Z',
        interval: 1,
        review_count: 0,
      }],
    },
  ]);
  const req = {
    body: {
      deckId: '42',
      frontContent: 'Capital of France?',
      backContent: 'Paris',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();
  const originalError = console.error;
  console.error = () => {};

  try {
    await createCard(req, res, db);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Capital of France?', 'Paris']);
});

test('POST /api/cards fails closed when the inserted row violates card mutation response invariants', async (t) => {
  const validInsertedCard = {
    id: 77,
    deck_id: 42,
    front_content: 'Capital of France?',
    back_content: 'Paris',
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 1,
    ease_factor: 2.5,
    review_count: 0,
  };
  const malformedRows = [
    { ...validInsertedCard, id: 'card-77' },
    { ...validInsertedCard, id: 2147483648 },
    { ...validInsertedCard, deck_id: 2147483648 },
    { ...validInsertedCard, front_content: '   ' },
    { ...validInsertedCard, back_content: '' },
    { ...validInsertedCard, next_review: 'not-a-date' },
    { ...validInsertedCard, interval: 0 },
    { ...validInsertedCard, interval: 36501 },
    { ...validInsertedCard, ease_factor: 1.29 },
    { ...validInsertedCard, ease_factor: Number.NaN },
    { ...validInsertedCard, review_count: -1 },
    { ...validInsertedCard, review_count: 1.5 },
  ];
  t.mock.method(console, 'error', () => {});

  for (const row of malformedRows) {
    const db = createDb([{ rowCount: 1, rows: [row] }]);
    const req = {
      body: {
        deckId: '42',
        frontContent: 'Capital of France?',
        backContent: 'Paris',
      },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await createCard(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Capital of France?', 'Paris']);
  }
});

test('POST /api/cards returns 400 for invalid deckId and skips db query', async () => {
  const invalidDeckIds = [
    undefined,
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -5 ',
    0,
    -2,
    1.3,
    '9007199254740992',
  ];

  for (const deckId of invalidDeckIds) {
    const db = createDb([]);
    const req = {
      body: {
        deckId,
        frontContent: 'Front',
        backContent: 'Back',
      },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await createCard(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid deckId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
  }
});

test('POST /api/cards returns 400 for blank front or back content and skips db query', async () => {
  const invalidContentCases = [
    [{ frontContent: '', backContent: 'Back' }, 'Invalid frontContent: must be a non-empty string'],
    [{ frontContent: '   ', backContent: 'Back' }, 'Invalid frontContent: must be a non-empty string'],
    [{ frontContent: 123, backContent: 'Back' }, 'Invalid frontContent: must be a non-empty string'],
    [{ frontContent: 'Front', backContent: '' }, 'Invalid backContent: must be a non-empty string'],
    [{ frontContent: 'Front', backContent: '   ' }, 'Invalid backContent: must be a non-empty string'],
    [{ frontContent: 'Front', backContent: null }, 'Invalid backContent: must be a non-empty string'],
  ];

  for (const [body, error] of invalidContentCases) {
    const db = createDb([]);
    const req = {
      body: {
        deckId: 42,
        ...body,
      },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await createCard(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
    assert.equal(db.calls.length, 0);
  }
});

test('POST /api/cards returns 400 for null bytes in front or back content and skips db query', async () => {
  const invalidContentCases = [
    [{ frontContent: 'Front\u0000', backContent: 'Back' }, 'Invalid frontContent: cannot contain null bytes'],
    [{ frontContent: 'Front', backContent: 'Back\u0000' }, 'Invalid backContent: cannot contain null bytes'],
  ];

  for (const [body, error] of invalidContentCases) {
    const db = createDb([]);
    const req = {
      body: {
        deckId: 42,
        ...body,
      },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await createCard(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
    assert.equal(db.calls.length, 0);
  }
});

test('POST /api/cards returns 400 for oversized front or back content and skips db query', async () => {
  const oversizedContent = ` ${'x'.repeat(10001)} `;
  const invalidContentCases = [
    [{ frontContent: oversizedContent, backContent: 'Back' }, 'Invalid frontContent: must be 10000 characters or fewer'],
    [{ frontContent: 'Front', backContent: oversizedContent }, 'Invalid backContent: must be 10000 characters or fewer'],
  ];

  for (const [body, error] of invalidContentCases) {
    const db = createDb([]);
    const req = {
      body: {
        deckId: 42,
        ...body,
      },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await createCard(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
    assert.equal(db.calls.length, 0);
  }
});

test('POST /api/cards returns 404 when deck is missing or not owned by user', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = {
    body: {
      deckId: '42',
      frontContent: 'Front',
      backContent: 'Back',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await createCard(req, res, db);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Deck not found' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Front', 'Back']);
  assert.match(db.calls[0].sql, /INSERT\s+INTO\s+cards/i);
  assert.match(db.calls[0].sql, /FROM\s+decks\s+d/i);
  assert.match(db.calls[0].sql, /WHERE\s+d\.id\s+=\s+\$1\s+AND\s+d\.user_id\s+=\s+\$2/i);
});

test('PATCH /api/cards/:cardId returns 400 for invalid cardId and skips db query', async () => {
  const invalidCardIds = [
    undefined,
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -7 ',
    0,
    -1,
    2.4,
    '9007199254740992',
    Number.MAX_SAFE_INTEGER + 1,
  ];

  for (const cardId of invalidCardIds) {
    const db = createDb([]);
    const req = {
      params: { cardId },
      body: {
        frontContent: 'Front',
        backContent: 'Back',
      },
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await updateCard(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid cardId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
  }
});

test('PATCH /api/cards/:cardId returns 400 for blank front or back content and skips db query', async () => {
  const invalidContentCases = [
    [{ frontContent: '', backContent: 'Back' }, 'Invalid frontContent: must be a non-empty string'],
    [{ frontContent: '   ', backContent: 'Back' }, 'Invalid frontContent: must be a non-empty string'],
    [{ frontContent: 123, backContent: 'Back' }, 'Invalid frontContent: must be a non-empty string'],
    [{ frontContent: 'Front', backContent: '' }, 'Invalid backContent: must be a non-empty string'],
    [{ frontContent: 'Front', backContent: '   ' }, 'Invalid backContent: must be a non-empty string'],
    [{ frontContent: 'Front', backContent: null }, 'Invalid backContent: must be a non-empty string'],
  ];

  for (const [body, error] of invalidContentCases) {
    const db = createDb([]);
    const req = {
      params: { cardId: '77' },
      body,
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await updateCard(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
    assert.equal(db.calls.length, 0);
  }
});

test('PATCH /api/cards/:cardId returns 400 for null bytes in front or back content and skips db query', async () => {
  const invalidContentCases = [
    [{ frontContent: 'Front\u0000', backContent: 'Back' }, 'Invalid frontContent: cannot contain null bytes'],
    [{ frontContent: 'Front', backContent: 'Back\u0000' }, 'Invalid backContent: cannot contain null bytes'],
  ];

  for (const [body, error] of invalidContentCases) {
    const db = createDb([]);
    const req = {
      params: { cardId: '77' },
      body,
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await updateCard(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
    assert.equal(db.calls.length, 0);
  }
});

test('PATCH /api/cards/:cardId returns 400 for oversized front or back content and skips db query', async () => {
  const oversizedContent = ` ${'x'.repeat(10001)} `;
  const invalidContentCases = [
    [{ frontContent: oversizedContent, backContent: 'Back' }, 'Invalid frontContent: must be 10000 characters or fewer'],
    [{ frontContent: 'Front', backContent: oversizedContent }, 'Invalid backContent: must be 10000 characters or fewer'],
  ];

  for (const [body, error] of invalidContentCases) {
    const db = createDb([]);
    const req = {
      params: { cardId: '77' },
      body,
      user: { userId: 'user-1' },
    };
    const res = createRes();

    await updateCard(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error });
    assert.equal(db.calls.length, 0);
  }
});

test('PATCH /api/cards/:cardId updates an owned card with one user-scoped query', async () => {
  const updatedCard = {
    id: 77,
    deck_id: 42,
    front_content: 'Updated front',
    back_content: 'Updated back',
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 1,
    ease_factor: 2.5,
    review_count: 0,
  };
  const db = createDb([{ rowCount: 1, rows: [{ ...updatedCard, private_note: 'do not expose' }] }]);
  const req = {
    params: { cardId: '77' },
    body: {
      frontContent: '  Updated front  ',
      backContent: '  Updated back  ',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await updateCard(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, updatedCard);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [77, 'user-1', 'Updated front', 'Updated back']);
  assert.match(db.calls[0].sql, /UPDATE\s+cards/i);
  assert.match(db.calls[0].sql, /SET\s+front_content\s+=\s+\$3,\s+back_content\s+=\s+\$4/i);
  assert.match(db.calls[0].sql, /WHERE\s+id\s+=\s+\$1/i);
  assert.match(db.calls[0].sql, /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+decks\s+d/i);
  assert.match(db.calls[0].sql, /d\.id\s+=\s+cards\.deck_id/i);
  assert.match(db.calls[0].sql, /d\.user_id\s+=\s+\$2/i);
  assert.match(
    db.calls[0].sql,
    /RETURNING\s+id,\s+deck_id,\s+front_content,\s+back_content,\s+next_review,\s+interval,\s+ease_factor,\s+review_count/i
  );
  assert.doesNotMatch(db.calls[0].sql, /RETURNING\s+\*/i);
  assert.doesNotMatch(db.calls[0].sql, /SELECT[\s\S]+FROM\s+cards/i);
});

test('PATCH /api/cards/:cardId returns 500 when the updated row is missing mutation response fields', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{
        id: 77,
        deck_id: 42,
        front_content: 'Updated front',
        back_content: 'Updated back',
        next_review: '2026-05-08T12:00:00.000Z',
        interval: 1,
        ease_factor: 2.5,
      }],
    },
  ]);
  const req = {
    params: { cardId: '77' },
    body: {
      frontContent: 'Updated front',
      backContent: 'Updated back',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();
  const originalError = console.error;
  console.error = () => {};

  try {
    await updateCard(req, res, db);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [77, 'user-1', 'Updated front', 'Updated back']);
});

test('PATCH /api/cards/:cardId fails closed when the updated row violates card mutation response invariants', async (t) => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{
        id: 77,
        deck_id: 'not-a-deck',
        front_content: 'Updated front',
        back_content: 'Updated back',
        next_review: '2026-05-08T12:00:00.000Z',
        interval: 1,
        ease_factor: 2.5,
        review_count: 0,
      }],
    },
  ]);
  const req = {
    params: { cardId: '77' },
    body: {
      frontContent: 'Updated front',
      backContent: 'Updated back',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();
  t.mock.method(console, 'error', () => {});

  await updateCard(req, res, db);

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [77, 'user-1', 'Updated front', 'Updated back']);
});

test('PATCH /api/cards/:cardId returns 404 for missing or unowned card with one user-scoped query', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = {
    params: { cardId: '77' },
    body: {
      frontContent: 'Front',
      backContent: 'Back',
    },
    user: { userId: 'user-1' },
  };
  const res = createRes();

  await updateCard(req, res, db);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Card not found' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [77, 'user-1', 'Front', 'Back']);
  assert.match(db.calls[0].sql, /UPDATE\s+cards/i);
  assert.match(db.calls[0].sql, /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+decks\s+d/i);
  assert.match(db.calls[0].sql, /d\.user_id\s+=\s+\$2/i);
});

test('DELETE /api/cards/:cardId deletes an owned card with one user-scoped query', async () => {
  const deletedCard = {
    id: 77,
    front_content: 'Front',
    back_content: 'Back',
    next_review: '2026-05-08T12:00:00.000Z',
  };
  const db = createDb([{ rowCount: 1, rows: [deletedCard] }]);
  const req = { params: { cardId: '77' }, user: { userId: 'user-1' } };
  const res = createRes();

  await deleteCard(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, card: deletedCard });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [77, 'user-1']);
  assert.match(db.calls[0].sql, /DELETE\s+FROM\s+cards/i);
  assert.match(db.calls[0].sql, /WHERE\s+id\s+=\s+\$1/i);
  assert.match(db.calls[0].sql, /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+decks\s+d/i);
  assert.match(db.calls[0].sql, /d\.id\s+=\s+cards\.deck_id/i);
  assert.match(db.calls[0].sql, /d\.user_id\s+=\s+\$2/i);
  assert.match(
    db.calls[0].sql,
    /RETURNING\s+id,\s+front_content,\s+back_content,\s+next_review/i
  );
  assert.doesNotMatch(db.calls[0].sql, /RETURNING\s+\*/i);
  assert.doesNotMatch(db.calls[0].sql, /SELECT[\s\S]+FROM\s+cards/i);
});

test('DELETE /api/cards/:cardId response omits unexpected returned card fields', async () => {
  const deletedRow = {
    id: 77,
    front_content: 'Front',
    back_content: 'Back',
    next_review: '2026-05-08T12:00:00.000Z',
    deck_id: 12,
    user_id: 'user-1',
    private_notes: 'do not expose',
  };
  const db = createDb([{ rowCount: 1, rows: [deletedRow] }]);
  const req = { params: { cardId: '77' }, user: { userId: 'user-1' } };
  const res = createRes();

  await deleteCard(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    success: true,
    card: {
      id: 77,
      front_content: 'Front',
      back_content: 'Back',
      next_review: '2026-05-08T12:00:00.000Z',
    },
  });
  assert.equal(Object.hasOwn(res.body.card, 'deck_id'), false);
  assert.equal(Object.hasOwn(res.body.card, 'user_id'), false);
  assert.equal(Object.hasOwn(res.body.card, 'private_notes'), false);
});

test('DELETE /api/cards/:cardId returns 500 when the deleted row is missing removal response fields', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [{
        id: 77,
        front_content: 'Front',
        back_content: 'Back',
      }],
    },
  ]);
  const req = { params: { cardId: '77' }, user: { userId: 'user-1' } };
  const res = createRes();
  const originalError = console.error;
  console.error = () => {};

  try {
    await deleteCard(req, res, db);
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [77, 'user-1']);
});

test('DELETE /api/cards/:cardId fails closed when the deleted row violates removal response invariants', async (t) => {
  const validDeletedCard = {
    id: 77,
    front_content: 'Front',
    back_content: 'Back',
    next_review: '2026-05-08T12:00:00.000Z',
  };
  const malformedRows = [
    { ...validDeletedCard, id: 'card-77' },
    { ...validDeletedCard, front_content: '   ' },
    { ...validDeletedCard, back_content: '' },
    { ...validDeletedCard, next_review: 'not-a-date' },
  ];
  t.mock.method(console, 'error', () => {});

  for (const row of malformedRows) {
    const db = createDb([{ rowCount: 1, rows: [row] }]);
    const req = { params: { cardId: '77' }, user: { userId: 'user-1' } };
    const res = createRes();

    await deleteCard(req, res, db);

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
    assert.deepEqual(db.calls[0].params, [77, 'user-1']);
  }
});

test('card mutation endpoints fail closed when returned-row cardinality is malformed', async (t) => {
  const mutationCard = {
    id: 77,
    deck_id: 42,
    front_content: 'Front',
    back_content: 'Back',
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 1,
    ease_factor: 2.5,
    review_count: 0,
  };
  const deletedCard = {
    id: 77,
    front_content: 'Front',
    back_content: 'Back',
    next_review: '2026-05-08T12:00:00.000Z',
  };
  const cases = [
    {
      name: 'create card with multiple returned rows',
      handler: createCard,
      req: {
        body: { deckId: '42', frontContent: 'Front', backContent: 'Back' },
        user: { userId: 'user-1' },
      },
      result: { rowCount: 2, rows: [mutationCard, { ...mutationCard, id: 78 }] },
      params: [42, 'user-1', 'Front', 'Back'],
    },
    {
      name: 'update card with rowCount zero but a returned row',
      handler: updateCard,
      req: {
        params: { cardId: '77' },
        body: { frontContent: 'Front', backContent: 'Back' },
        user: { userId: 'user-1' },
      },
      result: { rowCount: 0, rows: [mutationCard] },
      params: [77, 'user-1', 'Front', 'Back'],
    },
    {
      name: 'update card with multiple returned rows',
      handler: updateCard,
      req: {
        params: { cardId: '77' },
        body: { frontContent: 'Front', backContent: 'Back' },
        user: { userId: 'user-1' },
      },
      result: { rowCount: 2, rows: [mutationCard, { ...mutationCard, id: 78 }] },
      params: [77, 'user-1', 'Front', 'Back'],
    },
    {
      name: 'delete card with rowCount zero but a returned row',
      handler: deleteCard,
      req: { params: { cardId: '77' }, user: { userId: 'user-1' } },
      result: { rowCount: 0, rows: [deletedCard] },
      params: [77, 'user-1'],
    },
    {
      name: 'delete card with multiple returned rows',
      handler: deleteCard,
      req: { params: { cardId: '77' }, user: { userId: 'user-1' } },
      result: { rowCount: 2, rows: [deletedCard, { ...deletedCard, id: 78 }] },
      params: [77, 'user-1'],
    },
  ];

  for (const testCase of cases) {
    await t.test(testCase.name, async (t) => {
      const db = createDb([testCase.result]);
      const res = createRes();
      t.mock.method(console, 'error', () => {});

      await testCase.handler(testCase.req, res, db);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Internal server error' });
      assert.equal(db.calls.length, 1);
      assert.deepEqual(db.calls[0].params, testCase.params);
    });
  }
});

test('DELETE /api/cards/:cardId returns 400 for invalid cardId and skips db query', async () => {
  const invalidCardIds = [
    undefined,
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -7 ',
    0,
    -1,
    2.4,
    '9007199254740992',
    Number.MAX_SAFE_INTEGER + 1,
  ];

  for (const cardId of invalidCardIds) {
    const db = createDb([]);
    const req = { params: { cardId }, user: { userId: 'user-1' } };
    const res = createRes();

    await deleteCard(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid cardId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
  }
});

test('DELETE /api/cards/:cardId returns 404 for missing or unowned card with one user-scoped query', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = { params: { cardId: '77' }, user: { userId: 'user-1' } };
  const res = createRes();

  await deleteCard(req, res, db);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Card not found' });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [77, 'user-1']);
  assert.match(db.calls[0].sql, /DELETE\s+FROM\s+cards/i);
  assert.match(db.calls[0].sql, /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+decks\s+d/i);
  assert.match(db.calls[0].sql, /d\.user_id\s+=\s+\$2/i);
});

test('GET /api/stats returns expected shape with a single user-scoped query', async () => {
  const stats = {
    totalCards: '12',
    totalDecks: '3',
    todayReviews: '4',
    weekReviews: '7',
    monthReviews: '10',
  };
  const db = createDb([{ rowCount: 1, rows: [stats] }]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();
  const now = new Date(2026, 4, 8, 15, 45, 12, 345);

  await getStats(req, res, db, now);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(Object.keys(res.body), [
    'totalCards',
    'totalDecks',
    'todayReviews',
    'weekReviews',
    'monthReviews',
  ]);
  assert.deepEqual(res.body, {
    totalCards: 12,
    totalDecks: 3,
    todayReviews: 4,
    weekReviews: 7,
    monthReviews: 10,
  });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [
    'user-1',
    new Date(2026, 4, 8),
    new Date(2026, 4, 9),
    new Date(2026, 4, 1),
    new Date(2026, 3, 8),
  ]);
  assert.match(db.calls[0].sql, /WHERE d\.user_id = \$1/);
  assert.match(db.calls[0].sql, /c\.last_reviewed >= \$2\s+AND c\.last_reviewed < \$3/);
  assert.match(db.calls[0].sql, /c\.last_reviewed >= \$4\s+AND c\.last_reviewed < \$3/);
  assert.match(db.calls[0].sql, /c\.last_reviewed >= \$5\s+AND c\.last_reviewed < \$3/);
  assert.doesNotMatch(db.calls[0].sql, /\bCURRENT_DATE\b/i);
});

test('GET /api/stats uses app-local review windows for aggregate counts', async () => {
  const reviewedCards = [
    new Date(2026, 4, 8, 0, 30),
    new Date(2026, 4, 8, 23, 59, 59, 999),
    new Date(2026, 4, 9),
    new Date(2026, 4, 7, 12),
    new Date(2026, 3, 20, 12),
    null,
  ];
  const db = {
    calls: [],
    async query(sql, params) {
      this.calls.push({ sql, params });
      const [, todayStart, tomorrowStart, sevenDayLookbackStart, thirtyDayLookbackStart] = params;
      const inWindow = (reviewedAt, start) => (
        reviewedAt instanceof Date
          && reviewedAt >= start
          && reviewedAt < tomorrowStart
      );

      return {
        rowCount: 1,
        rows: [
          {
            totalCards: String(reviewedCards.length),
            totalDecks: '1',
            todayReviews: String(reviewedCards.filter((reviewedAt) => (
              inWindow(reviewedAt, todayStart)
            )).length),
            weekReviews: String(reviewedCards.filter((reviewedAt) => (
              inWindow(reviewedAt, sevenDayLookbackStart)
            )).length),
            monthReviews: String(reviewedCards.filter((reviewedAt) => (
              inWindow(reviewedAt, thirtyDayLookbackStart)
            )).length),
          },
        ],
      };
    },
  };
  const req = { user: { userId: 'user-1' } };
  const res = createRes();
  const now = new Date(2026, 4, 8, 15, 45, 12, 345);

  await getStats(req, res, db, now);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(db.calls[0].params, [
    'user-1',
    new Date(2026, 4, 8),
    new Date(2026, 4, 9),
    new Date(2026, 4, 1),
    new Date(2026, 3, 8),
  ]);
  assert.deepEqual(res.body, {
    totalCards: 6,
    totalDecks: 1,
    todayReviews: 2,
    weekReviews: 3,
    monthReviews: 4,
  });
});

test('GET /api/stats preserves exact large PostgreSQL count strings', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [
        {
          totalCards: '900719925474099312345',
          totalDecks: '000900719925474099300001',
          todayReviews: '9007199254740993',
          weekReviews: ' 00042 ',
          monthReviews: '000',
        },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  await getStats(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    totalCards: '900719925474099312345',
    totalDecks: '900719925474099300001',
    todayReviews: '9007199254740993',
    weekReviews: 42,
    monthReviews: 0,
  });
});

test('GET /api/stats handles aggregate count safe integer boundaries', async () => {
  const maxSafeAggregate = String(Number.MAX_SAFE_INTEGER);
  const oneAboveMaxSafeAggregate = String(BigInt(Number.MAX_SAFE_INTEGER) + 1n);
  const db = createDb([
    {
      rowCount: 1,
      rows: [
        {
          totalCards: maxSafeAggregate,
          totalDecks: oneAboveMaxSafeAggregate,
          todayReviews: BigInt(oneAboveMaxSafeAggregate),
          weekReviews: BigInt(maxSafeAggregate),
          monthReviews: '0',
        },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  await getStats(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    totalCards: Number.MAX_SAFE_INTEGER,
    totalDecks: oneAboveMaxSafeAggregate,
    todayReviews: oneAboveMaxSafeAggregate,
    weekReviews: Number.MAX_SAFE_INTEGER,
    monthReviews: 0,
  });
});

test('GET /api/stats fails closed for malformed successful aggregate results', async (t) => {
  const validStats = {
    totalCards: '12',
    totalDecks: '3',
    todayReviews: '4',
    weekReviews: '7',
    monthReviews: '10',
  };
  const rowMissingField = { ...validStats };
  delete rowMissingField.weekReviews;
  const malformedCases = [
    ['missing aggregate row', { rowCount: 0, rows: [] }],
    ['duplicate aggregate rows', { rowCount: 2, rows: [{ ...validStats }, { ...validStats }] }],
    ['missing aggregate field', { rowCount: 1, rows: [rowMissingField] }],
    ['null aggregate value', { rowCount: 1, rows: [{ ...validStats, totalCards: null }] }],
    ['empty aggregate value', { rowCount: 1, rows: [{ ...validStats, totalDecks: '' }] }],
    ['undefined aggregate value', { rowCount: 1, rows: [{ ...validStats, todayReviews: undefined }] }],
    ['exponent aggregate value', { rowCount: 1, rows: [{ ...validStats, totalCards: '1e3' }] }],
    ['negative aggregate value', { rowCount: 1, rows: [{ ...validStats, totalDecks: '-1' }] }],
    [
      'unsafe numeric aggregate value',
      { rowCount: 1, rows: [{ ...validStats, todayReviews: Number.MAX_SAFE_INTEGER + 1 }] },
    ],
    ['decimal aggregate value', { rowCount: 1, rows: [{ ...validStats, weekReviews: 1.5 }] }],
    ['array aggregate value', { rowCount: 1, rows: [{ ...validStats, monthReviews: [] }] }],
  ];
  t.mock.method(console, 'error', () => {});

  for (const [name, result] of malformedCases) {
    await t.test(name, async () => {
      const db = createDb([result]);
      const req = { user: { userId: 'user-1' } };
      const res = createRes();

      await getStats(req, res, db);

      assert.equal(res.statusCode, 500);
      assert.deepEqual(res.body, { error: 'Internal server error' });
      assert.equal(db.calls.length, 1);
      assert.equal(db.calls[0].params[0], 'user-1');
      const dateParams = db.calls[0].params.slice(1);
      assert.equal(dateParams.length, 4);
      dateParams.forEach((param) => {
        assert.ok(param instanceof Date);
      });
      assert.match(db.calls[0].sql, /WHERE d\.user_id = \$1/);
    });
  }
});

test('GET /api/scheduling-insights returns expected shape from one aggregate query', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [
        {
          totalCards: '30',
          overdue: '3',
          dueToday: '2',
          dueTomorrow: '4',
          dueNext7Days: '12',
          leechCandidates: '5',
          averageEaseFactor: '2.35',
        },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  const now = new Date(2026, 4, 8, 15, 45, 12, 345);

  await getSchedulingInsights(req, res, db, now);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    totalCards: 30,
    overdue: 3,
    dueToday: 2,
    dueTomorrow: 4,
    dueNext7Days: 12,
    leechCandidates: 5,
    averageEaseFactor: 2.35,
    recommendedDailyReviewTarget: 10,
    suggestedNewCards: 15,
  });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [
    'user-1',
    new Date(2026, 4, 8),
    new Date(2026, 4, 9),
    new Date(2026, 4, 10),
    new Date(2026, 4, 15),
  ]);
  assert.match(db.calls[0].sql, /COUNT\(c\.id\)/);
  assert.match(db.calls[0].sql, /WHERE d\.user_id = \$1/);
  assert.match(db.calls[0].sql, /c\.next_review IS NOT NULL\s+AND c\.next_review < \$2/);
  assert.match(db.calls[0].sql, /c\.next_review IS NULL\s+OR\s+\(\s+c\.next_review >= \$2\s+AND c\.next_review < \$3\s+\)/);
  assert.match(db.calls[0].sql, /c\.next_review >= \$3\s+AND c\.next_review < \$4/);
  assert.match(db.calls[0].sql, /c\.next_review IS NULL\s+OR\s+\(\s+c\.next_review >= \$2\s+AND c\.next_review < \$5\s+\)/);
  assert.doesNotMatch(db.calls[0].sql, /\bCURRENT_DATE\b/i);
  assert.doesNotMatch(db.calls[0].sql, /SELECT\s+c\.id\b/i);
  assert.doesNotMatch(db.calls[0].sql, /\bc\.next_review,\s*c\.ease_factor,\s*c\.review_count\b/i);
});

test('GET /api/scheduling-insights fails closed for missing or malformed aggregate counts', async (t) => {
  const validInsights = {
    totalCards: '30',
    overdue: '3',
    dueToday: '2',
    dueTomorrow: '4',
    dueNext7Days: '12',
    leechCandidates: '5',
    averageEaseFactor: '2.35',
  };
  const rowMissingField = { ...validInsights };
  delete rowMissingField.dueTomorrow;
  const malformedResults = [
    { rowCount: 0, rows: [] },
    { rowCount: 2, rows: [{ ...validInsights }, { ...validInsights }] },
    { rowCount: 1, rows: [rowMissingField] },
    { rowCount: 1, rows: [{ ...validInsights, totalCards: null }] },
    { rowCount: 1, rows: [{ ...validInsights, overdue: '-1' }] },
    { rowCount: 1, rows: [{ ...validInsights, dueToday: Number.MAX_SAFE_INTEGER + 1 }] },
    { rowCount: 1, rows: [{ ...validInsights, dueTomorrow: [] }] },
    { rowCount: 1, rows: [{ ...validInsights, dueNext7Days: '9007199254740993' }] },
    { rowCount: 1, rows: [{ ...validInsights, leechCandidates: 1.5 }] },
  ];
  t.mock.method(console, 'error', () => {});

  for (const result of malformedResults) {
    const db = createDb([result]);
    const req = { user: { userId: 'user-1' } };
    const res = createRes();

    await getSchedulingInsights(req, res, db, new Date(2026, 4, 8, 15, 45, 12, 345));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
  }
});

test('GET /api/scheduling-insights treats null next_review as due today load', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [
        {
          totalCards: '12',
          overdue: '1',
          dueToday: '9',
          dueTomorrow: '2',
          dueNext7Days: '11',
          leechCandidates: '0',
          averageEaseFactor: '2.5',
        },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  await getSchedulingInsights(req, res, db, new Date(2026, 4, 8, 15, 45, 12, 345));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    totalCards: 12,
    overdue: 1,
    dueToday: 9,
    dueTomorrow: 2,
    dueNext7Days: 11,
    leechCandidates: 0,
    averageEaseFactor: 2.5,
    recommendedDailyReviewTarget: 12,
    suggestedNewCards: 10,
  });
  assert.equal(db.calls.length, 1);

  const nullDuePredicates = db.calls[0].sql.match(/c\.next_review IS NULL/g) ?? [];
  assert.equal(nullDuePredicates.length, 2);
  assert.match(db.calls[0].sql, /c\.next_review IS NOT NULL\s+AND c\.next_review < \$2/);
  assert.match(db.calls[0].sql, /c\.next_review IS NULL\s+OR\s+\(\s+c\.next_review >= \$2\s+AND c\.next_review < \$3\s+\)\s+\)\s+AS "dueToday"/);
  assert.match(db.calls[0].sql, /c\.next_review IS NULL\s+OR\s+\(\s+c\.next_review >= \$2\s+AND c\.next_review < \$5\s+\)\s+\)\s+AS "dueNext7Days"/);
});

test('GET /api/scheduling-insights keeps null averageEaseFactor when no positive ease factors exist', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [
        {
          totalCards: '4',
          overdue: '9',
          dueToday: '2',
          dueTomorrow: '0',
          dueNext7Days: '2',
          leechCandidates: '0',
          averageEaseFactor: null,
        },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  const now = new Date(2026, 4, 8, 15, 45, 12, 345);

  await getSchedulingInsights(req, res, db, now);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    totalCards: 4,
    overdue: 9,
    dueToday: 2,
    dueTomorrow: 0,
    dueNext7Days: 2,
    leechCandidates: 0,
    averageEaseFactor: null,
    recommendedDailyReviewTarget: 14,
    suggestedNewCards: 9,
  });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [
    'user-1',
    new Date(2026, 4, 8),
    new Date(2026, 4, 9),
    new Date(2026, 4, 10),
    new Date(2026, 4, 15),
  ]);
});

test('GET /api/scheduling-insights preserves positive averageEaseFactor values', async () => {
  const validAverageEaseFactors = [
    ['2.35', 2.35],
    [2.5, 2.5],
  ];

  for (const [averageEaseFactor, expectedAverageEaseFactor] of validAverageEaseFactors) {
    const db = createDb([
      {
        rowCount: 1,
        rows: [
          {
            totalCards: '4',
            overdue: '1',
            dueToday: '2',
            dueTomorrow: '0',
            dueNext7Days: '2',
            leechCandidates: '0',
            averageEaseFactor,
          },
        ],
      },
    ]);
    const req = { user: { userId: 'user-1' } };
    const res = createRes();

    await getSchedulingInsights(req, res, db, new Date(2026, 4, 8, 15, 45, 12, 345));

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.averageEaseFactor, expectedAverageEaseFactor);
    assert.equal(db.calls.length, 1);
  }
});

test('GET /api/scheduling-insights fails closed for malformed averageEaseFactor values', async (t) => {
  const malformedAverageEaseFactors = [
    '',
    '   ',
    '0',
    0,
    '-1',
    -1,
    '1e3',
    '0x10',
    true,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    [2],
    [],
  ];
  t.mock.method(console, 'error', () => {});

  for (const averageEaseFactor of malformedAverageEaseFactors) {
    const db = createDb([
      {
        rowCount: 1,
        rows: [
          {
            totalCards: '4',
            overdue: '1',
            dueToday: '2',
            dueTomorrow: '0',
            dueNext7Days: '2',
            leechCandidates: '0',
            averageEaseFactor,
          },
        ],
      },
    ]);
    const req = { user: { userId: 'user-1' } };
    const res = createRes();

    await getSchedulingInsights(req, res, db, new Date(2026, 4, 8, 15, 45, 12, 345));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.calls.length, 1);
  }
});

test('POST /api/study-session returns 400 for invalid cardId and skips db query', async () => {
  const invalidCardIds = [
    undefined,
    null,
    '',
    'abc',
    '1.2',
    '0',
    ' -7 ',
    0,
    -1,
    2.4,
    '9007199254740992',
    Number.MAX_SAFE_INTEGER + 1,
  ];

  for (const cardId of invalidCardIds) {
    const db = createDb([]);
    const req = { body: { cardId, quality: 3 }, user: { userId: 'user-1' } };
    const res = createRes();

    await submitStudySession(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid cardId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
  }
});

test('POST /api/study-session returns 400 for absent body before db or scheduler work', async () => {
  const invalidRequests = [
    { user: { userId: 'user-1' } },
    { body: undefined, user: { userId: 'user-1' } },
    { body: null, user: { userId: 'user-1' } },
  ];

  for (const req of invalidRequests) {
    const db = addUnexpectedConnect(createDb([]));
    const res = createRes();
    let schedulerCalled = false;

    await submitStudySession(req, res, db, () => {
      schedulerCalled = true;
      return {};
    });

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid cardId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
    assert.equal(db.connectCalls, 0);
    assert.equal(schedulerCalled, false);
  }
});

test('POST /api/study-session returns 400 for invalid quality', async () => {
  const db = createDb([]);
  const req = { body: { cardId: 10, quality: 6 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db);

  assert.equal(res.statusCode, 400);
  assert.deepEqual(res.body, { error: 'Invalid quality: must be an integer between 0 and 5' });
  assert.equal(db.calls.length, 0);
});

test('POST /api/study-session returns 404 when card does not exist', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = { body: { cardId: 999, quality: 3 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Card not found' });
  assert.equal(db.calls.length, 1);
  assertStudySessionCardReadSql(db.calls[0].sql);
  assert.deepEqual(db.calls[0].params, [999, 'user-1']);
});

test('POST /api/study-session returns 404 when card is not in user decks', async () => {
  let schedulerCalled = false;
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = { body: { cardId: 5, quality: 3 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db, () => {
    schedulerCalled = true;
    return {};
  });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Card not found' });
  assert.equal(schedulerCalled, false);
  assert.equal(db.calls.length, 1);
  assertStudySessionCardReadSql(db.calls[0].sql);
  assert.deepEqual(db.calls[0].params, [5, 'user-1']);
});

test('POST /api/study-session rolls back and releases transaction client on missing card', async () => {
  let schedulerCalled = false;
  const db = createTransactionDb([{ rowCount: 0, rows: [] }]);
  const req = { body: { cardId: 5, quality: 3 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db, () => {
    schedulerCalled = true;
    return {};
  });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Card not found' });
  assert.equal(schedulerCalled, false);
  assert.equal(db.connectCalls, 1);
  assert.equal(db.client.released, true);
  assert.equal(db.calls.length, 3);
  assert.match(db.calls[0].sql, /^\s*BEGIN\s*$/i);
  assertStudySessionCardReadSql(db.calls[1].sql);
  assert.deepEqual(db.calls[1].params, [5, 'user-1']);
  assert.match(db.calls[2].sql, /^\s*ROLLBACK\s*$/i);
  assert.doesNotMatch(db.calls.map(({ sql }) => sql).join('\n'), /^\s*COMMIT\s*$/im);
});

test('POST /api/study-session rolls back and releases transaction client on thrown error', async () => {
  const db = createTransactionDb([new Error('read failed')]);
  const req = { body: { cardId: 5, quality: 3 }, user: { userId: 'user-1' } };
  const res = createRes();
  const originalError = console.error;
  console.error = () => {};

  try {
    await submitStudySession(req, res, db, () => ({}));
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.connectCalls, 1);
  assert.equal(db.client.released, true);
  assert.equal(db.calls.length, 3);
  assert.match(db.calls[0].sql, /^\s*BEGIN\s*$/i);
  assertStudySessionCardReadSql(db.calls[1].sql);
  assert.deepEqual(db.calls[1].params, [5, 'user-1']);
  assert.match(db.calls[2].sql, /^\s*ROLLBACK\s*$/i);
  assert.doesNotMatch(db.calls.map(({ sql }) => sql).join('\n'), /^\s*COMMIT\s*$/im);
});

test('POST /api/study-session returns 409 and skips scheduling when an owned card is not due', async () => {
  let schedulerCalled = false;
  const db = createDb([
    {
      rowCount: 1,
      rows: [createCardReadRow({
        id: 7,
        deck_id: 1,
        next_review: '2026-05-20T12:00:00.000Z',
        ease_factor: 2.5,
        interval: 2,
        review_count: 2,
        __is_due: false,
      })],
    },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db, () => {
    schedulerCalled = true;
    return {};
  });

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Card is not due' });
  assert.equal(schedulerCalled, false);
  assert.equal(db.calls.length, 1);
  assertStudySessionCardReadSql(db.calls[0].sql);
  assert.deepEqual(db.calls[0].params, [7, 'user-1']);
  assert.doesNotMatch(db.calls[0].sql, /AND\s+\(\s*c\.next_review IS NULL\s+OR\s+c\.next_review <= NOW\(\)\s+\)/i);
});

test('POST /api/study-session rolls back before scheduling when the locked card read contract is malformed', async (t) => {
  const validSourceCard = createCardReadRow({
    id: 7,
    deck_id: 1,
    front_content: 'Front',
    back_content: 'Back',
    created_at: '2026-05-01T12:00:00.000Z',
    last_reviewed: null,
    next_review: '2026-05-08T12:00:00.000Z',
    ease_factor: 2.5,
    interval: 2,
    review_count: 2,
    __is_due: true,
  });
  const rowMissingDueSentinel = { ...validSourceCard };
  delete rowMissingDueSentinel.__is_due;
  const rowMissingFrontContent = { ...validSourceCard };
  delete rowMissingFrontContent.front_content;
  const rowMissingNextReview = { ...validSourceCard };
  delete rowMissingNextReview.next_review;
  const malformedRows = [
    { name: 'mismatched card id', row: { ...validSourceCard, id: 8 } },
    { name: 'invalid card id', row: { ...validSourceCard, id: 'not-a-card' } },
    { name: 'invalid deck id', row: { ...validSourceCard, deck_id: 'not-a-deck' } },
    { name: 'missing due sentinel', row: rowMissingDueSentinel },
    { name: 'non-boolean due sentinel', row: { ...validSourceCard, __is_due: 'true' } },
    { name: 'missing front content', row: rowMissingFrontContent },
    { name: 'blank back content', row: { ...validSourceCard, back_content: '   ' } },
    { name: 'invalid created timestamp', row: { ...validSourceCard, created_at: 'not-a-date' } },
    { name: 'missing next review field', row: rowMissingNextReview },
    { name: 'invalid next review timestamp', row: { ...validSourceCard, next_review: 'not-a-date' } },
    { name: 'invalid interval', row: { ...validSourceCard, interval: 0 } },
    { name: 'invalid ease factor', row: { ...validSourceCard, ease_factor: Number.NaN } },
    { name: 'invalid review count', row: { ...validSourceCard, review_count: -1 } },
  ];
  const validUpdateRow = {
    id: 7,
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 3,
    ease_factor: 2.6,
    review_count: 3,
    last_reviewed: '2026-05-08T12:05:00.000Z',
    __updated: true,
  };
  t.mock.method(console, 'error', () => {});

  for (const { row } of malformedRows) {
    const db = createTransactionDb([
      { rowCount: 1, rows: [row] },
      { rowCount: 1, rows: [validUpdateRow] },
    ]);
    const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
    const res = createRes();
    let schedulerCalled = false;

    await submitStudySession(req, res, db, () => {
      schedulerCalled = true;
      return {
        ease_factor: 2.6,
        interval: 3,
        next_review: '2026-05-08T12:00:00.000Z',
      };
    });

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(schedulerCalled, false);
    assert.equal(db.connectCalls, 1);
    assert.equal(db.client.released, true);
    assert.equal(db.calls.length, 3);
    assert.match(db.calls[0].sql, /^\s*BEGIN\s*$/i);
    assertStudySessionCardReadSql(db.calls[1].sql);
    assert.match(db.calls[2].sql, /^\s*ROLLBACK\s*$/i);
    assert.doesNotMatch(db.calls.map(({ sql }) => sql).join('\n'), /\bUPDATE\s+cards\b|\bCOMMIT\b/i);
  }
});

test('POST /api/study-session rolls back before scheduling when the locked card read cardinality is malformed', async (t) => {
  const sourceCard = createCardReadRow({
    id: 7,
    deck_id: 1,
    next_review: '2026-05-08T12:00:00.000Z',
    ease_factor: 2.5,
    interval: 2,
    review_count: 2,
    __is_due: true,
  });
  const db = createTransactionDb([
    {
      rowCount: 2,
      rows: [sourceCard, { ...sourceCard, id: 8 }],
    },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();
  let schedulerCalled = false;
  t.mock.method(console, 'error', () => {});

  await submitStudySession(req, res, db, () => {
    schedulerCalled = true;
    return {
      ease_factor: 2.6,
      interval: 3,
      next_review: '2026-05-08T12:00:00.000Z',
    };
  });

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(schedulerCalled, false);
  assert.equal(db.connectCalls, 1);
  assert.equal(db.client.released, true);
  assert.equal(db.calls.length, 3);
  assert.match(db.calls[0].sql, /^\s*BEGIN\s*$/i);
  assertStudySessionCardReadSql(db.calls[1].sql);
  assert.match(db.calls[2].sql, /^\s*ROLLBACK\s*$/i);
  assert.doesNotMatch(db.calls.map(({ sql }) => sql).join('\n'), /\bUPDATE\s+cards\b|\bCOMMIT\b/i);
});

test('POST /api/study-session locks an owned due card before scheduling and updating', async () => {
  const nextReview = '2026-05-08T12:00:00.000Z';
  const sourceCard = {
    id: 7,
    deck_id: 1,
    front_content: 'Front',
    back_content: 'Back',
    created_at: '2026-05-01T12:00:00.000Z',
    last_reviewed: null,
    next_review: '2026-05-08T12:00:00.000Z',
    ease_factor: 2.5,
    interval: 2,
    review_count: 2,
    __is_due: true,
  };
  const updatedCard = {
    id: 7,
    next_review: nextReview,
    interval: 3,
    ease_factor: 2.6,
    review_count: 3,
    last_reviewed: '2026-05-08T12:05:00.000Z',
  };
  const db = createTransactionDb([
    { rowCount: 1, rows: [sourceCard] },
    { rowCount: 1, rows: [{ ...updatedCard, __updated: true, private_note: 'do not expose' }] },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();
  let scheduledCard = null;
  let scheduledReviewedAt = null;

  await submitStudySession(req, res, db, (card, quality, reviewedAt) => {
    scheduledCard = card;
    scheduledReviewedAt = reviewedAt;
    assert.equal(quality, 4);
    return {
      ease_factor: 2.6,
      interval: 3,
      next_review: nextReview,
    };
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, card: updatedCard });
  assert.equal(Object.hasOwn(res.body.card, 'private_note'), false);
  assert.equal(db.connectCalls, 1);
  assert.equal(db.client.released, true);
  assert.match(db.calls[0].sql, /^\s*BEGIN\s*$/i);
  assertStudySessionCardReadSql(db.calls[1].sql);
  assertStudySessionUpdateSql(db.calls[2].sql);
  assert.match(db.calls[3].sql, /^\s*COMMIT\s*$/i);
  assert.equal(scheduledCard, sourceCard);
  assert.equal(scheduledReviewedAt instanceof Date, true);
  assert.equal(db.calls[2].params[0], scheduledReviewedAt);
  assert.deepEqual(db.calls[2].params.slice(1), [nextReview, 3, 2.6, 7, 'user-1']);
  assert.doesNotMatch(
    db.calls.slice(0, 3).map(({ sql }) => sql).join('\n'),
    /\bSELECT\s+c\.\*/i,
  );
});

test('POST /api/study-session treats unscheduled owned cards as due for review', async () => {
  const nextReview = '2026-05-08T12:00:00.000Z';
  const sourceCard = createCardReadRow({
    id: 7,
    deck_id: 1,
    next_review: null,
    ease_factor: 2.5,
    interval: 2,
    review_count: 2,
    __is_due: true,
  });
  const updatedCard = {
    id: 7,
    next_review: nextReview,
    interval: 3,
    ease_factor: 2.6,
    review_count: 3,
    last_reviewed: '2026-05-08T12:05:00.000Z',
  };
  const db = createDb([
    { rowCount: 1, rows: [sourceCard] },
    { rowCount: 1, rows: [{ ...updatedCard, __updated: true }] },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();
  let scheduledCard = null;
  let scheduledReviewedAt = null;

  await submitStudySession(req, res, db, (card, quality, reviewedAt) => {
    scheduledCard = card;
    scheduledReviewedAt = reviewedAt;
    assert.equal(quality, 4);
    return {
      ease_factor: 2.6,
      interval: 3,
      next_review: nextReview,
    };
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, card: updatedCard });
  assert.equal(scheduledCard, sourceCard);
  assert.equal(scheduledReviewedAt instanceof Date, true);
  assert.equal(db.calls.length, 2);
  assertStudySessionCardReadSql(db.calls[0].sql);
  assertStudySessionUpdateSql(db.calls[1].sql);
  assert.equal(db.calls[1].params[0], scheduledReviewedAt);
});

test('POST /api/study-session returns updated scheduling metadata for successful review', async () => {
  const nextReview = new Date().toISOString();
  const updatedCard = {
    id: 7,
    next_review: nextReview,
    interval: 3,
    ease_factor: 2.6,
    review_count: 3,
    last_reviewed: '2026-05-08T12:05:00.000Z',
  };
  const db = createDb([
    {
      rowCount: 1,
      rows: [createCardReadRow({
        id: 7,
        deck_id: 1,
        next_review: '2026-05-08T12:00:00.000Z',
        ease_factor: 2.5,
        interval: 2,
        review_count: 2,
        __is_due: true,
      })],
    },
    { rowCount: 1, rows: [{ ...updatedCard, __updated: true }] },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();
  let scheduledReviewedAt = null;

  await submitStudySession(req, res, db, (card, quality, reviewedAt) => {
    scheduledReviewedAt = reviewedAt;
    assert.equal(card.id, 7);
    assert.equal(quality, 4);
    return {
      ease_factor: 2.6,
      interval: 3,
      next_review: nextReview,
    };
  });

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, card: updatedCard });
  assert.equal(db.calls.length, 2);
  assertStudySessionCardReadSql(db.calls[0].sql);
  assertStudySessionUpdateSql(db.calls[1].sql);
  assert.doesNotMatch(db.calls[1].sql, /last_reviewed\s+=\s+NOW\(\)/i);
  const returningClause = db.calls[1].sql.match(/\bRETURNING\b([\s\S]*?)\bSELECT\b/i)?.[1];
  assert.ok(returningClause, 'expected UPDATE to include a RETURNING clause');
  for (const column of ['id', 'next_review', 'interval', 'ease_factor', 'review_count', 'last_reviewed']) {
    assert.match(returningClause, new RegExp(`\\b${column}\\b`, 'i'));
  }
  assert.match(returningClause, /"__updated"/i);
  assert.equal(scheduledReviewedAt instanceof Date, true);
  assert.equal(db.calls[1].params[0], scheduledReviewedAt);
  assert.deepEqual(db.calls[1].params.slice(1), [nextReview, 3, 2.6, 7, 'user-1']);
});

test('POST /api/study-session returns 404 when final user-scoped update finds no card', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [createCardReadRow({
        id: 7,
        deck_id: 1,
        next_review: '2026-05-08T12:00:00.000Z',
        ease_factor: 2.5,
        interval: 2,
        review_count: 2,
        __is_due: true,
      })],
    },
    { rowCount: 0, rows: [] },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();
  let scheduledReviewedAt = null;

  await submitStudySession(req, res, db, (card, quality, reviewedAt) => {
    scheduledReviewedAt = reviewedAt;
    return {
      ease_factor: 2.6,
      interval: 3,
      next_review: '2026-05-08T12:00:00.000Z',
    };
  });

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Card not found' });
  assert.equal(db.calls.length, 2);
  assertStudySessionCardReadSql(db.calls[0].sql);
  assertStudySessionUpdateSql(db.calls[1].sql);
  assert.equal(db.calls[1].params[0], scheduledReviewedAt);
  assert.deepEqual(db.calls[1].params.slice(1), ['2026-05-08T12:00:00.000Z', 3, 2.6, 7, 'user-1']);
});

test('POST /api/study-session returns 409 when final due-gated update loses a stale-card race', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [createCardReadRow({
        id: 7,
        deck_id: 1,
        next_review: '2026-05-08T12:00:00.000Z',
        ease_factor: 2.5,
        interval: 2,
        review_count: 2,
        __is_due: true,
      })],
    },
    { rowCount: 1, rows: [{ __updated: false }] },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db, () => ({
    ease_factor: 2.6,
    interval: 3,
    next_review: '2026-05-08T12:00:00.000Z',
  }));

  assert.equal(res.statusCode, 409);
  assert.deepEqual(res.body, { error: 'Card is not due' });
  assert.equal(db.calls.length, 2);
  assertStudySessionCardReadSql(db.calls[0].sql);
  assertStudySessionUpdateSql(db.calls[1].sql);
  assert.deepEqual(db.calls[1].params.slice(1), ['2026-05-08T12:00:00.000Z', 3, 2.6, 7, 'user-1']);
});

test('POST /api/study-session rolls back when the final update cardinality is malformed', async (t) => {
  const sourceCard = createCardReadRow({
    id: 7,
    deck_id: 1,
    next_review: '2026-05-08T12:00:00.000Z',
    ease_factor: 2.5,
    interval: 2,
    review_count: 2,
    __is_due: true,
  });
  const updatedCard = {
    id: 7,
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 3,
    ease_factor: 2.6,
    review_count: 3,
    last_reviewed: '2026-05-08T12:05:00.000Z',
    __updated: true,
  };
  const malformedUpdateResults = [
    { rowCount: 0, rows: [updatedCard] },
    { rowCount: 1, rows: [] },
    { rowCount: 2, rows: [updatedCard, { ...updatedCard, id: 8 }] },
  ];
  t.mock.method(console, 'error', () => {});

  for (const result of malformedUpdateResults) {
    const db = createTransactionDb([
      { rowCount: 1, rows: [sourceCard] },
      result,
    ]);
    const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
    const res = createRes();

    await submitStudySession(req, res, db, () => ({
      ease_factor: 2.6,
      interval: 3,
      next_review: '2026-05-08T12:00:00.000Z',
    }));

    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'Internal server error' });
    assert.equal(db.connectCalls, 1);
    assert.equal(db.client.released, true);
    assert.equal(db.calls.length, 4);
    assert.match(db.calls[0].sql, /^\s*BEGIN\s*$/i);
    assertStudySessionCardReadSql(db.calls[1].sql);
    assertStudySessionUpdateSql(db.calls[2].sql);
    assert.match(db.calls[3].sql, /^\s*ROLLBACK\s*$/i);
    assert.doesNotMatch(db.calls.map(({ sql }) => sql).join('\n'), /^\s*COMMIT\s*$/im);
  }
});

async function assertMalformedStudySessionUpdateRowRollsBack(updateRow) {
  const db = createTransactionDb([
    {
      rowCount: 1,
      rows: [createCardReadRow({
        id: 7,
        deck_id: 1,
        next_review: '2026-05-08T12:00:00.000Z',
        ease_factor: 2.5,
        interval: 2,
        review_count: 2,
        __is_due: true,
      })],
    },
    {
      rowCount: 1,
      rows: [updateRow],
    },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();
  const originalError = console.error;
  console.error = () => {};

  try {
    await submitStudySession(req, res, db, () => ({
      ease_factor: 2.6,
      interval: 3,
      next_review: '2026-05-08T12:00:00.000Z',
    }));
  } finally {
    console.error = originalError;
  }

  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { error: 'Internal server error' });
  assert.equal(db.connectCalls, 1);
  assert.equal(db.client.released, true);
  assert.equal(db.calls.length, 4);
  assert.match(db.calls[0].sql, /^\s*BEGIN\s*$/i);
  assertStudySessionCardReadSql(db.calls[1].sql);
  assertStudySessionUpdateSql(db.calls[2].sql);
  assert.match(db.calls[3].sql, /^\s*ROLLBACK\s*$/i);
  assert.doesNotMatch(db.calls.map(({ sql }) => sql).join('\n'), /^\s*COMMIT\s*$/im);
}

test('POST /api/study-session rolls back when the final update result has a malformed sentinel', async () => {
  await assertMalformedStudySessionUpdateRowRollsBack({
    id: 7,
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 3,
    ease_factor: 2.6,
    review_count: 3,
    last_reviewed: '2026-05-08T12:05:00.000Z',
    __updated: 'false',
  });
});

test('POST /api/study-session rolls back when a card-shaped final update result is missing the sentinel', async () => {
  const updateRow = {
    id: 7,
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 3,
    ease_factor: 2.6,
    review_count: 3,
    last_reviewed: '2026-05-08T12:05:00.000Z',
  };

  assert.equal(Object.hasOwn(updateRow, '__updated'), false);
  await assertMalformedStudySessionUpdateRowRollsBack(updateRow);
});

test('POST /api/study-session rolls back when a successful final update result violates response invariants', async (t) => {
  const validUpdateRow = {
    id: 7,
    next_review: '2026-05-08T12:00:00.000Z',
    interval: 3,
    ease_factor: 2.6,
    review_count: 3,
    last_reviewed: '2026-05-08T12:05:00.000Z',
    __updated: true,
  };
  const rowMissingId = { ...validUpdateRow };
  delete rowMissingId.id;
  const malformedRows = [
    { name: 'missing id', row: rowMissingId },
    { name: 'non-numeric id', row: { ...validUpdateRow, id: 'card-7' } },
    { name: 'mismatched id', row: { ...validUpdateRow, id: 8 } },
    { name: 'zero id', row: { ...validUpdateRow, id: 0 } },
    { name: 'null next_review', row: { ...validUpdateRow, next_review: null } },
    { name: 'invalid next_review timestamp', row: { ...validUpdateRow, next_review: 'not-a-date' } },
    { name: 'zero interval', row: { ...validUpdateRow, interval: 0 } },
    { name: 'fractional interval', row: { ...validUpdateRow, interval: 3.5 } },
    { name: 'string interval', row: { ...validUpdateRow, interval: '3' } },
    { name: 'non-finite interval', row: { ...validUpdateRow, interval: Number.NaN } },
    { name: 'interval above maximum', row: { ...validUpdateRow, interval: 36501 } },
    { name: 'ease factor below minimum', row: { ...validUpdateRow, ease_factor: 1.29 } },
    { name: 'string ease factor', row: { ...validUpdateRow, ease_factor: '2.6' } },
    { name: 'non-finite ease factor', row: { ...validUpdateRow, ease_factor: Number.NaN } },
    { name: 'infinite ease factor', row: { ...validUpdateRow, ease_factor: Number.POSITIVE_INFINITY } },
    { name: 'negative review count', row: { ...validUpdateRow, review_count: -1 } },
    { name: 'fractional review count', row: { ...validUpdateRow, review_count: 1.5 } },
    { name: 'string review count', row: { ...validUpdateRow, review_count: '3' } },
    { name: 'non-finite review count', row: { ...validUpdateRow, review_count: Number.NaN } },
    { name: 'infinite review count', row: { ...validUpdateRow, review_count: Number.POSITIVE_INFINITY } },
    { name: 'null last_reviewed', row: { ...validUpdateRow, last_reviewed: null } },
    { name: 'invalid last_reviewed timestamp', row: { ...validUpdateRow, last_reviewed: 'not-a-date' } },
  ];

  for (const { name, row } of malformedRows) {
    await t.test(name, async () => {
      await assertMalformedStudySessionUpdateRowRollsBack(row);
    });
  }
});
