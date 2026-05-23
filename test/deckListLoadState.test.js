const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DECK_LIST_LOAD_MESSAGES,
  beginDeckListLoad,
  createDeckListLoadState,
  finishDeckListLoadFailure,
  finishDeckListSilentFailure,
  finishDeckListLoadSuccess,
  getDeckListLoadFailureMessage,
  isCurrentDeckListRequest,
} = require('../deckListLoadState');

test('createDeckListLoadState defaults to an idle successful state', () => {
  assert.deepEqual(createDeckListLoadState(), {
    loading: false,
    error: '',
  });
});

test('beginDeckListLoad clears previous errors while marking the deck list busy', () => {
  assert.deepEqual(beginDeckListLoad(), {
    loading: true,
    error: '',
  });
});

test('finishDeckListLoadSuccess clears loading and failure state', () => {
  assert.deepEqual(finishDeckListLoadSuccess(), {
    loading: false,
    error: '',
  });
});

test('finishDeckListLoadFailure records an actionable fallback when no message is usable', () => {
  assert.deepEqual(finishDeckListLoadFailure('   '), {
    loading: false,
    error: DECK_LIST_LOAD_MESSAGES.loadFailed,
  });
});

test('finishDeckListLoadFailure preserves a server-facing error message', () => {
  assert.deepEqual(finishDeckListLoadFailure('Deck service is unavailable.'), {
    loading: false,
    error: 'Deck service is unavailable.',
  });
});

test('finishDeckListSilentFailure clears prominent loading and error state', () => {
  assert.deepEqual(
    finishDeckListSilentFailure({
      loading: true,
      error: DECK_LIST_LOAD_MESSAGES.loadFailed,
    }),
    {
      loading: false,
      error: '',
    },
  );
});

test('getDeckListLoadFailureMessage surfaces non-2xx server errors when present', () => {
  assert.equal(
    getDeckListLoadFailureMessage({ error: 'Please sign in again.' }),
    'Please sign in again.'
  );
});

test('getDeckListLoadFailureMessage surfaces null-prototype own data server errors', () => {
  const payload = Object.create(null);
  payload.error = 'Deck service is unavailable.';

  assert.equal(
    getDeckListLoadFailureMessage(payload),
    'Deck service is unavailable.',
  );
});

test('getDeckListLoadFailureMessage falls back for missing or blank server errors', () => {
  assert.equal(getDeckListLoadFailureMessage({}), DECK_LIST_LOAD_MESSAGES.loadFailed);
  assert.equal(getDeckListLoadFailureMessage({ error: '   ' }), DECK_LIST_LOAD_MESSAGES.loadFailed);
  assert.equal(getDeckListLoadFailureMessage(null), DECK_LIST_LOAD_MESSAGES.loadFailed);
});

test('getDeckListLoadFailureMessage ignores inherited server errors', () => {
  const payload = Object.create({ error: 'Inherited error should not surface.' });

  assert.equal(getDeckListLoadFailureMessage(payload), DECK_LIST_LOAD_MESSAGES.loadFailed);
});

test('getDeckListLoadFailureMessage ignores own accessor-backed server errors without calling getters', () => {
  let getterCalled = false;
  const payload = {};

  Object.defineProperty(payload, 'error', {
    get() {
      getterCalled = true;
      return 'Getter error should not surface.';
    },
  });

  assert.equal(getDeckListLoadFailureMessage(payload), DECK_LIST_LOAD_MESSAGES.loadFailed);
  assert.equal(getterCalled, false);
});

test('getDeckListLoadFailureMessage ignores inherited accessor-backed server errors without calling getters', () => {
  let getterCalled = false;
  const prototype = {};

  Object.defineProperty(prototype, 'error', {
    get() {
      getterCalled = true;
      return 'Inherited getter error should not surface.';
    },
  });

  const payload = Object.create(prototype);

  assert.equal(getDeckListLoadFailureMessage(payload), DECK_LIST_LOAD_MESSAGES.loadFailed);
  assert.equal(getterCalled, false);
});

test('getDeckListLoadFailureMessage falls back for array, function, and primitive payloads', () => {
  const arrayPayload = [];
  arrayPayload.error = 'Array error should not surface.';

  function functionPayload() {}
  functionPayload.error = 'Function error should not surface.';

  assert.equal(getDeckListLoadFailureMessage(arrayPayload), DECK_LIST_LOAD_MESSAGES.loadFailed);
  assert.equal(getDeckListLoadFailureMessage(functionPayload), DECK_LIST_LOAD_MESSAGES.loadFailed);
  assert.equal(getDeckListLoadFailureMessage('Primitive error'), DECK_LIST_LOAD_MESSAGES.loadFailed);
  assert.equal(getDeckListLoadFailureMessage(42), DECK_LIST_LOAD_MESSAGES.loadFailed);
  assert.equal(getDeckListLoadFailureMessage(true), DECK_LIST_LOAD_MESSAGES.loadFailed);
});

test('isCurrentDeckListRequest only accepts the mounted latest request', () => {
  const isMountedRef = { current: true };
  const requestIdRef = { current: 4 };

  assert.equal(
    isCurrentDeckListRequest({ isMountedRef, requestIdRef, requestId: 4 }),
    true,
  );
  assert.equal(
    isCurrentDeckListRequest({ isMountedRef, requestIdRef, requestId: 3 }),
    false,
  );
  assert.equal(
    isCurrentDeckListRequest({ isMountedRef: { current: false }, requestIdRef, requestId: 4 }),
    false,
  );
  assert.equal(isCurrentDeckListRequest({ requestIdRef, requestId: 4 }), false);
  assert.equal(isCurrentDeckListRequest({ isMountedRef, requestId: 4 }), false);
});
