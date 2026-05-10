const test = require('node:test');
const assert = require('node:assert/strict');

const {
  beginDeckCardBrowserReplaceRequest,
  canApplyDeckCardBrowserAppendResponse,
  canStartDeckCardBrowserAppendRequest,
  clearDeckCardBrowserAppendRequest,
  createDeckCardBrowserAppendRequest,
  getLatestDeckCardBrowserRequest,
  getLatestDeckCardBrowserRequestId,
  hasSameAppendRequest,
  normalizeCursor,
  normalizeSearchQuery,
  setDeckCardBrowserAppendRequest,
  isLatestDeckCardBrowserReplaceRequest,
} = require('../deckCardBrowserRequestState');

test('beginDeckCardBrowserReplaceRequest advances request ids per deck without mutating state', () => {
  const requestState = {};
  const first = beginDeckCardBrowserReplaceRequest(requestState, 2, { searchQuery: ' math ' });
  const second = beginDeckCardBrowserReplaceRequest(first.requestState, '2', { searchQuery: 'science' });
  const otherDeck = beginDeckCardBrowserReplaceRequest(second.requestState, 3);

  assert.deepEqual(requestState, {});
  assert.equal(first.requestId, 1);
  assert.equal(second.requestId, 2);
  assert.equal(otherDeck.requestId, 1);
  assert.deepEqual(otherDeck.requestState, {
    2: {
      requestId: 2,
      searchQuery: 'science',
    },
    3: {
      requestId: 1,
      searchQuery: '',
    },
  });
});

test('isLatestDeckCardBrowserReplaceRequest only accepts the newest replace request for a deck', () => {
  const first = beginDeckCardBrowserReplaceRequest({}, 4);
  const second = beginDeckCardBrowserReplaceRequest(first.requestState, 4);

  assert.equal(isLatestDeckCardBrowserReplaceRequest(second.requestState, 4, first.requestId), false);
  assert.equal(isLatestDeckCardBrowserReplaceRequest(second.requestState, 4, second.requestId), true);
  assert.equal(isLatestDeckCardBrowserReplaceRequest(second.requestState, 5, second.requestId), false);
});

test('createDeckCardBrowserAppendRequest scopes load-more requests to current replace id, query, and cursor', () => {
  const { requestState, requestId } = beginDeckCardBrowserReplaceRequest({}, 7, {
    searchQuery: 'front back',
  });
  const request = createDeckCardBrowserAppendRequest(requestState, '7', {
    requestId,
    searchQuery: '  front back  ',
    cursor: {
      beforeCreatedAt: '2026-05-09T12:00:00.000Z',
      beforeId: 42,
    },
  });

  assert.deepEqual(request, {
    requestId: 1,
    searchQuery: 'front back',
    cursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '42',
    },
  });
});

test('canStartDeckCardBrowserAppendRequest blocks stale rendered load-more requests', () => {
  const first = beginDeckCardBrowserReplaceRequest({}, 8, { searchQuery: 'biology' });
  const second = beginDeckCardBrowserReplaceRequest(first.requestState, 8, { searchQuery: 'biology' });
  const staleRequest = createDeckCardBrowserAppendRequest(second.requestState, 8, {
    requestId: first.requestId,
    searchQuery: 'biology',
    cursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '10',
    },
  });
  const currentRequest = createDeckCardBrowserAppendRequest(second.requestState, 8, {
    requestId: second.requestId,
    searchQuery: 'biology',
    cursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '10',
    },
  });
  const differentQuery = createDeckCardBrowserAppendRequest(second.requestState, 8, {
    requestId: second.requestId,
    searchQuery: 'chemistry',
    cursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '10',
    },
  });
  const appendRequestState = setDeckCardBrowserAppendRequest({}, 8, currentRequest);

  assert.equal(
    canStartDeckCardBrowserAppendRequest(second.requestState, {}, 8, staleRequest),
    false,
  );
  assert.equal(
    canStartDeckCardBrowserAppendRequest(second.requestState, {}, 8, differentQuery),
    false,
  );
  assert.equal(
    canStartDeckCardBrowserAppendRequest(second.requestState, {}, 8, currentRequest),
    true,
  );
  assert.equal(
    canStartDeckCardBrowserAppendRequest(second.requestState, appendRequestState, 8, currentRequest),
    false,
  );
});

test('canApplyDeckCardBrowserAppendResponse rejects stale replace ids and inactive append requests', () => {
  const first = beginDeckCardBrowserReplaceRequest({}, 9, { searchQuery: 'biology' });
  const request = createDeckCardBrowserAppendRequest(first.requestState, 9, {
    requestId: first.requestId,
    searchQuery: 'biology',
    cursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '10',
    },
  });
  const appendRequestState = setDeckCardBrowserAppendRequest({}, 9, request);
  const second = beginDeckCardBrowserReplaceRequest(first.requestState, 9, {
    searchQuery: 'chemistry',
  });

  assert.equal(
    canApplyDeckCardBrowserAppendResponse(first.requestState, appendRequestState, 9, request),
    true,
  );
  assert.equal(
    canApplyDeckCardBrowserAppendResponse(second.requestState, appendRequestState, 9, request),
    false,
  );
  assert.equal(
    canApplyDeckCardBrowserAppendResponse(first.requestState, {}, 9, request),
    false,
  );
});

test('clearDeckCardBrowserAppendRequest does not clear a newer active append request', () => {
  const { requestState, requestId } = beginDeckCardBrowserReplaceRequest({}, 10);
  const first = createDeckCardBrowserAppendRequest(requestState, 10, {
    requestId,
    searchQuery: '',
    cursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '10',
    },
  });
  const second = createDeckCardBrowserAppendRequest(requestState, 10, {
    requestId,
    searchQuery: '',
    cursor: {
      cursorCreatedAt: '2026-05-08T12:00:00.000Z',
      cursorId: '9',
    },
  });
  const appendRequestState = setDeckCardBrowserAppendRequest({}, 10, second);

  assert.equal(
    clearDeckCardBrowserAppendRequest(appendRequestState, 10, first),
    appendRequestState,
  );
  assert.deepEqual(clearDeckCardBrowserAppendRequest(appendRequestState, 10, second), {});
});

test('normalizers handle blank search queries and invalid cursors', () => {
  assert.equal(normalizeSearchQuery(null), '');
  assert.equal(normalizeSearchQuery('  math  '), 'math');
  assert.equal(normalizeCursor(null), null);
  assert.equal(normalizeCursor({ cursorCreatedAt: '', cursorId: 1 }), null);
  assert.equal(getLatestDeckCardBrowserRequestId({}, 10), 0);
  assert.deepEqual(getLatestDeckCardBrowserRequest({}, 10), {
    requestId: 0,
    searchQuery: '',
  });
  assert.equal(hasSameAppendRequest(null, null), false);
});
