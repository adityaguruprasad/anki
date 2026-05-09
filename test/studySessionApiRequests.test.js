const test = require('node:test');
const assert = require('node:assert/strict');

const { getStudySessionApiRequests } = require('../studySessionApiRequests');

test('getStudySessionApiRequests falls back to the local development API base URL', () => {
  const requests = getStudySessionApiRequests();

  assert.equal(requests.dueCardUrl(42), 'http://localhost:3001/api/cards/42?limit=1');
  assert.equal(requests.deckListUrl, 'http://localhost:3001/api/decks');
  assert.equal(requests.submitUrl, 'http://localhost:3001/api/study-session');
});

test('getStudySessionApiRequests trims and strips configured API base URL trailing slashes', () => {
  const requests = getStudySessionApiRequests({
    REACT_APP_API_BASE_URL: '  https://api.example.test///  ',
  });

  assert.equal(requests.dueCardUrl(7), 'https://api.example.test/api/cards/7?limit=1');
  assert.equal(requests.deckListUrl, 'https://api.example.test/api/decks');
  assert.equal(requests.submitUrl, 'https://api.example.test/api/study-session');
});

test('getStudySessionApiRequests encodes deck ids as a single route segment with limit=1', () => {
  const requests = getStudySessionApiRequests({
    REACT_APP_API_BASE_URL: 'https://api.example.test',
  });

  assert.equal(
    requests.dueCardUrl('deck 1/with spaces'),
    'https://api.example.test/api/cards/deck%201%2Fwith%20spaces?limit=1'
  );
});
