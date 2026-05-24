const { getOwnDataPropertyValue } = require('./recordDataProperty');

const DECK_LIST_LOAD_MESSAGES = Object.freeze({
  loading: 'Loading decks...',
  loadFailed: 'Unable to load decks. Please try again.',
  networkFailed: 'Network error. Please try again.',
});

function createDeckListLoadState(overrides = {}) {
  return {
    loading: false,
    error: '',
    ...overrides,
  };
}

function beginDeckListLoad() {
  return createDeckListLoadState({
    loading: true,
    error: '',
  });
}

function finishDeckListLoadSuccess() {
  return createDeckListLoadState();
}

function finishDeckListLoadFailure(message) {
  const error = typeof message === 'string' && message.trim()
    ? message
    : DECK_LIST_LOAD_MESSAGES.loadFailed;

  return createDeckListLoadState({
    loading: false,
    error,
  });
}

function finishDeckListSilentFailure(currentState = {}) {
  return createDeckListLoadState({
    ...currentState,
    loading: false,
    error: '',
  });
}

function getDeckListLoadFailureMessage(payload) {
  const error = getOwnDataPropertyValue(payload, 'error');

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return DECK_LIST_LOAD_MESSAGES.loadFailed;
}

function isCurrentDeckListRequest(options = {}) {
  const { isMountedRef, requestIdRef, requestId } = options;

  return Boolean(isMountedRef?.current)
    && Boolean(requestIdRef)
    && requestIdRef.current === requestId;
}

module.exports = {
  DECK_LIST_LOAD_MESSAGES,
  beginDeckListLoad,
  createDeckListLoadState,
  finishDeckListLoadFailure,
  finishDeckListSilentFailure,
  finishDeckListLoadSuccess,
  getDeckListLoadFailureMessage,
  isCurrentDeckListRequest,
};
