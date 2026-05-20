const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_MUTATION_PAYLOAD_ERROR,
  hasDeckMutationResponsePayload,
  parseDeckMutationResponsePayload,
} = require('../deckMutationResponse');
const { getTableDefinition } = require('./schemaHelpers');

function assertMalformed(payload, options) {
  assert.throws(
    () => parseDeckMutationResponsePayload(payload, options),
    { message: MALFORMED_DECK_MUTATION_PAYLOAD_ERROR },
  );
}

test('parseDeckMutationResponsePayload preserves valid deck rows and extra fields', () => {
  const payload = {
    id: '42',
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

test('parseDeckMutationResponsePayload compares expected ids with route-safe normalization', () => {
  [7, '7'].forEach((id) => {
    const payload = {
      id,
      name: 'Biology',
    };

    ['7', ' 7 ', '0007', '\t0007\n', 7].forEach((expectedId) => {
      assert.equal(parseDeckMutationResponsePayload(payload, { expectedId }), payload);
      assert.equal(hasDeckMutationResponsePayload(payload, { expectedId }), true);
    });

    assertMalformed(payload, { expectedId: '0008' });
    assert.equal(hasDeckMutationResponsePayload(payload, { expectedId: '0008' }), false);
  });
});

test('parseDeckMutationResponsePayload accepts positive numeric id boundaries', () => {
  [1, 2147483647].forEach((id) => {
    const payload = {
      id,
      name: `Deck ${id}`,
    };

    assert.equal(parseDeckMutationResponsePayload(payload), payload);
    assert.equal(parseDeckMutationResponsePayload(payload, { expectedId: String(id) }), payload);
    assert.equal(hasDeckMutationResponsePayload(payload), true);
    assert.equal(hasDeckMutationResponsePayload(payload, { expectedId: id }), true);
  });
});

test('parseDeckMutationResponsePayload accepts PostgreSQL SERIAL string id boundaries', () => {
  ['1', '2147483647'].forEach((id) => {
    const payload = {
      id,
      name: 'Boundary deck',
    };

    assert.equal(parseDeckMutationResponsePayload(payload), payload);
    assert.equal(parseDeckMutationResponsePayload(payload, { expectedId: Number(id) }), payload);
    assert.equal(hasDeckMutationResponsePayload(payload), true);
    assert.equal(hasDeckMutationResponsePayload(payload, { expectedId: id }), true);
  });
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
    { id: ' 42 ', name: 'Math' },
    { id: 'deck-1', name: 'Math' },
    { id: '0', name: 'Math' },
    { id: '-1', name: 'Math' },
    { id: '1.5', name: 'Math' },
    { id: '00042', name: 'Math' },
    { id: '2147483648', name: 'Math' },
    { id: String(Number.MAX_SAFE_INTEGER), name: 'Math' },
    { id: 0, name: 'Math' },
    { id: -1, name: 'Math' },
    { id: 1.5, name: 'Math' },
    { id: Number.NaN, name: 'Math' },
    { id: Number.POSITIVE_INFINITY, name: 'Math' },
    { id: 2147483648, name: 'Math' },
    { id: Number.MAX_SAFE_INTEGER, name: 'Math' },
    { id: {}, name: 'Math' },
  ].forEach((payload) => {
    assertMalformed(payload);
    assert.equal(hasDeckMutationResponsePayload(payload), false);
  });
});

test('parseDeckMutationResponsePayload rejects unsafe numeric response ids', () => {
  [
    Number.MAX_SAFE_INTEGER + 1,
    Number.MAX_VALUE,
  ].forEach((id) => {
    const payload = {
      id,
      name: 'Math',
    };

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
  assert.equal(hasDeckMutationResponsePayload({ id: '007', name: 'History' }, { expectedId: 7 }), false);
});

test('parseDeckMutationResponsePayload rejects equal but unusable expected deck ids', () => {
  const payload = {
    id: 'deck-1',
    name: 'History',
  };

  assertMalformed(payload, { expectedId: 'deck-1' });
  assert.equal(hasDeckMutationResponsePayload(payload, { expectedId: 'deck-1' }), false);
});

test('deck mutation response id validation follows the backend schema contract', () => {
  assert.match(
    getTableDefinition('decks'),
    /\bid\s+SERIAL\s+PRIMARY\s+KEY\b/i,
    'Expected decks.id to be a numeric generated primary key',
  );
});
