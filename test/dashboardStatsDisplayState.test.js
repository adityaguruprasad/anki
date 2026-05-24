const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DASHBOARD_STATS_COPY,
  buildDashboardStatsDisplayState,
  hasDashboardStatsPayload,
  hasStatsPayload,
  toDisplayCount,
} = require('../dashboardStatsDisplayState');

function createValidDashboardStats(overrides = {}) {
  return {
    totalCards: 12,
    totalDecks: 3,
    todayReviews: 1,
    weekReviews: 4,
    monthReviews: 9,
    ...overrides,
  };
}

const DASHBOARD_TOTAL_FIELD_NAMES = Object.freeze([
  'totalCards',
  'totalDecks',
]);

const DASHBOARD_STATS_FIELD_NAMES = Object.freeze([
  ...DASHBOARD_TOTAL_FIELD_NAMES,
  'todayReviews',
  'weekReviews',
  'monthReviews',
]);

function createNullPrototypeDashboardStats(overrides = {}) {
  return Object.assign(Object.create(null), createValidDashboardStats(), overrides);
}

function defineThrowingGetter(object, fieldName) {
  let getterCalls = 0;

  Object.defineProperty(object, fieldName, {
    configurable: true,
    get() {
      getterCalls += 1;
      throw new Error(`${fieldName} getter should not run`);
    },
  });

  return () => getterCalls;
}

test('hasStatsPayload requires valid dashboard total count fields', () => {
  [
    { totalCards: 0, totalDecks: 0 },
    { totalCards: 12, totalDecks: 3 },
    { totalCards: Number.MAX_SAFE_INTEGER, totalDecks: 3 },
    { totalCards: '12', totalDecks: '3' },
    { totalCards: ' 12 ', totalDecks: ' 0 ' },
    { totalCards: '900719925474099312345', totalDecks: '00012' },
  ].forEach((stats) => {
    assert.equal(hasStatsPayload(stats), true);
  });

  [
    null,
    undefined,
    [],
    { totalCards: 1 },
    { totalDecks: 1 },
    { totalCards: '', totalDecks: 1 },
    { totalCards: ' ', totalDecks: 1 },
    { totalCards: null, totalDecks: 1 },
    { totalCards: [], totalDecks: 1 },
    { totalCards: Number.NaN, totalDecks: 1 },
    { totalCards: Number.POSITIVE_INFINITY, totalDecks: 1 },
    { totalCards: Number.MAX_SAFE_INTEGER + 1, totalDecks: 1 },
    { totalCards: -1, totalDecks: 1 },
    { totalCards: 1.5, totalDecks: 1 },
    { totalCards: '3.0', totalDecks: 1 },
    { totalCards: '1.5', totalDecks: 1 },
    { totalCards: '1e3', totalDecks: 1 },
    { totalCards: '+1', totalDecks: 1 },
    { totalCards: '-1', totalDecks: 1 },
    { totalCards: 'NaN', totalDecks: 1 },
    { totalCards: 'Infinity', totalDecks: 1 },
    { totalCards: 'cards', totalDecks: 1 },
    { totalCards: 1, totalDecks: Number.NEGATIVE_INFINITY },
    { totalCards: 1, totalDecks: -1 },
    { totalCards: 1, totalDecks: '3.0' },
    { totalCards: 1, totalDecks: '1.5' },
    { totalCards: 1, totalDecks: '1e3' },
    { totalCards: 1, totalDecks: '+1' },
    { totalCards: 1, totalDecks: '-1' },
    { totalCards: 1, totalDecks: 'NaN' },
    { totalCards: 1, totalDecks: 'Infinity' },
    { totalCards: 1, totalDecks: Number.MAX_SAFE_INTEGER + 1 },
  ].forEach((stats) => {
    assert.equal(hasStatsPayload(stats), false);
  });
});

test('hasDashboardStatsPayload requires the full stats endpoint contract', () => {
  [
    createValidDashboardStats(),
    createValidDashboardStats({
      todayReviews: 9,
      weekReviews: 9,
      monthReviews: 9,
    }),
    createValidDashboardStats({
      totalCards: '900719925474099312345',
      totalDecks: '00012',
      todayReviews: ' 0 ',
      weekReviews: '0007',
      monthReviews: String(Number.MAX_SAFE_INTEGER),
    }),
  ].forEach((stats) => {
    assert.equal(hasDashboardStatsPayload(stats), true);
  });

  [
    { totalCards: 12, totalDecks: 3 },
    createValidDashboardStats({ todayReviews: undefined }),
    createValidDashboardStats({ weekReviews: '1e3' }),
    createValidDashboardStats({ monthReviews: '9007199254740992' }),
    createValidDashboardStats({ totalCards: null }),
    createValidDashboardStats({ totalDecks: -1 }),
    createValidDashboardStats({ todayReviews: 5, weekReviews: 4, monthReviews: 9 }),
    createValidDashboardStats({ todayReviews: 1, weekReviews: 10, monthReviews: 9 }),
    createValidDashboardStats({ totalCards: 8, monthReviews: 9 }),
  ].forEach((stats) => {
    assert.equal(hasDashboardStatsPayload(stats), false);
  });
});

test('dashboard stats payload accepts null-prototype stats with own data fields', () => {
  const stats = createNullPrototypeDashboardStats({
    totalCards: ' 00012 ',
    totalDecks: '0003',
    todayReviews: '0001',
    weekReviews: '0004',
    monthReviews: '0009',
  });

  assert.equal(hasStatsPayload(stats), true);
  assert.equal(hasDashboardStatsPayload(stats), true);

  const state = buildDashboardStatsDisplayState({ stats });
  assert.equal(state.hasStats, true);
  assert.equal(state.totalCards.kind, 'value');
  assert.equal(state.totalCards.text, '12');
  assert.equal(state.totalDecks.text, '3');
});

test('dashboard stats payload rejects inherited and accessor-backed fields without invoking getters', () => {
  assert.equal(hasStatsPayload(Object.create({ totalCards: 12, totalDecks: 3 })), false);
  assert.equal(hasDashboardStatsPayload(Object.create(createValidDashboardStats())), false);

  for (const fieldName of DASHBOARD_STATS_FIELD_NAMES) {
    const ownAccessorStats = createNullPrototypeDashboardStats();
    const ownGetterCalls = defineThrowingGetter(ownAccessorStats, fieldName);

    assert.equal(hasDashboardStatsPayload(ownAccessorStats), false);
    const ownAccessorState = buildDashboardStatsDisplayState({
      stats: ownAccessorStats,
      statsLoadFailed: true,
    });
    const isTotalField = DASHBOARD_TOTAL_FIELD_NAMES.includes(fieldName);
    assert.equal(ownAccessorState.hasStats, !isTotalField);
    assert.equal(ownAccessorState.totalCards.kind, isTotalField ? 'unavailable' : 'value');
    assert.equal(ownGetterCalls(), 0);

    const prototype = {};
    const prototypeGetterCalls = defineThrowingGetter(prototype, fieldName);
    const prototypeBackedStats = createNullPrototypeDashboardStats();
    delete prototypeBackedStats[fieldName];
    Object.setPrototypeOf(prototypeBackedStats, prototype);

    assert.equal(hasDashboardStatsPayload(prototypeBackedStats), false);
    const prototypeBackedState = buildDashboardStatsDisplayState({
      stats: prototypeBackedStats,
      statsLoadFailed: true,
    });
    assert.equal(prototypeBackedState.hasStats, !isTotalField);
    assert.equal(prototypeBackedState.totalCards.kind, isTotalField ? 'unavailable' : 'value');
    assert.equal(prototypeGetterCalls(), 0);
  }
});

test('hasDashboardStatsPayload mirrors the server card-count-by-last_reviewed invariant', () => {
  assert.equal(
    hasDashboardStatsPayload(createValidDashboardStats({
      totalCards: ' 00009 ',
      totalDecks: ' 003 ',
      weekReviews: '0004',
      monthReviews: '0000000000009',
    })),
    true
  );

  assert.equal(
    hasDashboardStatsPayload(createValidDashboardStats({
      totalCards: ' 0000000000008 ',
      monthReviews: '0000000000009',
    })),
    false
  );

  assert.equal(
    hasDashboardStatsPayload(createValidDashboardStats({
      totalCards: '8',
      monthReviews: ' 00009 ',
    })),
    false
  );
});

test('toDisplayCount formats valid dashboard totals without numeric string coercion', () => {
  assert.equal(toDisplayCount(4), '4');
  assert.equal(toDisplayCount(Number.MAX_SAFE_INTEGER), '9007199254740991');
  assert.equal(toDisplayCount('5'), '5');
  assert.equal(toDisplayCount(' 00012 '), '12');
  assert.equal(toDisplayCount('000'), '0');
  assert.equal(
    toDisplayCount('900719925474099312345'),
    '900719925474099312345'
  );
});

test('toDisplayCount falls back for invalid dashboard totals', () => {
  assert.equal(toDisplayCount(Number.MAX_SAFE_INTEGER + 1), '0');
  assert.equal(toDisplayCount(2.9), '0');
  assert.equal(toDisplayCount(-3), '0');
  assert.equal(toDisplayCount('1e3'), '0');
  assert.equal(toDisplayCount('+3'), '0');
  assert.equal(toDisplayCount('3.0'), '0');
  assert.equal(toDisplayCount(' '), '0');
  assert.equal(toDisplayCount([]), '0');
  assert.equal(toDisplayCount(Number.NaN), '0');
});

test('buildDashboardStatsDisplayState shows loading copy before stats arrive', () => {
  const state = buildDashboardStatsDisplayState({
    stats: null,
    isLoadingStats: true,
    statsLoadFailed: false,
  });

  assert.equal(state.showError, false);
  assert.equal(state.totalCards.kind, 'loading');
  assert.equal(state.totalCards.text, DASHBOARD_STATS_COPY.loading);
  assert.equal(state.totalCards.isLoading, true);
  assert.equal(state.totalDecks.kind, 'loading');
  assert.equal(state.totalDecks.text, DASHBOARD_STATS_COPY.loading);
});

test('buildDashboardStatsDisplayState marks totals unavailable after a failed load with no stats', () => {
  const state = buildDashboardStatsDisplayState({
    stats: null,
    isLoadingStats: false,
    statsLoadFailed: true,
  });

  assert.equal(state.showError, true);
  assert.equal(state.errorMessage, DASHBOARD_STATS_COPY.errorWithoutStats);
  assert.equal(state.retryButtonLabel, DASHBOARD_STATS_COPY.retry);
  assert.equal(state.retryDisabled, false);
  assert.equal(state.totalCards.kind, 'unavailable');
  assert.equal(state.totalCards.text, DASHBOARD_STATS_COPY.unavailable);
  assert.equal(state.totalDecks.kind, 'unavailable');
});

test('buildDashboardStatsDisplayState keeps last known stats during a background retry', () => {
  const state = buildDashboardStatsDisplayState({
    stats: { totalCards: 12, totalDecks: 3 },
    isLoadingStats: true,
    statsLoadFailed: false,
  });

  assert.equal(state.showError, false);
  assert.equal(state.retryButtonLabel, DASHBOARD_STATS_COPY.retrying);
  assert.equal(state.retryDisabled, true);
  assert.equal(state.totalCards.kind, 'value');
  assert.equal(state.totalCards.text, '12');
  assert.equal(state.totalDecks.kind, 'value');
  assert.equal(state.totalDecks.text, '3');
});

test('buildDashboardStatsDisplayState renders valid string totals exactly', () => {
  const state = buildDashboardStatsDisplayState({
    stats: {
      totalCards: '900719925474099312345',
      totalDecks: '00012',
    },
    isLoadingStats: false,
    statsLoadFailed: false,
  });

  assert.equal(state.hasStats, true);
  assert.equal(state.totalCards.kind, 'value');
  assert.equal(state.totalCards.text, '900719925474099312345');
  assert.equal(state.totalDecks.kind, 'value');
  assert.equal(state.totalDecks.text, '12');
});

test('buildDashboardStatsDisplayState shows the failure alert copy without replacing known stats', () => {
  const state = buildDashboardStatsDisplayState({
    stats: { totalCards: 8, totalDecks: 2 },
    isLoadingStats: false,
    statsLoadFailed: true,
  });

  assert.equal(state.showError, true);
  assert.equal(state.errorMessage, DASHBOARD_STATS_COPY.errorWithStats);
  assert.equal(state.totalCards.kind, 'value');
  assert.equal(state.totalCards.text, '8');
  assert.equal(state.totalDecks.text, '2');
});

test('buildDashboardStatsDisplayState does not display malformed object-shaped stats as zeroes', () => {
  const state = buildDashboardStatsDisplayState({
    stats: { totalCards: null, totalDecks: 2 },
    isLoadingStats: false,
    statsLoadFailed: true,
  });

  assert.equal(state.hasStats, false);
  assert.equal(state.errorMessage, DASHBOARD_STATS_COPY.errorWithoutStats);
  assert.equal(state.totalCards.kind, 'unavailable');
  assert.equal(state.totalCards.text, DASHBOARD_STATS_COPY.unavailable);
  assert.equal(state.totalDecks.kind, 'unavailable');
  assert.equal(state.totalDecks.text, DASHBOARD_STATS_COPY.unavailable);
});
