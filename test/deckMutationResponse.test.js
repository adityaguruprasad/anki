const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_MUTATION_PAYLOAD_ERROR,
  hasDeckMutationResponsePayload,
  parseDeckMutationResponsePayload,
} = require('../deckMutationResponse');

function assertMalformed(payload, options) {
  assert.throws(
    () => parseDeckMutationResponsePayload(payload, options),
    { message: MALFORMED_DECK_MUTATION_PAYLOAD_ERROR },
  );
}

test('parseDeckMutationResponsePayload preserves valid deck rows and extra fields', () => {
  const payload = {
    id: 'deck-1',
    name: 'Spanish',
    totalCards: 12,
    dueCards: 3,
    created_at: '2026-05-10T12:00:00.000Z',
    updated_at: '2026-05-10T12:30:00.000Z',
  };

  const parsed = parseDeckMutationResponsePayload(payload);

  assert.equal(parsed, payload);
  assert.deepEqual(parsed, payload);
  assert.equal(hasDeckMutationResponsePayload(payload), true);
});

test('parseDeckMutationResponsePayload accepts numeric ids', () => {
  const payload = {
    id: 7,
    name: 'Biology',
  };

  assert.equal(parseDeckMutationResponsePayload(payload), payload);
  assert.equal(parseDeckMutationResponsePayload(payload, { expectedId: '7' }), payload);
  assert.equal(hasDeckMutationResponsePayload(payload), true);
  assert.equal(hasDeckMutationResponsePayload(payload, { expectedId: '7' }), true);
});

test('parseDeckMutationResponsePayload rejects malformed top-level payloads', () => {
  [
    undefined,
    null,
    [],
    'deck',
    7,
    true,
  ].forEach((payload) => {
    assertMalformed(payload);
    assert.equal(hasDeckMutationResponsePayload(payload), false);
  });
});

test('parseDeckMutationResponsePayload rejects missing or unusable ids', () => {
  [
    {},
    { id: null, name: 'Math' },
    { id: '', name: 'Math' },
    { id: '  ', name: 'Math' },
    { id: Number.NaN, name: 'Math' },
    { id: Number.POSITIVE_INFINITY, name: 'Math' },
    { id: {}, name: 'Math' },
  ].forEach((payload) => {
    assertMalformed(payload);
    assert.equal(hasDeckMutationResponsePayload(payload), false);
  });
});

test('parseDeckMutationResponsePayload rejects missing or unusable names', () => {
  [
    { id: 1 },
    { id: 1, name: null },
    { id: 1, name: '' },
    { id: 1, name: '  ' },
    { id: 1, name: 7 },
    { id: 1, name: [] },
  ].forEach((payload) => {
    assertMalformed(payload);
    assert.equal(hasDeckMutationResponsePayload(payload), false);
  });
});

test('parseDeckMutationResponsePayload rejects rows for a different expected deck id', () => {
  const payload = {
    id: 8,
    name: 'History',
  };

  assertMalformed(payload, { expectedId: 7 });
  assert.equal(hasDeckMutationResponsePayload(payload, { expectedId: 7 }), false);
  assert.equal(hasDeckMutationResponsePayload({ id: 'null', name: 'History' }, { expectedId: null }), false);
});
