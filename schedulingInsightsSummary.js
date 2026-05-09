function toNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);

    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function toCount(value) {
  const number = toNumber(value);

  if (number === null) {
    return 0;
  }

  return Math.max(0, Math.trunc(number));
}

function formatDecimal(value, digits = 2) {
  const number = toNumber(value);

  if (number === null) {
    return 'Unavailable';
  }

  return number.toFixed(digits);
}

function buildSchedulingInsightsSummary(insights) {
  const source = insights && typeof insights === 'object' ? insights : {};

  return {
    dueToday: toCount(source.dueToday),
    overdue: toCount(source.overdue),
    recommendedDailyReviewTarget: toCount(source.recommendedDailyReviewTarget),
    averageEaseFactorLabel: formatDecimal(source.averageEaseFactor),
    upcomingBuckets: [
      {
        key: 'dueToday',
        label: 'Today',
        value: toCount(source.dueToday),
      },
      {
        key: 'dueTomorrow',
        label: 'Tomorrow',
        value: toCount(source.dueTomorrow),
      },
      {
        key: 'dueNext7Days',
        label: 'Next 7 days',
        value: toCount(source.dueNext7Days),
      },
    ],
  };
}

module.exports = {
  buildSchedulingInsightsSummary,
  formatDecimal,
  toCount,
};
