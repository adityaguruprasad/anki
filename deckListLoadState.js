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

function getDeckListLoadFailureMessage(payload) {
  if (payload && typeof payload.error === 'string' && payload.error.trim()) {
    return payload.error;
  }

  return DECK_LIST_LOAD_MESSAGES.loadFailed;
}

module.exports = {
  DECK_LIST_LOAD_MESSAGES,
  beginDeckListLoad,
  createDeckListLoadState,
  finishDeckListLoadFailure,
  finishDeckListLoadSuccess,
  getDeckListLoadFailureMessage,
};
