const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR,
  hasDeckCardRemovalSuccessPayload,
  parseDeckCardRemovalSuccessPayload,
} = require('../deckCardRemovalResponse');

function assertMalformed(payload, options) {
  assert.throws(
    () => parseDeckCardRemovalSuccessPayload(payload, options),
    { message: MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR },
  );
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, options), false);
}

test('parseDeckCardRemovalSuccessPayload preserves valid success payloads and extra fields', () => {
  const payload = {
    success: true,
    card: {
      id: 7,
      front_content: 'Front',
      back_content: 'Back',
      next_review: '2026-05-10T12:00:00.000Z',
    },
    requestId: 'remove-card-1',
  };

  const parsed = parseDeckCardRemovalSuccessPayload(payload);

  assert.equal(parsed, payload);
  assert.deepEqual(parsed, payload);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload), true);
});

test('parseDeckCardRemovalSuccessPayload accepts matching expected card ids', () => {
  const payload = {
    success: true,
    card: {
      id: 7,
      front_content: 'Front',
      back_content: 'Back',
    },
  };

  assert.equal(parseDeckCardRemovalSuccessPayload(payload, { expectedId: 7 }), payload);
  assert.equal(parseDeckCardRemovalSuccessPayload(payload, { expectedId: '7' }), payload);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, { expectedId: '7' }), true);
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
  const card = {
    id: 7,
    front_content: 'Front',
    back_content: 'Back',
  };

  [
    {},
    { success: false, card },
    { success: 'true', card },
    { success: 1, card },
    { success: null, card },
    { success: [], card },
  ].forEach(assertMalformed);
});

test('parseDeckCardRemovalSuccessPayload requires the authoritative deleted card payload', () => {
  [
    { success: true },
    { success: true, card: null },
    { success: true, card: [] },
    { success: true, card: { id: 7, front_content: 'Front' } },
    { success: true, card: { id: '', front_content: 'Front', back_content: 'Back' } },
    { success: true, card: { id: 'card-7', front_content: 'Front', back_content: 'Back' } },
    { success: true, card: { id: '0', front_content: 'Front', back_content: 'Back' } },
    { success: true, card: { id: 0, front_content: 'Front', back_content: 'Back' } },
    { success: true, card: { id: -1, front_content: 'Front', back_content: 'Back' } },
    { success: true, card: { id: 1.5, front_content: 'Front', back_content: 'Back' } },
    { success: true, card: { id: 7, front_content: 42, back_content: 'Back' } },
    { success: true, card: { id: 7, front_content: 'Front', back_content: null } },
  ].forEach(assertMalformed);
});

test('parseDeckCardRemovalSuccessPayload rejects a deleted card with the wrong expected id', () => {
  const payload = {
    success: true,
    card: {
      id: 8,
      front_content: 'Front',
      back_content: 'Back',
    },
  };

  assertMalformed(payload, { expectedId: 7 });
  assertMalformed(payload, { expectedId: '7' });
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, { expectedId: 7 }), false);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, { expectedId: '7' }), false);
});
