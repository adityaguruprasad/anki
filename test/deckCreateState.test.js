const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CREATE_DECK_MESSAGES,
  createDeckSubmission,
  getCreateDeckFailureMessage,
  validateCreateDeckName,
} = require('../deckCreateState');
const {
  DECK_NAME_VALIDATION_ERROR_CODES,
  MAX_DECK_NAME_LENGTH,
} = require('../deckNameValidation');

test('validateCreateDeckName rejects empty and whitespace-only names before network work', () => {
  assert.deepEqual(validateCreateDeckName(''), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.BLANK,
    error: CREATE_DECK_MESSAGES.blankName,
  });
  assert.deepEqual(validateCreateDeckName('   \n\t   '), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.BLANK,
    error: CREATE_DECK_MESSAGES.blankName,
  });
});

test('validateCreateDeckName returns a trimmed deck name for valid input', () => {
  assert.deepEqual(validateCreateDeckName('  Spanish  '), {
    ok: true,
    value: 'Spanish',
  });
});

test('validateCreateDeckName rejects over-length names with a friendly message', () => {
  const longName = 'a'.repeat(MAX_DECK_NAME_LENGTH + 1);

  assert.deepEqual(validateCreateDeckName(longName), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.TOO_LONG,
    error: CREATE_DECK_MESSAGES.tooLongName,
  });
});

test('createDeckSubmission blocks duplicate in-flight submissions before validation', () => {
  assert.deepEqual(createDeckSubmission({ name: '   ', isSubmitting: true }), {
    ok: false,
    blocked: true,
  });
});

test('createDeckSubmission returns an explicit invalid shape when validation fails', () => {
  assert.deepEqual(createDeckSubmission({ name: '   ', isSubmitting: false }), {
    ok: false,
    blocked: false,
    error: CREATE_DECK_MESSAGES.blankName,
  });
});

test('createDeckSubmission rejects over-length names before network work', () => {
  const longName = 'a'.repeat(MAX_DECK_NAME_LENGTH + 1);

  assert.deepEqual(createDeckSubmission({ name: longName, isSubmitting: false }), {
    ok: false,
    blocked: false,
    error: CREATE_DECK_MESSAGES.tooLongName,
  });
});

test('createDeckSubmission returns a trimmed request name when not blocked and valid', () => {
  assert.deepEqual(createDeckSubmission({ name: '  Spanish  ', isSubmitting: false }), {
    ok: true,
    blocked: false,
    name: 'Spanish',
  });
});

test('getCreateDeckFailureMessage surfaces server errors when present', () => {
  assert.equal(
    getCreateDeckFailureMessage({ error: 'Deck name already exists for this user' }),
    'Deck name already exists for this user'
  );
});

test('getCreateDeckFailureMessage falls back when response has no usable server error', () => {
  assert.equal(getCreateDeckFailureMessage({}), CREATE_DECK_MESSAGES.createFailed);
  assert.equal(getCreateDeckFailureMessage({ error: '   ' }), CREATE_DECK_MESSAGES.createFailed);
  assert.equal(getCreateDeckFailureMessage(null), CREATE_DECK_MESSAGES.createFailed);
});
