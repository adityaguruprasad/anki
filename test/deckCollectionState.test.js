const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addCreatedDeck,
  mergeRenamedDeck,
  removeDeckFromList,
} = require('../deckCollectionState');

test('addCreatedDeck prepends a viable created deck with empty card counts', () => {
  const decks = [
    { id: 1, name: 'Math', totalCards: 2, dueCards: 1 },
    { id: 2, name: 'Biology', totalCards: 4, dueCards: 0 },
  ];

  assert.deepEqual(
    addCreatedDeck(decks, { id: 3, name: 'Spanish', created_at: '2026-05-09' }),
    [
      { id: 3, name: 'Spanish', created_at: '2026-05-09', totalCards: 0, dueCards: 0 },
      decks[0],
      decks[1],
    ],
  );
});

test('addCreatedDeck uses the submitted name fallback and avoids duplicate ids', () => {
  const decks = [
    { id: 3, name: 'Stale name', totalCards: 9, dueCards: 2 },
    { id: 1, name: 'Math', totalCards: 2, dueCards: 1 },
  ];

  assert.deepEqual(
    addCreatedDeck(decks, { id: '3' }, 'Spanish'),
    [
      { id: '3', name: 'Spanish', totalCards: 0, dueCards: 0 },
      decks[1],
    ],
  );
});

test('addCreatedDeck leaves the list unchanged for unusable create responses', () => {
  const decks = [{ id: 1, name: 'Math' }];

  assert.equal(addCreatedDeck(decks, { name: 'Missing id' }), decks);
  assert.equal(addCreatedDeck(decks, { id: 2, name: '   ' }), decks);
});

test('mergeRenamedDeck merges a successful rename while preserving existing counts', () => {
  const decks = [
    { id: 1, name: 'Math', totalCards: 2, dueCards: 1 },
    { id: 2, name: 'Biology', totalCards: 4, dueCards: 0 },
  ];

  assert.deepEqual(
    mergeRenamedDeck(decks, '2', { id: 2, name: 'Life Science', created_at: '2026-05-09' }),
    [
      decks[0],
      { id: 2, name: 'Life Science', totalCards: 4, dueCards: 0, created_at: '2026-05-09' },
    ],
  );
});

test('mergeRenamedDeck falls back to the submitted name when the response is sparse', () => {
  const decks = [{ id: 2, name: 'Biology', totalCards: 4, dueCards: 0 }];

  assert.deepEqual(
    mergeRenamedDeck(decks, 2, {}, 'Life Science'),
    [{ id: 2, name: 'Life Science', totalCards: 4, dueCards: 0 }],
  );
});

test('removeDeckFromList removes matching deck ids without touching unrelated decks', () => {
  const decks = [
    { id: 1, name: 'Math' },
    { id: 2, name: 'Biology' },
  ];

  assert.deepEqual(removeDeckFromList(decks, '2'), [decks[0]]);
  assert.equal(removeDeckFromList(decks, 3), decks);
});
