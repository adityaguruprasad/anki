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
      id: ' science ',
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
    [{ id: 1, name: 'Valid' }, null],
    [{ id: 1, name: 'Valid' }, { id: 2 }],
    [{ id: 1, name: 'Valid' }, { name: 'Missing id' }],
    [{ id: 1, name: 'Valid' }, { id: Number.POSITIVE_INFINITY, name: 'Bad id' }],
    [{ id: 1, name: 'Valid' }, { id: {}, name: 'Bad id' }],
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
    const payload = [{ id, name: 'Math' }];

    assert.throws(
      () => parseDeckManagementDeckListPayload(payload),
      { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
    );
    assert.equal(hasDeckManagementDeckListPayload(payload), false);
  });

  ['', '   ', '\n\t'].forEach((name) => {
    const payload = [{ id: 1, name }];

    assert.throws(
      () => parseDeckManagementDeckListPayload(payload),
      { message: MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR },
    );
    assert.equal(hasDeckManagementDeckListPayload(payload), false);
  });
});

test('CRA source sync mirrors the deck management deck-list payload helper', () => {
  assert.ok(
    FRONTEND_MODULES.includes('deckManagementDeckListPayload.js'),
    'Expected deckManagementDeckListPayload.js to be mirrored into CRA src',
  );
});
