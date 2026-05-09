const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSchedulingInsightsSummary,
  formatDecimal,
  toCount,
} = require('../schedulingInsightsSummary');

test('toCount defaults missing and invalid counts to zero', () => {
  assert.equal(toCount(undefined), 0);
  assert.equal(toCount(null), 0);
  assert.equal(toCount(''), 0);
  assert.equal(toCount('abc'), 0);
  assert.equal(toCount(Number.NaN), 0);
});

test('toCount coerces finite numeric values into non-negative integers', () => {
  assert.equal(toCount(3), 3);
  assert.equal(toCount('4'), 4);
  assert.equal(toCount(2.9), 2);
  assert.equal(toCount(-7), 0);
});

test('formatDecimal returns a clear unavailable label for missing averages', () => {
  assert.equal(formatDecimal(null), 'Unavailable');
  assert.equal(formatDecimal(undefined), 'Unavailable');
  assert.equal(formatDecimal(''), 'Unavailable');
});

test('formatDecimal formats finite averages with two decimal places', () => {
  assert.equal(formatDecimal(2.35), '2.35');
  assert.equal(formatDecimal('2.3'), '2.30');
});

test('buildSchedulingInsightsSummary maps endpoint response into dashboard display values', () => {
  assert.deepEqual(buildSchedulingInsightsSummary({
    totalCards: 30,
    overdue: 3,
    dueToday: 2,
    dueTomorrow: 4,
    dueNext7Days: 12,
    leechCandidates: 1,
    averageEaseFactor: 2.35,
    recommendedDailyReviewTarget: 10,
    suggestedNewCards: 15,
  }), {
    dueToday: 2,
    overdue: 3,
    recommendedDailyReviewTarget: 10,
    averageEaseFactorLabel: '2.35',
    upcomingBuckets: [
      { key: 'dueToday', label: 'Today', value: 2 },
      { key: 'dueTomorrow', label: 'Tomorrow', value: 4 },
      { key: 'dueNext7Days', label: 'Next 7 days', value: 12 },
    ],
  });
});

test('buildSchedulingInsightsSummary defaults missing endpoint counts to zero', () => {
  const summary = buildSchedulingInsightsSummary({
    averageEaseFactor: null,
    recommendedDailyReviewTarget: null,
  });

  assert.equal(summary.dueToday, 0);
  assert.equal(summary.overdue, 0);
  assert.equal(summary.recommendedDailyReviewTarget, 0);
  assert.equal(summary.averageEaseFactorLabel, 'Unavailable');
  assert.deepEqual(summary.upcomingBuckets, [
    { key: 'dueToday', label: 'Today', value: 0 },
    { key: 'dueTomorrow', label: 'Tomorrow', value: 0 },
    { key: 'dueNext7Days', label: 'Next 7 days', value: 0 },
  ]);
});
