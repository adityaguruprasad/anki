const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR,
  hasDeckCardMutationPayload,
  parseDeckCardMutationResponsePayload,
} = require('../deckCardMutationResponse');

function assertMalformed(payload) {
  assert.throws(
    () => parseDeckCardMutationResponsePayload(payload),
    new RegExp(MALFORMED_DECK_CARD_MUTATION_PAYLOAD_ERROR),
  );
}

test('parseDeckCardMutationResponsePayload preserves valid cards and extra fields', () => {
  const payload = {
    id: 'card-1',
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
  const payload = {
    id: 7,
    front_content: '',
    back_content: '  ',
  };

  assert.equal(parseDeckCardMutationResponsePayload(payload), payload);
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
    { id: null, front_content: 'Front', back_content: 'Back' },
    { id: '', front_content: 'Front', back_content: 'Back' },
    { id: '  ', front_content: 'Front', back_content: 'Back' },
    { id: Number.NaN, front_content: 'Front', back_content: 'Back' },
    { id: Number.POSITIVE_INFINITY, front_content: 'Front', back_content: 'Back' },
    { id: {}, front_content: 'Front', back_content: 'Back' },
  ].forEach(assertMalformed);
});

test('parseDeckCardMutationResponsePayload rejects missing or non-string card content fields', () => {
  [
    { id: 1, back_content: 'Back' },
    { id: 1, front_content: 'Front' },
    { id: 1, front_content: null, back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: null },
    { id: 1, front_content: 7, back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: 7 },
    { id: 1, front_content: ['Front'], back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: ['Back'] },
  ].forEach(assertMalformed);
});

test('hasDeckCardMutationPayload accepts only single-card mutation objects', () => {
  assert.equal(
    hasDeckCardMutationPayload({ id: '1', front_content: 'Front', back_content: 'Back' }),
    true,
  );
  assert.equal(
    hasDeckCardMutationPayload({ id: 1, front_content: '', back_content: '' }),
    true,
  );
  assert.equal(hasDeckCardMutationPayload(null), false);
  assert.equal(hasDeckCardMutationPayload([]), false);
  assert.equal(
    hasDeckCardMutationPayload({ id: '', front_content: 'Front', back_content: 'Back' }),
    false,
  );
  assert.equal(
    hasDeckCardMutationPayload({ id: 1, front_content: 'Front', back_content: undefined }),
    false,
  );
});
