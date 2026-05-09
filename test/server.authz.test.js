const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

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

function createConnectedDb(poolResults, clientResults) {
  const db = createDb(poolResults);
  const client = createDb(clientResults);
  client.releaseCalls = 0;
  client.release = () => {
    client.releaseCalls += 1;
  };
  db.connectCalls = 0;
  db.client = client;
  db.connect = async () => {
    db.connectCalls += 1;
    return client;
  };
  return db;
}

test('POST /api/decks returns 400 for invalid deck name and skips db query', async () => {
  const invalidCases = [
    [undefined, 'Invalid deck name: must be a string'],
    [null, 'Invalid deck name: must be a string'],
    [42, 'Invalid deck name: must be a string'],
    ['', 'Invalid deck name: cannot be blank'],
    ['   ', 'Invalid deck name: cannot be blank'],
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
  const deck = { id: 12, user_id: 'user-1', name: 'Biology' };
  const db = createDb([{ rowCount: 1, rows: [deck] }]);
  const req = { body: { name: ' Biology ' }, user: { userId: 'user-1' } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(res.statusCode, 201);
  assert.deepEqual(res.body, deck);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1', 'Biology']);
});

test('POST /api/decks uses atomic conflict handling for duplicate deck names', async () => {
  const db = createDb([{ rowCount: 1, rows: [{ id: 12, user_id: 'user-1', name: 'Biology' }] }]);
  const req = { body: { name: 'Biology' }, user: { userId: 'user-1' } };
  const res = createRes();

  await createDeck(req, res, db);

  assert.equal(db.calls.length, 1);
  assert.match(db.calls[0].sql, /INSERT\s+INTO\s+decks\s+\(user_id,\s+name\)/i);
  assert.match(db.calls[0].sql, /VALUES\s*\(\$1,\s*\$2\)/i);
  assert.match(db.calls[0].sql, /ON\s+CONFLICT\s*\(\s*user_id\s*,\s*\(\s*LOWER\(TRIM\(name\)\)\s*\)\s*\)\s+DO\s+NOTHING/i);
  assert.match(db.calls[0].sql, /RETURNING\s+\*/i);
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
  const invalidCases = [
    [undefined, 'Invalid deck name: must be a string'],
    [null, 'Invalid deck name: must be a string'],
    [42, 'Invalid deck name: must be a string'],
    ['', 'Invalid deck name: cannot be blank'],
    ['   ', 'Invalid deck name: cannot be blank'],
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
  const deck = { id: 42, user_id: 'user-1', name: 'Organic Chemistry' };
  const db = createDb([
    {
      rowCount: 1,
      rows: [{ deckExists: true, duplicateExists: false, deck }],
    },
  ]);
  const req = { params: { deckId: '42' }, body: { name: ' Organic Chemistry ' }, user: { userId: 'user-1' } };
  const res = createRes();

  await renameDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, deck);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 'Organic Chemistry']);
  assert.match(db.calls[0].sql, /WITH\s+target\s+AS/i);
  assert.match(db.calls[0].sql, /UPDATE\s+decks\s+d/i);
  assert.match(db.calls[0].sql, /SET\s+name\s+=\s+\$3/i);
  assert.match(db.calls[0].sql, /WHERE\s+id\s+=\s+\$1\s+AND\s+user_id\s+=\s+\$2/i);
  assert.match(db.calls[0].sql, /LOWER\(TRIM\(name\)\)\s+=\s+LOWER\(TRIM\(\$3\)\)/i);
  assert.match(db.calls[0].sql, /NOT\s+EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+duplicate\s*\)/i);
  assert.match(db.calls[0].sql, /RETURNING\s+d\.\*/i);
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
  const schema = fs.readFileSync(path.join(__dirname, '..', 'anki.db'), 'utf8');

  assert.match(schema, /CREATE\s+UNIQUE\s+INDEX\s+\S+\s+ON\s+decks\s*\(\s*user_id\s*,\s*\(\s*LOWER\(TRIM\(name\)\)\s*\)\s*\)/i);
});

test('GET /api/decks returns decks with one user-scoped aggregate query', async () => {
  const db = createDb([
    {
      rowCount: 2,
      rows: [
        { id: 1, user_id: 'user-1', name: 'Biology', description: null, created_at: '2026-05-08', totalCards: '10', dueCards: '3' },
        { id: 2, user_id: 'user-1', name: 'Math', description: 'Algebra', created_at: '2026-05-08', totalCards: '4', dueCards: '0' },
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
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1']);
  assert.match(db.calls[0].sql, /FROM decks d/);
  assert.match(db.calls[0].sql, /LEFT JOIN cards c ON c\.deck_id = d\.id/);
  assert.match(db.calls[0].sql, /WHERE d\.user_id = \$1/);
  assert.match(db.calls[0].sql, /GROUP BY d\.id/);
  assert.match(db.calls[0].sql, /ORDER BY d\.created_at DESC,\s*d\.id DESC/);
  assert.match(db.calls[0].sql, /COUNT\(c\.id\) AS "totalCards"/);
  assert.match(db.calls[0].sql, /COUNT\(c\.id\) FILTER \(WHERE c\.next_review <= NOW\(\)\) AS "dueCards"/);
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
    '9007199254740992',
  ];

  for (const deckId of invalidDeckIds) {
    const db = createConnectedDb([], []);
    const req = { params: { deckId }, user: { userId: 'user-1' } };
    const res = createRes();

    await deleteDeck(req, res, db);

    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Invalid deckId: must be a positive integer' });
    assert.equal(db.calls.length, 0);
    assert.equal(db.connectCalls, 0);
    assert.equal(db.client.calls.length, 0);
    assert.equal(db.client.releaseCalls, 0);
  }
});

test('DELETE /api/decks/:deckId deletes cards then deck using a connected client transaction', async () => {
  const db = createConnectedDb([], [
    { rowCount: null, rows: [] },
    { rowCount: 1, rows: [{ id: 42 }] },
    { rowCount: 3, rows: [] },
    { rowCount: 1, rows: [] },
    { rowCount: null, rows: [] },
  ]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await deleteDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(db.calls.length, 0);
  assert.equal(db.connectCalls, 1);
  assert.equal(db.client.calls.length, 5);
  assert.equal(db.client.calls[0].sql, 'BEGIN');
  assert.match(db.client.calls[1].sql, /SELECT\s+id\s+FROM\s+decks/i);
  assert.match(db.client.calls[1].sql, /WHERE\s+id\s+=\s+\$1\s+AND\s+user_id\s+=\s+\$2/i);
  assert.match(db.client.calls[1].sql, /FOR\s+UPDATE/i);
  assert.deepEqual(db.client.calls[1].params, [42, 'user-1']);
  assert.match(db.client.calls[2].sql, /DELETE\s+FROM\s+cards/i);
  assert.match(db.client.calls[2].sql, /WHERE\s+deck_id\s+=\s+\$1/i);
  assert.deepEqual(db.client.calls[2].params, [42]);
  assert.match(db.client.calls[3].sql, /DELETE\s+FROM\s+decks/i);
  assert.match(db.client.calls[3].sql, /WHERE\s+id\s+=\s+\$1\s+AND\s+user_id\s+=\s+\$2/i);
  assert.deepEqual(db.client.calls[3].params, [42, 'user-1']);
  assert.equal(db.client.calls[4].sql, 'COMMIT');
  assert.equal(db.client.releaseCalls, 1);
});

test('DELETE /api/decks/:deckId returns 404 for missing or unowned deck without deleting cards', async () => {
  const db = createConnectedDb([], [
    { rowCount: null, rows: [] },
    { rowCount: 0, rows: [] },
    { rowCount: null, rows: [] },
  ]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await deleteDeck(req, res, db);

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Deck not found' });
  assert.equal(db.calls.length, 0);
  assert.equal(db.connectCalls, 1);
  assert.equal(db.client.calls.length, 3);
  assert.equal(db.client.calls[0].sql, 'BEGIN');
  assert.match(db.client.calls[1].sql, /SELECT\s+id\s+FROM\s+decks/i);
  assert.match(db.client.calls[1].sql, /WHERE\s+id\s+=\s+\$1\s+AND\s+user_id\s+=\s+\$2/i);
  assert.match(db.client.calls[1].sql, /FOR\s+UPDATE/i);
  assert.deepEqual(db.client.calls[1].params, [42, 'user-1']);
  assert.equal(db.client.calls[2].sql, 'ROLLBACK');
  assert.equal(db.client.calls.some((call) => /DELETE\s+FROM\s+cards/i.test(call.sql)), false);
  assert.equal(db.client.releaseCalls, 1);
});

test('DELETE /api/decks/:deckId rolls back on connected client failure after BEGIN', async () => {
  const db = createConnectedDb([], [
    { rowCount: null, rows: [] },
    { rowCount: 1, rows: [{ id: 42 }] },
    new Error('delete failed'),
    { rowCount: null, rows: [] },
  ]);
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
  assert.equal(db.calls.length, 0);
  assert.equal(db.connectCalls, 1);
  assert.equal(db.client.calls.length, 4);
  assert.equal(db.client.calls[0].sql, 'BEGIN');
  assert.match(db.client.calls[1].sql, /SELECT\s+id\s+FROM\s+decks/i);
  assert.match(db.client.calls[1].sql, /FOR\s+UPDATE/i);
  assert.match(db.client.calls[2].sql, /DELETE\s+FROM\s+cards/i);
  assert.equal(db.client.calls[3].sql, 'ROLLBACK');
  assert.equal(db.client.releaseCalls, 1);
});

test('DELETE /api/decks/:deckId falls back to db query transaction when connect is unavailable', async () => {
  const db = createDb([
    { rowCount: null, rows: [] },
    { rowCount: 1, rows: [{ id: 42 }] },
    { rowCount: 3, rows: [] },
    { rowCount: 1, rows: [] },
    { rowCount: null, rows: [] },
  ]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await deleteDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(db.calls.length, 5);
  assert.equal(db.calls[0].sql, 'BEGIN');
  assert.match(db.calls[1].sql, /SELECT\s+id\s+FROM\s+decks/i);
  assert.match(db.calls[1].sql, /FOR\s+UPDATE/i);
  assert.match(db.calls[2].sql, /DELETE\s+FROM\s+cards/i);
  assert.match(db.calls[3].sql, /DELETE\s+FROM\s+decks/i);
  assert.equal(db.calls[4].sql, 'COMMIT');
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
  assert.deepEqual(
    validatePositiveIntegerIdentifier(5, 'deckId'),
    { ok: true, value: 5 }
  );
  assert.deepEqual(
    validatePositiveIntegerIdentifier(Number.MAX_SAFE_INTEGER, 'deckId'),
    { ok: true, value: Number.MAX_SAFE_INTEGER }
  );
  assert.deepEqual(
    validatePositiveIntegerIdentifier(' 42 ', 'deckId'),
    { ok: true, value: 42 }
  );
  assert.deepEqual(
    validatePositiveIntegerIdentifier(` ${Number.MAX_SAFE_INTEGER} `, 'deckId'),
    { ok: true, value: Number.MAX_SAFE_INTEGER }
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
    Number.MAX_SAFE_INTEGER + 1,
    `${Number.MAX_SAFE_INTEGER + 1}`,
    '9007199254740993',
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

test('GET /api/decks/:deckId/cards returns default-limited owned deck cards newest first', async () => {
  const cards = [
    {
      id: 3,
      deck_id: 42,
      front_content: 'Future card',
      back_content: 'Answer',
      created_at: '2026-05-08T13:00:00.000Z',
      next_review: '2026-05-20T12:00:00.000Z',
    },
    {
      id: 2,
      deck_id: 42,
      front_content: 'Due card',
      back_content: 'Answer',
      created_at: '2026-05-08T12:00:00.000Z',
      next_review: '2026-05-07T12:00:00.000Z',
    },
  ];
  const db = createDb([
    {
      rowCount: 2,
      rows: cards.map((card) => ({
        ...card,
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
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
});

test('GET /api/decks/:deckId/cards uses one user-scoped ordered browse query with default limit', async () => {
  const db = createDb([{ rowCount: 1, rows: [{ id: null, __owned_deck_id: 42 }] }]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getCardsByDeck(req, res, db);

  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1', 51]);
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
  const card = {
    id: 3,
    deck_id: 42,
    front_content: 'Future card',
    back_content: 'Answer',
    created_at: createdAt,
  };
  const extraCard = {
    id: 2,
    deck_id: 42,
    front_content: 'Extra card',
    back_content: 'Answer',
    created_at: new Date('2026-05-08T12:00:00.000Z'),
  };
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

test('GET /api/decks/:deckId/cards omits next cursor when only limit rows are returned', async () => {
  const card = {
    id: 3,
    deck_id: 42,
    front_content: 'Future card',
    back_content: 'Answer',
    created_at: new Date('2026-05-08T13:00:00.000Z'),
  };
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
  const card = {
    id: 3,
    deck_id: 42,
    front_content: 'Cell division',
    back_content: 'Mitosis',
    created_at: '2026-05-08T13:00:00.000Z',
  };
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
      query: { beforeCreatedAt: '2026-05-08T13:00:00.000Z', beforeId: ['3'] },
      error: 'Invalid beforeId: must be a positive integer',
    },
    {
      query: { cursorCreatedAt: 'not-a-date', cursorId: '3' },
      error: 'Invalid cursorCreatedAt: must be a valid date',
    },
    {
      query: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: '0' },
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
  const card = {
    id: 2,
    deck_id: 42,
    front_content: 'Older card',
    back_content: 'Answer',
    created_at: '2026-05-08T12:00:00.000Z',
  };
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
  const card = {
    id: 2,
    deck_id: 42,
    front_content: 'Older card',
    back_content: 'Answer',
    created_at: '2026-05-08T12:00:00.000Z',
  };
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
  const card = {
    id: 2,
    deck_id: 42,
    front_content: 'Older card',
    back_content: 'Mito answer',
    created_at: '2026-05-08T12:00:00.000Z',
  };
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
  const card = {
    id: 2,
    deck_id: 42,
    front_content: 'Older card',
    back_content: 'Answer',
    created_at: '2026-05-08T12:00:00.000Z',
  };
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
  assert.deepEqual(db.calls[0].params, [42, 'user-1']);
  assert.match(db.calls[0].sql, /WHERE d\.id = \$1 AND d\.user_id = \$2/);
});

test('GET /api/cards/:deckId returns all due cards for owned deck when limit is omitted', async () => {
  const dueCards = [
    { id: 1, next_review: '2026-05-07T12:00:00.000Z' },
    { id: 2, next_review: '2026-05-08T12:00:00.000Z' },
  ];
  const db = createDb([
    {
      rowCount: 2,
      rows: dueCards.map((card) => ({ ...card, __owned_deck_id: 42 })),
    },
  ]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getDueCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, dueCards);
  assert.equal(Object.hasOwn(res.body[0], '__owned_deck_id'), false);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1']);
  assert.match(db.calls[0].sql, /LEFT JOIN cards c/);
  assert.match(db.calls[0].sql, /WHERE d\.id = \$1 AND d\.user_id = \$2/);
  assert.match(db.calls[0].sql, /ORDER BY c\.next_review ASC,\s*c\.id ASC/);
  assert.doesNotMatch(db.calls[0].sql, /\bLIMIT\b/);
});

test('GET /api/cards/:deckId accepts boundary limit with a parameterized limit', async () => {
  const dueCard = { id: 1, next_review: '2026-05-07T12:00:00.000Z' };
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
  assert.match(db.calls[0].sql, /ORDER BY c\.next_review ASC,\s*c\.id ASC\s+LIMIT \$3/);
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
  assert.deepEqual(db.calls[0].params, [42, 'user-1']);
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
  const db = createDb([{ rowCount: 1, rows: [createdCard] }]);
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
  assert.match(db.calls[0].sql, /RETURNING\s+\*/i);
  assert.doesNotMatch(db.calls[0].sql, /INSERT[\s\S]+VALUES/i);
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
  const db = createDb([{ rowCount: 1, rows: [updatedCard] }]);
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
  assert.match(db.calls[0].sql, /RETURNING\s+\*/i);
  assert.doesNotMatch(db.calls[0].sql, /SELECT[\s\S]+FROM\s+cards/i);
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
  const db = createDb([{ rowCount: 1, rows: [] }]);
  const req = { params: { cardId: '77' }, user: { userId: 'user-1' } };
  const res = createRes();

  await deleteCard(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [77, 'user-1']);
  assert.match(db.calls[0].sql, /DELETE\s+FROM\s+cards/i);
  assert.match(db.calls[0].sql, /WHERE\s+id\s+=\s+\$1/i);
  assert.match(db.calls[0].sql, /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+decks\s+d/i);
  assert.match(db.calls[0].sql, /d\.id\s+=\s+cards\.deck_id/i);
  assert.match(db.calls[0].sql, /d\.user_id\s+=\s+\$2/i);
  assert.doesNotMatch(db.calls[0].sql, /SELECT[\s\S]+FROM\s+cards/i);
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

test('GET /api/stats returns zero for null and empty aggregate values', async () => {
  const db = createDb([
    {
      rowCount: 1,
      rows: [
        {
          totalCards: null,
          totalDecks: '',
          todayReviews: undefined,
          weekReviews: null,
          monthReviews: '',
        },
      ],
    },
  ]);
  const req = { user: { userId: 'user-1' } };
  const res = createRes();

  await getStats(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    totalCards: 0,
    totalDecks: 0,
    todayReviews: 0,
    weekReviews: 0,
    monthReviews: 0,
  });
  assert.equal(db.calls.length, 1);
  assert.equal(db.calls[0].params[0], 'user-1');
  const dateParams = db.calls[0].params.slice(1);
  assert.equal(dateParams.length, 4);
  dateParams.forEach((param) => {
    assert.ok(param instanceof Date);
  });
  assert.match(db.calls[0].sql, /WHERE d\.user_id = \$1/);
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
  assert.match(db.calls[0].sql, /c\.next_review < \$2/);
  assert.match(db.calls[0].sql, /c\.next_review >= \$2\s+AND c\.next_review < \$3/);
  assert.match(db.calls[0].sql, /c\.next_review >= \$3\s+AND c\.next_review < \$4/);
  assert.match(db.calls[0].sql, /c\.next_review >= \$2\s+AND c\.next_review < \$5/);
  assert.doesNotMatch(db.calls[0].sql, /\bCURRENT_DATE\b/i);
  assert.doesNotMatch(db.calls[0].sql, /SELECT\s+c\.id\b/i);
  assert.doesNotMatch(db.calls[0].sql, /\bc\.next_review,\s*c\.ease_factor,\s*c\.review_count\b/i);
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
});

test('POST /api/study-session returns 404 when card is not in user decks', async () => {
  const db = createDb([{ rowCount: 0, rows: [] }]);
  const req = { body: { cardId: 5, quality: 3 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db, () => ({}));

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Card not found' });
  assert.equal(db.calls.length, 1);
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
    { rowCount: 1, rows: [{ id: 7, deck_id: 1, ease_factor: 2.5, interval: 2, review_count: 2 }] },
    { rowCount: 1, rows: [updatedCard] },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db, () => ({
    ease_factor: 2.6,
    interval: 3,
    next_review: nextReview,
  }));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true, card: updatedCard });
  assert.equal(db.calls.length, 2);
  assert.match(db.calls[1].sql, /UPDATE\s+cards/i);
  assert.match(db.calls[1].sql, /WHERE\s+id\s+=\s+\$4/i);
  assert.match(db.calls[1].sql, /EXISTS\s*\(\s*SELECT\s+1\s+FROM\s+decks\s+d/i);
  assert.match(db.calls[1].sql, /d\.id\s+=\s+cards\.deck_id/i);
  assert.match(db.calls[1].sql, /d\.user_id\s+=\s+\$5/i);
  const returningClause = db.calls[1].sql.match(/\bRETURNING\b([\s\S]*)/i)?.[1];
  assert.ok(returningClause, 'expected UPDATE to include a RETURNING clause');
  for (const column of ['id', 'next_review', 'interval', 'ease_factor', 'review_count', 'last_reviewed']) {
    assert.match(returningClause, new RegExp(`\\b${column}\\b`, 'i'));
  }
  assert.deepEqual(db.calls[1].params, [nextReview, 3, 2.6, 7, 'user-1']);
});

test('POST /api/study-session returns 404 when final user-scoped update finds no card', async () => {
  const db = createDb([
    { rowCount: 1, rows: [{ id: 7, deck_id: 1, ease_factor: 2.5, interval: 2, review_count: 2 }] },
    { rowCount: 0, rows: [] },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db, () => ({
    ease_factor: 2.6,
    interval: 3,
    next_review: '2026-05-08T12:00:00.000Z',
  }));

  assert.equal(res.statusCode, 404);
  assert.deepEqual(res.body, { error: 'Card not found' });
  assert.equal(db.calls.length, 2);
  assert.match(db.calls[1].sql, /d\.user_id\s+=\s+\$5/i);
  assert.deepEqual(db.calls[1].params, ['2026-05-08T12:00:00.000Z', 3, 2.6, 7, 'user-1']);
});
