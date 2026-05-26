const { normalizeRouteSafeCardId } = require('./cardIdentifier');
const { isSameIsoTimestampInstant, isValidIsoTimestamp } = require('./isoTimestampValidation');
const {
  getOwnDataPropertyDescriptor,
  getOwnDataPropertyValue,
  getOwnEnumerableDataProperties,
  getOwnRecordPropertyDescriptor,
  isDataPropertyDescriptor,
} = require('./recordDataProperty');

const INVALID_CURSOR_ALIAS = Symbol('invalidCursorAlias');

function normalizeDeckId(deckId) {
  return String(deckId);
}

function normalizeRequestId(requestId) {
  return typeof requestId === 'number' && Number.isFinite(requestId) ? requestId : 0;
}

function normalizeSearchQuery(searchQuery) {
  return typeof searchQuery === 'string' ? searchQuery.trim() : '';
}

function normalizeRequestEntry(entry) {
  if (entry && typeof entry === 'object') {
    return {
      requestId: normalizeRequestId(getOwnDataPropertyValue(entry, 'requestId')),
      searchQuery: normalizeSearchQuery(getOwnDataPropertyValue(entry, 'searchQuery')),
    };
  }

  return {
    requestId: normalizeRequestId(entry),
    searchQuery: '',
  };
}

function getLatestDeckCardBrowserRequest(requestState, deckId) {
  return normalizeRequestEntry(getOwnDataPropertyValue(requestState, normalizeDeckId(deckId)));
}

function getLatestDeckCardBrowserRequestId(requestState, deckId) {
  return getLatestDeckCardBrowserRequest(requestState, deckId).requestId;
}

function beginDeckCardBrowserReplaceRequest(requestState, deckId, options = {}) {
  const deckKey = normalizeDeckId(deckId);
  const searchQuery = getOwnDataPropertyValue(options, 'searchQuery');
  const requestId = getLatestDeckCardBrowserRequest(requestState, deckId).requestId + 1;
  const request = {
    requestId,
    searchQuery: normalizeSearchQuery(searchQuery),
  };

  return {
    requestId,
    request,
    requestState: {
      ...getOwnEnumerableDataProperties(requestState),
      [deckKey]: request,
    },
  };
}

function getOwnNullishCoalescedDataPropertyValue(record, preferredKey, fallbackKey) {
  const preferredDescriptor = getOwnRecordPropertyDescriptor(record, preferredKey);
  if (preferredDescriptor !== undefined) {
    if (!isDataPropertyDescriptor(preferredDescriptor)) {
      return INVALID_CURSOR_ALIAS;
    }

    if (preferredDescriptor.value !== null && preferredDescriptor.value !== undefined) {
      return preferredDescriptor.value;
    }
  }

  const fallbackDescriptor = getOwnRecordPropertyDescriptor(record, fallbackKey);
  if (fallbackDescriptor !== undefined) {
    return isDataPropertyDescriptor(fallbackDescriptor)
      ? fallbackDescriptor.value
      : INVALID_CURSOR_ALIAS;
  }

  return preferredDescriptor === undefined ? undefined : preferredDescriptor.value;
}

function normalizeCursor(cursor) {
  if (!cursor) {
    return null;
  }

  const cursorCreatedAt = getOwnNullishCoalescedDataPropertyValue(
    cursor,
    'cursorCreatedAt',
    'beforeCreatedAt',
  );
  const cursorId = getOwnNullishCoalescedDataPropertyValue(cursor, 'cursorId', 'beforeId');

  if (cursorCreatedAt === INVALID_CURSOR_ALIAS || cursorId === INVALID_CURSOR_ALIAS) {
    return null;
  }

  const normalizedCursorId = normalizeRouteSafeCardId(cursorId);

  if (!isValidIsoTimestamp(cursorCreatedAt) || normalizedCursorId === null) {
    return null;
  }

  return {
    cursorCreatedAt,
    cursorId: normalizedCursorId,
  };
}

function hasSameCursor(leftCursor, rightCursor) {
  const left = normalizeCursor(leftCursor);
  const right = normalizeCursor(rightCursor);

  if (!left || !right) {
    return left === right;
  }

  return (
    isSameIsoTimestampInstant(left.cursorCreatedAt, right.cursorCreatedAt)
    && left.cursorId === right.cursorId
  );
}

function createDeckCardBrowserAppendRequest(requestState, deckId, options = {}) {
  const requestId = getOwnDataPropertyValue(options, 'requestId');
  const searchQuery = getOwnDataPropertyValue(options, 'searchQuery');
  const cursor = getOwnDataPropertyValue(options, 'cursor');
  const latestRequest = getLatestDeckCardBrowserRequest(requestState, deckId);

  return {
    requestId: requestId === null || requestId === undefined
      ? latestRequest.requestId
      : normalizeRequestId(requestId),
    searchQuery: normalizeSearchQuery(searchQuery),
    cursor: normalizeCursor(cursor),
  };
}

function setDeckCardBrowserAppendRequest(appendRequestState, deckId, request) {
  return {
    ...getOwnEnumerableDataProperties(appendRequestState),
    [normalizeDeckId(deckId)]: request,
  };
}

function getOwnAppendRequestFields(request) {
  const requestIdDescriptor = getOwnDataPropertyDescriptor(request, 'requestId');
  const searchQueryDescriptor = getOwnDataPropertyDescriptor(request, 'searchQuery');
  const cursorDescriptor = getOwnDataPropertyDescriptor(request, 'cursor');

  if (
    requestIdDescriptor === undefined
    || searchQueryDescriptor === undefined
    || cursorDescriptor === undefined
  ) {
    return null;
  }

  return {
    requestId: requestIdDescriptor.value,
    searchQuery: searchQueryDescriptor.value,
    cursor: cursorDescriptor.value,
  };
}

function hasSameAppendRequest(leftRequest, rightRequest) {
  const left = getOwnAppendRequestFields(leftRequest);
  const right = getOwnAppendRequestFields(rightRequest);

  if (!left || !right) {
    return false;
  }

  return (
    left.requestId === right.requestId
    && left.searchQuery === right.searchQuery
    && hasSameCursor(left.cursor, right.cursor)
  );
}

function clearDeckCardBrowserAppendRequest(appendRequestState, deckId, request = null) {
  const deckKey = normalizeDeckId(deckId);
  const currentRequest = getOwnDataPropertyValue(appendRequestState, deckKey);

  if (request && !hasSameAppendRequest(currentRequest, request)) {
    return appendRequestState;
  }

  if (!currentRequest) {
    return appendRequestState;
  }

  const nextState = getOwnEnumerableDataProperties(appendRequestState);
  delete nextState[deckKey];
  return nextState;
}

function isLatestDeckCardBrowserReplaceRequest(requestState, deckId, requestId) {
  return getLatestDeckCardBrowserRequestId(requestState, deckId) === requestId;
}

function canStartDeckCardBrowserAppendRequest(requestState, appendRequestState, deckId, request) {
  const latestRequest = getLatestDeckCardBrowserRequest(requestState, deckId);
  const appendRequest = getOwnAppendRequestFields(request);

  // Short-circuit append requests whose cursor normalization failed.
  return (
    Boolean(appendRequest)
    && Boolean(appendRequest.cursor)
    && latestRequest.requestId === appendRequest.requestId
    && latestRequest.searchQuery === appendRequest.searchQuery
    && !getOwnDataPropertyValue(appendRequestState, normalizeDeckId(deckId))
  );
}

function canApplyDeckCardBrowserAppendResponse(
  requestState,
  appendRequestState,
  deckId,
  request,
) {
  const latestRequest = getLatestDeckCardBrowserRequest(requestState, deckId);
  const appendRequest = getOwnAppendRequestFields(request);

  return (
    Boolean(appendRequest?.cursor)
    && latestRequest.requestId === appendRequest.requestId
    && latestRequest.searchQuery === appendRequest.searchQuery
    && hasSameAppendRequest(
      getOwnDataPropertyValue(appendRequestState, normalizeDeckId(deckId)),
      request,
    )
  );
}

module.exports = {
  beginDeckCardBrowserReplaceRequest,
  canStartDeckCardBrowserAppendRequest,
  canApplyDeckCardBrowserAppendResponse,
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
};
