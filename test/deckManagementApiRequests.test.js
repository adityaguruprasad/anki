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

test('getDeckManagementApiRequests encodes deck and card ids as single route segments', () => {
  const requests = getDeckManagementApiRequests({
    REACT_APP_API_BASE_URL: 'https://api.example.test',
  });

  assert.equal(
    requests.renameDeckUrl('deck 1/with spaces'),
    'https://api.example.test/api/decks/deck%201%2Fwith%20spaces'
  );
  assert.equal(
    requests.removeDeckUrl('deck?archived=true'),
    'https://api.example.test/api/decks/deck%3Farchived%3Dtrue'
  );
  assert.equal(
    requests.browseDeckCardsUrl('deck 1/with spaces', 'limit=10'),
    'https://api.example.test/api/decks/deck%201%2Fwith%20spaces/cards?limit=10'
  );
  assert.equal(
    requests.updateCardUrl('card 1/with spaces'),
    'https://api.example.test/api/cards/card%201%2Fwith%20spaces'
  );
  assert.equal(
    requests.removeCardUrl('card?deleted=false'),
    'https://api.example.test/api/cards/card%3Fdeleted%3Dfalse'
  );
});

test('getDeckManagementApiRequests preserves browse deck cards query strings', () => {
  const requests = getDeckManagementApiRequests({
    REACT_APP_API_BASE_URL: 'https://api.example.test',
  });
  const query = 'limit=10&q=front+back&cursorCreatedAt=2026-05-01T00%3A00%3A00.000Z&cursorId=card%2F1';

  assert.equal(
    requests.browseDeckCardsUrl('deck-1', query),
    `https://api.example.test/api/decks/deck-1/cards?${query}`
  );
});
