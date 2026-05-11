const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildSchedulingInsightsSummary,
  formatDecimal,
  hasSchedulingInsightsSummaryPayload,
  toCount,
} = require('../schedulingInsightsSummary');

const MALFORMED_PAYLOAD_ERROR = /Malformed scheduling insights payload/;

function createSchedulingInsightsPayload(overrides = {}) {
  return {
    totalCards: 30,
    overdue: 3,
    dueToday: 2,
    dueTomorrow: 4,
    dueNext7Days: 12,
    leechCandidates: 1,
    averageEaseFactor: 2.35,
    recommendedDailyReviewTarget: 10,
    suggestedNewCards: 15,
    ...overrides,
  };
}

test('toCount accepts only non-negative safe integers', () => {
  assert.equal(toCount(0), 0);
  assert.equal(toCount(3), 3);
  assert.equal(toCount(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
});

test('toCount rejects malformed counts instead of fabricating zeros', () => {
  [
    undefined,
    null,
    '',
    '4',
    'abc',
    2.9,
    -7,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ].forEach((value) => {
    assert.throws(() => toCount(value), MALFORMED_PAYLOAD_ERROR);
  });
});

test('formatDecimal returns a clear unavailable label for missing averages', () => {
  assert.equal(formatDecimal(null), 'Unavailable');
});

test('formatDecimal formats finite positive averages with two decimal places', () => {
  assert.equal(formatDecimal(2.35), '2.35');
  assert.equal(formatDecimal(2.3), '2.30');
});

test('formatDecimal rejects malformed non-null averages', () => {
  [
    undefined,
    '',
    '2.3',
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
  ].forEach((value) => {
    assert.throws(() => formatDecimal(value), MALFORMED_PAYLOAD_ERROR);
  });
});

test('hasSchedulingInsightsSummaryPayload validates every field required by the summary mapper', () => {
  assert.equal(hasSchedulingInsightsSummaryPayload(createSchedulingInsightsPayload()), true);
  assert.equal(
    hasSchedulingInsightsSummaryPayload(createSchedulingInsightsPayload({ averageEaseFactor: null })),
    true,
  );

  [
    null,
    undefined,
    [],
    '',
    createSchedulingInsightsPayload({ dueToday: -1 }),
    createSchedulingInsightsPayload({ overdue: 3.5 }),
    createSchedulingInsightsPayload({ dueTomorrow: '4' }),
    createSchedulingInsightsPayload({ dueNext7Days: Number.MAX_SAFE_INTEGER + 1 }),
    createSchedulingInsightsPayload({ recommendedDailyReviewTarget: Number.NaN }),
    createSchedulingInsightsPayload({ averageEaseFactor: undefined }),
    createSchedulingInsightsPayload({ averageEaseFactor: '2.35' }),
    createSchedulingInsightsPayload({ averageEaseFactor: 0 }),
    createSchedulingInsightsPayload({ averageEaseFactor: -1 }),
  ].forEach((payload) => {
    assert.equal(
      hasSchedulingInsightsSummaryPayload(payload),
      false,
      `Expected ${JSON.stringify(payload)} to be rejected`,
    );
  });
});

test('buildSchedulingInsightsSummary maps endpoint response into dashboard display values', () => {
  assert.deepEqual(buildSchedulingInsightsSummary(createSchedulingInsightsPayload()), {
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

test('buildSchedulingInsightsSummary preserves the allowed null average label', () => {
  const summary = buildSchedulingInsightsSummary(createSchedulingInsightsPayload({
    averageEaseFactor: null,
  }));

  assert.equal(summary.dueToday, 2);
  assert.equal(summary.overdue, 3);
  assert.equal(summary.recommendedDailyReviewTarget, 10);
  assert.equal(summary.averageEaseFactorLabel, 'Unavailable');
  assert.deepEqual(summary.upcomingBuckets, [
    { key: 'dueToday', label: 'Today', value: 2 },
    { key: 'dueTomorrow', label: 'Tomorrow', value: 4 },
    { key: 'dueNext7Days', label: 'Next 7 days', value: 12 },
  ]);
});

test('buildSchedulingInsightsSummary rejects malformed summary count fields', () => {
  [
    { dueToday: undefined },
    { dueToday: null },
    { dueToday: '2' },
    { overdue: 3.5 },
    { dueTomorrow: -1 },
    { dueNext7Days: Number.NaN },
    { recommendedDailyReviewTarget: Number.POSITIVE_INFINITY },
    { recommendedDailyReviewTarget: Number.MAX_SAFE_INTEGER + 1 },
  ].forEach((override) => {
    assert.throws(
      () => buildSchedulingInsightsSummary(createSchedulingInsightsPayload(override)),
      MALFORMED_PAYLOAD_ERROR,
    );
  });
});

test('buildSchedulingInsightsSummary rejects malformed payload shapes and averages', () => {
  [
    null,
    undefined,
    [],
    '',
    createSchedulingInsightsPayload({ averageEaseFactor: undefined }),
    createSchedulingInsightsPayload({ averageEaseFactor: '2.35' }),
    createSchedulingInsightsPayload({ averageEaseFactor: 0 }),
    createSchedulingInsightsPayload({ averageEaseFactor: -1 }),
  ].forEach((payload) => {
    assert.throws(
      () => buildSchedulingInsightsSummary(payload),
      MALFORMED_PAYLOAD_ERROR,
    );
  });
});
