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
    Boolean(stats)
    && typeof stats === 'object'
    && !Array.isArray(stats)
    && DASHBOARD_STATS_COUNT_KEYS.every((key) => (
      Object.prototype.hasOwnProperty.call(stats, key)
      && isStatsCount(stats[key])
    ))
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
    text: toDisplayCount(stats[key]),
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
  hasStatsPayload,
  toDisplayCount,
};
