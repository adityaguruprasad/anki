const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DASHBOARD_AUXILIARY_COPY,
  buildDeckAvailabilityDisplayState,
  buildSchedulingInsightsDisplayState,
  hasSchedulingInsightsPayload,
} = require('../dashboardAuxiliaryDisplayState');

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

test('hasSchedulingInsightsPayload only accepts object insights payloads', () => {
  assert.equal(hasSchedulingInsightsPayload({ dueToday: 1 }), true);
  assert.equal(hasSchedulingInsightsPayload(null), false);
  assert.equal(hasSchedulingInsightsPayload(undefined), false);
  assert.equal(hasSchedulingInsightsPayload([]), false);
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

test('buildSchedulingInsightsDisplayState keeps summaries visible during background retry', () => {
  const state = buildSchedulingInsightsDisplayState({
    schedulingInsights: { dueToday: 2 },
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
