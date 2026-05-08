const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  createDeck,
  getStats,
  getSchedulingInsights,
  getDueCardsByDeck,
  submitStudySession,
  isValidQuality,
  validatePositiveIntegerIdentifier,
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

test('anki.db enforces unique normalized deck names per user', () => {
  const schema = fs.readFileSync(path.join(__dirname, '..', 'anki.db'), 'utf8');

  assert.match(schema, /CREATE\s+UNIQUE\s+INDEX\s+\S+\s+ON\s+decks\s*\(\s*user_id\s*,\s*\(\s*LOWER\(TRIM\(name\)\)\s*\)\s*\)/i);
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
    validatePositiveIntegerIdentifier(' 42 ', 'deckId'),
    { ok: true, value: 42 }
  );

  const invalidValues = [undefined, null, '', '  ', 'abc', '1.2', '1e2', 0, -1, 1.5];
  for (const value of invalidValues) {
    assert.deepEqual(
      validatePositiveIntegerIdentifier(value, 'deckId'),
      { ok: false, error: 'Invalid deckId: must be a positive integer' }
    );
  }
});

test('GET /api/cards/:deckId returns 400 for invalid deckId and skips db query', async () => {
  const invalidDeckIds = [undefined, null, '', 'abc', '1.2', '0', ' -5 ', 0, -2, 1.3];

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

test('GET /api/cards/:deckId returns due cards for owned deck with one query', async () => {
  const dueCards = [{ id: 1 }, { id: 2 }];
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
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, [42, 'user-1']);
  assert.match(db.calls[0].sql, /LEFT JOIN cards c/);
  assert.match(db.calls[0].sql, /WHERE d\.id = \$1 AND d\.user_id = \$2/);
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

  await getStats(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, {
    totalCards: 12,
    totalDecks: 3,
    todayReviews: 4,
    weekReviews: 7,
    monthReviews: 10,
  });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1']);
  assert.match(db.calls[0].sql, /WHERE d\.user_id = \$1/);
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
  assert.deepEqual(db.calls[0].params, ['user-1']);
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
  const invalidCardIds = [undefined, null, '', 'abc', '1.2', '0', ' -7 ', 0, -1, 2.4];

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

test('POST /api/study-session keeps successful response shape', async () => {
  const db = createDb([
    { rowCount: 1, rows: [{ id: 7, deck_id: 1, ease_factor: 2.5, interval: 2, review_count: 2 }] },
    { rowCount: 1, rows: [] },
  ]);
  const req = { body: { cardId: 7, quality: 4 }, user: { userId: 'user-1' } };
  const res = createRes();

  await submitStudySession(req, res, db, () => ({
    ease_factor: 2.6,
    interval: 3,
    next_review: new Date().toISOString(),
  }));

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, { success: true });
  assert.equal(db.calls.length, 2);
});
