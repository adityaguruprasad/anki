const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR,
  hasDeckCardRemovalSuccessPayload,
  parseDeckCardRemovalSuccessPayload,
} = require('../deckCardRemovalResponse');

const VALID_NEXT_REVIEW = '2026-05-10T12:00:00.000Z';

function createValidRemovalPayload(cardOverrides = {}) {
  return {
    success: true,
    card: {
      id: 7,
      front_content: 'Front',
      back_content: 'Back',
      next_review: VALID_NEXT_REVIEW,
      ...cardOverrides,
    },
  };
}

function assertMalformed(payload, options) {
  assert.throws(
    () => parseDeckCardRemovalSuccessPayload(payload, options),
    { message: MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR },
  );
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, options), false);
}

test('parseDeckCardRemovalSuccessPayload preserves valid success payloads and extra fields', () => {
  const payload = {
    ...createValidRemovalPayload(),
    requestId: 'remove-card-1',
  };

  const parsed = parseDeckCardRemovalSuccessPayload(payload);

  assert.equal(parsed, payload);
  assert.deepEqual(parsed, payload);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload), true);
});

test('parseDeckCardRemovalSuccessPayload accepts null, past, and future next_review metadata', () => {
  [
    null,
    '2026-05-08T12:00:00.000Z',
    '2026-05-10T12:00:00.000Z',
  ].forEach((nextReview) => {
    const payload = createValidRemovalPayload({ next_review: nextReview });

    assert.equal(parseDeckCardRemovalSuccessPayload(payload), payload);
    assert.equal(hasDeckCardRemovalSuccessPayload(payload), true);
  });
});

test('parseDeckCardRemovalSuccessPayload rejects untrustworthy next_review metadata', () => {
  [
    {
      success: true,
      card: {
        id: 7,
        front_content: 'Front',
        back_content: 'Back',
      },
    },
    createValidRemovalPayload({ next_review: undefined }),
    createValidRemovalPayload({ next_review: '' }),
    createValidRemovalPayload({ next_review: '  ' }),
    createValidRemovalPayload({ next_review: 'not-a-date' }),
    createValidRemovalPayload({ next_review: '2026-05-10' }),
    createValidRemovalPayload({ next_review: '2026-05-10T12:00:00.000Z ' }),
    createValidRemovalPayload({ next_review: 0 }),
    createValidRemovalPayload({ next_review: false }),
    createValidRemovalPayload({ next_review: new Date(VALID_NEXT_REVIEW) }),
    createValidRemovalPayload({ next_review: ['2026-05-10T12:00:00.000Z'] }),
  ].forEach(assertMalformed);
});

test('parseDeckCardRemovalSuccessPayload accepts matching expected card ids', () => {
  const payload = createValidRemovalPayload();

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
  const { card } = createValidRemovalPayload();

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
    {
      success: true,
      card: {
        id: 7,
        front_content: 'Front',
        next_review: VALID_NEXT_REVIEW,
      },
    },
    createValidRemovalPayload({ id: '' }),
    createValidRemovalPayload({ id: 'card-7' }),
    createValidRemovalPayload({ id: '0' }),
    createValidRemovalPayload({ id: 0 }),
    createValidRemovalPayload({ id: -1 }),
    createValidRemovalPayload({ id: 1.5 }),
    createValidRemovalPayload({ front_content: 42 }),
    createValidRemovalPayload({ back_content: null }),
  ].forEach(assertMalformed);
});

test('parseDeckCardRemovalSuccessPayload rejects a deleted card with the wrong expected id', () => {
  const payload = createValidRemovalPayload({ id: 8 });

  assertMalformed(payload, { expectedId: 7 });
  assertMalformed(payload, { expectedId: '7' });
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, { expectedId: 7 }), false);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, { expectedId: '7' }), false);
});
