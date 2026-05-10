const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DASHBOARD_STATS_COPY,
  buildDashboardStatsDisplayState,
  hasStatsPayload,
  toDisplayCount,
} = require('../dashboardStatsDisplayState');

test('hasStatsPayload only accepts object stats payloads', () => {
  assert.equal(hasStatsPayload({ totalCards: 1 }), true);
  assert.equal(hasStatsPayload(null), false);
  assert.equal(hasStatsPayload(undefined), false);
  assert.equal(hasStatsPayload([]), false);
});

test('toDisplayCount formats finite non-negative whole-number totals', () => {
  assert.equal(toDisplayCount(4), '4');
  assert.equal(toDisplayCount('5'), '5');
  assert.equal(toDisplayCount(2.9), '2');
  assert.equal(toDisplayCount(-3), '0');
  assert.equal(toDisplayCount(Number.NaN), '0');
});

test('buildDashboardStatsDisplayState shows loading copy before stats arrive', () => {
  const state = buildDashboardStatsDisplayState({
    stats: null,
    isLoadingStats: true,
    statsLoadFailed: false,
  });

  assert.equal(state.showError, false);
  assert.equal(state.totalCards.kind, 'loading');
  assert.equal(state.totalCards.text, DASHBOARD_STATS_COPY.loading);
  assert.equal(state.totalCards.isLoading, true);
  assert.equal(state.totalDecks.kind, 'loading');
  assert.equal(state.totalDecks.text, DASHBOARD_STATS_COPY.loading);
});

test('buildDashboardStatsDisplayState marks totals unavailable after a failed load with no stats', () => {
  const state = buildDashboardStatsDisplayState({
    stats: null,
    isLoadingStats: false,
    statsLoadFailed: true,
  });

  assert.equal(state.showError, true);
  assert.equal(state.errorMessage, DASHBOARD_STATS_COPY.errorWithoutStats);
  assert.equal(state.retryButtonLabel, DASHBOARD_STATS_COPY.retry);
  assert.equal(state.retryDisabled, false);
  assert.equal(state.totalCards.kind, 'unavailable');
  assert.equal(state.totalCards.text, DASHBOARD_STATS_COPY.unavailable);
  assert.equal(state.totalDecks.kind, 'unavailable');
});

test('buildDashboardStatsDisplayState keeps last known stats during a background retry', () => {
  const state = buildDashboardStatsDisplayState({
    stats: { totalCards: 12, totalDecks: 3 },
    isLoadingStats: true,
    statsLoadFailed: false,
  });

  assert.equal(state.showError, false);
  assert.equal(state.retryButtonLabel, DASHBOARD_STATS_COPY.retrying);
  assert.equal(state.retryDisabled, true);
  assert.equal(state.totalCards.kind, 'value');
  assert.equal(state.totalCards.text, '12');
  assert.equal(state.totalDecks.kind, 'value');
  assert.equal(state.totalDecks.text, '3');
});

test('buildDashboardStatsDisplayState shows the failure alert copy without replacing known stats', () => {
  const state = buildDashboardStatsDisplayState({
    stats: { totalCards: 8, totalDecks: 2 },
    isLoadingStats: false,
    statsLoadFailed: true,
  });

  assert.equal(state.showError, true);
  assert.equal(state.errorMessage, DASHBOARD_STATS_COPY.errorWithStats);
  assert.equal(state.totalCards.kind, 'value');
  assert.equal(state.totalCards.text, '8');
  assert.equal(state.totalDecks.text, '2');
});
