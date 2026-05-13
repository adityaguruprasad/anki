const test = require('node:test');
const assert = require('node:assert/strict');

const {
  addCreatedCardToLoadedDeckCards,
  decrementDeckCardCounts,
  incrementDeckCardCounts,
  isCardCurrentlyDue,
  mergeUniqueCards,
} = require('../deckCardState');

test('isCardCurrentlyDue treats unscheduled or past next_review values as due', () => {
  const now = new Date('2026-05-09T12:00:00.000Z');

  assert.equal(isCardCurrentlyDue({ next_review: null }, now), true);
  assert.equal(isCardCurrentlyDue({ next_review: '2026-05-09T12:00:00.000Z' }, now), true);
  assert.equal(isCardCurrentlyDue({ next_review: '2026-05-09T11:59:59.999Z' }, now), true);
  assert.equal(isCardCurrentlyDue({ next_review: '2026-05-09T12:00:00.001Z' }, now), false);
});

test('isCardCurrentlyDue treats missing or invalid next_review metadata as unknown', () => {
  const now = new Date('2026-05-09T12:00:00.000Z');

  [
    undefined,
    null,
    [],
    {},
    { next_review: undefined },
    { next_review: '' },
    { next_review: '  ' },
    { next_review: 'not-a-date' },
    { next_review: 0 },
    { next_review: false },
  ].forEach((card) => {
    assert.equal(isCardCurrentlyDue(card, now), false);
  });
});

test('incrementDeckCardCounts increments total and only increments due count for currently due cards', () => {
  const decks = [
    { id: 1, name: 'Math', totalCards: 2, dueCards: 0 },
    { id: 2, name: 'Biology', totalCards: 4, dueCards: 3 },
  ];

  assert.deepEqual(
    incrementDeckCardCounts(
      decks,
      '2',
      { id: 9, next_review: '2026-05-09T11:00:00.000Z' },
      new Date('2026-05-09T12:00:00.000Z'),
    ),
    [
      decks[0],
      { id: 2, name: 'Biology', totalCards: 5, dueCards: 4 },
    ],
  );

  assert.deepEqual(
    incrementDeckCardCounts(
      decks,
      2,
      { id: 10, next_review: '2026-05-10T12:00:00.000Z' },
      new Date('2026-05-09T12:00:00.000Z'),
    ),
    [
      decks[0],
      { id: 2, name: 'Biology', totalCards: 5, dueCards: 3 },
    ],
  );
});

test('decrementDeckCardCounts decrements total and only decrements due count for due cards', () => {
  const decks = [
    { id: 1, name: 'Math', totalCards: 2, dueCards: 1 },
    { id: 2, name: 'Biology', totalCards: 4, dueCards: 3 },
  ];

  assert.deepEqual(
    decrementDeckCardCounts(
      decks,
      '2',
      { id: 9, next_review: '2026-05-09T11:00:00.000Z' },
      new Date('2026-05-09T12:00:00.000Z'),
    ),
    [
      decks[0],
      { id: 2, name: 'Biology', totalCards: 3, dueCards: 2 },
    ],
  );

  assert.deepEqual(
    decrementDeckCardCounts(
      decks,
      2,
      { id: 10, next_review: '2026-05-10T12:00:00.000Z' },
      new Date('2026-05-09T12:00:00.000Z'),
    ),
    [
      decks[0],
      { id: 2, name: 'Biology', totalCards: 3, dueCards: 3 },
    ],
  );
});

test('optimistic card count updates leave due counts unchanged without trustworthy scheduling metadata', () => {
  const decks = [
    { id: 2, name: 'Biology', totalCards: 4, dueCards: 3 },
  ];

  assert.deepEqual(
    incrementDeckCardCounts(decks, 2, { id: 10 }, new Date('2026-05-09T12:00:00.000Z')),
    [
      { id: 2, name: 'Biology', totalCards: 5, dueCards: 3 },
    ],
  );
  assert.deepEqual(
    decrementDeckCardCounts(
      decks,
      2,
      { id: 9, next_review: '' },
      new Date('2026-05-09T12:00:00.000Z'),
    ),
    [
      { id: 2, name: 'Biology', totalCards: 3, dueCards: 3 },
    ],
  );
});

test('decrementDeckCardCounts does not produce negative card counts', () => {
  assert.deepEqual(
    decrementDeckCardCounts(
      [{ id: 2, name: 'Biology', totalCards: 0, dueCards: 0 }],
      2,
      { id: 9, next_review: '2026-05-09T11:00:00.000Z' },
      new Date('2026-05-09T12:00:00.000Z'),
    ),
    [{ id: 2, name: 'Biology', totalCards: 0, dueCards: 0 }],
  );
});

test('addCreatedCardToLoadedDeckCards prepends created cards for loaded unfiltered browsers without duplicating IDs', () => {
  const createdCard = { id: 3, front_content: 'New', back_content: 'Card' };
  const deckCards = {
    2: {
      cards: [
        { id: 1, front_content: 'Old' },
        { id: 3, front_content: 'Stale duplicate' },
      ],
      nextCursor: { cursorCreatedAt: '2026-05-08T12:00:00.000Z', cursorId: 1 },
      hasLoaded: true,
      expanded: true,
      loading: false,
      loadingMore: false,
      error: 'Previous load-more error',
      appliedSearchQuery: '',
      searchQuery: 'typed but not applied',
    },
  };

  const nextDeckCards = addCreatedCardToLoadedDeckCards(deckCards, 2, createdCard);

  assert.deepEqual(nextDeckCards[2], {
    ...deckCards[2],
    cards: [
      createdCard,
      { id: 1, front_content: 'Old' },
    ],
  });
});

test('addCreatedCardToLoadedDeckCards leaves filtered or unloaded browser state unchanged', () => {
  const createdCard = { id: 4, front_content: 'New', back_content: 'Card' };
  const filteredDeckCards = {
    2: {
      cards: [{ id: 1 }],
      hasLoaded: true,
      appliedSearchQuery: 'biology',
      nextCursor: null,
      error: '',
      loading: false,
    },
  };
  const unloadedDeckCards = {
    2: {
      cards: [],
      hasLoaded: false,
      appliedSearchQuery: '',
    },
  };

  assert.equal(addCreatedCardToLoadedDeckCards(filteredDeckCards, 2, createdCard), filteredDeckCards);
  assert.equal(addCreatedCardToLoadedDeckCards(unloadedDeckCards, 2, createdCard), unloadedDeckCards);
});

test('mergeUniqueCards appends only cards whose IDs are not already loaded', () => {
  assert.deepEqual(
    mergeUniqueCards(
      [{ id: 1 }, { id: 2 }],
      [{ id: '2' }, { id: 3 }],
    ),
    [{ id: 1 }, { id: 2 }, { id: 3 }],
  );
});
