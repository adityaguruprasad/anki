const DASHBOARD_REVIEW_ACTIVITY_COPY = Object.freeze({
  loading: 'Loading review activity...',
  unavailable: 'Review activity is unavailable.',
  error: 'Review activity is unavailable because stats could not be loaded.',
});

const REVIEW_ACTIVITY_CHART_BUCKETS = Object.freeze([
  Object.freeze({ name: 'Today', key: 'todayReviews' }),
  Object.freeze({ name: 'This Week', key: 'weekReviews' }),
  Object.freeze({ name: 'This Month', key: 'monthReviews' }),
]);

function hasReviewActivityStats(stats) {
  return Boolean(stats) && typeof stats === 'object' && !Array.isArray(stats);
}

function toReviewActivityCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.max(0, Math.trunc(value));
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.trunc(parsed));
    }
  }

  return 0;
}

function buildReviewActivityChartData(stats) {
  if (!hasReviewActivityStats(stats)) {
    return null;
  }

  return REVIEW_ACTIVITY_CHART_BUCKETS.map(({ name, key }) => ({
    name,
    cards: toReviewActivityCount(stats[key]),
  }));
}

function buildDashboardReviewActivityDisplayState({
  stats = null,
  isLoadingStats = false,
  statsLoadFailed = false,
} = {}) {
  const chartData = buildReviewActivityChartData(stats);

  if (chartData) {
    return {
      kind: 'chart',
      hasStats: true,
      showChart: true,
      chartData,
      message: '',
      messageRole: undefined,
      messageAriaLive: undefined,
      isLoading: false,
      isUnavailable: false,
    };
  }

  const isLoading = Boolean(isLoadingStats);
  const message = isLoading
    ? DASHBOARD_REVIEW_ACTIVITY_COPY.loading
    : statsLoadFailed
      ? DASHBOARD_REVIEW_ACTIVITY_COPY.error
      : DASHBOARD_REVIEW_ACTIVITY_COPY.unavailable;

  return {
    kind: isLoading ? 'loading' : 'unavailable',
    hasStats: false,
    showChart: false,
    chartData: null,
    message,
    messageRole: 'status',
    messageAriaLive: 'polite',
    isLoading,
    isUnavailable: !isLoading,
  };
}

module.exports = {
  DASHBOARD_REVIEW_ACTIVITY_COPY,
  REVIEW_ACTIVITY_CHART_BUCKETS,
  buildDashboardReviewActivityDisplayState,
  buildReviewActivityChartData,
  hasReviewActivityStats,
  toReviewActivityCount,
};
