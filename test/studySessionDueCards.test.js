const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DUE_CARD_PAYLOAD_ERROR,
  hasSafeStudySessionCardId,
  hasStudySessionDueCardRowPayload,
  selectValidatedStudySessionDueCard,
} = require('../studySessionDueCards');
const { MAX_CARD_CONTENT_LENGTH } = require('../cardContentValidation');
const { MAX_POSTGRES_SERIAL_ID } = require('../cardIdentifier');

function assertMalformedSelection(payload, options) {
  assert.throws(
    () => selectValidatedStudySessionDueCard(payload, options),
    new RegExp(MALFORMED_DUE_CARD_PAYLOAD_ERROR),
  );
}

function defineThrowingGetter(object, fieldName) {
  Object.defineProperty(object, fieldName, {
    configurable: true,
    get() {
      throw new Error(`Unexpected ${fieldName} getter invocation`);
    },
  });
}

test('selectValidatedStudySessionDueCard keeps empty arrays on the no-due path', () => {
  assert.equal(selectValidatedStudySessionDueCard([]), null);
});

test('selectValidatedStudySessionDueCard selects a valid card and preserves extra fields', () => {
  const card = {
    id: '42',
    deck_id: '7',
    front_content: 'Question',
    back_content: 'Answer',
    next_review: '2026-05-10T20:00:00.000Z',
    interval: 3,
    ease_factor: 2.5,
  };

  assert.equal(selectValidatedStudySessionDueCard([card]), card);
});

test('selectValidatedStudySessionDueCard accepts cards anchored to the requested deck', () => {
  const card = {
    id: '42',
    deck_id: '0007',
    front_content: 'Question',
    back_content: 'Answer',
  };

  assert.equal(
    selectValidatedStudySessionDueCard([card], { expectedDeckId: ' 7 ' }),
    card,
  );
  assert.equal(hasStudySessionDueCardRowPayload(card, { expectedDeckId: 7 }), true);
});

test('selectValidatedStudySessionDueCard rejects cards outside the requested deck', () => {
  const baseCard = {
    id: 42,
    deck_id: 7,
    front_content: 'Question',
    back_content: 'Answer',
  };
  const malformedCards = [
    { ...baseCard, deck_id: undefined },
    { ...baseCard, deck_id: null },
    { ...baseCard, deck_id: '' },
    { ...baseCard, deck_id: '  ' },
    { ...baseCard, deck_id: 'deck-7' },
    { ...baseCard, deck_id: '0' },
    { ...baseCard, deck_id: 0 },
    { ...baseCard, deck_id: MAX_POSTGRES_SERIAL_ID + 1 },
    { ...baseCard, deck_id: 8 },
    { ...baseCard, deck_id: '0008' },
  ];

  malformedCards.forEach((card) => {
    assert.throws(
      () => selectValidatedStudySessionDueCard([card], { expectedDeckId: 7 }),
      new RegExp(MALFORMED_DUE_CARD_PAYLOAD_ERROR),
    );
    assert.equal(hasStudySessionDueCardRowPayload(card, { expectedDeckId: 7 }), false);
  });
});

test('selectValidatedStudySessionDueCard rejects unusable expected deck ids when a card is returned', () => {
  const card = {
    id: 42,
    deck_id: 7,
    front_content: 'Question',
    back_content: 'Answer',
  };

  [
    null,
    '',
    'deck-7',
    '0',
    0,
    MAX_POSTGRES_SERIAL_ID + 1,
  ].forEach((expectedDeckId) => {
    assert.throws(
      () => selectValidatedStudySessionDueCard([card], { expectedDeckId }),
      new RegExp(MALFORMED_DUE_CARD_PAYLOAD_ERROR),
    );
    assert.equal(hasStudySessionDueCardRowPayload(card, { expectedDeckId }), false);
  });
});

test('selectValidatedStudySessionDueCard rejects multiple cards for the limit-one study request', () => {
  const cards = [
    { id: 41, front_content: 'Question 1', back_content: 'Answer 1' },
    { id: 42, front_content: 'Question 2', back_content: 'Answer 2' },
  ];

  assert.throws(
    () => selectValidatedStudySessionDueCard(cards),
    new RegExp(MALFORMED_DUE_CARD_PAYLOAD_ERROR),
  );
});

test('selectValidatedStudySessionDueCard rejects malformed top-level payloads', () => {
  [
    undefined,
    null,
    {},
    { 0: { id: 1, front_content: 'Front', back_content: 'Back' } },
    'not an array',
  ].forEach((payload) => {
    assertMalformedSelection(payload);
  });
});

test('selectValidatedStudySessionDueCard rejects inherited row fields without invoking getters', () => {
  const prototype = {};
  ['id', 'deck_id', 'front_content', 'back_content'].forEach((fieldName) => {
    defineThrowingGetter(prototype, fieldName);
  });
  const card = Object.create(prototype);

  assert.equal(hasStudySessionDueCardRowPayload(card, { expectedDeckId: 7 }), false);
  assertMalformedSelection([card], { expectedDeckId: 7 });
});

test('selectValidatedStudySessionDueCard rejects accessor-backed rows and array entries without invoking getters', () => {
  const card = {};
  ['id', 'deck_id', 'front_content', 'back_content'].forEach((fieldName) => {
    defineThrowingGetter(card, fieldName);
  });

  assert.equal(hasStudySessionDueCardRowPayload(card, { expectedDeckId: 7 }), false);
  assertMalformedSelection([card], { expectedDeckId: 7 });

  const payload = [];
  defineThrowingGetter(payload, '0');

  assert.equal(payload.length, 1);
  assertMalformedSelection(payload);
});

test('selectValidatedStudySessionDueCard rejects blank or missing content', () => {
  [
    { id: 1, back_content: 'Back' },
    { id: 1, front_content: 'Front' },
    { id: 1, front_content: '', back_content: 'Back' },
    { id: 1, front_content: '  ', back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: '' },
    { id: 1, front_content: 'Front', back_content: '  ' },
    { id: 1, front_content: 7, back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: 7 },
  ].forEach((card) => {
    assert.throws(
      () => selectValidatedStudySessionDueCard([card]),
      new RegExp(MALFORMED_DUE_CARD_PAYLOAD_ERROR),
    );
  });
});

test('selectValidatedStudySessionDueCard rejects content outside the shared safe-text contract', () => {
  [
    { id: 1, front_content: 'Front\u0000', back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: 'Back\u0000' },
    { id: 1, front_content: 'Question\u202E1', back_content: 'Answer' },
    { id: 1, front_content: 'Question', back_content: 'Answer\u200B1' },
    { id: 1, front_content: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1), back_content: 'Back' },
    { id: 1, front_content: 'Front', back_content: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1) },
  ].forEach((card) => {
    assert.throws(
      () => selectValidatedStudySessionDueCard([card]),
      new RegExp(MALFORMED_DUE_CARD_PAYLOAD_ERROR),
    );
    assert.equal(hasStudySessionDueCardRowPayload(card), false);
  });
});

test('hasSafeStudySessionCardId accepts only backend SERIAL IDs safe for study submissions', () => {
  assert.equal(hasSafeStudySessionCardId(1), true);
  assert.equal(hasSafeStudySessionCardId(MAX_POSTGRES_SERIAL_ID), true);
  assert.equal(hasSafeStudySessionCardId('42'), true);
  assert.equal(hasSafeStudySessionCardId(' 42 '), true);
  assert.equal(hasSafeStudySessionCardId(String(MAX_POSTGRES_SERIAL_ID)), true);

  [
    undefined,
    null,
    '',
    '  ',
    'abc',
    '1.2',
    '1e2',
    '0',
    '-1',
    String(MAX_POSTGRES_SERIAL_ID + 1),
    '9007199254740992',
    0,
    -1,
    1.5,
    MAX_POSTGRES_SERIAL_ID + 1,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
  ].forEach((id) => {
    assert.equal(hasSafeStudySessionCardId(id), false);
  });
});

test('hasStudySessionDueCardRowPayload rejects invalid card row shapes', () => {
  assert.equal(hasStudySessionDueCardRowPayload(null), false);
  assert.equal(hasStudySessionDueCardRowPayload([]), false);
  assert.equal(hasStudySessionDueCardRowPayload({}), false);
  assert.equal(
    hasStudySessionDueCardRowPayload({ id: 1, front_content: 'Front', back_content: 'Back' }),
    true,
  );
});

test('selectValidatedStudySessionDueCard rejects multi-card payloads before validating later IDs', () => {
  const validCard = { id: 1, front_content: 'Front', back_content: 'Back' };

  [
    { id: undefined, front_content: 'Front', back_content: 'Back' },
    { id: null, front_content: 'Front', back_content: 'Back' },
    { id: '', front_content: 'Front', back_content: 'Back' },
    { id: '0', front_content: 'Front', back_content: 'Back' },
    { id: 'abc', front_content: 'Front', back_content: 'Back' },
    { id: String(MAX_POSTGRES_SERIAL_ID + 1), front_content: 'Front', back_content: 'Back' },
    { id: 0, front_content: 'Front', back_content: 'Back' },
    { id: MAX_POSTGRES_SERIAL_ID + 1, front_content: 'Front', back_content: 'Back' },
    { id: Number.MAX_SAFE_INTEGER, front_content: 'Front', back_content: 'Back' },
    { id: Number.MAX_SAFE_INTEGER + 1, front_content: 'Front', back_content: 'Back' },
  ].forEach((card) => {
    assert.throws(
      () => selectValidatedStudySessionDueCard([validCard, card]),
      new RegExp(MALFORMED_DUE_CARD_PAYLOAD_ERROR),
    );
  });
});
