const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DECK_REMOVAL_COMPLETION_TYPES,
  DECK_REMOVAL_MESSAGES,
  MALFORMED_DECK_REMOVAL_PAYLOAD_ERROR,
  getDeckRemovalFailureMessage,
  getDeckRemovalResponseCompletion,
  hasDeckRemovalSuccessPayload,
  parseDeckRemovalSuccessPayload,
} = require('../deckRemovalResponse');

function assertMalformed(payload) {
  assert.throws(
    () => parseDeckRemovalSuccessPayload(payload),
    { message: MALFORMED_DECK_REMOVAL_PAYLOAD_ERROR },
  );
  assert.equal(hasDeckRemovalSuccessPayload(payload), false);
}

test('parseDeckRemovalSuccessPayload preserves valid success payloads and extra fields', () => {
  const payload = {
    success: true,
    requestId: 'delete-1',
  };

  const parsed = parseDeckRemovalSuccessPayload(payload);

  assert.equal(parsed, payload);
  assert.deepEqual(parsed, payload);
  assert.equal(hasDeckRemovalSuccessPayload(payload), true);
});

test('parseDeckRemovalSuccessPayload supports null-prototype success payloads', () => {
  const payload = Object.create(null);
  payload.success = true;
  payload.requestId = 'delete-1';

  const parsed = parseDeckRemovalSuccessPayload(payload);

  assert.equal(parsed, payload);
  assert.equal(parsed.requestId, 'delete-1');
  assert.equal(hasDeckRemovalSuccessPayload(payload), true);
});

test('parseDeckRemovalSuccessPayload rejects malformed top-level payloads', () => {
  [
    undefined,
    null,
    [],
    'true',
    1,
    true,
  ].forEach(assertMalformed);
});

test('parseDeckRemovalSuccessPayload rejects missing or non-true success values', () => {
  [
    {},
    { success: false },
    { success: 'true' },
    { success: 1 },
    { success: null },
    { success: [] },
  ].forEach(assertMalformed);
});

test('parseDeckRemovalSuccessPayload rejects inherited success fields without invoking prototype getters', () => {
  assertMalformed(Object.create({ success: true }));

  let getterCalls = 0;
  const prototype = {};
  Object.defineProperty(prototype, 'success', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });

  assertMalformed(Object.create(prototype));
  assert.equal(getterCalls, 0);
});

test('parseDeckRemovalSuccessPayload rejects accessor-backed success fields without invoking getters', () => {
  let getterCalls = 0;
  const payload = {};
  Object.defineProperty(payload, 'success', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return true;
    },
  });

  assertMalformed(payload);
  assert.equal(getterCalls, 0);
});

test('getDeckRemovalFailureMessage preserves existing non-OK error fallback behavior', () => {
  assert.equal(getDeckRemovalFailureMessage({ error: 'Deck not found' }), 'Deck not found');
  assert.equal(getDeckRemovalFailureMessage({ error: '  Deck not found  ' }), '  Deck not found  ');
  assert.equal(getDeckRemovalFailureMessage({ error: '' }), DECK_REMOVAL_MESSAGES.deleteFailed);
  assert.equal(getDeckRemovalFailureMessage({ error: '   ' }), DECK_REMOVAL_MESSAGES.deleteFailed);
  assert.equal(getDeckRemovalFailureMessage({}), DECK_REMOVAL_MESSAGES.deleteFailed);
  assert.equal(getDeckRemovalFailureMessage(null), DECK_REMOVAL_MESSAGES.deleteFailed);
});

test('getDeckRemovalFailureMessage supports null-prototype error payloads', () => {
  const payload = Object.create(null);
  payload.error = 'Deck not found';

  assert.equal(getDeckRemovalFailureMessage(payload), 'Deck not found');
});

test('getDeckRemovalFailureMessage falls back for malformed server error fields', () => {
  [
    { error: { message: 'Deck not found' } },
    { error: ['Deck not found'] },
    { error: 404 },
    { error: true },
  ].forEach((payload) => {
    assert.equal(getDeckRemovalFailureMessage(payload), DECK_REMOVAL_MESSAGES.deleteFailed);
  });
});

test('getDeckRemovalFailureMessage falls back for inherited error fields without invoking prototype getters', () => {
  assert.equal(
    getDeckRemovalFailureMessage(Object.create({ error: 'Deck not found' })),
    DECK_REMOVAL_MESSAGES.deleteFailed,
  );

  let getterCalls = 0;
  const prototype = {};
  Object.defineProperty(prototype, 'error', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'Deck not found';
    },
  });

  assert.equal(
    getDeckRemovalFailureMessage(Object.create(prototype)),
    DECK_REMOVAL_MESSAGES.deleteFailed,
  );
  assert.equal(getterCalls, 0);
});

test('getDeckRemovalFailureMessage falls back for accessor-backed error fields without invoking getters', () => {
  let getterCalls = 0;
  const payload = {};
  Object.defineProperty(payload, 'error', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'Deck not found';
    },
  });

  assert.equal(getDeckRemovalFailureMessage(payload), DECK_REMOVAL_MESSAGES.deleteFailed);
  assert.equal(getterCalls, 0);
});

test('deck-removal response completion ignores stale responses before parsing payloads', () => {
  let parseCalls = 0;
  const completion = getDeckRemovalResponseCompletion({
    isCurrent: false,
    responseOk: true,
    payload: { success: true },
    parseRemovalSuccess() {
      parseCalls += 1;
      return {};
    },
  });

  assert.deepEqual(completion, {
    type: DECK_REMOVAL_COMPLETION_TYPES.IGNORED,
    ignored: true,
  });
  assert.equal(parseCalls, 0);
});

test('deck-removal response completion preserves non-OK server error behavior', () => {
  let parseCalls = 0;
  const completion = getDeckRemovalResponseCompletion({
    isCurrent: true,
    responseOk: false,
    payload: { error: 'Deck not found' },
    parseRemovalSuccess() {
      parseCalls += 1;
      return {};
    },
  });

  assert.deepEqual(completion, {
    type: DECK_REMOVAL_COMPLETION_TYPES.SERVER_ERROR,
    ignored: false,
    error: 'Deck not found',
  });
  assert.equal(parseCalls, 0);
});

test('deck-removal response completion does not expose malformed server error payloads', () => {
  const completion = getDeckRemovalResponseCompletion({
    isCurrent: true,
    responseOk: false,
    payload: { error: { message: 'Deck not found' } },
  });

  assert.deepEqual(completion, {
    type: DECK_REMOVAL_COMPLETION_TYPES.SERVER_ERROR,
    ignored: false,
    error: DECK_REMOVAL_MESSAGES.deleteFailed,
  });
});

test('deck-removal response completion exposes only validated successful removal payloads', () => {
  const payload = { success: true };

  assert.deepEqual(
    getDeckRemovalResponseCompletion({
      isCurrent: true,
      responseOk: true,
      payload,
    }),
    {
      type: DECK_REMOVAL_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      removal: payload,
    },
  );
});

test('deck-removal response completion rejects malformed 2xx payloads before local mutation data exists', () => {
  const completion = getDeckRemovalResponseCompletion({
    isCurrent: true,
    responseOk: true,
    payload: { success: false },
  });

  assert.deepEqual(completion, {
    type: DECK_REMOVAL_COMPLETION_TYPES.INVALID_RESPONSE,
    ignored: false,
    error: DECK_REMOVAL_MESSAGES.deleteFailed,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(completion, 'removal'), false);
});
