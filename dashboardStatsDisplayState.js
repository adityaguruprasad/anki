const DASHBOARD_STATS_COPY = Object.freeze({
  loading: 'Loading stats...',
  unavailable: 'Unavailable',
  errorTitle: 'Stats could not be loaded',
  retry: 'Retry',
  retrying: 'Retrying...',
  errorWithStats: 'Showing the last loaded totals. Retry to refresh stats.',
  errorWithoutStats: 'Totals are unavailable. Retry to load stats.',
});

function hasStatsPayload(stats) {
  return Boolean(stats) && typeof stats === 'object' && !Array.isArray(stats);
}

function toDisplayCount(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(Math.max(0, Math.trunc(value)));
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return String(Math.max(0, Math.trunc(parsed)));
    }
  }

  return '0';
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
