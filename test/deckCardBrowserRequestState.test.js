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
  normalizeRequestId,
  normalizeSearchQuery,
  setDeckCardBrowserAppendRequest,
  isLatestDeckCardBrowserReplaceRequest,
} = require('../deckCardBrowserRequestState');
const { MAX_POSTGRES_SERIAL_ID } = require('../cardIdentifier');

function defineThrowingGetter(record, key, onCall) {
  Object.defineProperty(record, key, {
    enumerable: true,
    get() {
      onCall(key);
      throw new Error(`${key} getter should not run`);
    },
  });
}

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

test('request-state reads use own data properties without invoking getters', () => {
  const getterCalls = [];
  const accessorEntry = {};
  const accessorState = {};
  const inheritedEntry = Object.create({
    requestId: 9,
    searchQuery: 'inherited query',
  });
  const inheritedState = Object.create({
    12: {
      requestId: 8,
      searchQuery: 'inherited state',
    },
  });
  const copySource = { 11: { requestId: 3, searchQuery: 'math' } };

  defineThrowingGetter(accessorEntry, 'requestId', (key) => getterCalls.push(key));
  defineThrowingGetter(accessorEntry, 'searchQuery', (key) => getterCalls.push(key));
  Object.defineProperty(accessorState, '12', {
    enumerable: true,
    get() {
      getterCalls.push('12');
      throw new Error('state getter should not run');
    },
  });
  defineThrowingGetter(copySource, 'accessorCopy', (key) => getterCalls.push(key));

  assert.deepEqual(getLatestDeckCardBrowserRequest({ 12: accessorEntry }, 12), {
    requestId: 0,
    searchQuery: '',
  });
  assert.deepEqual(getLatestDeckCardBrowserRequest({ 12: inheritedEntry }, 12), {
    requestId: 0,
    searchQuery: '',
  });
  assert.deepEqual(getLatestDeckCardBrowserRequest(accessorState, 12), {
    requestId: 0,
    searchQuery: '',
  });
  assert.deepEqual(getLatestDeckCardBrowserRequest(inheritedState, 12), {
    requestId: 0,
    searchQuery: '',
  });

  const next = beginDeckCardBrowserReplaceRequest(copySource, 11, { searchQuery: 'science' });
  assert.equal(next.requestId, 4);
  assert.equal(Object.prototype.hasOwnProperty.call(next.requestState, 'accessorCopy'), false);
  assert.deepEqual(getterCalls, []);
});

test('request-state reads accept null-prototype state and entries', () => {
  const entry = Object.create(null);
  entry.requestId = 4;
  entry.searchQuery = '  math  ';

  const requestState = Object.create(null);
  requestState[13] = entry;

  assert.deepEqual(getLatestDeckCardBrowserRequest(requestState, 13), {
    requestId: 4,
    searchQuery: 'math',
  });

  const next = beginDeckCardBrowserReplaceRequest(requestState, 13, { searchQuery: 'science' });
  assert.equal(next.requestId, 5);
  assert.deepEqual(next.requestState[13], {
    requestId: 5,
    searchQuery: 'science',
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

test('normalizeCursor follows the server cursor timestamp and card-id contract', () => {
  assert.deepEqual(
    normalizeCursor({
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: ' 00042 ',
    }),
    {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '42',
    },
  );
  assert.deepEqual(
    normalizeCursor({
      beforeCreatedAt: '2026-05-09T12:00:00.123456Z',
      beforeId: MAX_POSTGRES_SERIAL_ID,
    }),
    {
      cursorCreatedAt: '2026-05-09T12:00:00.123456Z',
      cursorId: String(MAX_POSTGRES_SERIAL_ID),
    },
  );
  [
    { cursorCreatedAt: 'not-a-date', cursorId: 42 },
    { cursorCreatedAt: '2026-05-09', cursorId: 42 },
    { cursorCreatedAt: '2026-05-09T12:00:00.000Z ', cursorId: 42 },
    { cursorCreatedAt: '2026-05-09T12:00:00.000Z', cursorId: 0 },
    { cursorCreatedAt: '2026-05-09T12:00:00.000Z', cursorId: '-1' },
    { cursorCreatedAt: '2026-05-09T12:00:00.000Z', cursorId: '1.5' },
    { cursorCreatedAt: '2026-05-09T12:00:00.000Z', cursorId: 'card-42' },
    { cursorCreatedAt: '2026-05-09T12:00:00.000Z', cursorId: MAX_POSTGRES_SERIAL_ID + 1 },
  ].forEach((cursor) => {
    assert.equal(normalizeCursor(cursor), null, `Expected ${JSON.stringify(cursor)} to be rejected`);
  });
});

test('normalizeCursor reads only own data aliases without invoking getters', () => {
  const getterCalls = [];
  const accessorCursor = {
    beforeCreatedAt: '2026-05-09T12:00:00.000Z',
    beforeId: 42,
  };
  const accessorCursorId = {
    cursorCreatedAt: '2026-05-09T12:00:00.000Z',
    beforeId: 42,
  };
  const inheritedCursor = Object.create({
    cursorCreatedAt: '2026-05-09T12:00:00.000Z',
    cursorId: 42,
  });
  const nullPrototypeCursor = Object.create(null);

  defineThrowingGetter(accessorCursor, 'cursorCreatedAt', (key) => getterCalls.push(key));
  defineThrowingGetter(accessorCursor, 'cursorId', (key) => getterCalls.push(key));
  defineThrowingGetter(accessorCursorId, 'cursorId', (key) => getterCalls.push(key));
  nullPrototypeCursor.beforeCreatedAt = '2026-05-09T12:00:00.123456Z';
  nullPrototypeCursor.beforeId = '00042';

  assert.equal(normalizeCursor(accessorCursor), null);
  assert.equal(normalizeCursor(accessorCursorId), null);
  assert.equal(normalizeCursor(inheritedCursor), null);
  assert.deepEqual(normalizeCursor(nullPrototypeCursor), {
    cursorCreatedAt: '2026-05-09T12:00:00.123456Z',
    cursorId: '42',
  });
  assert.deepEqual(
    normalizeCursor({
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: 43,
      beforeCreatedAt: '2026-05-08T12:00:00.000Z',
      beforeId: 42,
    }),
    {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '43',
    },
  );
  assert.deepEqual(getterCalls, []);
});

test('canStartDeckCardBrowserAppendRequest blocks requests with malformed cursors', () => {
  const { requestState, requestId } = beginDeckCardBrowserReplaceRequest({}, 11, {
    searchQuery: 'biology',
  });
  const malformedCursorRequest = createDeckCardBrowserAppendRequest(requestState, 11, {
    requestId,
    searchQuery: 'biology',
    cursor: {
      cursorCreatedAt: 'not-a-date',
      cursorId: '10',
    },
  });

  assert.equal(malformedCursorRequest.cursor, null);
  assert.equal(
    canStartDeckCardBrowserAppendRequest(requestState, {}, 11, malformedCursorRequest),
    false,
  );
});

test('append request and state comparisons use own data properties without invoking getters', () => {
  const { requestState, requestId } = beginDeckCardBrowserReplaceRequest({}, 14, {
    searchQuery: 'biology',
  });
  const request = createDeckCardBrowserAppendRequest(requestState, 14, {
    requestId,
    searchQuery: 'biology',
    cursor: {
      cursorCreatedAt: '2026-05-09T12:00:00.000Z',
      cursorId: '10',
    },
  });
  const getterCalls = [];
  const accessorRequest = {};
  const inheritedRequest = Object.create(request);
  const accessorAppendState = {};
  const copySource = setDeckCardBrowserAppendRequest({}, 15, request);

  defineThrowingGetter(accessorRequest, 'requestId', (key) => getterCalls.push(key));
  defineThrowingGetter(accessorRequest, 'searchQuery', (key) => getterCalls.push(key));
  defineThrowingGetter(accessorRequest, 'cursor', (key) => getterCalls.push(key));
  Object.defineProperty(accessorAppendState, '14', {
    enumerable: true,
    get() {
      getterCalls.push('14');
      throw new Error('append-state getter should not run');
    },
  });
  defineThrowingGetter(copySource, 'accessorCopy', (key) => getterCalls.push(key));

  assert.deepEqual(createDeckCardBrowserAppendRequest(requestState, 14, accessorRequest), {
    requestId,
    searchQuery: '',
    cursor: null,
  });
  assert.equal(hasSameAppendRequest(accessorRequest, request), false);
  assert.equal(hasSameAppendRequest(inheritedRequest, request), false);
  assert.equal(
    canStartDeckCardBrowserAppendRequest(requestState, {}, 14, accessorRequest),
    false,
  );
  assert.equal(
    canStartDeckCardBrowserAppendRequest(requestState, {}, 14, inheritedRequest),
    false,
  );
  assert.equal(
    canApplyDeckCardBrowserAppendResponse(requestState, accessorAppendState, 14, request),
    false,
  );
  assert.equal(
    clearDeckCardBrowserAppendRequest(accessorAppendState, 14, request),
    accessorAppendState,
  );

  const nextAppendState = setDeckCardBrowserAppendRequest(copySource, 14, request);
  assert.equal(Object.prototype.hasOwnProperty.call(nextAppendState, 'accessorCopy'), false);
  assert.deepEqual(getterCalls, []);
});

test('append response matching accepts null-prototype append requests and state', () => {
  const { requestState, requestId } = beginDeckCardBrowserReplaceRequest({}, 16, {
    searchQuery: 'biology',
  });
  const request = Object.create(null);
  request.requestId = requestId;
  request.searchQuery = 'biology';
  request.cursor = {
    beforeCreatedAt: '2026-05-09T12:00:00.000Z',
    beforeId: '10',
  };

  const appendRequestState = Object.create(null);
  appendRequestState[16] = request;

  assert.equal(
    canStartDeckCardBrowserAppendRequest(requestState, Object.create(null), 16, request),
    true,
  );
  assert.equal(
    canApplyDeckCardBrowserAppendResponse(requestState, appendRequestState, 16, request),
    true,
  );
});

test('append response matching compares cursor timestamps by microsecond UTC instant', () => {
  const left = {
    requestId: 1,
    searchQuery: 'biology',
    cursor: {
      beforeCreatedAt: '2026-05-08T06:00:00.123-07:00',
      beforeId: '10',
    },
  };
  const equivalentRight = {
    requestId: 1,
    searchQuery: 'biology',
    cursor: {
      cursorCreatedAt: '2026-05-08T13:00:00.123000Z',
      cursorId: '10',
    },
  };
  const differentMicrosecondRight = {
    requestId: 1,
    searchQuery: 'biology',
    cursor: {
      cursorCreatedAt: '2026-05-08T13:00:00.123001Z',
      cursorId: '10',
    },
  };
  const { requestState } = beginDeckCardBrowserReplaceRequest({}, 17, {
    searchQuery: 'biology',
  });
  const appendRequestState = setDeckCardBrowserAppendRequest({}, 17, left);

  assert.equal(hasSameAppendRequest(left, equivalentRight), true);
  assert.equal(
    canApplyDeckCardBrowserAppendResponse(requestState, appendRequestState, 17, equivalentRight),
    true,
  );
  assert.equal(hasSameAppendRequest(left, differentMicrosecondRight), false);
  assert.equal(
    canApplyDeckCardBrowserAppendResponse(
      requestState,
      appendRequestState,
      17,
      differentMicrosecondRight,
    ),
    false,
  );
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
  assert.equal(normalizeRequestId(12), 12);
  assert.equal(normalizeRequestId('12'), 0);
  assert.equal(normalizeRequestId(''), 0);
  assert.equal(normalizeRequestId(Number.NaN), 0);
  assert.equal(getLatestDeckCardBrowserRequestId({}, 10), 0);
  assert.deepEqual(getLatestDeckCardBrowserRequest({}, 10), {
    requestId: 0,
    searchQuery: '',
  });
  assert.equal(hasSameAppendRequest(null, null), false);
});
