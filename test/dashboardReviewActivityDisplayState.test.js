const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DASHBOARD_REVIEW_ACTIVITY_COPY,
  buildDashboardReviewActivityDisplayState,
  buildReviewActivityChartData,
  hasReviewActivityStats,
  toReviewActivityCount,
} = require('../dashboardReviewActivityDisplayState');

test('hasReviewActivityStats only accepts object stats payloads', () => {
  assert.equal(hasReviewActivityStats({ todayReviews: 1 }), true);
  assert.equal(hasReviewActivityStats(null), false);
  assert.equal(hasReviewActivityStats(undefined), false);
  assert.equal(hasReviewActivityStats([]), false);
});

test('toReviewActivityCount formats finite non-negative whole-number chart counts', () => {
  assert.equal(toReviewActivityCount(4), 4);
  assert.equal(toReviewActivityCount('5'), 5);
  assert.equal(toReviewActivityCount(2.9), 2);
  assert.equal(toReviewActivityCount(-3), 0);
  assert.equal(toReviewActivityCount(Number.NaN), 0);
});

test('buildReviewActivityChartData returns the existing chart buckets only when stats exist', () => {
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
