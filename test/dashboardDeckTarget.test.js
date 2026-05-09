const test = require('node:test');
const assert = require('node:assert/strict');

const { getStudyDeckTargetPath, hasDueCards, selectStudyDeckTarget } = require('../dashboardDeckTarget');

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

test('selectStudyDeckTarget ignores non-numeric counts', () => {
  const numericDeck = { id: 3, name: 'Biology', totalCards: 2, dueCards: 0 };

  assert.equal(selectStudyDeckTarget([
    { id: 1, name: 'String Due', totalCards: 0, dueCards: '5' },
    { id: 2, name: 'String Total', totalCards: '10', dueCards: 0 },
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
