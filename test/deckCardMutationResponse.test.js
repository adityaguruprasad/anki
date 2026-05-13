const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR,
  hasDeckCardMutationPayload,
  parseDeckCardMutationResponsePayload,
} = require('../deckCardMutationResponse');

const VALID_NEXT_REVIEW = '2026-05-10T12:00:00.000Z';

function createValidCardPayload(overrides = {}) {
  return {
    id: 7,
    front_content: 'Front',
    back_content: 'Back',
    next_review: VALID_NEXT_REVIEW,
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

test('parseDeckCardMutationResponsePayload preserves valid cards and extra fields', () => {
  const payload = {
    id: '0007',
    front_content: 'Front',
    back_content: 'Back',
    next_review: '2026-05-10T12:00:00.000Z',
    cursorCreatedAt: '2026-05-09T12:00:00.000Z',
    repetitions: 4,
  };

  const parsed = parseDeckCardMutationResponsePayload(payload);

  assert.equal(parsed, payload);
  assert.deepEqual(parsed, payload);
});

test('parseDeckCardMutationResponsePayload accepts numeric ids and blank string content', () => {
  const payload = createValidCardPayload({
    front_content: '',
    back_content: '  ',
  });

  assert.equal(parseDeckCardMutationResponsePayload(payload), payload);
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
    createValidCardPayload({ id: '9007199254740992' }),
    createValidCardPayload({ id: 0 }),
    createValidCardPayload({ id: -1 }),
    createValidCardPayload({ id: 1.5 }),
    createValidCardPayload({ id: Number.NaN }),
    createValidCardPayload({ id: Number.POSITIVE_INFINITY }),
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

test('hasDeckCardMutationPayload accepts only single-card mutation objects', () => {
  assert.equal(
    hasDeckCardMutationPayload(createValidCardPayload({ id: '1' })),
    true,
  );
  assert.equal(
    hasDeckCardMutationPayload(createValidCardPayload({ id: 1, front_content: '', back_content: '' })),
    true,
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
