const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DASHBOARD_AUXILIARY_COPY,
  buildDeckAvailabilityDisplayState,
  buildSchedulingInsightsDisplayState,
  hasSchedulingInsightsPayload,
} = require('../dashboardAuxiliaryDisplayState');
const {
  buildSchedulingInsightsSummary,
  hasSchedulingInsightsSummaryPayload,
} = require('../schedulingInsightsSummary');

const SCHEDULING_INSIGHTS_DISPLAY_STATE_FIELD_NAMES = Object.freeze([
  'totalCards',
  'overdue',
  'dueToday',
  'dueTomorrow',
  'dueNext7Days',
  'averageEaseFactor',
  'recommendedDailyReviewTarget',
  'leechCandidates',
  'suggestedNewCards',
]);

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

function createNullPrototypeSchedulingInsightsPayload(overrides = {}) {
  return Object.assign(Object.create(null), createSchedulingInsightsPayload(), overrides);
}

function defineThrowingGetter(object, fieldName) {
  let getterCalls = 0;

  Object.defineProperty(object, fieldName, {
    get() {
      getterCalls += 1;
      throw new Error(`${fieldName} getter should not run`);
    },
    configurable: true,
  });

  return () => getterCalls;
}

function assertSchedulingInsightsHiddenWithError(schedulingInsights) {
  assert.equal(hasSchedulingInsightsPayload(schedulingInsights), false);

  const state = buildSchedulingInsightsDisplayState({
    schedulingInsights,
    isLoadingSchedulingInsights: false,
    schedulingInsightsLoadFailed: true,
  });

  assert.equal(state.hasInsights, false);
  assert.equal(state.showSummary, false);
  assert.equal(state.showError, true);
}

test('buildDeckAvailabilityDisplayState shows accessible loading and disables actions while checking decks', () => {
  const state = buildDeckAvailabilityDisplayState({
    isLoadingDecks: true,
    deckLoadFailed: true,
  });

  assert.equal(state.showError, true);
  assert.equal(state.prompt, DASHBOARD_AUXILIARY_COPY.deckAvailability.loading);
  assert.equal(state.ctaLabel, DASHBOARD_AUXILIARY_COPY.deckAvailability.loadingCta);
  assert.equal(state.ctaDisabled, true);
  assert.equal(state.retryButtonLabel, DASHBOARD_AUXILIARY_COPY.deckAvailability.retrying);
  assert.equal(state.retryDisabled, true);
});

test('buildDeckAvailabilityDisplayState routes due deck copy toward studying only when cards are due', () => {
  const state = buildDeckAvailabilityDisplayState({
    studyDeckTarget: { id: 7, totalCards: 12, dueCards: 3 },
    isLoadingDecks: false,
    deckLoadFailed: false,
  });

  assert.equal(state.hasDueStudyTarget, true);
  assert.equal(state.prompt, DASHBOARD_AUXILIARY_COPY.deckAvailability.duePrompt);
  assert.equal(state.ctaLabel, DASHBOARD_AUXILIARY_COPY.deckAvailability.dueCta);
  assert.equal(state.ctaDisabled, false);
  assert.equal(state.showError, false);
});

test('buildDeckAvailabilityDisplayState sends no-due and missing decks to deck management copy', () => {
  const noDueState = buildDeckAvailabilityDisplayState({
    studyDeckTarget: { id: 3, totalCards: 12, dueCards: 0 },
  });
  const missingState = buildDeckAvailabilityDisplayState();

  assert.equal(noDueState.hasDueStudyTarget, false);
  assert.equal(noDueState.prompt, DASHBOARD_AUXILIARY_COPY.deckAvailability.noDuePrompt);
  assert.equal(noDueState.ctaLabel, DASHBOARD_AUXILIARY_COPY.deckAvailability.noDueCta);
  assert.equal(missingState.prompt, DASHBOARD_AUXILIARY_COPY.deckAvailability.missingPrompt);
  assert.equal(missingState.ctaLabel, DASHBOARD_AUXILIARY_COPY.deckAvailability.missingCta);
});

test('buildDeckAvailabilityDisplayState keeps stale due deck CTA visible after a retryable failure', () => {
  const state = buildDeckAvailabilityDisplayState({
    studyDeckTarget: { id: 7, totalCards: 12, dueCards: 3 },
    isLoadingDecks: false,
    deckLoadFailed: true,
  });

  assert.equal(state.showError, true);
  assert.equal(state.errorTitle, DASHBOARD_AUXILIARY_COPY.deckAvailability.errorTitle);
  assert.equal(state.errorMessage, DASHBOARD_AUXILIARY_COPY.deckAvailability.errorMessage);
  assert.equal(state.retryButtonLabel, DASHBOARD_AUXILIARY_COPY.deckAvailability.retry);
  assert.equal(state.retryDisabled, false);
  assert.equal(state.hasDueStudyTarget, true);
  assert.equal(state.prompt, DASHBOARD_AUXILIARY_COPY.deckAvailability.duePrompt);
  assert.equal(state.ctaLabel, DASHBOARD_AUXILIARY_COPY.deckAvailability.dueCta);
});

test('buildDeckAvailabilityDisplayState does not promise study when a failed retry has no due deck', () => {
  const noDueState = buildDeckAvailabilityDisplayState({
    studyDeckTarget: { id: 7, totalCards: 12, dueCards: 0 },
    isLoadingDecks: false,
    deckLoadFailed: true,
  });
  const missingState = buildDeckAvailabilityDisplayState({
    isLoadingDecks: false,
    deckLoadFailed: true,
  });

  assert.equal(noDueState.showError, true);
  assert.equal(noDueState.hasDueStudyTarget, false);
  assert.equal(noDueState.prompt, DASHBOARD_AUXILIARY_COPY.deckAvailability.noDuePrompt);
  assert.equal(noDueState.ctaLabel, DASHBOARD_AUXILIARY_COPY.deckAvailability.noDueCta);
  assert.equal(missingState.showError, true);
  assert.equal(missingState.prompt, DASHBOARD_AUXILIARY_COPY.deckAvailability.failurePrompt);
  assert.equal(missingState.ctaLabel, DASHBOARD_AUXILIARY_COPY.deckAvailability.failureCta);
});

test('hasSchedulingInsightsPayload requires the successful endpoint contract', () => {
  assert.equal(hasSchedulingInsightsPayload(createSchedulingInsightsPayload()), true);
  assert.equal(
    hasSchedulingInsightsPayload(createSchedulingInsightsPayload({ averageEaseFactor: null })),
    true,
  );
  assert.equal(
    hasSchedulingInsightsPayload(createSchedulingInsightsPayload({
      totalCards: 12,
      overdue: 6,
      dueToday: 2,
      dueTomorrow: 4,
      dueNext7Days: 6,
      leechCandidates: 12,
    })),
    true,
  );

  [
    { dueToday: 1 },
    createSchedulingInsightsPayload({ totalCards: '30' }),
    createSchedulingInsightsPayload({ leechCandidates: Number.MAX_SAFE_INTEGER + 1 }),
    createSchedulingInsightsPayload({ suggestedNewCards: Number.NaN }),
    createSchedulingInsightsPayload({ totalCards: 2 }),
    createSchedulingInsightsPayload({
      totalCards: 12,
      overdue: 1,
      dueToday: 2,
      dueTomorrow: 4,
      dueNext7Days: 12,
    }),
    createSchedulingInsightsPayload({ leechCandidates: 31 }),
    createSchedulingInsightsPayload({ dueToday: 9, dueTomorrow: 4, dueNext7Days: 12 }),
  ].forEach((payload) => {
    assert.equal(
      hasSchedulingInsightsPayload(payload),
      false,
      `Expected ${JSON.stringify(payload)} to be rejected`,
    );
  });

  assert.equal(hasSchedulingInsightsPayload(null), false);
  assert.equal(hasSchedulingInsightsPayload(undefined), false);
  assert.equal(hasSchedulingInsightsPayload([]), false);
  assert.equal(hasSchedulingInsightsPayload(''), false);
  assert.equal(hasSchedulingInsightsPayload(0), false);
});

test('hasSchedulingInsightsPayload accepts null-prototype endpoint records with own data fields', () => {
  const state = buildSchedulingInsightsDisplayState({
    schedulingInsights: createNullPrototypeSchedulingInsightsPayload(),
  });

  assert.equal(state.hasInsights, true);
  assert.equal(state.showSummary, true);
  assert.equal(state.showLoadingBody, false);
});

test('hasSchedulingInsightsPayload rejects inherited scheduling insights fields', () => {
  for (const fieldName of SCHEDULING_INSIGHTS_DISPLAY_STATE_FIELD_NAMES) {
    const dataPrototype = { [fieldName]: createSchedulingInsightsPayload()[fieldName] };
    const prototypeBackedPayload = Object.assign(
      Object.create(dataPrototype),
      createSchedulingInsightsPayload(),
    );
    delete prototypeBackedPayload[fieldName];

    assertSchedulingInsightsHiddenWithError(prototypeBackedPayload);
  }
});

test('hasSchedulingInsightsPayload ignores inherited accessors without invoking getters', () => {
  for (const fieldName of SCHEDULING_INSIGHTS_DISPLAY_STATE_FIELD_NAMES) {
    const accessorPrototype = {};
    const getterCalls = defineThrowingGetter(accessorPrototype, fieldName);
    const accessorPayload = createSchedulingInsightsPayload();
    Object.setPrototypeOf(accessorPayload, accessorPrototype);
    delete accessorPayload[fieldName];

    assertSchedulingInsightsHiddenWithError(accessorPayload);
    assert.equal(getterCalls(), 0);
  }
});

test('hasSchedulingInsightsPayload rejects accessor-backed scheduling insights fields without invoking getters', () => {
  for (const fieldName of SCHEDULING_INSIGHTS_DISPLAY_STATE_FIELD_NAMES) {
    const payload = createSchedulingInsightsPayload();
    const getterCalls = defineThrowingGetter(payload, fieldName);

    assertSchedulingInsightsHiddenWithError(payload);
    assert.equal(getterCalls(), 0);
  }
});

test('hasSchedulingInsightsPayload rejects impossible upcoming buckets with valid endpoint totals', () => {
  const validEndpointTotals = {
    totalCards: 20,
    overdue: 5,
    dueToday: 9,
    dueTomorrow: 3,
    dueNext7Days: 12,
    leechCandidates: 20,
  };

  assert.equal(
    hasSchedulingInsightsPayload(createSchedulingInsightsPayload(validEndpointTotals)),
    true,
  );
  assert.equal(
    hasSchedulingInsightsPayload(createSchedulingInsightsPayload({
      ...validEndpointTotals,
      dueTomorrow: 4,
    })),
    false,
  );
});

test('buildSchedulingInsightsDisplayState shows loading copy while insights are unavailable', () => {
  const state = buildSchedulingInsightsDisplayState({
    schedulingInsights: null,
    isLoadingSchedulingInsights: true,
    schedulingInsightsLoadFailed: false,
  });

  assert.equal(state.showError, false);
  assert.equal(state.showLoadingBody, true);
  assert.equal(state.showSummary, false);
  assert.equal(state.headerLoadingText, DASHBOARD_AUXILIARY_COPY.schedulingInsights.headerLoading);
  assert.equal(state.loadingText, DASHBOARD_AUXILIARY_COPY.schedulingInsights.loading);
  assert.equal(state.retryButtonLabel, DASHBOARD_AUXILIARY_COPY.schedulingInsights.retrying);
  assert.equal(state.retryDisabled, true);
});

test('buildSchedulingInsightsDisplayState exposes retryable failure copy', () => {
  const state = buildSchedulingInsightsDisplayState({
    schedulingInsights: null,
    isLoadingSchedulingInsights: false,
    schedulingInsightsLoadFailed: true,
  });

  assert.equal(state.showError, true);
  assert.equal(state.showLoadingBody, false);
  assert.equal(state.showSummary, false);
  assert.equal(state.errorTitle, DASHBOARD_AUXILIARY_COPY.schedulingInsights.errorTitle);
  assert.equal(state.errorMessage, DASHBOARD_AUXILIARY_COPY.schedulingInsights.errorMessage);
  assert.equal(state.retryButtonLabel, DASHBOARD_AUXILIARY_COPY.schedulingInsights.retry);
  assert.equal(state.retryDisabled, false);
});

test('buildSchedulingInsightsDisplayState does not show summary without a valid payload', () => {
  [
    null,
    undefined,
    [],
    '',
    0,
    { dueToday: 2 },
    createSchedulingInsightsPayload({ overdue: '3' }),
    createSchedulingInsightsPayload({
      totalCards: 12,
      overdue: 1,
      dueToday: 2,
      dueTomorrow: 4,
      dueNext7Days: 12,
    }),
  ].forEach((schedulingInsights) => {
    const state = buildSchedulingInsightsDisplayState({
      schedulingInsights,
      isLoadingSchedulingInsights: false,
      schedulingInsightsLoadFailed: false,
    });

    assert.equal(state.hasInsights, false);
    assert.equal(state.showLoadingBody, false);
    assert.equal(state.showSummary, false);
  });
});

test('buildSchedulingInsightsDisplayState hides payloads rejected by the summary mapper', () => {
  [
    null,
    undefined,
    [],
    '',
    0,
    createSchedulingInsightsPayload({ dueToday: '2' }),
    createSchedulingInsightsPayload({ overdue: -1 }),
    createSchedulingInsightsPayload({ dueTomorrow: 1.5 }),
    createSchedulingInsightsPayload({ dueNext7Days: Number.MAX_SAFE_INTEGER + 1 }),
    createSchedulingInsightsPayload({ dueToday: 9, dueTomorrow: 4, dueNext7Days: 12 }),
    createSchedulingInsightsPayload({ recommendedDailyReviewTarget: Number.NaN }),
    createSchedulingInsightsPayload({ recommendedDailyReviewTarget: '10' }),
    createSchedulingInsightsPayload({ averageEaseFactor: '2.35' }),
    createSchedulingInsightsPayload({ averageEaseFactor: 0 }),
    createSchedulingInsightsPayload({ averageEaseFactor: -1 }),
  ].forEach((schedulingInsights) => {
    assert.equal(hasSchedulingInsightsSummaryPayload(schedulingInsights), false);
    assert.throws(
      () => buildSchedulingInsightsSummary(schedulingInsights),
      /Malformed scheduling insights payload/,
    );

    const state = buildSchedulingInsightsDisplayState({
      schedulingInsights,
      isLoadingSchedulingInsights: false,
      schedulingInsightsLoadFailed: false,
    });

    assert.equal(state.hasInsights, false);
    assert.equal(state.showSummary, false);
  });
});

test('buildSchedulingInsightsDisplayState keeps summaries visible during background retry', () => {
  const state = buildSchedulingInsightsDisplayState({
    schedulingInsights: createSchedulingInsightsPayload(),
    isLoadingSchedulingInsights: true,
    schedulingInsightsLoadFailed: true,
  });

  assert.equal(state.hasInsights, true);
  assert.equal(state.showError, true);
  assert.equal(state.showLoadingBody, false);
  assert.equal(state.showSummary, true);
  assert.equal(state.retryButtonLabel, DASHBOARD_AUXILIARY_COPY.schedulingInsights.retrying);
  assert.equal(state.retryDisabled, true);
});

test('buildSchedulingInsightsDisplayState keeps stale summaries visible after retry failure', () => {
  const state = buildSchedulingInsightsDisplayState({
    schedulingInsights: createSchedulingInsightsPayload(),
    isLoadingSchedulingInsights: false,
    schedulingInsightsLoadFailed: true,
  });

  assert.equal(state.hasInsights, true);
  assert.equal(state.showError, true);
  assert.equal(state.showLoadingBody, false);
  assert.equal(state.showSummary, true);
  assert.equal(state.retryButtonLabel, DASHBOARD_AUXILIARY_COPY.schedulingInsights.retry);
  assert.equal(state.retryDisabled, false);
});
