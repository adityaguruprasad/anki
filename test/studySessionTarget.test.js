const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STUDY_SESSION_REQUESTS,
  getStudySessionRequest,
  parseDeckId,
} = require('../studySessionTarget');

test('parseDeckId returns a positive safe integer deck id from the route', () => {
  assert.equal(parseDeckId('?deckId=123'), 123);
  assert.equal(parseDeckId('?deckId=0'), null);
  assert.equal(parseDeckId('?deckId=-1'), null);
  assert.equal(parseDeckId('?deckId=abc'), null);
  assert.equal(parseDeckId(''), null);
});

test('getStudySessionRequest fetches decks when no valid deck id is present', () => {
  assert.deepEqual(getStudySessionRequest(''), {
    type: STUDY_SESSION_REQUESTS.LOAD_DECKS,
  });
  assert.deepEqual(getStudySessionRequest('?deckId=abc'), {
    type: STUDY_SESSION_REQUESTS.LOAD_DECKS,
  });
});

test('getStudySessionRequest selects the first deck with due cards after decks load', () => {
  const dueDeck = { id: 2, name: 'Biology', totalCards: 5, dueCards: 1 };

  assert.deepEqual(
    getStudySessionRequest('', [
      { id: 1, name: 'Math', totalCards: 10, dueCards: 0 },
      dueDeck,
      { id: 3, name: 'History', totalCards: 8, dueCards: 4 },
    ]),
    {
      type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
      deckId: 2,
      deck: dueDeck,
      source: 'selected',
    },
  );
});

test('getStudySessionRequest reports no due deck instead of selecting a non-due fallback for study', () => {
  const fallbackDeck = { id: 1, name: 'Math', totalCards: 10, dueCards: 0 };

  assert.deepEqual(
    getStudySessionRequest('', [
      fallbackDeck,
      { id: 2, name: 'Chemistry', totalCards: 5, dueCards: 0 },
    ]),
    {
      type: STUDY_SESSION_REQUESTS.NO_DUE_DECK,
      deck: fallbackDeck,
    },
  );
  assert.deepEqual(getStudySessionRequest('', []), {
    type: STUDY_SESSION_REQUESTS.NO_DUE_DECK,
    deck: null,
  });
});

test('getStudySessionRequest uses an explicit deck id without requiring deck loading', () => {
  assert.deepEqual(getStudySessionRequest('?deckId=123'), {
    type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
    deckId: 123,
    source: 'explicit',
  });
  assert.deepEqual(
    getStudySessionRequest('?deckId=123', [
      { id: 2, name: 'Biology', totalCards: 5, dueCards: 1 },
    ]),
    {
      type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
      deckId: 123,
      source: 'explicit',
    },
  );
});
