const {
  normalizeCursor,
  normalizeRequestId,
  normalizeSearchQuery,
} = require('./deckCardBrowserRequestState');
const {
  getOwnDataPropertyValue,
  isObjectRecord,
} = require('./recordDataProperty');

const DECK_CARD_BROWSER_ERROR_KINDS = Object.freeze({
  REPLACE: 'replace',
  APPEND: 'append',
});

const DECK_CARD_BROWSER_COPY = Object.freeze({
  loading: 'Loading cards...',
  loadMore: 'Load more',
  loadingMore: 'Loading...',
  replaceErrorTitle: 'Cards could not be loaded',
  replaceErrorMessage: 'Retry to load cards for this deck.',
  appendErrorTitle: 'More cards could not be loaded',
  appendErrorMessage: 'Retry loading the next page of cards.',
  retry: 'Try Again',
  retrying: 'Retrying...',
  retryAppend: 'Try Loading More Again',
  retryingAppend: 'Retrying load more...',
  emptyDeckMessage: 'No cards in this deck yet.',
  emptySearchMessage: 'No cards match the search.',
  clearSearch: 'Clear search',
});

function normalizeErrorKind(kind) {
  return kind === DECK_CARD_BROWSER_ERROR_KINDS.APPEND
    ? DECK_CARD_BROWSER_ERROR_KINDS.APPEND
    : DECK_CARD_BROWSER_ERROR_KINDS.REPLACE;
}

function getAppendRetryRequestId(...requestIds) {
  for (const requestId of requestIds) {
    const normalizedRequestId = normalizeRequestId(requestId);

    if (normalizedRequestId !== 0) {
      return normalizedRequestId;
    }
  }

  return null;
}

function normalizeDeckCardBrowserError(error) {
  if (!error) {
    return null;
  }

  if (typeof error === 'string') {
    const message = error.trim();

    if (!message) {
      return null;
    }

    return {
      kind: DECK_CARD_BROWSER_ERROR_KINDS.REPLACE,
      message,
      searchQuery: '',
      cursor: null,
      requestId: normalizeRequestId(null),
    };
  }

  if (!isObjectRecord(error)) {
    return null;
  }

  const message = getOwnDataPropertyValue(error, 'message');

  return {
    kind: normalizeErrorKind(getOwnDataPropertyValue(error, 'kind')),
    message: typeof message === 'string' ? message.trim() : '',
    searchQuery: normalizeSearchQuery(getOwnDataPropertyValue(error, 'searchQuery')),
    cursor: normalizeCursor(getOwnDataPropertyValue(error, 'cursor')),
    requestId: normalizeRequestId(getOwnDataPropertyValue(error, 'requestId')),
  };
}

function createDeckCardBrowserFailure({
  kind = DECK_CARD_BROWSER_ERROR_KINDS.REPLACE,
  message = '',
  searchQuery = '',
  cursor = null,
  requestId = null,
} = {}) {
  return {
    kind: normalizeErrorKind(kind),
    message: typeof message === 'string' ? message.trim() : '',
    searchQuery: normalizeSearchQuery(searchQuery),
    cursor: normalizeCursor(cursor),
    requestId: normalizeRequestId(requestId),
  };
}

function buildDeckCardBrowserDisplayState(deckCards = {}) {
  const currentDeckCards = deckCards && typeof deckCards === 'object' ? deckCards : {};
  const error = normalizeDeckCardBrowserError(currentDeckCards.error);
  const isLoading = Boolean(currentDeckCards.loading);
  const isLoadingMore = Boolean(currentDeckCards.loadingMore);
  const loadedCards = Array.isArray(currentDeckCards.cards) ? currentDeckCards.cards : [];
  const appliedSearchQuery = normalizeSearchQuery(currentDeckCards.appliedSearchQuery);
  const normalizedNextCursor = normalizeCursor(currentDeckCards.nextCursor);
  const showEmptyState = Boolean(currentDeckCards.hasLoaded)
    && loadedCards.length === 0
    && !isLoading;
  const showEmptySearchResult = showEmptyState && Boolean(appliedSearchQuery);
  const isAppendError = error?.kind === DECK_CARD_BROWSER_ERROR_KINDS.APPEND;
  const retryBusy = isAppendError ? isLoadingMore : isLoading;
  const retrySearchQuery = error?.searchQuery || appliedSearchQuery;
  const retryCursor = isAppendError
    ? error?.cursor || normalizedNextCursor
    : null;
  const retryRequestId = isAppendError
    ? getAppendRetryRequestId(error?.requestId, currentDeckCards.browserRequestId)
    : null;
  const retryRequest = error
    ? {
      append: isAppendError,
      q: retrySearchQuery,
      cursor: retryCursor,
      requestId: retryRequestId,
    }
    : null;

  return {
    isLoading,
    isLoadingMore,
    showLoadingStatus: isLoading && !error,
    loadingText: DECK_CARD_BROWSER_COPY.loading,
    showEmptyState,
    showEmptySearchResult,
    emptyMessage: showEmptySearchResult
      ? DECK_CARD_BROWSER_COPY.emptySearchMessage
      : DECK_CARD_BROWSER_COPY.emptyDeckMessage,
    clearSearchButtonLabel: DECK_CARD_BROWSER_COPY.clearSearch,
    clearSearchRequest: showEmptySearchResult ? { q: '' } : null,
    loadMoreButtonLabel: isLoadingMore
      ? DECK_CARD_BROWSER_COPY.loadingMore
      : DECK_CARD_BROWSER_COPY.loadMore,
    showLoadMore: Boolean(normalizedNextCursor) && !isAppendError,
    showError: Boolean(error),
    errorKind: error?.kind || null,
    errorTitle: isAppendError
      ? DECK_CARD_BROWSER_COPY.appendErrorTitle
      : DECK_CARD_BROWSER_COPY.replaceErrorTitle,
    errorMessage: error?.message || (
      isAppendError
        ? DECK_CARD_BROWSER_COPY.appendErrorMessage
        : DECK_CARD_BROWSER_COPY.replaceErrorMessage
    ),
    retryButtonLabel: isAppendError
      ? (retryBusy ? DECK_CARD_BROWSER_COPY.retryingAppend : DECK_CARD_BROWSER_COPY.retryAppend)
      : (retryBusy ? DECK_CARD_BROWSER_COPY.retrying : DECK_CARD_BROWSER_COPY.retry),
    retryDisabled: retryBusy || (isAppendError && !retryCursor),
    retryRequest,
  };
}

module.exports = {
  DECK_CARD_BROWSER_COPY,
  DECK_CARD_BROWSER_ERROR_KINDS,
  buildDeckCardBrowserDisplayState,
  createDeckCardBrowserFailure,
  normalizeDeckCardBrowserError,
};
