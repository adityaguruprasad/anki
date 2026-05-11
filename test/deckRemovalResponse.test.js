const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_REMOVAL_PAYLOAD_ERROR,
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
