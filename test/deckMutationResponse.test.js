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

function createValidDeckPayload(overrides = {}) {
  return {
    id: 7,
    user_id: 1,
    name: 'Biology',
    description: null,
    created_at: '2026-05-10T12:00:00.000Z',
    ...overrides,
  };
}

function createPayloadWithAccessorField(fieldName) {
  const payload = createValidDeckPayload();
  let getterCalls = 0;

  Object.defineProperty(payload, fieldName, {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error(`${fieldName} getter should not run`);
    },
  });

  return {
    payload,
    getGetterCalls: () => getterCalls,
  };
}

function createPayloadWithPrototypeField(fieldName) {
  const prototype = {};
  let getterCalls = 0;

  Object.defineProperty(prototype, fieldName, {
    get() {
      getterCalls += 1;
      throw new Error(`prototype ${fieldName} getter should not run`);
    },
  });

  const payload = { ...createValidDeckPayload() };
  Object.setPrototypeOf(payload, prototype);
  delete payload[fieldName];

  return {
    payload,
    getGetterCalls: () => getterCalls,
  };
}

test('parseDeckMutationResponsePayload preserves valid deck rows and extra fields', () => {
  const payload = createValidDeckPayload({
    id: '42',
    user_id: '1',
    name: 'Spanish',
    description: 'Language study',
    totalCards: 12,
    dueCards: 3,
    updated_at: '2026-05-10T12:30:00.000Z',
  });

  const parsed = parseDeckMutationResponsePayload(payload);

  assert.equal(parsed, payload);
  assert.deepEqual(parsed, payload);
  assert.equal(hasDeckMutationResponsePayload(payload), true);
});

test('parseDeckMutationResponsePayload accepts null-prototype responses with own data fields', () => {
  const payload = Object.assign(Object.create(null), createValidDeckPayload({
    id: '42',
    user_id: '1',
    name: 'Spanish',
    description: 'Language study',
  }));

  assert.equal(parseDeckMutationResponsePayload(payload), payload);
  assert.equal(hasDeckMutationResponsePayload(payload), true);
});

test('parseDeckMutationResponsePayload accepts numeric ids', () => {
  const payload = createValidDeckPayload({
    id: 7,
    name: 'Biology',
  });

  assert.equal(parseDeckMutationResponsePayload(payload), payload);
  assert.equal(parseDeckMutationResponsePayload(payload, { expectedId: '7' }), payload);
  assert.equal(hasDeckMutationResponsePayload(payload), true);
  assert.equal(hasDeckMutationResponsePayload(payload, { expectedId: '7' }), true);
});

test('parseDeckMutationResponsePayload compares expected ids with route-safe normalization', () => {
  [7, '7'].forEach((id) => {
    const payload = createValidDeckPayload({
      id,
      name: 'Biology',
    });

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
    const payload = createValidDeckPayload({
      id,
      name: `Deck ${id}`,
    });

    assert.equal(parseDeckMutationResponsePayload(payload), payload);
    assert.equal(parseDeckMutationResponsePayload(payload, { expectedId: String(id) }), payload);
    assert.equal(hasDeckMutationResponsePayload(payload), true);
    assert.equal(hasDeckMutationResponsePayload(payload, { expectedId: id }), true);
  });
});

test('parseDeckMutationResponsePayload accepts PostgreSQL SERIAL string id boundaries', () => {
  ['1', '2147483647'].forEach((id) => {
    const payload = createValidDeckPayload({
      id,
      name: 'Boundary deck',
    });

    assert.equal(parseDeckMutationResponsePayload(payload), payload);
    assert.equal(parseDeckMutationResponsePayload(payload, { expectedId: Number(id) }), payload);
    assert.equal(hasDeckMutationResponsePayload(payload), true);
    assert.equal(hasDeckMutationResponsePayload(payload, { expectedId: id }), true);
  });
});

test('parseDeckMutationResponsePayload accepts ISO timestamps without fractional seconds', () => {
  const payload = createValidDeckPayload({
    created_at: '2026-05-10T12:00:00Z',
  });

  assert.equal(parseDeckMutationResponsePayload(payload), payload);
  assert.equal(hasDeckMutationResponsePayload(payload), true);
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
    createValidDeckPayload({ name: undefined }),
    createValidDeckPayload({ name: null }),
    createValidDeckPayload({ name: '' }),
    createValidDeckPayload({ name: '  ' }),
    createValidDeckPayload({ name: 7 }),
    createValidDeckPayload({ name: [] }),
  ].forEach((payload) => {
    assertMalformed(payload);
    assert.equal(hasDeckMutationResponsePayload(payload), false);
  });
});

test('parseDeckMutationResponsePayload rejects missing or unusable owner ids', () => {
  [
    createValidDeckPayload({ user_id: undefined }),
    createValidDeckPayload({ user_id: null }),
    createValidDeckPayload({ user_id: '' }),
    createValidDeckPayload({ user_id: '  ' }),
    createValidDeckPayload({ user_id: 'user-1' }),
    createValidDeckPayload({ user_id: '0' }),
    createValidDeckPayload({ user_id: '-1' }),
    createValidDeckPayload({ user_id: '1.5' }),
    createValidDeckPayload({ user_id: '00042' }),
    createValidDeckPayload({ user_id: '2147483648' }),
    createValidDeckPayload({ user_id: 0 }),
    createValidDeckPayload({ user_id: -1 }),
    createValidDeckPayload({ user_id: 1.5 }),
    createValidDeckPayload({ user_id: Number.NaN }),
    createValidDeckPayload({ user_id: Number.POSITIVE_INFINITY }),
    createValidDeckPayload({ user_id: 2147483648 }),
    createValidDeckPayload({ user_id: {} }),
  ].forEach((payload) => {
    assertMalformed(payload);
    assert.equal(hasDeckMutationResponsePayload(payload), false);
  });
});

test('parseDeckMutationResponsePayload rejects malformed description fields', () => {
  [
    createValidDeckPayload({ description: undefined }),
    createValidDeckPayload({ description: 7 }),
    createValidDeckPayload({ description: [] }),
    createValidDeckPayload({ description: {} }),
    createValidDeckPayload({ description: false }),
  ].forEach((payload) => {
    assertMalformed(payload);
    assert.equal(hasDeckMutationResponsePayload(payload), false);
  });
});

test('parseDeckMutationResponsePayload rejects missing or invalid created timestamps', () => {
  [
    createValidDeckPayload({ created_at: undefined }),
    createValidDeckPayload({ created_at: null }),
    createValidDeckPayload({ created_at: '' }),
    createValidDeckPayload({ created_at: '  ' }),
    createValidDeckPayload({ created_at: 'not-a-date' }),
    createValidDeckPayload({ created_at: '2026-05-10' }),
    createValidDeckPayload({ created_at: '2026-05-10T12:00:00' }),
    createValidDeckPayload({ created_at: '2026-05-10T12:00:00.000Z ' }),
    createValidDeckPayload({ created_at: '2026-02-31T12:00:00.000Z' }),
    createValidDeckPayload({ created_at: 0 }),
    createValidDeckPayload({ created_at: new Date('2026-05-10T12:00:00.000Z') }),
    createValidDeckPayload({ created_at: ['2026-05-10T12:00:00.000Z'] }),
  ].forEach((payload) => {
    assertMalformed(payload);
    assert.equal(hasDeckMutationResponsePayload(payload), false);
  });
});

test('parseDeckMutationResponsePayload rejects accessor-backed fields without invoking getters', () => {
  [
    'id',
    'user_id',
    'name',
    'description',
    'created_at',
  ].forEach((fieldName) => {
    const { payload, getGetterCalls } = createPayloadWithAccessorField(fieldName);

    assert.equal(hasDeckMutationResponsePayload(payload), false);
    assertMalformed(payload);
    assert.equal(getGetterCalls(), 0);
  });
});

test('parseDeckMutationResponsePayload rejects prototype-backed fields without invoking getters', () => {
  [
    'id',
    'user_id',
    'name',
    'description',
    'created_at',
  ].forEach((fieldName) => {
    const { payload, getGetterCalls } = createPayloadWithPrototypeField(fieldName);

    assert.equal(hasDeckMutationResponsePayload(payload), false);
    assertMalformed(payload);
    assert.equal(getGetterCalls(), 0);
  });
});

test('parseDeckMutationResponsePayload rejects rows for a different expected deck id', () => {
  const payload = createValidDeckPayload({
    id: 8,
    name: 'History',
  });

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
