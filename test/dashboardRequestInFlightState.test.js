const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DASHBOARD_REQUEST_DOMAINS,
  beginDashboardRequest,
  completeDashboardRequest,
  isDashboardRequestInFlight,
} = require('../dashboardRequestInFlightState');

test('beginDashboardRequest blocks duplicate in-flight requests for the same domain and URL', () => {
  const inFlightRequests = {};

  const firstRequest = beginDashboardRequest(
    inFlightRequests,
    DASHBOARD_REQUEST_DOMAINS.STATS,
    'http://localhost:3001/api/stats'
  );

  assert.ok(firstRequest);
  assert.equal(
    beginDashboardRequest(
      inFlightRequests,
      DASHBOARD_REQUEST_DOMAINS.STATS,
      'http://localhost:3001/api/stats'
    ),
    null
  );
  assert.equal(
    isDashboardRequestInFlight(
      inFlightRequests,
      DASHBOARD_REQUEST_DOMAINS.STATS,
      'http://localhost:3001/api/stats'
    ),
    true
  );
  assert.deepEqual(inFlightRequests, {
    [DASHBOARD_REQUEST_DOMAINS.STATS]: firstRequest,
  });
});

test('dashboard request guards are scoped by domain and URL', () => {
  const inFlightRequests = {};

  const statsRequest = beginDashboardRequest(
    inFlightRequests,
    DASHBOARD_REQUEST_DOMAINS.STATS,
    'http://localhost:3001/api/stats'
  );
  const deckRequest = beginDashboardRequest(
    inFlightRequests,
    DASHBOARD_REQUEST_DOMAINS.DECK_LIST,
    'http://localhost:3001/api/decks'
  );
  const nextStatsRequest = beginDashboardRequest(
    inFlightRequests,
    DASHBOARD_REQUEST_DOMAINS.STATS,
    'http://localhost:4000/api/stats'
  );

  assert.ok(statsRequest);
  assert.ok(deckRequest);
  assert.ok(nextStatsRequest);
  assert.notEqual(statsRequest, nextStatsRequest);
  assert.equal(
    isDashboardRequestInFlight(
      inFlightRequests,
      DASHBOARD_REQUEST_DOMAINS.STATS,
      'http://localhost:3001/api/stats'
    ),
    false
  );
  assert.equal(
    isDashboardRequestInFlight(
      inFlightRequests,
      DASHBOARD_REQUEST_DOMAINS.STATS,
      'http://localhost:4000/api/stats'
    ),
    true
  );
  assert.equal(
    isDashboardRequestInFlight(
      inFlightRequests,
      DASHBOARD_REQUEST_DOMAINS.DECK_LIST,
      'http://localhost:3001/api/decks'
    ),
    true
  );
});

test('completeDashboardRequest only clears the matching request guard', () => {
  const inFlightRequests = {};

  const firstRequest = beginDashboardRequest(
    inFlightRequests,
    DASHBOARD_REQUEST_DOMAINS.SCHEDULING_INSIGHTS,
    'http://localhost:3001/api/scheduling-insights'
  );
  const secondRequest = beginDashboardRequest(
    inFlightRequests,
    DASHBOARD_REQUEST_DOMAINS.SCHEDULING_INSIGHTS,
    'http://localhost:4000/api/scheduling-insights'
  );

  assert.equal(completeDashboardRequest(inFlightRequests, firstRequest), false);
  assert.equal(
    isDashboardRequestInFlight(
      inFlightRequests,
      DASHBOARD_REQUEST_DOMAINS.SCHEDULING_INSIGHTS,
      'http://localhost:4000/api/scheduling-insights'
    ),
    true
  );
  assert.equal(completeDashboardRequest(inFlightRequests, secondRequest), true);
  assert.deepEqual(inFlightRequests, {});
});

test('stale completions cannot clear a newer guard for the same URL', () => {
  const inFlightRequests = {};

  const firstStatsRequest = beginDashboardRequest(
    inFlightRequests,
    DASHBOARD_REQUEST_DOMAINS.STATS,
    'http://localhost:3001/api/stats'
  );
  beginDashboardRequest(
    inFlightRequests,
    DASHBOARD_REQUEST_DOMAINS.STATS,
    'http://localhost:4000/api/stats'
  );
  const secondStatsRequest = beginDashboardRequest(
    inFlightRequests,
    DASHBOARD_REQUEST_DOMAINS.STATS,
    'http://localhost:3001/api/stats'
  );

  assert.equal(completeDashboardRequest(inFlightRequests, firstStatsRequest), false);
  assert.equal(
    isDashboardRequestInFlight(
      inFlightRequests,
      DASHBOARD_REQUEST_DOMAINS.STATS,
      'http://localhost:3001/api/stats'
    ),
    true
  );
  assert.equal(completeDashboardRequest(inFlightRequests, secondStatsRequest), true);
  assert.deepEqual(inFlightRequests, {});
});

test('invalid state and completion inputs are no-ops', () => {
  const inFlightRequests = {};

  assert.equal(beginDashboardRequest(null, DASHBOARD_REQUEST_DOMAINS.STATS, '/api/stats'), null);
  assert.equal(completeDashboardRequest(inFlightRequests, null), false);
  assert.equal(completeDashboardRequest(null, { domain: DASHBOARD_REQUEST_DOMAINS.STATS }), false);
  assert.equal(isDashboardRequestInFlight(null, DASHBOARD_REQUEST_DOMAINS.STATS, '/api/stats'), false);
});
