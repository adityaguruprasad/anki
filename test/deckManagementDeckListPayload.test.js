const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR,
  hasDeckManagementDeckListPayload,
  parseDeckManagementDeckListPayload,
} = require('../deckManagementDeckListPayload');
const {
  FRONTEND_MODULES,
} = require('../scripts/sync-cra-src');
const { MAX_POSTGRES_SERIAL_ID } = require('../cardIdentifier');
const { getTableDefinition } = require('./schemaHelpers');

test('parseDeckManagementDeckListPayload preserves valid deck rows and extra fields', () => {
  const decks = [
    {
      id: 1,
      name: 'Math',
      totalCards: 12,
      dueCards: 3,
      created_at: '2026-05-10T12:00:00.000Z',
    },
    {
      id: '42',
      name: 'Science',
      totalCards: 0,
      dueCards: 0,
      owner: { id: 'teacher-1' },
    },
  ];

  assert.equal(parseDeckManagementDeckListPayload(decks), decks);
  assert.deepEqual(parseDeckManagementDeckListPayload(decks), decks);
  assert.equal(hasDeckManagementDeckListPayload(decks), true);
});

test('parseDeckManagementDeckListPayload accepts due counts equal to total counts', () => {
  const decks = [{ id: 7, name: 'Review Ready', totalCards: 4, dueCards: 4 }];

  assert.equal(parseDeckManagementDeckListPayload(decks), decks);
  assert.equal(hasDeckManagementDeckListPayload(decks), true);
});

test('parseDeckManagementDeckListPayload accepts PostgreSQL SERIAL id boundaries', () => {
  const decks = [
    { id: MAX_POSTGRES_SERIAL_ID, name: 'Numeric boundary', totalCards: 1, dueCards: 0 },
    { id: String(MAX_POSTGRES_SERIAL_ID), name: 'String boundary', totalCards: 1, dueCards: 1 },
  ];

  assert.equal(parseDeckManagementDeckListPayload(decks), decks);
  assert.equal(hasDeckManagementDeckListPayload(decks), true);
});

test('parseDeckManagementDeckListPayload accepts and preserves an empty deck list', () => {
  const decks = [];

  assert.equal(parseDeckManagementDeckListPayload(decks), decks);
  assert.deepEqual(parseDeckManagementDeckListPayload(decks), []);
  assert.equal(hasDeckManagementDeckListPayload(decks), true);
});

test('parseDeckManagementDeckListPayload preserves null-prototype rows with own data fields', () => {
  const deck = Object.create(null);
  Object.defineProperties(deck, {
    id: { value: '42', enumerable: true },
    name: { value: 'Science', enumerable: true },
    totalCards: { value: 3, enumerable: true },
    dueCards: { value: 1, enumerable: true },
  });
  const decks = [deck];

  assert.equal(parseDeckManagementDeckListPayload(decks), decks);
  assert.equal(hasDeckManagementDeckListPayload(decks), true);
});

test('parseDeckManagementDeckListPayload rejects accessor-backed row fields without invoking getters', () => {
  let getterCalls = 0;
  const deck = {
    id: 1,
    name: 'Math',
    dueCards: 0,
  };
  Object.defineProperty(deck, 'totalCards', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('totalCards getter should not run');
    },
  });

  assert.equal(hasDeckManagementDeckListPayload([deck]), false);
  assert.throws(
    () => parseDeckManagementDeckListPayload([deck]),
    { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
  );
  assert.equal(getterCalls, 0);
});

test('parseDeckManagementDeckListPayload rejects prototype-backed row fields without invoking getters', () => {
  let getterCalls = 0;
  const prototype = {};
  Object.defineProperty(prototype, 'id', {
    get() {
      getterCalls += 1;
      throw new Error('prototype id getter should not run');
    },
  });
  const deck = Object.create(prototype);
  Object.defineProperties(deck, {
    name: { value: 'Math', enumerable: true },
    totalCards: { value: 2, enumerable: true },
    dueCards: { value: 1, enumerable: true },
  });

  assert.equal(hasDeckManagementDeckListPayload([deck]), false);
  assert.throws(
    () => parseDeckManagementDeckListPayload([deck]),
    { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
  );
  assert.equal(getterCalls, 0);
});

test('parseDeckManagementDeckListPayload rejects invalid top-level payloads', () => {
  [
    null,
    undefined,
    true,
    7,
    'decks',
    {},
    { decks: [] },
  ].forEach((payload) => {
    assert.throws(
      () => parseDeckManagementDeckListPayload(payload),
      { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
    );
    assert.equal(hasDeckManagementDeckListPayload(payload), false);
  });
});

test('parseDeckManagementDeckListPayload rejects any malformed row without filtering', () => {
  [
    [null],
    [3],
    ['deck'],
    [[]],
    [{ id: 1, name: 'Valid', totalCards: 1, dueCards: 0 }, null],
    [{ id: 1, name: 'Valid', totalCards: 1, dueCards: 0 }, { id: 2 }],
    [{ id: 1, name: 'Valid', totalCards: 1, dueCards: 0 }, { name: 'Missing id' }],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: 'science', name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: ' 42 ', name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: 0, name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: -1, name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: 1.5, name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: Number.POSITIVE_INFINITY, name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: MAX_POSTGRES_SERIAL_ID + 1, name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: Number.MAX_SAFE_INTEGER, name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: String(MAX_POSTGRES_SERIAL_ID + 1), name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: String(Number.MAX_SAFE_INTEGER), name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Valid', totalCards: 1, dueCards: 0 },
      { id: {}, name: 'Bad id', totalCards: 0, dueCards: 0 },
    ],
  ].forEach((payload) => {
    assert.throws(
      () => parseDeckManagementDeckListPayload(payload),
      { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
    );
    assert.equal(hasDeckManagementDeckListPayload(payload), false);
  });
});

test('parseDeckManagementDeckListPayload rejects ambiguous leading-zero deck ids', () => {
  ['01', '00042', '000', `000${MAX_POSTGRES_SERIAL_ID}`].forEach((id) => {
    const payload = [{ id, name: 'Math', totalCards: 0, dueCards: 0 }];

    assert.throws(
      () => parseDeckManagementDeckListPayload(payload),
      { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
    );
    assert.equal(hasDeckManagementDeckListPayload(payload), false);
  });
});

test('parseDeckManagementDeckListPayload rejects malformed card count fields', () => {
  [
    [{ id: 1, name: 'Missing total', dueCards: 0 }],
    [{ id: 1, name: 'Missing due', totalCards: 0 }],
    [{ id: 1, name: 'String total', totalCards: '2', dueCards: 0 }],
    [{ id: 1, name: 'String due', totalCards: 2, dueCards: '1' }],
    [{ id: 1, name: 'Negative total', totalCards: -1, dueCards: 0 }],
    [{ id: 1, name: 'Negative due', totalCards: 2, dueCards: -1 }],
    [{ id: 1, name: 'Fractional total', totalCards: 1.5, dueCards: 0 }],
    [{ id: 1, name: 'Fractional due', totalCards: 2, dueCards: 1.5 }],
    [
      { id: 1, name: 'Unsafe total', totalCards: Number.MAX_SAFE_INTEGER + 1, dueCards: 0 },
    ],
    [
      { id: 1, name: 'Unsafe due', totalCards: 2, dueCards: Number.MAX_SAFE_INTEGER + 1 },
    ],
    [{ id: 1, name: 'Impossible due', totalCards: 1, dueCards: 2 }],
  ].forEach((payload) => {
    assert.throws(
      () => parseDeckManagementDeckListPayload(payload),
      { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
    );
    assert.equal(hasDeckManagementDeckListPayload(payload), false);
  });
});

test('parseDeckManagementDeckListPayload rejects blank id and name fields', () => {
  ['', '   ', '\n\t'].forEach((id) => {
    const payload = [{ id, name: 'Math', totalCards: 0, dueCards: 0 }];

    assert.throws(
      () => parseDeckManagementDeckListPayload(payload),
      { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
    );
    assert.equal(hasDeckManagementDeckListPayload(payload), false);
  });

  ['', '   ', '\n\t'].forEach((name) => {
    const payload = [{ id: 1, name, totalCards: 0, dueCards: 0 }];

    assert.throws(
      () => parseDeckManagementDeckListPayload(payload),
      { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
    );
    assert.equal(hasDeckManagementDeckListPayload(payload), false);
  });
});

test('deck management deck-list id validation follows the backend schema contract', () => {
  assert.match(
    getTableDefinition('decks'),
    /\bid\s+SERIAL\s+PRIMARY\s+KEY\b/i,
    'Expected decks.id to be a numeric generated primary key',
  );
});

test('CRA source sync mirrors the deck management deck-list payload helper', () => {
  assert.ok(
    FRONTEND_MODULES.includes('deckManagementDeckListPayload.js'),
    'Expected deckManagementDeckListPayload.js to be mirrored into CRA src',
  );
});
