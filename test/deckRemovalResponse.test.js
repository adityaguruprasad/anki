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

test('getDeckRemovalFailureMessage preserves existing non-OK error fallback behavior', () => {
  assert.equal(getDeckRemovalFailureMessage({ error: 'Deck not found' }), 'Deck not found');
  assert.equal(getDeckRemovalFailureMessage({ error: '  Deck not found  ' }), '  Deck not found  ');
  assert.equal(getDeckRemovalFailureMessage({ error: '' }), DECK_REMOVAL_MESSAGES.deleteFailed);
  assert.equal(getDeckRemovalFailureMessage({ error: '   ' }), DECK_REMOVAL_MESSAGES.deleteFailed);
  assert.equal(getDeckRemovalFailureMessage({}), DECK_REMOVAL_MESSAGES.deleteFailed);
  assert.equal(getDeckRemovalFailureMessage(null), DECK_REMOVAL_MESSAGES.deleteFailed);
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
