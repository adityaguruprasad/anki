const MALFORMED_SCHEDULING_INSIGHTS_PAYLOAD = 'Malformed scheduling insights payload';

const SCHEDULING_INSIGHTS_SUMMARY_COUNT_KEYS = Object.freeze([
  'dueToday',
  'overdue',
  'dueTomorrow',
  'dueNext7Days',
  'recommendedDailyReviewTarget',
]);

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasSchedulingInsightsAverageEaseFactor(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function toCount(value) {
  if (!isNonNegativeSafeInteger(value)) {
    throw new Error(MALFORMED_SCHEDULING_INSIGHTS_PAYLOAD);
  }

  return value;
}

function formatDecimal(value, digits = 2) {
  if (value === null) {
    return 'Unavailable';
  }

  if (!hasSchedulingInsightsAverageEaseFactor(value)) {
    throw new Error(MALFORMED_SCHEDULING_INSIGHTS_PAYLOAD);
  }

  return value.toFixed(digits);
}

function hasSchedulingInsightsSummaryPayload(insights) {
  return Boolean(insights)
    && typeof insights === 'object'
    && !Array.isArray(insights)
    && SCHEDULING_INSIGHTS_SUMMARY_COUNT_KEYS.every((key) => (
      hasOwn(insights, key) && isNonNegativeSafeInteger(insights[key])
    ))
    && hasOwn(insights, 'averageEaseFactor')
    && hasSchedulingInsightsAverageEaseFactor(insights.averageEaseFactor);
}

function buildSchedulingInsightsSummary(insights) {
  if (!hasSchedulingInsightsSummaryPayload(insights)) {
    throw new Error(MALFORMED_SCHEDULING_INSIGHTS_PAYLOAD);
  }

  const dueToday = toCount(insights.dueToday);
  const overdue = toCount(insights.overdue);
  const dueTomorrow = toCount(insights.dueTomorrow);
  const dueNext7Days = toCount(insights.dueNext7Days);

  return {
    dueToday,
    overdue,
    recommendedDailyReviewTarget: toCount(insights.recommendedDailyReviewTarget),
    averageEaseFactorLabel: formatDecimal(insights.averageEaseFactor),
    upcomingBuckets: [
      {
        key: 'dueToday',
        label: 'Today',
        value: dueToday,
      },
      {
        key: 'dueTomorrow',
        label: 'Tomorrow',
        value: dueTomorrow,
      },
      {
        key: 'dueNext7Days',
        label: 'Next 7 days',
        value: dueNext7Days,
      },
    ],
  };
}

module.exports = {
  buildSchedulingInsightsSummary,
  formatDecimal,
  hasSchedulingInsightsSummaryPayload,
  toCount,
};
