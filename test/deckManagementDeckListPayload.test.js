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

test('parseDeckManagementDeckListPayload accepts and preserves an empty deck list', () => {
  const decks = [];

  assert.equal(parseDeckManagementDeckListPayload(decks), decks);
  assert.deepEqual(parseDeckManagementDeckListPayload(decks), []);
  assert.equal(hasDeckManagementDeckListPayload(decks), true);
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
  ['01', '00042', '000', `000${Number.MAX_SAFE_INTEGER}`].forEach((id) => {
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
