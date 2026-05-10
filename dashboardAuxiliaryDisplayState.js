const { hasDueCards } = require('./dashboardDeckTarget');

const DASHBOARD_AUXILIARY_COPY = Object.freeze({
  deckAvailability: Object.freeze({
    loading: 'Checking deck availability...',
    errorTitle: 'Deck status could not be loaded',
    errorMessage: 'Retry to check deck availability or manage your decks.',
    retry: 'Retry deck status',
    retrying: 'Checking...',
    duePrompt: 'Resume with the next deck that has cards ready.',
    noDuePrompt: 'No cards are due right now. Browse or manage your decks instead.',
    missingPrompt: 'Add cards or create a deck before starting a study session.',
    failurePrompt: 'Deck status could not be loaded. Retry to check availability or manage your decks.',
    dueCta: 'Start Studying',
    noDueCta: 'Browse Decks',
    missingCta: 'Add Cards or Decks',
    failureCta: 'Manage Decks',
    loadingCta: 'Checking Decks...',
  }),
  schedulingInsights: Object.freeze({
    headerLoading: 'Loading...',
    loading: 'Loading scheduling insights...',
    errorTitle: 'Scheduling insights could not be loaded',
    errorMessage: 'Retry to refresh review workload and due-date estimates.',
    retry: 'Retry insights',
    retrying: 'Retrying...',
  }),
});

function buildDeckAvailabilityDisplayState({
  studyDeckTarget = null,
  isLoadingDecks = false,
  deckLoadFailed = false,
} = {}) {
  const isLoading = Boolean(isLoadingDecks);
  const hasDueStudyTarget = hasDueCards(studyDeckTarget);
  const copy = DASHBOARD_AUXILIARY_COPY.deckAvailability;

  let prompt = copy.missingPrompt;
  let ctaLabel = copy.missingCta;

  if (studyDeckTarget) {
    prompt = hasDueStudyTarget ? copy.duePrompt : copy.noDuePrompt;
    ctaLabel = hasDueStudyTarget ? copy.dueCta : copy.noDueCta;
  } else if (isLoading) {
    prompt = copy.loading;
    ctaLabel = copy.loadingCta;
  } else if (deckLoadFailed) {
    prompt = copy.failurePrompt;
    ctaLabel = copy.failureCta;
  }

  return {
    isLoading,
    hasDueStudyTarget,
    showError: Boolean(deckLoadFailed),
    loadingText: copy.loading,
    errorTitle: copy.errorTitle,
    errorMessage: copy.errorMessage,
    retryButtonLabel: isLoading ? copy.retrying : copy.retry,
    retryDisabled: isLoading,
    prompt,
    ctaLabel,
    ctaDisabled: isLoading,
  };
}

function hasSchedulingInsightsPayload(schedulingInsights) {
  return Boolean(schedulingInsights)
    && typeof schedulingInsights === 'object'
    && !Array.isArray(schedulingInsights);
}

function buildSchedulingInsightsDisplayState({
  schedulingInsights = null,
  isLoadingSchedulingInsights = false,
  schedulingInsightsLoadFailed = false,
} = {}) {
  const isLoading = Boolean(isLoadingSchedulingInsights);
  const hasInsights = hasSchedulingInsightsPayload(schedulingInsights);
  const copy = DASHBOARD_AUXILIARY_COPY.schedulingInsights;

  return {
    isLoading,
    hasInsights,
    showError: Boolean(schedulingInsightsLoadFailed),
    showLoadingBody: isLoading && !hasInsights,
    showSummary: hasInsights || (!isLoading && !schedulingInsightsLoadFailed),
    headerLoadingText: copy.headerLoading,
    loadingText: copy.loading,
    errorTitle: copy.errorTitle,
    errorMessage: copy.errorMessage,
    retryButtonLabel: isLoading ? copy.retrying : copy.retry,
    retryDisabled: isLoading,
  };
}

module.exports = {
  DASHBOARD_AUXILIARY_COPY,
  buildDeckAvailabilityDisplayState,
  buildSchedulingInsightsDisplayState,
  hasSchedulingInsightsPayload,
};
