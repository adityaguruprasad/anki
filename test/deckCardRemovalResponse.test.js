const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR,
  hasDeckCardRemovalSuccessPayload,
  parseDeckCardRemovalSuccessPayload,
} = require('../deckCardRemovalResponse');

function assertMalformed(payload) {
  assert.throws(
    () => parseDeckCardRemovalSuccessPayload(payload),
    { message: MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR },
  );
  assert.equal(hasDeckCardRemovalSuccessPayload(payload), false);
}

test('parseDeckCardRemovalSuccessPayload preserves valid success payloads and extra fields', () => {
  const payload = {
    success: true,
    requestId: 'remove-card-1',
  };

  const parsed = parseDeckCardRemovalSuccessPayload(payload);

  assert.equal(parsed, payload);
  assert.deepEqual(parsed, payload);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload), true);
});

test('parseDeckCardRemovalSuccessPayload rejects malformed top-level payloads', () => {
  [
    undefined,
    null,
    [],
    'true',
    1,
    true,
  ].forEach(assertMalformed);
});

test('parseDeckCardRemovalSuccessPayload rejects missing or non-true success values', () => {
  [
    {},
    { success: false },
    { success: 'true' },
    { success: 1 },
    { success: null },
    { success: [] },
  ].forEach(assertMalformed);
});
