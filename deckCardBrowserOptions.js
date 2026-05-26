const {
  getOwnObjectLikePropertyDescriptor,
  isDataPropertyDescriptor,
} = require('./recordDataProperty');

function getDeckCardBrowserOptionDescriptor(options, key) {
  if (Array.isArray(options)) {
    return undefined;
  }

  return getOwnObjectLikePropertyDescriptor(options, key);
}

function hasDeckCardBrowserOption(options, key) {
  return isDataPropertyDescriptor(getDeckCardBrowserOptionDescriptor(options, key));
}

function getDeckCardBrowserOptionValue(options, key) {
  const descriptor = getDeckCardBrowserOptionDescriptor(options, key);
  return isDataPropertyDescriptor(descriptor) ? descriptor.value : undefined;
}

function getDeckCardBrowserFetchOptions(options = {}) {
  const cursor = getDeckCardBrowserOptionValue(options, 'cursor');
  const append = getDeckCardBrowserOptionValue(options, 'append');

  return {
    cursor: cursor === undefined ? null : cursor,
    append: append === undefined ? false : append,
    retry: getDeckCardBrowserOptionValue(options, 'retry'),
    hasExplicitQuery: hasDeckCardBrowserOption(options, 'q'),
    q: getDeckCardBrowserOptionValue(options, 'q'),
    requestId: getDeckCardBrowserOptionValue(options, 'requestId'),
  };
}

function getDeckCardBrowserCursorParamValue(cursor, preferredKey, fallbackKey) {
  const preferredDescriptor = getDeckCardBrowserOptionDescriptor(cursor, preferredKey);
  if (
    isDataPropertyDescriptor(preferredDescriptor)
    && preferredDescriptor.value !== null
    && preferredDescriptor.value !== undefined
  ) {
    return preferredDescriptor.value;
  }

  const fallbackDescriptor = getDeckCardBrowserOptionDescriptor(cursor, fallbackKey);
  return isDataPropertyDescriptor(fallbackDescriptor) ? fallbackDescriptor.value : undefined;
}

function getDeckCardBrowserCursorSearchParams(cursor) {
  return {
    cursorCreatedAt: getDeckCardBrowserCursorParamValue(
      cursor,
      'cursorCreatedAt',
      'beforeCreatedAt',
    ),
    cursorId: getDeckCardBrowserCursorParamValue(cursor, 'cursorId', 'beforeId'),
  };
}

function getDeckCardBrowserClearSearchQuery(clearSearchRequest = { q: '' }) {
  return getDeckCardBrowserOptionValue(clearSearchRequest, 'q') || '';
}

module.exports = {
  getDeckCardBrowserClearSearchQuery,
  getDeckCardBrowserCursorSearchParams,
  getDeckCardBrowserFetchOptions,
};
