const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getStats,
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
});

test('GET /api/cards/:deckId returns due cards for owned deck', async () => {
  const dueCards = [{ id: 1 }, { id: 2 }];
  const db = createDb([
    { rowCount: 1, rows: [{ id: 42 }] },
    { rowCount: 2, rows: dueCards },
  ]);
  const req = { params: { deckId: '42' }, user: { userId: 'user-1' } };
  const res = createRes();

  await getDueCardsByDeck(req, res, db);

  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body, dueCards);
  assert.equal(db.calls.length, 2);
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
  assert.deepEqual(res.body, stats);
  assert.equal(db.calls.length, 1);
  assert.deepEqual(db.calls[0].params, ['user-1']);
  assert.match(db.calls[0].sql, /WHERE d\.user_id = \$1/);
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
