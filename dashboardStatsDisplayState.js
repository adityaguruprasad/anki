const {
  hasReviewActivityStats,
  toReviewActivityCount,
} = require('./dashboardReviewActivityDisplayState');
const {
  getOwnDataPropertyValue,
  isObjectRecord,
} = require('./recordDataProperty');

const DASHBOARD_STATS_COPY = Object.freeze({
  loading: 'Loading stats...',
  unavailable: 'Unavailable',
  errorTitle: 'Stats could not be loaded',
  retry: 'Retry',
  retrying: 'Retrying...',
  errorWithStats: 'Showing the last loaded totals. Retry to refresh stats.',
  errorWithoutStats: 'Totals are unavailable. Retry to load stats.',
});

const DASHBOARD_STATS_COUNT_KEYS = Object.freeze(['totalCards', 'totalDecks']);

const DASHBOARD_STATS_DIGIT_COUNT_PATTERN = /^[0-9]+$/;

function normalizeStatsCount(value) {
  if (typeof value === 'number') {
    if (Number.isSafeInteger(value) && value >= 0) {
      return String(value);
    }

    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (DASHBOARD_STATS_DIGIT_COUNT_PATTERN.test(trimmed)) {
      return trimmed.replace(/^0+/, '') || '0';
    }
  }

  return null;
}

function isStatsCount(value) {
  return normalizeStatsCount(value) !== null;
}

function hasStatsPayload(stats) {
  return (
    isObjectRecord(stats)
    && DASHBOARD_STATS_COUNT_KEYS.every((key) => (
      isStatsCount(getOwnDataPropertyValue(stats, key))
    ))
  );
}

// Both operands must be normalized decimal count strings: trimmed, digits only,
// and no leading zeroes except "0". totalCards may exceed Number.MAX_SAFE_INTEGER,
// so length plus lexical comparison preserves numeric order without Number coercion.
function isNormalizedCountLessThanOrEqual(left, right) {
  if (left.length !== right.length) {
    return left.length < right.length;
  }

  return left <= right;
}

function hasStatsAggregateInvariants(stats) {
  const totalCards = normalizeStatsCount(getOwnDataPropertyValue(stats, 'totalCards'));
  const monthReviews = toReviewActivityCount(getOwnDataPropertyValue(stats, 'monthReviews'));

  return (
    totalCards !== null
    && monthReviews !== null
    && isNormalizedCountLessThanOrEqual(String(monthReviews), totalCards)
  );
}

function hasDashboardStatsPayload(stats) {
  // Mirrors the server contract: these buckets count current cards by
  // last_reviewed, so todayReviews <= weekReviews <= monthReviews <= totalCards.
  return (
    hasStatsPayload(stats)
    && hasReviewActivityStats(stats)
    && hasStatsAggregateInvariants(stats)
  );
}

function toDisplayCount(value) {
  return normalizeStatsCount(value) ?? '0';
}

function buildStatCardDisplay(stats, key, isLoadingStats) {
  if (!hasStatsPayload(stats)) {
    if (isLoadingStats) {
      return {
        kind: 'loading',
        text: DASHBOARD_STATS_COPY.loading,
        isLoading: true,
        isUnavailable: false,
        isValue: false,
      };
    }

    return {
      kind: 'unavailable',
      text: DASHBOARD_STATS_COPY.unavailable,
      isLoading: false,
      isUnavailable: true,
      isValue: false,
    };
  }

  return {
    kind: 'value',
    text: toDisplayCount(getOwnDataPropertyValue(stats, key)),
    isLoading: false,
    isUnavailable: false,
    isValue: true,
  };
}

function buildDashboardStatsDisplayState({
  stats = null,
  isLoadingStats = false,
  statsLoadFailed = false,
} = {}) {
  const hasStats = hasStatsPayload(stats);

  return {
    hasStats,
    showError: Boolean(statsLoadFailed),
    errorTitle: DASHBOARD_STATS_COPY.errorTitle,
    errorMessage: hasStats
      ? DASHBOARD_STATS_COPY.errorWithStats
      : DASHBOARD_STATS_COPY.errorWithoutStats,
    retryButtonLabel: isLoadingStats
      ? DASHBOARD_STATS_COPY.retrying
      : DASHBOARD_STATS_COPY.retry,
    retryDisabled: Boolean(isLoadingStats),
    totalCards: buildStatCardDisplay(stats, 'totalCards', Boolean(isLoadingStats)),
    totalDecks: buildStatCardDisplay(stats, 'totalDecks', Boolean(isLoadingStats)),
  };
}

module.exports = {
  DASHBOARD_STATS_COPY,
  buildDashboardStatsDisplayState,
  hasDashboardStatsPayload,
  hasStatsPayload,
  toDisplayCount,
};
