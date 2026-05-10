const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MALFORMED_DUE_CARD_PAYLOAD_ERROR,
  hasSafeStudySessionCardId,
  hasStudySessionDueCardRowPayload,
  selectValidatedStudySessionDueCard,
} = require('../studySessionDueCards');

test('selectValidatedStudySessionDueCard keeps empty arrays on the no-due path', () => {
  assert.equal(selectValidatedStudySessionDueCard([]), null);
});

test('selectValidatedStudySessionDueCard selects a valid card and preserves extra fields', () => {
  const card = {
    id: '42',
    front_content: 'Question',
    back_content: 'Answer',
    next_review: '2026-05-10T20:00:00.000Z',
    interval: 3,
    ease_factor: 2.5,
  };

  assert.equal(selectValidatedStudySessionDueCard([card]), card);
});

test('selectValidatedStudySessionDueCard rejects malformed top-level payloads', () => {
  [
    undefined,
    null,
    {},
    { 0: { id: 1, front_content: 'Front', back_content: 'Back' } },
    'not an array',
  ].forEach((payload) => {
    assert.throws(
      () => selectValidatedStudySessionDueCard(payload),
      new RegExp(MALFORMED_DUE_CARD_PAYLOAD_ERROR),
    );
  });
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

test('hasSafeStudySessionCardId accepts only IDs safe for study submissions', () => {
  assert.equal(hasSafeStudySessionCardId(1), true);
  assert.equal(hasSafeStudySessionCardId(Number.MAX_SAFE_INTEGER), true);
  assert.equal(hasSafeStudySessionCardId('42'), true);
  assert.equal(hasSafeStudySessionCardId(' 42 '), true);
  assert.equal(hasSafeStudySessionCardId(String(Number.MAX_SAFE_INTEGER)), true);

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
    '9007199254740992',
    0,
    -1,
    1.5,
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

test('selectValidatedStudySessionDueCard rejects invalid IDs anywhere in the payload', () => {
  const validCard = { id: 1, front_content: 'Front', back_content: 'Back' };

  [
    { id: undefined, front_content: 'Front', back_content: 'Back' },
    { id: null, front_content: 'Front', back_content: 'Back' },
    { id: '', front_content: 'Front', back_content: 'Back' },
    { id: '0', front_content: 'Front', back_content: 'Back' },
    { id: 'abc', front_content: 'Front', back_content: 'Back' },
    { id: 0, front_content: 'Front', back_content: 'Back' },
    { id: Number.MAX_SAFE_INTEGER + 1, front_content: 'Front', back_content: 'Back' },
  ].forEach((card) => {
    assert.throws(
      () => selectValidatedStudySessionDueCard([validCard, card]),
      new RegExp(MALFORMED_DUE_CARD_PAYLOAD_ERROR),
    );
  });
});
