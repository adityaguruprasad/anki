const {
  getOwnDataPropertyValue,
  isObjectRecord,
} = require('./recordDataProperty');

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

const REVIEW_ACTIVITY_DIGIT_COUNT_PATTERN = /^[0-9]+$/;

function normalizeReviewActivityCount(value) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0) {
      return value;
    }

    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (REVIEW_ACTIVITY_DIGIT_COUNT_PATTERN.test(trimmed)) {
      const normalized = trimmed.replace(/^0+/, '') || '0';
      const parsed = Number(normalized);

      if (Number.isSafeInteger(parsed)) {
        return parsed;
      }
    }
  }

  return null;
}

function hasReviewActivityStats(stats) {
  if (!isObjectRecord(stats)) {
    return false;
  }

  const reviewCounts = REVIEW_ACTIVITY_CHART_BUCKETS.map(({ key }) => {
    return normalizeReviewActivityCount(getOwnDataPropertyValue(stats, key));
  });

  return reviewCounts.every((count, index) => (
    count !== null
    && (index === 0 || reviewCounts[index - 1] <= count)
  ));
}

function toReviewActivityCount(value) {
  return normalizeReviewActivityCount(value);
}

function buildReviewActivityChartData(stats) {
  if (!hasReviewActivityStats(stats)) {
    return null;
  }

  return REVIEW_ACTIVITY_CHART_BUCKETS.map(({ name, key }) => ({
    name,
    cards: toReviewActivityCount(getOwnDataPropertyValue(stats, key)),
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
