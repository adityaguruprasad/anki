const test = require('node:test');
const assert = require('node:assert/strict');

const { getDeckManagementApiRequests } = require('../deckManagementApiRequests');

test('getDeckManagementApiRequests falls back to the local development API base URL', () => {
  const requests = getDeckManagementApiRequests();

  assert.equal(requests.deckListUrl, 'http://localhost:3001/api/decks');
  assert.equal(requests.createDeckUrl, 'http://localhost:3001/api/decks');
  assert.equal(requests.renameDeckUrl(42), 'http://localhost:3001/api/decks/42');
  assert.equal(requests.removeDeckUrl(42), 'http://localhost:3001/api/decks/42');
  assert.equal(
    requests.browseDeckCardsUrl(42, 'limit=10&q=front+back'),
    'http://localhost:3001/api/decks/42/cards?limit=10&q=front+back'
  );
  assert.equal(requests.createCardUrl, 'http://localhost:3001/api/cards');
  assert.equal(requests.updateCardUrl(9), 'http://localhost:3001/api/cards/9');
  assert.equal(requests.removeCardUrl(9), 'http://localhost:3001/api/cards/9');
});

test('getDeckManagementApiRequests trims and strips configured API base URL trailing slashes', () => {
  const requests = getDeckManagementApiRequests({
    REACT_APP_API_BASE_URL: '  https://api.example.test///  ',
  });

  assert.equal(requests.deckListUrl, 'https://api.example.test/api/decks');
  assert.equal(requests.createDeckUrl, 'https://api.example.test/api/decks');
  assert.equal(requests.renameDeckUrl(7), 'https://api.example.test/api/decks/7');
  assert.equal(requests.removeDeckUrl(7), 'https://api.example.test/api/decks/7');
  assert.equal(
    requests.browseDeckCardsUrl(7, 'limit=10'),
    'https://api.example.test/api/decks/7/cards?limit=10'
  );
  assert.equal(requests.createCardUrl, 'https://api.example.test/api/cards');
  assert.equal(requests.updateCardUrl(11), 'https://api.example.test/api/cards/11');
  assert.equal(requests.removeCardUrl(11), 'https://api.example.test/api/cards/11');
});

test('getDeckManagementApiRequests normalizes deck and card ids as serial route segments', () => {
  const requests = getDeckManagementApiRequests({
    REACT_APP_API_BASE_URL: 'https://api.example.test',
  });

  assert.equal(
    requests.renameDeckUrl(' 0007 '),
    'https://api.example.test/api/decks/7'
  );
  assert.equal(
    requests.removeDeckUrl('0008'),
    'https://api.example.test/api/decks/8'
  );
  assert.equal(
    requests.browseDeckCardsUrl('0009', 'limit=10'),
    'https://api.example.test/api/decks/9/cards?limit=10'
  );
  assert.equal(
    requests.updateCardUrl(' 0011 '),
    'https://api.example.test/api/cards/11'
  );
  assert.equal(
    requests.removeCardUrl('0012'),
    'https://api.example.test/api/cards/12'
  );
});

test('getDeckManagementApiRequests rejects unsafe route ids before building URLs', () => {
  const requests = getDeckManagementApiRequests({
    REACT_APP_API_BASE_URL: 'https://api.example.test',
  });
  const unsafeIds = [
    undefined,
    null,
    '',
    'deck 1/with spaces',
    'card?deleted=false',
    '0',
    '2147483648',
    {},
  ];

  [
    ['renameDeckUrl', 'deckId'],
    ['removeDeckUrl', 'deckId'],
    ['browseDeckCardsUrl', 'deckId'],
    ['updateCardUrl', 'cardId'],
    ['removeCardUrl', 'cardId'],
  ].forEach(([methodName, fieldName]) => {
    unsafeIds.forEach((id) => {
      assert.throws(
        () => requests[methodName](id, 'limit=10'),
        {
          name: 'TypeError',
          message: `Invalid ${fieldName}: must be a positive integer route id`,
        },
        `${methodName} should reject ${String(id)}`
      );
    });
  });
});

test('getDeckManagementApiRequests preserves browse deck cards query strings', () => {
  const requests = getDeckManagementApiRequests({
    REACT_APP_API_BASE_URL: 'https://api.example.test',
  });
  const query = 'limit=10&q=front+back&cursorCreatedAt=2026-05-01T00%3A00%3A00.000Z&cursorId=card%2F1';

  assert.equal(
    requests.browseDeckCardsUrl('0013', query),
    `https://api.example.test/api/decks/13/cards?${query}`
  );
});
