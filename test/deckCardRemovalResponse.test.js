const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_DECK_CARD_REMOVAL_FAILURE_MESSAGE,
  MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR,
  getDeckCardRemovalFailureMessage,
  hasDeckCardRemovalSuccessPayload,
  parseDeckCardRemovalSuccessPayload,
} = require('../deckCardRemovalResponse');
const { MAX_CARD_CONTENT_LENGTH } = require('../cardContentValidation');

const VALID_NEXT_REVIEW = '2026-05-10T12:00:00.000Z';

function createValidRemovalPayload(cardOverrides = {}) {
  return {
    success: true,
    card: {
      id: 7,
      deck_id: 42,
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

function defineThrowingGetter(record, fieldName) {
  let getterCalls = 0;

  Object.defineProperty(record, fieldName, {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error(`${fieldName} getter should not run`);
    },
  });

  return () => getterCalls;
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

test('getDeckCardRemovalFailureMessage returns trimmed own string server errors', () => {
  assert.equal(
    getDeckCardRemovalFailureMessage({ error: '  Card already removed  ' }),
    'Card already removed',
  );

  const nullPrototypePayload = Object.create(null);
  nullPrototypePayload.error = '  Card belongs to another deck  ';

  assert.equal(
    getDeckCardRemovalFailureMessage(nullPrototypePayload),
    'Card belongs to another deck',
  );
});

test('getDeckCardRemovalFailureMessage ignores inherited server errors without invoking getters', () => {
  assert.equal(
    getDeckCardRemovalFailureMessage(Object.create({ error: 'Inherited error' })),
    DEFAULT_DECK_CARD_REMOVAL_FAILURE_MESSAGE,
  );

  const prototype = {};
  const getGetterCalls = defineThrowingGetter(prototype, 'error');

  assert.equal(
    getDeckCardRemovalFailureMessage(Object.create(prototype)),
    DEFAULT_DECK_CARD_REMOVAL_FAILURE_MESSAGE,
  );
  assert.equal(getGetterCalls(), 0);
});

test('getDeckCardRemovalFailureMessage ignores own accessor server errors without invoking getters', () => {
  const payload = {};
  const getGetterCalls = defineThrowingGetter(payload, 'error');

  assert.equal(
    getDeckCardRemovalFailureMessage(payload),
    DEFAULT_DECK_CARD_REMOVAL_FAILURE_MESSAGE,
  );
  assert.equal(getGetterCalls(), 0);
});

test('getDeckCardRemovalFailureMessage falls back for blank, missing, and non-string errors', () => {
  [
    undefined,
    null,
    {},
    { error: '' },
    { error: '   ' },
    { error: 404 },
    { error: { message: 'Card already removed' } },
  ].forEach((payload) => {
    assert.equal(
      getDeckCardRemovalFailureMessage(payload),
      DEFAULT_DECK_CARD_REMOVAL_FAILURE_MESSAGE,
    );
  });
});

test('getDeckCardRemovalFailureMessage uses a custom fallback for unusable server errors', () => {
  assert.equal(
    getDeckCardRemovalFailureMessage({ error: '   ' }, 'Could not remove card.'),
    'Could not remove card.',
  );
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

test('parseDeckCardRemovalSuccessPayload accepts matching expected deck ids', () => {
  const payload = createValidRemovalPayload({ deck_id: '00042' });

  assert.equal(parseDeckCardRemovalSuccessPayload(payload, { expectedDeckId: 42 }), payload);
  assert.equal(parseDeckCardRemovalSuccessPayload(payload, { expectedDeckId: '42' }), payload);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, { expectedDeckId: '42' }), true);
});

test('parseDeckCardRemovalSuccessPayload accepts null-prototype match options', () => {
  const payload = createValidRemovalPayload({ deck_id: '00042' });
  const options = Object.create(null);
  options.expectedId = '7';
  options.expectedDeckId = 42;

  assert.equal(parseDeckCardRemovalSuccessPayload(payload, options), payload);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, options), true);
});

test('parseDeckCardRemovalSuccessPayload ignores non-enumerable data and accessor match options without invoking getters', () => {
  const payload = createValidRemovalPayload();
  const options = {};
  let getterCalls = 0;

  Object.defineProperty(options, 'expectedId', {
    value: 8,
  });
  Object.defineProperty(options, 'expectedDeckId', {
    get() {
      getterCalls += 1;
      throw new Error('expectedDeckId getter should not run');
    },
  });

  assert.equal(parseDeckCardRemovalSuccessPayload(payload, options), payload);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, options), true);
  assert.equal(getterCalls, 0);
});

test('parseDeckCardRemovalSuccessPayload rejects accessor-backed match options without invoking getters', () => {
  const payload = createValidRemovalPayload();

  ['expectedId', 'expectedDeckId'].forEach((fieldName) => {
    const options = {};
    const getterCalls = defineThrowingGetter(options, fieldName);

    assertMalformed(payload, options);
    assert.equal(getterCalls(), 0);
  });
});

test('parseDeckCardRemovalSuccessPayload ignores inherited match options without invoking getters', () => {
  const payload = createValidRemovalPayload();
  const prototype = {};
  const expectedIdGetterCalls = defineThrowingGetter(prototype, 'expectedId');
  const expectedDeckIdGetterCalls = defineThrowingGetter(prototype, 'expectedDeckId');
  const options = Object.create(prototype);

  assert.equal(parseDeckCardRemovalSuccessPayload(payload, options), payload);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, options), true);
  assert.equal(expectedIdGetterCalls(), 0);
  assert.equal(expectedDeckIdGetterCalls(), 0);
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

test('parseDeckCardRemovalSuccessPayload rejects inherited and accessor-backed top-level fields without invoking getters', () => {
  const { card } = createValidRemovalPayload();

  [
    Object.assign(Object.create({ success: true }), { card }),
    Object.assign(Object.create({ card }), { success: true }),
  ].forEach(assertMalformed);

  const accessorSuccessPayload = { card };
  const ownSuccessGetterCalls = defineThrowingGetter(accessorSuccessPayload, 'success');
  assertMalformed(accessorSuccessPayload);
  assert.equal(ownSuccessGetterCalls(), 0);

  const accessorCardPayload = { success: true };
  const ownCardGetterCalls = defineThrowingGetter(accessorCardPayload, 'card');
  assertMalformed(accessorCardPayload);
  assert.equal(ownCardGetterCalls(), 0);

  const successPrototype = {};
  const inheritedSuccessGetterCalls = defineThrowingGetter(successPrototype, 'success');
  const inheritedSuccessPayload = Object.assign(Object.create(successPrototype), { card });
  assertMalformed(inheritedSuccessPayload);
  assert.equal(inheritedSuccessGetterCalls(), 0);

  const cardPrototype = {};
  const inheritedCardGetterCalls = defineThrowingGetter(cardPrototype, 'card');
  const inheritedCardPayload = Object.assign(Object.create(cardPrototype), { success: true });
  assertMalformed(inheritedCardPayload);
  assert.equal(inheritedCardGetterCalls(), 0);
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

test('parseDeckCardRemovalSuccessPayload rejects deleted card text outside the shared safe-text contract', () => {
  [
    createValidRemovalPayload({ front_content: 'Front\u0000' }),
    createValidRemovalPayload({ back_content: 'Back\u0000' }),
    createValidRemovalPayload({ front_content: 'Front\u202E' }),
    createValidRemovalPayload({ back_content: 'Back\u200B' }),
    createValidRemovalPayload({ front_content: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1) }),
    createValidRemovalPayload({ back_content: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1) }),
  ].forEach(assertMalformed);
});

test('parseDeckCardRemovalSuccessPayload rejects a deleted card with the wrong expected id', () => {
  const payload = createValidRemovalPayload({ id: 8 });

  assertMalformed(payload, { expectedId: 7 });
  assertMalformed(payload, { expectedId: '7' });
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, { expectedId: 7 }), false);
  assert.equal(hasDeckCardRemovalSuccessPayload(payload, { expectedId: '7' }), false);
});

test('parseDeckCardRemovalSuccessPayload rejects missing or mismatched expected deck ids', () => {
  [
    createValidRemovalPayload({ deck_id: undefined }),
    createValidRemovalPayload({ deck_id: 41 }),
    createValidRemovalPayload({ deck_id: 'deck-42' }),
    createValidRemovalPayload({ deck_id: 0 }),
  ].forEach((payload) => {
    assertMalformed(payload, { expectedDeckId: 42 });
    assert.equal(hasDeckCardRemovalSuccessPayload(payload, { expectedDeckId: 42 }), false);
  });
});
