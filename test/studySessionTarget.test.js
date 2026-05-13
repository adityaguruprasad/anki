const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STUDY_SESSION_REQUESTS,
  getStudySessionRequest,
  getValidatedStudySessionDeckListRequest,
  parseDeckId,
  shouldShowNoDueNoticeForInitialStudySessionRequest,
} = require('../studySessionTarget');

test('parseDeckId returns a positive safe integer deck id from the route', () => {
  assert.equal(parseDeckId('?deckId=123'), 123);
  assert.equal(parseDeckId('?deckId=00042'), 42);
  assert.equal(parseDeckId('?deckId=%2042%20'), null);
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

test('getStudySessionRequest selects the due deck with the largest backlog after decks load', () => {
  const largestDueDeck = { id: 3, name: 'History', totalCards: 8, dueCards: 4 };

  assert.deepEqual(
    getStudySessionRequest('', [
      { id: 1, name: 'Math', totalCards: 10, dueCards: 0 },
      { id: 2, name: 'Biology', totalCards: 5, dueCards: 1 },
      largestDueDeck,
    ]),
    {
      type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
      deckId: 3,
      deck: largestDueDeck,
      source: 'selected',
    },
  );
});

test('getStudySessionRequest preserves an unrouteable due deck instead of loading cards', () => {
  const fallbackDeck = { id: 7, name: 'Math', totalCards: 10, dueCards: 0 };
  const unrouteableDueDeck = { id: 'science deck', name: 'Science', totalCards: 5, dueCards: 4 };
  const request = getStudySessionRequest('', [
    fallbackDeck,
    unrouteableDueDeck,
  ]);

  assert.notEqual(request.type, STUDY_SESSION_REQUESTS.LOAD_CARDS);
  assert.deepEqual(request, {
    type: STUDY_SESSION_REQUESTS.NO_DUE_DECK,
    deck: unrouteableDueDeck,
  });
  assert.equal(request.deck, unrouteableDueDeck);
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

test('getValidatedStudySessionDeckListRequest rejects malformed deck lists instead of selecting from them', () => {
  const malformedPayload = [
    { id: 1, name: 'Impossible due count', totalCards: 2, dueCards: 10 },
    { id: 2, name: 'Due deck', totalCards: 5, dueCards: 3 },
  ];

  assert.throws(
    () => getValidatedStudySessionDeckListRequest('', malformedPayload),
    /Malformed deck list payload/,
  );

  [
    null,
    {},
    { id: 1, totalCards: 2, dueCards: 1 },
    [{ id: 1, name: 'Missing total', dueCards: 1 }],
    [{ id: 1, name: 'Impossible due count', totalCards: 1, dueCards: 2 }],
    [{ id: 'science deck', name: 'Unrouteable id', totalCards: 2, dueCards: 1 }],
  ].forEach((payload) => {
    assert.throws(
      () => getValidatedStudySessionDeckListRequest('', payload),
      /Malformed deck list payload/,
    );
  });
});

test('getValidatedStudySessionDeckListRequest preserves valid deck selection behavior', () => {
  const dueDeck = { id: 2, name: 'Biology', totalCards: 5, dueCards: 1 };
  const noDueDeck = { id: 1, name: 'Math', totalCards: 10, dueCards: 0 };
  const duePayload = [
    noDueDeck,
    dueDeck,
  ];
  const noDuePayload = [
    noDueDeck,
    { id: 3, name: 'Empty', totalCards: 0, dueCards: 0 },
  ];

  assert.deepEqual(
    getValidatedStudySessionDeckListRequest('', duePayload),
    getStudySessionRequest('', duePayload),
  );
  assert.deepEqual(
    getValidatedStudySessionDeckListRequest('', noDuePayload),
    getStudySessionRequest('', noDuePayload),
  );
  assert.deepEqual(
    getValidatedStudySessionDeckListRequest('', []),
    getStudySessionRequest('', []),
  );
});

test('getValidatedStudySessionDeckListRequest normalizes automatically selected string deck ids', () => {
  const selectedDeck = { id: ' 00042 ', name: 'Biology', totalCards: 5, dueCards: 3 };
  const decks = [
    { id: 7, name: 'Math', totalCards: 10, dueCards: 1 },
    selectedDeck,
  ];
  const request = getValidatedStudySessionDeckListRequest('', decks);

  assert.deepEqual(request, {
    type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
    deckId: 42,
    deck: selectedDeck,
    source: 'selected',
  });
  assert.equal(request.deck, selectedDeck);
  assert.equal(typeof request.deckId, 'number');
});

test('shouldShowNoDueNoticeForInitialStudySessionRequest covers initial deck loads only', () => {
  assert.equal(
    shouldShowNoDueNoticeForInitialStudySessionRequest({
      type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
      deckId: 1,
      source: 'explicit',
    }),
    true,
  );
  assert.equal(
    shouldShowNoDueNoticeForInitialStudySessionRequest({
      type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
      deckId: 2,
      source: 'selected',
    }),
    true,
  );
  assert.equal(
    shouldShowNoDueNoticeForInitialStudySessionRequest({
      type: STUDY_SESSION_REQUESTS.LOAD_CARDS,
      deckId: 3,
    }),
    false,
  );
  assert.equal(
    shouldShowNoDueNoticeForInitialStudySessionRequest({
      type: STUDY_SESSION_REQUESTS.LOAD_DECKS,
    }),
    false,
  );
  assert.equal(
    shouldShowNoDueNoticeForInitialStudySessionRequest({
      type: STUDY_SESSION_REQUESTS.NO_DUE_DECK,
      deck: null,
    }),
    false,
  );
  assert.equal(shouldShowNoDueNoticeForInitialStudySessionRequest(null), false);
});
