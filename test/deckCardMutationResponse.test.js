const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR,
  hasDeckCardMutationPayload,
  parseDeckCardMutationResponsePayload,
} = require('../deckCardMutationResponse');
const { MAX_CARD_CONTENT_LENGTH } = require('../cardContentValidation');
const { MAX_POSTGRES_SERIAL_ID } = require('../cardIdentifier');

const VALID_NEXT_REVIEW = '2026-05-10T12:00:00.000Z';

function createValidCardPayload(overrides = {}) {
  return {
    id: 7,
    front_content: 'Front',
    back_content: 'Back',
    next_review: VALID_NEXT_REVIEW,
    interval: 1,
    ease_factor: 2.5,
    review_count: 0,
    ...overrides,
  };
}

function assertMalformed(payload, options) {
  assert.throws(
    () => parseDeckCardMutationResponsePayload(payload, options),
    new RegExp(MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR),
  );
  assert.equal(hasDeckCardMutationPayload(payload, options), false);
}

function createPayloadWithAccessorField(fieldName, overrides = {}) {
  const payload = createValidCardPayload(overrides);
  let getterCalls = 0;

  Object.defineProperty(payload, fieldName, {
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

function createPayloadWithPrototypeField(fieldName, overrides = {}) {
  const prototype = {};
  let getterCalls = 0;
  Object.defineProperty(prototype, fieldName, {
    get() {
      getterCalls += 1;
      throw new Error(`prototype ${fieldName} getter should not run`);
    },
  });

  const payload = { ...createValidCardPayload(overrides) };
  Object.setPrototypeOf(payload, prototype);
  delete payload[fieldName];

  return {
    payload,
    getGetterCalls: () => getterCalls,
  };
}

test('parseDeckCardMutationResponsePayload preserves valid cards and extra fields', () => {
  const payload = {
    id: '0007',
    front_content: 'Front',
    back_content: 'Back',
    next_review: '2026-05-10T12:00:00.000Z',
    interval: 1,
    ease_factor: 2.5,
    review_count: 0,
    cursorCreatedAt: '2026-05-09T12:00:00.000Z',
    repetitions: 4,
  };

  const parsed = parseDeckCardMutationResponsePayload(payload);

  assert.equal(parsed, payload);
  assert.deepEqual(parsed, payload);
});

test('parseDeckCardMutationResponsePayload accepts numeric ids and non-blank string content', () => {
  const payload = createValidCardPayload({
    id: 7,
    front_content: '  Front  ',
    back_content: '\nBack\t',
  });

  assert.equal(parseDeckCardMutationResponsePayload(payload), payload);
});

test('parseDeckCardMutationResponsePayload accepts null-prototype payloads with own data fields', () => {
  const payload = Object.assign(Object.create(null), createValidCardPayload({
    deck_id: '42',
  }));

  assert.equal(parseDeckCardMutationResponsePayload(payload, { expectedDeckId: 42 }), payload);
  assert.equal(hasDeckCardMutationPayload(payload, { expectedDeckId: 42 }), true);
});

test('parseDeckCardMutationResponsePayload accepts PostgreSQL SERIAL id boundaries', () => {
  [
    MAX_POSTGRES_SERIAL_ID,
    String(MAX_POSTGRES_SERIAL_ID),
    `000${MAX_POSTGRES_SERIAL_ID}`,
  ].forEach((id) => {
    const payload = createValidCardPayload({ id });

    assert.equal(parseDeckCardMutationResponsePayload(payload), payload);
    assert.equal(hasDeckCardMutationPayload(payload), true);
  });
});

test('parseDeckCardMutationResponsePayload accepts matching expected card ids', () => {
  const payload = createValidCardPayload({
    id: '0007',
  });

  assert.equal(parseDeckCardMutationResponsePayload(payload, { expectedId: 7 }), payload);
  assert.equal(parseDeckCardMutationResponsePayload(payload, { expectedId: '7' }), payload);
  assert.equal(parseDeckCardMutationResponsePayload(payload, { expectedId: ' 0007 ' }), payload);
  assert.equal(hasDeckCardMutationPayload(payload, { expectedId: '7' }), true);
});

test('parseDeckCardMutationResponsePayload accepts matching expected deck ids', () => {
  const payload = createValidCardPayload({
    deck_id: '00042',
  });

  assert.equal(parseDeckCardMutationResponsePayload(payload, { expectedDeckId: 42 }), payload);
  assert.equal(parseDeckCardMutationResponsePayload(payload, { expectedDeckId: '42' }), payload);
  assert.equal(parseDeckCardMutationResponsePayload(payload, { expectedDeckId: ' 00042 ' }), payload);
  assert.equal(hasDeckCardMutationPayload(payload, { expectedDeckId: 42 }), true);
});

test('parseDeckCardMutationResponsePayload rejects malformed top-level payloads', () => {
  [
    undefined,
    null,
    [],
    'card',
    7,
    true,
  ].forEach(assertMalformed);
});

test('parseDeckCardMutationResponsePayload rejects missing or unusable card ids', () => {
  [
    {},
    createValidCardPayload({ id: null }),
    createValidCardPayload({ id: '' }),
    createValidCardPayload({ id: '  ' }),
    createValidCardPayload({ id: 'card-1' }),
    createValidCardPayload({ id: '0' }),
    createValidCardPayload({ id: '-1' }),
    createValidCardPayload({ id: '1.5' }),
    createValidCardPayload({ id: String(MAX_POSTGRES_SERIAL_ID + 1) }),
    createValidCardPayload({ id: '9007199254740992' }),
    createValidCardPayload({ id: 0 }),
    createValidCardPayload({ id: -1 }),
    createValidCardPayload({ id: 1.5 }),
    createValidCardPayload({ id: Number.NaN }),
    createValidCardPayload({ id: Number.POSITIVE_INFINITY }),
    createValidCardPayload({ id: MAX_POSTGRES_SERIAL_ID + 1 }),
    createValidCardPayload({ id: Number.MAX_SAFE_INTEGER }),
    createValidCardPayload({ id: Number.MAX_SAFE_INTEGER + 1 }),
    createValidCardPayload({ id: {} }),
  ].forEach(assertMalformed);
});

test('parseDeckCardMutationResponsePayload rejects missing or non-string card content fields', () => {
  [
    { id: 1, back_content: 'Back', next_review: VALID_NEXT_REVIEW },
    { id: 1, front_content: 'Front', next_review: VALID_NEXT_REVIEW },
    createValidCardPayload({ id: 1, front_content: null }),
    createValidCardPayload({ id: 1, back_content: null }),
    createValidCardPayload({ id: 1, front_content: 7 }),
    createValidCardPayload({ id: 1, back_content: 7 }),
    createValidCardPayload({ id: 1, front_content: ['Front'] }),
    createValidCardPayload({ id: 1, back_content: ['Back'] }),
  ].forEach(assertMalformed);
});

test('parseDeckCardMutationResponsePayload rejects blank card content fields', () => {
  [
    createValidCardPayload({ id: 1, front_content: '' }),
    createValidCardPayload({ id: 1, front_content: '  ' }),
    createValidCardPayload({ id: 1, front_content: '\n\t' }),
    createValidCardPayload({ id: 1, back_content: '' }),
    createValidCardPayload({ id: 1, back_content: '  ' }),
    createValidCardPayload({ id: 1, back_content: '\n\t' }),
  ].forEach(assertMalformed);
});

test('parseDeckCardMutationResponsePayload rejects content outside the shared safe-text contract', () => {
  [
    createValidCardPayload({ id: 1, front_content: 'Front\u0000' }),
    createValidCardPayload({ id: 1, back_content: 'Back\u0000' }),
    createValidCardPayload({ id: 1, front_content: 'Question\u202E1' }),
    createValidCardPayload({ id: 1, back_content: 'Answer\u200B1' }),
    createValidCardPayload({ id: 1, front_content: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1) }),
    createValidCardPayload({ id: 1, back_content: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1) }),
  ].forEach(assertMalformed);
});

test('parseDeckCardMutationResponsePayload requires trustworthy next_review metadata', () => {
  [
    { id: 1, front_content: 'Front', back_content: 'Back' },
    createValidCardPayload({ id: 1, next_review: undefined }),
    createValidCardPayload({ id: 1, next_review: '' }),
    createValidCardPayload({ id: 1, next_review: '  ' }),
    createValidCardPayload({ id: 1, next_review: 'not-a-date' }),
    createValidCardPayload({ id: 1, next_review: '2026-05-10' }),
    createValidCardPayload({ id: 1, next_review: '2026-05-10T12:00:00.000Z ' }),
    createValidCardPayload({ id: 1, next_review: 0 }),
    createValidCardPayload({ id: 1, next_review: false }),
    createValidCardPayload({ id: 1, next_review: new Date(VALID_NEXT_REVIEW) }),
    createValidCardPayload({ id: 1, next_review: ['2026-05-10T12:00:00.000Z'] }),
  ].forEach(assertMalformed);
});

test('parseDeckCardMutationResponsePayload accepts null, past, and future next_review metadata', () => {
  [
    null,
    '2026-05-08T12:00:00.000Z',
    '2026-05-10T12:00:00.000Z',
  ].forEach((nextReview) => {
    const payload = createValidCardPayload({ next_review: nextReview });

    assert.equal(parseDeckCardMutationResponsePayload(payload), payload);
    assert.equal(hasDeckCardMutationPayload(payload), true);
  });
});

test('parseDeckCardMutationResponsePayload requires trustworthy scheduling metadata', () => {
  [
    { id: 1, front_content: 'Front', back_content: 'Back', next_review: VALID_NEXT_REVIEW },
    createValidCardPayload({ interval: undefined }),
    createValidCardPayload({ interval: 0 }),
    createValidCardPayload({ interval: 36501 }),
    createValidCardPayload({ interval: 1.5 }),
    createValidCardPayload({ interval: '1' }),
    createValidCardPayload({ ease_factor: undefined }),
    createValidCardPayload({ ease_factor: 1.29 }),
    createValidCardPayload({ ease_factor: Number.NaN }),
    createValidCardPayload({ ease_factor: Number.POSITIVE_INFINITY }),
    createValidCardPayload({ ease_factor: '2.5' }),
    createValidCardPayload({ review_count: undefined }),
    createValidCardPayload({ review_count: -1 }),
    createValidCardPayload({ review_count: 1.5 }),
    createValidCardPayload({ review_count: '0' }),
  ].forEach(assertMalformed);
});

test('parseDeckCardMutationResponsePayload accepts scheduling metadata boundaries', () => {
  const payload = createValidCardPayload({
    interval: 36500,
    ease_factor: 1.3,
    review_count: Number.MAX_SAFE_INTEGER,
  });

  assert.equal(parseDeckCardMutationResponsePayload(payload), payload);
  assert.equal(hasDeckCardMutationPayload(payload), true);
});

test('parseDeckCardMutationResponsePayload rejects accessor-backed fields without invoking getters', () => {
  [
    ['id'],
    ['front_content'],
    ['back_content'],
    ['next_review'],
    ['interval'],
    ['ease_factor'],
    ['review_count'],
    ['deck_id', { deck_id: 42 }, { expectedDeckId: 42 }],
  ].forEach(([fieldName, overrides = {}, options]) => {
    const { payload, getGetterCalls } = createPayloadWithAccessorField(fieldName, overrides);

    assert.equal(hasDeckCardMutationPayload(payload, options), false);
    assert.throws(
      () => parseDeckCardMutationResponsePayload(payload, options),
      { message: MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR },
    );
    assert.equal(getGetterCalls(), 0);
  });
});

test('parseDeckCardMutationResponsePayload rejects prototype-backed fields without invoking getters', () => {
  [
    ['id'],
    ['front_content'],
    ['back_content'],
    ['next_review'],
    ['interval'],
    ['ease_factor'],
    ['review_count'],
    ['deck_id', { deck_id: 42 }, { expectedDeckId: 42 }],
  ].forEach(([fieldName, overrides = {}, options]) => {
    const { payload, getGetterCalls } = createPayloadWithPrototypeField(fieldName, overrides);

    assert.equal(hasDeckCardMutationPayload(payload, options), false);
    assert.throws(
      () => parseDeckCardMutationResponsePayload(payload, options),
      { message: MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR },
    );
    assert.equal(getGetterCalls(), 0);
  });
});

test('hasDeckCardMutationPayload can opt out of scheduling metadata for smaller card contracts', () => {
  const payload = {
    id: 7,
    front_content: 'Front',
    back_content: 'Back',
    next_review: VALID_NEXT_REVIEW,
  };

  assert.equal(hasDeckCardMutationPayload(payload), false);
  assert.equal(hasDeckCardMutationPayload(payload, { requireSchedulingMetadata: false }), true);
});

test('hasDeckCardMutationPayload accepts only single-card mutation objects', () => {
  assert.equal(
    hasDeckCardMutationPayload(createValidCardPayload({ id: '1' })),
    true,
  );
  assert.equal(
    hasDeckCardMutationPayload(createValidCardPayload({ id: 1, front_content: '', back_content: '' })),
    false,
  );
  assert.equal(hasDeckCardMutationPayload(null), false);
  assert.equal(hasDeckCardMutationPayload([]), false);
  assert.equal(
    hasDeckCardMutationPayload(createValidCardPayload({ id: '' })),
    false,
  );
  assert.equal(
    hasDeckCardMutationPayload(createValidCardPayload({ id: 'card-1' })),
    false,
  );
  assert.equal(
    hasDeckCardMutationPayload(createValidCardPayload({ id: 1, back_content: undefined })),
    false,
  );
  assert.equal(
    hasDeckCardMutationPayload({ id: 1, front_content: 'Front', back_content: 'Back' }),
    false,
  );
});

test('parseDeckCardMutationResponsePayload rejects responses for a different expected card id', () => {
  const payload = createValidCardPayload({
    id: 8,
  });

  assertMalformed(payload, { expectedId: 7 });
  assertMalformed(payload, { expectedId: '7' });
  assert.equal(hasDeckCardMutationPayload(payload, { expectedId: 7 }), false);
  assert.equal(hasDeckCardMutationPayload(payload, { expectedId: '7' }), false);
  assert.equal(hasDeckCardMutationPayload({ ...payload, id: 7 }, { expectedId: null }), false);
});

test('parseDeckCardMutationResponsePayload rejects missing or mismatched expected deck ids', () => {
  [
    createValidCardPayload(),
    createValidCardPayload({ deck_id: 8 }),
    createValidCardPayload({ deck_id: 'deck-7' }),
    createValidCardPayload({ deck_id: 0 }),
    createValidCardPayload({ deck_id: MAX_POSTGRES_SERIAL_ID + 1 }),
  ].forEach((payload) => {
    assertMalformed(payload, { expectedDeckId: 7 });
    assert.equal(hasDeckCardMutationPayload(payload, { expectedDeckId: 7 }), false);
  });

  assertMalformed(createValidCardPayload({ deck_id: 7 }), { expectedDeckId: null });
  assert.equal(
    hasDeckCardMutationPayload(createValidCardPayload({ deck_id: 7 }), { expectedDeckId: null }),
    false,
  );
});
