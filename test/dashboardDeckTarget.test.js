const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getStudyDeckTargetPath,
  hasDashboardDeckListPayload,
  hasDueCards,
  selectStudyDeckTarget,
} = require('../dashboardDeckTarget');

test('hasDashboardDeckListPayload accepts arrays of deck-like objects with usable ids and non-negative safe integer counts', () => {
  assert.equal(hasDashboardDeckListPayload([]), true);
  assert.equal(hasDashboardDeckListPayload([
    { id: 1, name: 'Math', totalCards: 20, dueCards: 0 },
    { id: 'science deck', name: 'Science', totalCards: Number.MAX_SAFE_INTEGER, dueCards: 2 },
  ]), true);
});

test('hasDashboardDeckListPayload rejects non-integer, negative, and unsafe count fields', () => {
  [
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ].forEach((count) => {
    assert.equal(
      hasDashboardDeckListPayload([{ id: 1, name: 'Bad total', totalCards: count, dueCards: 0 }]),
      false,
      `Expected totalCards=${String(count)} to be rejected`
    );
    assert.equal(
      hasDashboardDeckListPayload([{ id: 1, name: 'Bad due', totalCards: 1, dueCards: count }]),
      false,
      `Expected dueCards=${String(count)} to be rejected`
    );
  });
});

test('hasDashboardDeckListPayload rejects blank string ids while preserving finite numeric ids', () => {
  assert.equal(hasDashboardDeckListPayload([
    { id: 7, name: 'Numeric id', totalCards: 1, dueCards: 0 },
  ]), true);
  assert.equal(hasDashboardDeckListPayload([
    { id: ' science deck ', name: 'String id', totalCards: 1, dueCards: 0 },
  ]), true);

  ['', '   ', '\n\t'].forEach((id) => {
    assert.equal(
      hasDashboardDeckListPayload([{ id, name: 'Blank id', totalCards: 1, dueCards: 0 }]),
      false,
      `Expected id=${JSON.stringify(id)} to be rejected`
    );
  });
});

test('hasDashboardDeckListPayload rejects malformed deck list payloads', () => {
  [
    null,
    undefined,
    true,
    7,
    'decks',
    {},
    { id: 1, totalCards: 2, dueCards: 1 },
    [null],
    [3],
    ['deck'],
    [[]],
    [{ name: 'Missing id', totalCards: 2, dueCards: 1 }],
    [{ id: Number.POSITIVE_INFINITY, totalCards: 2, dueCards: 1 }],
    [{ id: 1, dueCards: 1 }],
    [{ id: 1, totalCards: 2 }],
    [{ id: 1, totalCards: '2', dueCards: 1 }],
    [{ id: 1, totalCards: 2, dueCards: '1' }],
    [{ id: 1, totalCards: Number.NaN, dueCards: 1 }],
    [{ id: 1, totalCards: 2, dueCards: Number.NEGATIVE_INFINITY }],
    [
      { id: 1, name: 'Valid', totalCards: 2, dueCards: 1 },
      { id: 2, name: 'Malformed', totalCards: 2, dueCards: null },
    ],
  ].forEach((payload) => {
    assert.equal(hasDashboardDeckListPayload(payload), false);
  });
});

test('selectStudyDeckTarget returns the first deck with due cards', () => {
  const dueDeck = { id: 2, name: 'Biology', totalCards: 4, dueCards: 1 };
  const laterDueDeck = { id: 3, name: 'History', totalCards: 8, dueCards: 6 };

  assert.equal(selectStudyDeckTarget([
    { id: 1, name: 'Math', totalCards: 20, dueCards: 0 },
    dueDeck,
    laterDueDeck,
  ]), dueDeck);
});

test('selectStudyDeckTarget prefers due cards over earlier non-due cards', () => {
  const dueDeck = { id: 3, name: 'Spanish', totalCards: 2, dueCards: 1 };

  assert.equal(selectStudyDeckTarget([
    { id: 1, name: 'Math', totalCards: 20, dueCards: 0 },
    { id: 2, name: 'Chemistry', totalCards: 5, dueCards: 0 },
    dueDeck,
  ]), dueDeck);
});

test('selectStudyDeckTarget falls back to the first deck with cards when none are due', () => {
  const firstDeckWithCards = { id: 2, name: 'Chemistry', totalCards: 5, dueCards: 0 };

  assert.equal(selectStudyDeckTarget([
    { id: 1, name: 'Empty', totalCards: 0, dueCards: 0 },
    firstDeckWithCards,
    { id: 3, name: 'History', totalCards: 9, dueCards: 0 },
  ]), firstDeckWithCards);
});

test('selectStudyDeckTarget ignores invalid counts', () => {
  const numericDeck = { id: 3, name: 'Biology', totalCards: 2, dueCards: 0 };

  assert.equal(selectStudyDeckTarget([
    { id: 1, name: 'String Due', totalCards: 0, dueCards: '5' },
    { id: 2, name: 'String Total', totalCards: '10', dueCards: 0 },
    { id: 4, name: 'Decimal Due', totalCards: 0, dueCards: 1.5 },
    { id: 5, name: 'Unsafe Total', totalCards: Number.MAX_SAFE_INTEGER + 1, dueCards: 0 },
    numericDeck,
  ]), numericDeck);
});

test('selectStudyDeckTarget returns null when there is no study target', () => {
  assert.equal(selectStudyDeckTarget([
    { id: 1, name: 'Empty', totalCards: 0, dueCards: 0 },
    { id: 2, name: 'Unknown', totalCards: Number.NaN, dueCards: Number.POSITIVE_INFINITY },
  ]), null);
  assert.equal(selectStudyDeckTarget(null), null);
});

test('hasDueCards distinguishes due targets from fallback targets', () => {
  assert.equal(hasDueCards({ totalCards: 5, dueCards: 1 }), true);
  assert.equal(hasDueCards({ totalCards: 5, dueCards: 0 }), false);
  assert.equal(hasDueCards({ totalCards: 5, dueCards: 1.5 }), false);
  assert.equal(hasDueCards({ totalCards: 5, dueCards: '1' }), false);
});

test('getStudyDeckTargetPath only routes due targets to study sessions', () => {
  assert.equal(
    getStudyDeckTargetPath({ id: 'science deck', totalCards: 5, dueCards: 2 }),
    '/study?deckId=science%20deck',
  );
  assert.equal(getStudyDeckTargetPath({ id: 3, totalCards: 5, dueCards: 0 }), '/decks');
  assert.equal(getStudyDeckTargetPath(null), '/decks');
});
