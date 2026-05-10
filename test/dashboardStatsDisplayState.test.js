const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DASHBOARD_STATS_COPY,
  buildDashboardStatsDisplayState,
  hasStatsPayload,
  toDisplayCount,
} = require('../dashboardStatsDisplayState');

test('hasStatsPayload requires valid dashboard total count fields', () => {
  [
    { totalCards: 0, totalDecks: 0 },
    { totalCards: 12, totalDecks: 3 },
    { totalCards: '12', totalDecks: '3' },
    { totalCards: ' 12 ', totalDecks: ' 0 ' },
  ].forEach((stats) => {
    assert.equal(hasStatsPayload(stats), true);
  });

  [
    null,
    undefined,
    [],
    { totalCards: 1 },
    { totalDecks: 1 },
    { totalCards: '', totalDecks: 1 },
    { totalCards: ' ', totalDecks: 1 },
    { totalCards: null, totalDecks: 1 },
    { totalCards: [], totalDecks: 1 },
    { totalCards: Number.NaN, totalDecks: 1 },
    { totalCards: Number.POSITIVE_INFINITY, totalDecks: 1 },
    { totalCards: -1, totalDecks: 1 },
    { totalCards: 1.5, totalDecks: 1 },
    { totalCards: '3.0', totalDecks: 1 },
    { totalCards: '1.5', totalDecks: 1 },
    { totalCards: '1e3', totalDecks: 1 },
    { totalCards: '+1', totalDecks: 1 },
    { totalCards: '-1', totalDecks: 1 },
    { totalCards: 'NaN', totalDecks: 1 },
    { totalCards: 'Infinity', totalDecks: 1 },
    { totalCards: 'cards', totalDecks: 1 },
    { totalCards: 1, totalDecks: Number.NEGATIVE_INFINITY },
    { totalCards: 1, totalDecks: -1 },
    { totalCards: 1, totalDecks: '3.0' },
    { totalCards: 1, totalDecks: '1.5' },
    { totalCards: 1, totalDecks: '1e3' },
    { totalCards: 1, totalDecks: '+1' },
    { totalCards: 1, totalDecks: '-1' },
    { totalCards: 1, totalDecks: 'NaN' },
    { totalCards: 1, totalDecks: 'Infinity' },
  ].forEach((stats) => {
    assert.equal(hasStatsPayload(stats), false);
  });
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

test('buildDashboardStatsDisplayState does not display malformed object-shaped stats as zeroes', () => {
  const state = buildDashboardStatsDisplayState({
    stats: { totalCards: null, totalDecks: 2 },
    isLoadingStats: false,
    statsLoadFailed: true,
  });

  assert.equal(state.hasStats, false);
  assert.equal(state.errorMessage, DASHBOARD_STATS_COPY.errorWithoutStats);
  assert.equal(state.totalCards.kind, 'unavailable');
  assert.equal(state.totalCards.text, DASHBOARD_STATS_COPY.unavailable);
  assert.equal(state.totalDecks.kind, 'unavailable');
  assert.equal(state.totalDecks.text, DASHBOARD_STATS_COPY.unavailable);
});
