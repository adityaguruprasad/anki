const test = require('node:test');
const assert = require('node:assert/strict');

const { getDashboardApiRequests } = require('../dashboardApiRequests');

test('getDashboardApiRequests falls back to the local development API base URL', () => {
  const requests = getDashboardApiRequests();

  assert.equal(requests.statsUrl, 'http://localhost:3001/api/stats');
  assert.equal(requests.deckListUrl, 'http://localhost:3001/api/decks');
  assert.equal(requests.schedulingInsightsUrl, 'http://localhost:3001/api/scheduling-insights');
});

test('getDashboardApiRequests trims and strips configured API base URL trailing slashes', () => {
  const requests = getDashboardApiRequests({
    REACT_APP_API_BASE_URL: '  https://api.example.test///  ',
  });

  assert.equal(requests.statsUrl, 'https://api.example.test/api/stats');
  assert.equal(requests.deckListUrl, 'https://api.example.test/api/decks');
  assert.equal(requests.schedulingInsightsUrl, 'https://api.example.test/api/scheduling-insights');
});
