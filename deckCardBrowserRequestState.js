const { normalizeRouteSafeCardId } = require('./cardIdentifier');
const { isValidIsoTimestamp } = require('./isoTimestampValidation');

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
      requestId: normalizeRequestId(entry.requestId),
      searchQuery: normalizeSearchQuery(entry.searchQuery),
    };
  }

  return {
    requestId: normalizeRequestId(entry),
    searchQuery: '',
  };
}

function getLatestDeckCardBrowserRequest(requestState, deckId) {
  return normalizeRequestEntry(requestState[normalizeDeckId(deckId)]);
}

function getLatestDeckCardBrowserRequestId(requestState, deckId) {
  return getLatestDeckCardBrowserRequest(requestState, deckId).requestId;
}

function beginDeckCardBrowserReplaceRequest(requestState, deckId, { searchQuery = '' } = {}) {
  const deckKey = normalizeDeckId(deckId);
  const requestId = getLatestDeckCardBrowserRequest(requestState, deckId).requestId + 1;
  const request = {
    requestId,
    searchQuery: normalizeSearchQuery(searchQuery),
  };

  return {
    requestId,
    request,
    requestState: {
      ...requestState,
      [deckKey]: request,
    },
  };
}

function normalizeCursor(cursor) {
  if (!cursor) {
    return null;
  }

  const cursorCreatedAt = cursor.cursorCreatedAt ?? cursor.beforeCreatedAt;
  const cursorId = cursor.cursorId ?? cursor.beforeId;
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
    left.cursorCreatedAt === right.cursorCreatedAt
    && left.cursorId === right.cursorId
  );
}

function createDeckCardBrowserAppendRequest(requestState, deckId, {
  requestId = null,
  searchQuery,
  cursor,
}) {
  const latestRequest = getLatestDeckCardBrowserRequest(requestState, deckId);

  return {
    requestId: requestId === null ? latestRequest.requestId : normalizeRequestId(requestId),
    searchQuery: normalizeSearchQuery(searchQuery),
    cursor: normalizeCursor(cursor),
  };
}

function setDeckCardBrowserAppendRequest(appendRequestState, deckId, request) {
  return {
    ...appendRequestState,
    [normalizeDeckId(deckId)]: request,
  };
}

function hasSameAppendRequest(leftRequest, rightRequest) {
  if (!leftRequest || !rightRequest) {
    return false;
  }

  return (
    leftRequest.requestId === rightRequest.requestId
    && leftRequest.searchQuery === rightRequest.searchQuery
    && hasSameCursor(leftRequest.cursor, rightRequest.cursor)
  );
}

function clearDeckCardBrowserAppendRequest(appendRequestState, deckId, request = null) {
  const deckKey = normalizeDeckId(deckId);
  const currentRequest = appendRequestState[deckKey];

  if (request && !hasSameAppendRequest(currentRequest, request)) {
    return appendRequestState;
  }

  if (!currentRequest) {
    return appendRequestState;
  }

  const nextState = { ...appendRequestState };
  delete nextState[deckKey];
  return nextState;
}

function isLatestDeckCardBrowserReplaceRequest(requestState, deckId, requestId) {
  return getLatestDeckCardBrowserRequestId(requestState, deckId) === requestId;
}

function canStartDeckCardBrowserAppendRequest(requestState, appendRequestState, deckId, request) {
  const latestRequest = getLatestDeckCardBrowserRequest(requestState, deckId);

  // Short-circuit append requests whose cursor normalization failed.
  return (
    Boolean(request)
    && Boolean(request.cursor)
    && latestRequest.requestId === request.requestId
    && latestRequest.searchQuery === request.searchQuery
    && !appendRequestState[normalizeDeckId(deckId)]
  );
}

function canApplyDeckCardBrowserAppendResponse(
  requestState,
  appendRequestState,
  deckId,
  request,
) {
  const latestRequest = getLatestDeckCardBrowserRequest(requestState, deckId);

  return (
    Boolean(request?.cursor)
    && latestRequest.requestId === request.requestId
    && latestRequest.searchQuery === request.searchQuery
    && hasSameAppendRequest(appendRequestState[normalizeDeckId(deckId)], request)
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
