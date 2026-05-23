const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DECK_CARD_BROWSE_PAYLOAD_ERROR,
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
