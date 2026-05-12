const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DASHBOARD_REVIEW_ACTIVITY_COPY,
  buildDashboardReviewActivityDisplayState,
  buildReviewActivityChartData,
  hasReviewActivityStats,
  toReviewActivityCount,
} = require('../dashboardReviewActivityDisplayState');

test('hasReviewActivityStats requires valid review activity count fields', () => {
  [
    { todayReviews: 0, weekReviews: 1, monthReviews: Number.MAX_SAFE_INTEGER },
    { todayReviews: '0', weekReviews: ' 12 ', monthReviews: '0003' },
  ].forEach((stats) => {
    assert.equal(hasReviewActivityStats(stats), true);
  });

  [
    null,
    undefined,
    [],
    { todayReviews: 1, weekReviews: 2 },
    { todayReviews: null, weekReviews: 1, monthReviews: 2 },
    { todayReviews: 1, weekReviews: [], monthReviews: 2 },
    { todayReviews: 1, weekReviews: -1, monthReviews: 2 },
    { todayReviews: 1, weekReviews: 2.5, monthReviews: 2 },
    { todayReviews: 1, weekReviews: '2.5', monthReviews: 2 },
    { todayReviews: 1, weekReviews: '1e3', monthReviews: 2 },
    { todayReviews: 1, weekReviews: Number.MAX_SAFE_INTEGER + 1, monthReviews: 2 },
    { todayReviews: 1, weekReviews: '9007199254740992', monthReviews: 2 },
    { todayReviews: 1, weekReviews: ' ', monthReviews: 2 },
    { todayReviews: 1, weekReviews: 'cards', monthReviews: 2 },
  ].forEach((stats) => {
    assert.equal(hasReviewActivityStats(stats), false);
  });
});

test('toReviewActivityCount accepts safe integer numbers and digit strings', () => {
  assert.equal(toReviewActivityCount(4), 4);
  assert.equal(toReviewActivityCount(Number.MAX_SAFE_INTEGER), 9007199254740991);
  assert.equal(toReviewActivityCount('5'), 5);
  assert.equal(toReviewActivityCount(' 00012 '), 12);
  assert.equal(toReviewActivityCount('000'), 0);
});

test('toReviewActivityCount rejects malformed review activity counts', () => {
  assert.equal(toReviewActivityCount(2.9), null);
  assert.equal(toReviewActivityCount(-3), null);
  assert.equal(toReviewActivityCount(Number.MAX_SAFE_INTEGER + 1), null);
  assert.equal(toReviewActivityCount(Number.NaN), null);
  assert.equal(toReviewActivityCount('3.0'), null);
  assert.equal(toReviewActivityCount('1e3'), null);
  assert.equal(toReviewActivityCount(''), null);
  assert.equal(toReviewActivityCount(' '), null);
  assert.equal(toReviewActivityCount('cards'), null);
  assert.equal(toReviewActivityCount([]), null);
});

test('buildReviewActivityChartData returns the existing chart buckets for valid stats', () => {
  assert.equal(buildReviewActivityChartData(null), null);
  assert.equal(buildReviewActivityChartData(undefined), null);
  assert.equal(buildReviewActivityChartData([]), null);
  assert.deepEqual(
    buildReviewActivityChartData({
      todayReviews: 4,
      weekReviews: '7',
      monthReviews: 10,
    }),
    [
      { name: 'Today', cards: 4 },
      { name: 'This Week', cards: 7 },
      { name: 'This Month', cards: 10 },
    ]
  );

  const chartData = buildReviewActivityChartData({
    todayReviews: ' 000 ',
    weekReviews: '0007',
    monthReviews: String(Number.MAX_SAFE_INTEGER),
  });

  assert.deepEqual(chartData, [
    { name: 'Today', cards: 0 },
    { name: 'This Week', cards: 7 },
    { name: 'This Month', cards: 9007199254740991 },
  ]);
  assert.equal(chartData.every(({ cards }) => typeof cards === 'number'), true);
});

test('buildReviewActivityChartData suppresses malformed review activity stats', () => {
  [
    { weekReviews: 1, monthReviews: 2 },
    { todayReviews: null, weekReviews: 1, monthReviews: 2 },
    { todayReviews: 1, weekReviews: [], monthReviews: 2 },
    { todayReviews: -1, weekReviews: 1, monthReviews: 2 },
    { todayReviews: 1.5, weekReviews: 1, monthReviews: 2 },
    { todayReviews: '1.5', weekReviews: 1, monthReviews: 2 },
    { todayReviews: '1e3', weekReviews: 1, monthReviews: 2 },
    { todayReviews: Number.MAX_SAFE_INTEGER + 1, weekReviews: 1, monthReviews: 2 },
    { todayReviews: '9007199254740992', weekReviews: 1, monthReviews: 2 },
    { todayReviews: '', weekReviews: 1, monthReviews: 2 },
    { todayReviews: ' ', weekReviews: 1, monthReviews: 2 },
    { todayReviews: 'cards', weekReviews: 1, monthReviews: 2 },
  ].forEach((stats) => {
    assert.equal(buildReviewActivityChartData(stats), null);
  });
});

test('buildDashboardReviewActivityDisplayState shows loading copy before stats arrive', () => {
  const state = buildDashboardReviewActivityDisplayState({
    stats: null,
    isLoadingStats: true,
    statsLoadFailed: false,
  });

  assert.equal(state.kind, 'loading');
  assert.equal(state.showChart, false);
  assert.equal(state.chartData, null);
  assert.equal(state.message, DASHBOARD_REVIEW_ACTIVITY_COPY.loading);
  assert.equal(state.messageRole, 'status');
  assert.equal(state.messageAriaLive, 'polite');
});

test('buildDashboardReviewActivityDisplayState shows unavailable copy after a failed load with no stats', () => {
  const state = buildDashboardReviewActivityDisplayState({
    stats: null,
    isLoadingStats: false,
    statsLoadFailed: true,
  });

  assert.equal(state.kind, 'unavailable');
  assert.equal(state.showChart, false);
  assert.equal(state.chartData, null);
  assert.equal(state.message, DASHBOARD_REVIEW_ACTIVITY_COPY.error);
  assert.equal(state.isUnavailable, true);
});

test('buildDashboardReviewActivityDisplayState keeps stale chart data during loading and failed retries', () => {
  const loadingState = buildDashboardReviewActivityDisplayState({
    stats: { todayReviews: 1, weekReviews: 2, monthReviews: 3 },
    isLoadingStats: true,
    statsLoadFailed: false,
  });
  const failedState = buildDashboardReviewActivityDisplayState({
    stats: { todayReviews: 1, weekReviews: 2, monthReviews: 3 },
    isLoadingStats: false,
    statsLoadFailed: true,
  });

  [loadingState, failedState].forEach((state) => {
    assert.equal(state.kind, 'chart');
    assert.equal(state.showChart, true);
    assert.deepEqual(state.chartData, [
      { name: 'Today', cards: 1 },
      { name: 'This Week', cards: 2 },
      { name: 'This Month', cards: 3 },
    ]);
    assert.equal(state.message, '');
  });
});

test('buildDashboardReviewActivityDisplayState treats malformed stats as unavailable', () => {
  const state = buildDashboardReviewActivityDisplayState({
    stats: { todayReviews: 1, weekReviews: '1e3', monthReviews: 3 },
    isLoadingStats: false,
    statsLoadFailed: true,
  });

  assert.equal(state.kind, 'unavailable');
  assert.equal(state.hasStats, false);
  assert.equal(state.showChart, false);
  assert.equal(state.chartData, null);
  assert.equal(state.message, DASHBOARD_REVIEW_ACTIVITY_COPY.error);
});
