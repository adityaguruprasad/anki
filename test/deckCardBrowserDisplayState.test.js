const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DECK_CARD_BROWSER_COPY,
  DECK_CARD_BROWSER_ERROR_KINDS,
  buildDeckCardBrowserDisplayState,
  createDeckCardBrowserFailure,
  normalizeDeckCardBrowserError,
} = require('../deckCardBrowserDisplayState');

const {
  normalizeRequestId,
} = require('../deckCardBrowserRequestState');

test('buildDeckCardBrowserDisplayState makes replace failures retryable with applied search', () => {
  const state = buildDeckCardBrowserDisplayState({
    appliedSearchQuery: 'biology',
    loading: false,
    error: createDeckCardBrowserFailure({
      kind: DECK_CARD_BROWSER_ERROR_KINDS.REPLACE,
      message: 'Unable to load cards.',
      searchQuery: 'biology',
      requestId: 3,
    }),
  });

  assert.equal(state.showError, true);
  assert.equal(state.showLoadingStatus, false);
  assert.equal(state.errorKind, DECK_CARD_BROWSER_ERROR_KINDS.REPLACE);
  assert.equal(state.errorTitle, DECK_CARD_BROWSER_COPY.replaceErrorTitle);
  assert.equal(state.errorMessage, 'Unable to load cards.');
  assert.equal(state.retryButtonLabel, DECK_CARD_BROWSER_COPY.retry);
  assert.equal(state.retryDisabled, false);
  assert.deepEqual(state.retryRequest, {
    append: false,
    q: 'biology',
    cursor: null,
    requestId: null,
  });
});

test('replace retry controls are disabled with retrying copy while loading', () => {
  const state = buildDeckCardBrowserDisplayState({
    appliedSearchQuery: 'biology',
    loading: true,
    error: createDeckCardBrowserFailure({
      kind: DECK_CARD_BROWSER_ERROR_KINDS.REPLACE,
      message: 'Unable to load cards.',
      searchQuery: 'biology',
    }),
  });

  assert.equal(state.showError, true);
  assert.equal(state.showLoadingStatus, false);
  assert.equal(state.retryButtonLabel, DECK_CARD_BROWSER_COPY.retrying);
  assert.equal(state.retryDisabled, true);
});

test('loading status is shown only while no error live region is visible', () => {
  const state = buildDeckCardBrowserDisplayState({
    loading: true,
    error: '',
  });

  assert.equal(state.showError, false);
  assert.equal(state.showLoadingStatus, true);
  assert.equal(state.loadingText, DECK_CARD_BROWSER_COPY.loading);
});

test('append failures expose a dedicated retry request and hide the normal load-more action', () => {
  const cursor = {
    beforeCreatedAt: '2026-05-09T12:00:00.000Z',
    beforeId: 42,
  };
  const state = buildDeckCardBrowserDisplayState({
    cards: [{ id: 1 }],
    hasLoaded: true,
    appliedSearchQuery: 'science',
    browserRequestId: 5,
    nextCursor: cursor,
    error: createDeckCardBrowserFailure({
      kind: DECK_CARD_BROWSER_ERROR_KINDS.APPEND,
      message: 'Unable to load more cards.',
      searchQuery: 'science',
      cursor,
      requestId: 5,
    }),
  });

  assert.equal(state.showError, true);
  assert.equal(state.errorKind, DECK_CARD_BROWSER_ERROR_KINDS.APPEND);
  assert.equal(state.errorTitle, DECK_CARD_BROWSER_COPY.appendErrorTitle);
  assert.equal(state.errorMessage, 'Unable to load more cards.');
  assert.equal(state.retryButtonLabel, DECK_CARD_BROWSER_COPY.retryAppend);
  assert.equal(state.retryDisabled, false);
  assert.equal(state.showLoadMore, false);
  assert.deepEqual(state.retryRequest, {
    append: true,
    q: 'science',
    cursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '42',
    },
    requestId: 5,
  });
});

test('append retry controls are disabled with loading-more copy while retrying', () => {
  const state = buildDeckCardBrowserDisplayState({
    loadingMore: true,
    browserRequestId: 7,
    nextCursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '9',
    },
    error: createDeckCardBrowserFailure({
      kind: DECK_CARD_BROWSER_ERROR_KINDS.APPEND,
      message: 'Network error. Please try again.',
      searchQuery: 'math',
      cursor: {
        cursorCreatedAt: '2026-05-09T12:00:00.000Z',
        cursorId: '9',
      },
      requestId: 7,
    }),
  });

  assert.equal(state.retryButtonLabel, DECK_CARD_BROWSER_COPY.retryingAppend);
  assert.equal(state.retryDisabled, true);
  assert.equal(state.showLoadMore, false);
});

test('append retry falls back from invalid error request id to current browser request id', () => {
  const cursor = {
    cursorCreatedAt: '2026-05-09T12:00:00.000Z',
    cursorId: '9',
  };
  const state = buildDeckCardBrowserDisplayState({
    browserRequestId: 7,
    nextCursor: cursor,
    error: createDeckCardBrowserFailure({
      kind: DECK_CARD_BROWSER_ERROR_KINDS.APPEND,
      message: 'Unable to load more cards.',
      searchQuery: 'math',
      cursor,
      requestId: '7',
    }),
  });

  assert.equal(normalizeRequestId('7'), 0);
  assert.equal(normalizeDeckCardBrowserError({
    kind: DECK_CARD_BROWSER_ERROR_KINDS.APPEND,
    message: 'Unable to load more cards.',
    requestId: '7',
  }).requestId, 0);
  assert.deepEqual(state.retryRequest, {
    append: true,
    q: 'math',
    cursor,
    requestId: 7,
  });
});

test('normal load-more display remains available without append errors', () => {
  const state = buildDeckCardBrowserDisplayState({
    loadingMore: true,
    nextCursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '9',
    },
    error: '',
  });

  assert.equal(state.showError, false);
  assert.equal(state.showLoadMore, true);
  assert.equal(state.loadMoreButtonLabel, DECK_CARD_BROWSER_COPY.loadingMore);
});

test('legacy string errors normalize to replace failures', () => {
  const state = buildDeckCardBrowserDisplayState({
    appliedSearchQuery: 'history',
    error: '  Network error. Please try again.  ',
  });

  assert.deepEqual(normalizeDeckCardBrowserError('  Network error. Please try again.  '), {
    kind: DECK_CARD_BROWSER_ERROR_KINDS.REPLACE,
    message: 'Network error. Please try again.',
    searchQuery: '',
    cursor: null,
    requestId: 0,
  });
  assert.equal(state.errorKind, DECK_CARD_BROWSER_ERROR_KINDS.REPLACE);
  assert.equal(state.retryRequest.q, 'history');
});

test('createDeckCardBrowserFailure trims display fields and normalizes request ids', () => {
  assert.deepEqual(createDeckCardBrowserFailure({
    kind: 'unknown',
    message: '  Failed.  ',
    searchQuery: '  anatomy  ',
    cursor: {
      beforeCreatedAt: '2026-05-09T12:00:00.000Z',
      beforeId: 13,
    },
    requestId: '8',
  }), {
    kind: DECK_CARD_BROWSER_ERROR_KINDS.REPLACE,
    message: 'Failed.',
    searchQuery: 'anatomy',
    cursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '13',
    },
    requestId: 0,
  });
  assert.equal(normalizeRequestId(8), 8);
  assert.equal(normalizeRequestId('8'), 0);
  assert.equal(normalizeRequestId(''), 0);
  assert.equal(normalizeRequestId(Number.NaN), 0);
});
