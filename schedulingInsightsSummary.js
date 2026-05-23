const MALFORMED_SCHEDULING_INSIGHTS_PAYLOAD = 'Malformed scheduling insights payload';

const SCHEDULING_INSIGHTS_SUMMARY_COUNT_KEYS = Object.freeze([
  'dueToday',
  'overdue',
  'dueTomorrow',
  'dueNext7Days',
  'recommendedDailyReviewTarget',
]);

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function descriptorHasValue(descriptor) {
  return (
    descriptor !== undefined
    && Object.prototype.hasOwnProperty.call(descriptor, 'value')
  );
}

function getOwnDataPropertyValue(value, key) {
  const descriptor = isObjectRecord(value)
    ? Object.getOwnPropertyDescriptor(value, key)
    : undefined;

  return descriptorHasValue(descriptor) ? descriptor.value : undefined;
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function hasSchedulingInsightsAverageEaseFactor(value) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value > 0);
}

function hasSchedulingInsightsSummaryCountInvariants(insights) {
  const dueToday = getOwnDataPropertyValue(insights, 'dueToday');
  const dueTomorrow = getOwnDataPropertyValue(insights, 'dueTomorrow');
  const dueNext7Days = getOwnDataPropertyValue(insights, 'dueNext7Days');

  // Today and tomorrow are disjoint subsets of the next-7-days bucket.
  return (
    dueToday <= dueNext7Days
    && dueTomorrow <= dueNext7Days
    && dueToday + dueTomorrow <= dueNext7Days
  );
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
  return isObjectRecord(insights)
    && SCHEDULING_INSIGHTS_SUMMARY_COUNT_KEYS.every((key) => (
      isNonNegativeSafeInteger(getOwnDataPropertyValue(insights, key))
    ))
    && hasSchedulingInsightsSummaryCountInvariants(insights)
    && hasSchedulingInsightsAverageEaseFactor(
      getOwnDataPropertyValue(insights, 'averageEaseFactor'),
    );
}

function buildSchedulingInsightsSummary(insights) {
  if (!hasSchedulingInsightsSummaryPayload(insights)) {
    throw new Error(MALFORMED_SCHEDULING_INSIGHTS_PAYLOAD);
  }

  const dueToday = toCount(getOwnDataPropertyValue(insights, 'dueToday'));
  const overdue = toCount(getOwnDataPropertyValue(insights, 'overdue'));
  const dueTomorrow = toCount(getOwnDataPropertyValue(insights, 'dueTomorrow'));
  const dueNext7Days = toCount(getOwnDataPropertyValue(insights, 'dueNext7Days'));

  return {
    dueToday,
    overdue,
    recommendedDailyReviewTarget: toCount(
      getOwnDataPropertyValue(insights, 'recommendedDailyReviewTarget'),
    ),
    averageEaseFactorLabel: formatDecimal(getOwnDataPropertyValue(insights, 'averageEaseFactor')),
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
