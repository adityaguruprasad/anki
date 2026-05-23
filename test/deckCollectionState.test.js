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

test('addCreatedDeck ignores inherited create fields without invoking getters', () => {
  const decks = [{ id: 1, name: 'Math' }];
  let getterCalls = 0;
  const prototype = {};

  for (const field of ['id', 'name', 'totalCards', 'dueCards']) {
    Object.defineProperty(prototype, field, {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error(`${field} getter should not run`);
      },
    });
  }

  assert.equal(addCreatedDeck(decks, Object.create(prototype)), decks);
  assert.equal(getterCalls, 0);
});

test('addCreatedDeck falls back from accessor names and normalizes unsafe counts', () => {
  const decks = [{ id: 1, name: 'Math' }];
  let getterCalls = 0;
  const prototype = {};
  Object.defineProperty(prototype, 'dueCards', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('inherited dueCards getter should not run');
    },
  });

  const createdDeck = Object.create(prototype);
  Object.defineProperties(createdDeck, {
    id: { value: 2, enumerable: true },
    name: {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('name getter should not run');
      },
    },
    totalCards: {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('totalCards getter should not run');
      },
    },
  });

  assert.deepEqual(
    addCreatedDeck(decks, createdDeck, 'Biology'),
    [
      { id: 2, name: 'Biology', totalCards: 0, dueCards: 0 },
      decks[0],
    ],
  );
  assert.equal(getterCalls, 0);
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

test('mergeRenamedDeck ignores inherited and accessor response fields without invoking getters', () => {
  const decks = [{ id: 2, name: 'Biology', totalCards: 4, dueCards: 1 }];
  let getterCalls = 0;
  const prototype = {};

  for (const field of ['id', 'name', 'totalCards', 'dueCards', 'created_at']) {
    Object.defineProperty(prototype, field, {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error(`${field} getter should not run`);
      },
    });
  }

  const renamedDeck = Object.create(prototype);
  Object.defineProperties(renamedDeck, {
    id: {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('own id getter should not run');
      },
    },
    name: {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('own name getter should not run');
      },
    },
  });

  assert.deepEqual(
    mergeRenamedDeck(decks, 2, renamedDeck, 'Life Science'),
    [{ id: 2, name: 'Life Science', totalCards: 4, dueCards: 1 }],
  );
  assert.equal(getterCalls, 0);
});

test('mergeRenamedDeck copies only own data patch fields and preserves counts for unsafe fields', () => {
  const decks = [{ id: 2, name: 'Biology', totalCards: 4, dueCards: 1 }];
  let getterCalls = 0;
  const prototype = { archived: true, dueCards: 12 };
  const renamedDeck = Object.assign(Object.create(prototype), {
    id: '2',
    name: 'Life Science',
    created_at: '2026-05-09',
  });

  Object.defineProperties(renamedDeck, {
    totalCards: {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('totalCards getter should not run');
      },
    },
    dueCards: {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('dueCards getter should not run');
      },
    },
  });

  assert.deepEqual(
    mergeRenamedDeck(decks, 2, renamedDeck),
    [{ id: 2, name: 'Life Science', totalCards: 4, dueCards: 1, created_at: '2026-05-09' }],
  );
  assert.equal(getterCalls, 0);
});

test('removeDeckFromList removes matching deck ids without touching unrelated decks', () => {
  const decks = [
    { id: 1, name: 'Math' },
    { id: 2, name: 'Biology' },
  ];

  assert.deepEqual(removeDeckFromList(decks, '2'), [decks[0]]);
  assert.equal(removeDeckFromList(decks, 3), decks);
});
