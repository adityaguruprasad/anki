const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DECK_CARD_BROWSE_FAILURE_MESSAGES,
  MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR,
  getDeckCardBrowseFailureMessage,
  hasDeckCardBrowseRowPayload,
  hasMatchingCursorFamilies,
  parseDeckCardBrowseResponsePayload,
} = require('../deckCardBrowseResponse');
const { MAX_CARD_CONTENT_LENGTH } = require('../cardContentValidation');
const { MAX_POSTGRES_SERIAL_ID } = require('../cardIdentifier');

function assertMalformed(payload, options) {
  assert.throws(
    () => parseDeckCardBrowseResponsePayload(payload, options),
    new RegExp(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR),
  );
}

function createAccessorPayload(fields) {
  const payload = {};
  const accessCounts = {};

  for (const [fieldName, value] of Object.entries(fields)) {
    accessCounts[fieldName] = 0;
    Object.defineProperty(payload, fieldName, {
      enumerable: true,
      get() {
        accessCounts[fieldName] += 1;
        return value;
      },
    });
  }

  return { payload, accessCounts };
}

function defineThrowingGetter(object, fieldName) {
  let accessCount = 0;

  Object.defineProperty(object, fieldName, {
    configurable: true,
    enumerable: true,
    get() {
      accessCount += 1;
      throw new Error(`${fieldName} getter should not run`);
    },
  });

  return () => accessCount;
}

test('getDeckCardBrowseFailureMessage surfaces own nonblank server errors', () => {
  const paddedError = '  Deck-card browser is unavailable.  ';

  assert.equal(
    getDeckCardBrowseFailureMessage({ error: 'Deck-card browser is unavailable.' }),
    'Deck-card browser is unavailable.',
  );
  assert.equal(
    getDeckCardBrowseFailureMessage({ error: paddedError }),
    paddedError,
  );
});

test('getDeckCardBrowseFailureMessage falls back for missing, non-string, and blank errors', () => {
  [
    {},
    { error: null },
    { error: 0 },
    { error: false },
    { error: { message: 'Nested error should not surface.' } },
    { error: '   ' },
    null,
  ].forEach((payload) => {
    assert.equal(
      getDeckCardBrowseFailureMessage(payload),
      DECK_CARD_BROWSE_FAILURE_MESSAGES.loadFailed,
    );
  });

  assert.equal(
    getDeckCardBrowseFailureMessage({}, { append: true }),
    DECK_CARD_BROWSE_FAILURE_MESSAGES.loadMoreFailed,
  );
  assert.equal(
    getDeckCardBrowseFailureMessage({ error: '   ' }, { append: true }),
    DECK_CARD_BROWSE_FAILURE_MESSAGES.loadMoreFailed,
  );
  assert.equal(
    getDeckCardBrowseFailureMessage({ error: 503 }, { append: true }),
    DECK_CARD_BROWSE_FAILURE_MESSAGES.loadMoreFailed,
  );
});

test('getDeckCardBrowseFailureMessage accepts null-prototype own data errors', () => {
  const payload = Object.create(null);
  payload.error = 'Deck-card browser rejected this request.';

  assert.equal(
    getDeckCardBrowseFailureMessage(payload),
    'Deck-card browser rejected this request.',
  );
});

test('getDeckCardBrowseFailureMessage ignores inherited errors', () => {
  const payload = Object.create({
    error: 'Inherited error should not surface.',
  });

  assert.equal(
    getDeckCardBrowseFailureMessage(payload),
    DECK_CARD_BROWSE_FAILURE_MESSAGES.loadFailed,
  );
});

test('getDeckCardBrowseFailureMessage ignores own accessor errors without invoking getters', () => {
  let getterCalled = false;
  const payload = {};

  Object.defineProperty(payload, 'error', {
    enumerable: true,
    get() {
      getterCalled = true;
      return 'Getter error should not surface.';
    },
  });

  assert.equal(
    getDeckCardBrowseFailureMessage(payload, { append: true }),
    DECK_CARD_BROWSE_FAILURE_MESSAGES.loadMoreFailed,
  );
  assert.equal(getterCalled, false);
});

test('getDeckCardBrowseFailureMessage ignores inherited accessor errors without invoking getters', () => {
  let getterCalled = false;
  const prototype = {};

  Object.defineProperty(prototype, 'error', {
    enumerable: true,
    get() {
      getterCalled = true;
      return 'Inherited getter error should not surface.';
    },
  });

  const payload = Object.create(prototype);

  assert.equal(
    getDeckCardBrowseFailureMessage(payload),
    DECK_CARD_BROWSE_FAILURE_MESSAGES.loadFailed,
  );
  assert.equal(getterCalled, false);
});

test('parseDeckCardBrowseResponsePayload accepts an empty page without a cursor', () => {
  const payload = { cards: [] };

  assert.deepEqual(parseDeckCardBrowseResponsePayload(payload), {
    cards: payload.cards,
    nextCursor: null,
  });
});

test('parseDeckCardBrowseResponsePayload preserves valid card rows and extra fields', () => {
  const cardWithStringId = {
    id: '0001',
    front_content: 'Front',
    back_content: 'Back',
    created_at: '2026-05-08T12:00:00.000Z',
    next_review: '2026-05-10T12:00:00.000Z',
    ease_factor: 2.5,
    interval_days: 3,
    repetitions: 4,
  };
  const cardWithNumberId = {
    id: 2,
    front_content: 'Front 2',
    back_content: 'Back 2',
  };
  const payload = { cards: [cardWithStringId, cardWithNumberId], nextCursor: null };
  const parsed = parseDeckCardBrowseResponsePayload(payload);

  assert.equal(parsed.cards, payload.cards);
  assert.equal(parsed.cards[0], cardWithStringId);
  assert.deepEqual(parsed.cards[0], cardWithStringId);
  assert.equal(parsed.nextCursor, null);
});

test('parseDeckCardBrowseResponsePayload accepts null-prototype card rows with own data fields', () => {
  const card = Object.create(null);
  Object.defineProperties(card, {
    id: { value: '42', enumerable: true },
    deck_id: { value: '7', enumerable: true },
    front_content: { value: 'Front', enumerable: true },
    back_content: { value: 'Back', enumerable: true },
  });
  const payload = { cards: [card], nextCursor: null };
  const parsed = parseDeckCardBrowseResponsePayload(payload, { expectedDeckId: 7 });

  assert.equal(parsed.cards, payload.cards);
  assert.equal(parsed.cards[0], card);
  assert.equal(hasDeckCardBrowseRowPayload(card, { expectedDeckId: '7' }), true);
});

test('parseDeckCardBrowseResponsePayload accepts matching expected deck ids', () => {
  const payload = {
    cards: [
      {
        id: 1,
        deck_id: '00042',
        front_content: 'Front',
        back_content: 'Back',
        created_at: '2026-05-08T12:00:00.000Z',
      },
      {
        id: '2',
        deck_id: 42,
        front_content: 'Front 2',
        back_content: 'Back 2',
      },
    ],
    nextCursor: null,
  };

  const parsed = parseDeckCardBrowseResponsePayload(payload, { expectedDeckId: ' 42 ' });

  assert.equal(parsed.cards, payload.cards);
  assert.equal(parsed.cards[0], payload.cards[0]);
  assert.deepEqual(parsed, { cards: payload.cards, nextCursor: null });
  assert.equal(
    hasDeckCardBrowseRowPayload(payload.cards[0], { expectedDeckId: 42 }),
    true,
  );
});

test('parseDeckCardBrowseResponsePayload rejects cards not anchored to the expected deck', () => {
  const baseCard = {
    id: 1,
    deck_id: 42,
    front_content: 'Front',
    back_content: 'Back',
  };
  const malformedCards = [
    { ...baseCard, deck_id: undefined },
    { ...baseCard, deck_id: null },
    { ...baseCard, deck_id: '' },
    { ...baseCard, deck_id: '  ' },
    { ...baseCard, deck_id: 'deck-42' },
    { ...baseCard, deck_id: '0' },
    { ...baseCard, deck_id: 0 },
    { ...baseCard, deck_id: MAX_POSTGRES_SERIAL_ID + 1 },
    { ...baseCard, deck_id: 41 },
    { ...baseCard, deck_id: '0041' },
  ];

  malformedCards.forEach((card) => {
    assertMalformed({ cards: [card], nextCursor: null }, { expectedDeckId: 42 });
    assert.equal(hasDeckCardBrowseRowPayload(card, { expectedDeckId: 42 }), false);
  });
});

test('parseDeckCardBrowseResponsePayload rejects unusable expected deck ids', () => {
  const payload = {
    cards: [{
      id: 1,
      deck_id: 42,
      front_content: 'Front',
      back_content: 'Back',
    }],
    nextCursor: null,
  };

  [
    null,
    '',
    'deck-42',
    '0',
    0,
    MAX_POSTGRES_SERIAL_ID + 1,
  ].forEach((expectedDeckId) => {
    assertMalformed(payload, { expectedDeckId });
    assert.equal(
      hasDeckCardBrowseRowPayload(payload.cards[0], { expectedDeckId }),
      false,
    );
  });
});

test('parseDeckCardBrowseResponsePayload preserves valid cursor objects', () => {
  [
    { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: 3 },
    { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: MAX_POSTGRES_SERIAL_ID },
    { beforeCreatedAt: '2026-05-08T13:00:00.000Z', beforeId: '3' },
    {
      cursorCreatedAt: '2026-05-08T13:00:00.000Z',
      cursorId: 3,
      beforeCreatedAt: '2026-05-08T13:00:00.000Z',
      beforeId: '3',
    },
    {
      cursorCreatedAt: '2026-05-08T13:00:00.000Z',
      cursorId: '0003',
      beforeCreatedAt: '2026-05-08T13:00:00.000Z',
      beforeId: 3,
    },
    {
      cursorCreatedAt: '2026-05-08T06:00:00.123456-07:00',
      cursorId: 3,
      beforeCreatedAt: '2026-05-08T13:00:00.123456Z',
      beforeId: '0003',
    },
  ].forEach((nextCursor) => {
    const payload = {
      cards: [{ id: 1, front_content: 'Front', back_content: 'Back' }],
      nextCursor,
    };

    assert.equal(parseDeckCardBrowseResponsePayload(payload).nextCursor, nextCursor);
  });
});

test('parseDeckCardBrowseResponsePayload rejects malformed top-level payloads', () => {
  [
    undefined,
    null,
    [],
    {},
    { cards: null },
    { cards: {} },
    { cards: 'not cards' },
  ].forEach(assertMalformed);
});

test('parseDeckCardBrowseResponsePayload requires cards to be an own data property', () => {
  const validCards = [{ id: 1, front_content: 'Front', back_content: 'Back' }];
  const inheritedPayload = Object.create({ cards: validCards });
  const { payload: accessorPayload, accessCounts } = createAccessorPayload({
    cards: validCards,
  });

  assertMalformed(inheritedPayload);
  assertMalformed(accessorPayload);
  assert.equal(accessCounts.cards, 0);
});

test('parseDeckCardBrowseResponsePayload rejects sparse, inherited, and accessor card entries without invoking getters', () => {
  const validCard = {
    id: 1,
    deck_id: 7,
    front_content: 'Front',
    back_content: 'Back',
  };
  const options = { expectedDeckId: validCard.deck_id };

  const sparseCards = [];
  sparseCards.length = 1;

  const inheritedDataCards = [];
  const inheritedDataPrototype = Object.create(Array.prototype);
  inheritedDataCards.length = 1;
  Object.defineProperty(inheritedDataPrototype, '0', {
    configurable: true,
    enumerable: true,
    value: validCard,
  });
  Object.setPrototypeOf(inheritedDataCards, inheritedDataPrototype);

  const ownAccessorCards = [];
  const getOwnAccessCount = defineThrowingGetter(ownAccessorCards, '0');

  const inheritedAccessorCards = [];
  const inheritedAccessorPrototype = Object.create(Array.prototype);
  inheritedAccessorCards.length = 1;
  const getInheritedAccessCount = defineThrowingGetter(inheritedAccessorPrototype, '0');
  Object.setPrototypeOf(inheritedAccessorCards, inheritedAccessorPrototype);

  [
    { label: 'sparse array entry', cards: sparseCards },
    { label: 'inherited data array entry', cards: inheritedDataCards },
    { label: 'own accessor array entry', cards: ownAccessorCards },
    { label: 'inherited accessor array entry', cards: inheritedAccessorCards },
  ].forEach(({ label, cards }) => {
    assert.equal(cards.length, 1, `${label} fixture should keep one logical entry`);
    assert.throws(
      () => parseDeckCardBrowseResponsePayload({ cards, nextCursor: null }, options),
      new RegExp(MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR),
      `${label} should be rejected as malformed`,
    );
  });
  assert.equal(getOwnAccessCount(), 0, 'own accessor array entry getter should not run');
  assert.equal(
    getInheritedAccessCount(),
    0,
    'inherited accessor array entry getter should not run',
  );
});

test('parseDeckCardBrowseResponsePayload rejects accessor-backed top-level nextCursor without invoking it', () => {
  let getterCalls = 0;
  const payload = {
    cards: [{ id: 1, front_content: 'Front', back_content: 'Back' }],
  };

  Object.defineProperty(payload, 'nextCursor', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: 3 };
    },
  });

  assertMalformed(payload);
  assert.equal(getterCalls, 0);
});

test('parseDeckCardBrowseResponsePayload rejects invalid card rows', () => {
  [
    null,
    [],
    {},
    { id: null, front_content: 'Front', back_content: 'Back' },
    { id: '', front_content: 'Front', back_content: 'Back' },
    { id: '  ', front_content: 'Front', back_content: 'Back' },
    { id: 'card-1', front_content: 'Front', back_content: 'Back' },
    { id: '0', front_content: 'Front', back_content: 'Back' },
    { id: '-1', front_content: 'Front', back_content: 'Back' },
    { id: '1.2', front_content: 'Front', back_content: 'Back' },
    { id: String(MAX_POSTGRES_SERIAL_ID + 1), front_content: 'Front', back_content: 'Back' },
    { id: '9007199254740992', front_content: 'Front', back_content: 'Back' },
    { id: 0, front_content: 'Front', back_content: 'Back' },
    { id: -1, front_content: 'Front', back_content: 'Back' },
    { id: 1.5, front_content: 'Front', back_content: 'Back' },
    { id: Number.NaN, front_content: 'Front', back_content: 'Back' },
    { id: MAX_POSTGRES_SERIAL_ID + 1, front_content: 'Front', back_content: 'Back' },
    { id: Number.MAX_SAFE_INTEGER, front_content: 'Front', back_content: 'Back' },
    { id: Number.MAX_SAFE_INTEGER + 1, front_content: 'Front', back_content: 'Back' },
    { id: {}, front_content: 'Front', back_content: 'Back' },
    { id: 1, front_content: '', back_content: 'Back' },
    { id: 1, front_content: '  ', back_content: 'Back' },
    { id: 1, back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: '' },
    { id: 1, front_content: 'Front', back_content: '  ' },
    { id: 1, front_content: 'Front' },
    { id: 1, front_content: 7, back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: 7 },
  ].forEach((card) => {
    assertMalformed({ cards: [card] });
  });
});

test('hasDeckCardBrowseRowPayload requires required card fields to be own data properties', () => {
  const inheritedCard = Object.create({
    id: 1,
    front_content: 'Front',
    back_content: 'Back',
  });
  const { payload: accessorCard, accessCounts } = createAccessorPayload({
    id: 1,
    front_content: 'Front',
    back_content: 'Back',
  });

  assert.equal(hasDeckCardBrowseRowPayload(inheritedCard), false);
  assert.equal(hasDeckCardBrowseRowPayload(accessorCard), false);
  assert.deepEqual(accessCounts, {
    id: 0,
    front_content: 0,
    back_content: 0,
  });
});

test('parseDeckCardBrowseResponsePayload rejects card text outside the shared safe-text contract', () => {
  [
    { id: 1, front_content: 'Front\u0000', back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: 'Back\u0000' },
    { id: 1, front_content: 'Front\u202E', back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: 'Back\u200B' },
    { id: 1, front_content: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1), back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1) },
  ].forEach((card) => {
    assertMalformed({ cards: [card] });
    assert.equal(hasDeckCardBrowseRowPayload(card), false);
  });
});

test('hasDeckCardBrowseRowPayload accepts only card-browser row objects', () => {
  assert.equal(
    hasDeckCardBrowseRowPayload({ id: '1', front_content: 'Front', back_content: 'Back' }),
    true,
  );
  assert.equal(
    hasDeckCardBrowseRowPayload({ id: 1, front_content: 'Front', back_content: 'Back' }),
    true,
  );
  assert.equal(hasDeckCardBrowseRowPayload(null), false);
  assert.equal(hasDeckCardBrowseRowPayload([]), false);
  assert.equal(
    hasDeckCardBrowseRowPayload({ id: '', front_content: 'Front', back_content: 'Back' }),
    false,
  );
  assert.equal(
    hasDeckCardBrowseRowPayload({ id: 'card-1', front_content: 'Front', back_content: 'Back' }),
    false,
  );
  assert.equal(
    hasDeckCardBrowseRowPayload({ id: 0, front_content: 'Front', back_content: 'Back' }),
    false,
  );
});

test('hasMatchingCursorFamilies rejects matching invalid cursor ids', () => {
  assert.equal(
    hasMatchingCursorFamilies({
      cursorCreatedAt: '2026-05-08T13:00:00.000Z',
      cursorId: 'not-a-positive-integer',
      beforeCreatedAt: '2026-05-08T13:00:00.000Z',
      beforeId: 'also-not-a-positive-integer',
    }),
    false,
  );
});

test('parseDeckCardBrowseResponsePayload rejects partial or blank cursor payloads', () => {
  [
    { nextCursor: undefined },
    { nextCursor: '' },
    { nextCursor: [] },
    { nextCursor: {} },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z' } },
    { nextCursor: { cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: '', cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: '  ', cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: '' } },
    { nextCursor: { beforeCreatedAt: '2026-05-08T13:00:00.000Z' } },
    { nextCursor: { beforeId: '3' } },
    { nextCursor: { beforeCreatedAt: '2026-05-08T13:00:00.000Z', beforeId: '  ' } },
    {
      nextCursor: {
        cursorCreatedAt: '2026-05-08T13:00:00.000Z',
        cursorId: 3,
        beforeCreatedAt: '2026-05-08T13:00:00.000Z',
      },
    },
    {
      nextCursor: {
        cursorCreatedAt: '2026-05-08T13:00:00.000Z',
        cursorId: 3,
        beforeCreatedAt: '2026-05-08T13:00:01.000Z',
        beforeId: 3,
      },
    },
    {
      nextCursor: {
        cursorCreatedAt: '2026-05-08T13:00:00.123456Z',
        cursorId: 3,
        beforeCreatedAt: '2026-05-08T13:00:00.123457Z',
        beforeId: 3,
      },
    },
  ].forEach((payload) => {
    assertMalformed({
      cards: [{ id: 1, front_content: 'Front', back_content: 'Back' }],
      ...payload,
    });
  });
});

test('parseDeckCardBrowseResponsePayload rejects accessor-backed cursor fields without invoking them', () => {
  const { payload: nextCursor, accessCounts } = createAccessorPayload({
    cursorCreatedAt: '2026-05-08T13:00:00.000Z',
    cursorId: 3,
  });

  assertMalformed({
    cards: [{ id: 1, front_content: 'Front', back_content: 'Back' }],
    nextCursor,
  });
  assert.deepEqual(accessCounts, {
    cursorCreatedAt: 0,
    cursorId: 0,
  });
});

test('parseDeckCardBrowseResponsePayload rejects invalid cursor timestamps and ids', () => {
  [
    { nextCursor: { cursorCreatedAt: 'not-a-date', cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08', cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00', cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.1234567Z', cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: `2026-05-08T13:00:00.${'1'.repeat(200)}Z`, cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: '2026-02-31T13:00:00.000Z', cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z ', cursorId: 3 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: 0 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: '0' } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: -1 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: 'abc' } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: '1.2' } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: MAX_POSTGRES_SERIAL_ID + 1 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: String(MAX_POSTGRES_SERIAL_ID + 1) } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: Number.MAX_SAFE_INTEGER } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: Number.MAX_SAFE_INTEGER + 1 } },
    { nextCursor: { cursorCreatedAt: '2026-05-08T13:00:00.000Z', cursorId: String(Number.MAX_SAFE_INTEGER + 1) } },
    {
      nextCursor: {
        cursorCreatedAt: '2026-05-08T13:00:00.000Z',
        cursorId: '3',
        beforeCreatedAt: '2026-05-08T13:00:00.000Z',
        beforeId: '4',
      },
    },
  ].forEach((payload) => {
    assertMalformed({
      cards: [{ id: 1, front_content: 'Front', back_content: 'Back' }],
      ...payload,
    });
  });
});
