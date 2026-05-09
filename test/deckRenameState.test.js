const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RENAME_DECK_MESSAGES,
  getRenameDeckFailureMessage,
  renameDeckSubmission,
  validateRenameDeckName,
} = require('../deckRenameState');
const {
  DECK_NAME_VALIDATION_ERROR_CODES,
  MAX_DECK_NAME_LENGTH,
} = require('../deckNameValidation');

test('validateRenameDeckName returns a trimmed deck name for valid input', () => {
  assert.deepEqual(validateRenameDeckName('  Spanish  '), {
    ok: true,
    value: 'Spanish',
  });
});

test('renameDeckSubmission returns a trimmed request name when valid', () => {
  assert.deepEqual(
    renameDeckSubmission({
      name: '  Organic Chemistry  ',
      currentName: 'Chemistry',
      isSubmitting: false,
    }),
    {
      ok: true,
      blocked: false,
      name: 'Organic Chemistry',
    },
  );
});

test('renameDeckSubmission rejects blank names before network work', () => {
  assert.deepEqual(
    renameDeckSubmission({
      name: '   \n\t   ',
      currentName: 'Biology',
      isSubmitting: false,
    }),
    {
      ok: false,
      blocked: false,
      error: RENAME_DECK_MESSAGES.blankName,
    },
  );
});

test('renameDeckSubmission rejects non-string names with friendly copy', () => {
  assert.deepEqual(validateRenameDeckName(null), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.NON_STRING,
    error: RENAME_DECK_MESSAGES.invalidName,
  });
  assert.deepEqual(
    renameDeckSubmission({
      name: null,
      currentName: 'Biology',
      isSubmitting: false,
    }),
    {
      ok: false,
      blocked: false,
      error: RENAME_DECK_MESSAGES.invalidName,
    },
  );
});

test('renameDeckSubmission rejects over-length names before network work', () => {
  const longName = 'a'.repeat(MAX_DECK_NAME_LENGTH + 1);

  assert.deepEqual(validateRenameDeckName(longName), {
    ok: false,
    code: DECK_NAME_VALIDATION_ERROR_CODES.TOO_LONG,
    error: RENAME_DECK_MESSAGES.tooLongName,
  });
  assert.deepEqual(
    renameDeckSubmission({
      name: longName,
      currentName: 'Biology',
      isSubmitting: false,
    }),
    {
      ok: false,
      blocked: false,
      error: RENAME_DECK_MESSAGES.tooLongName,
    },
  );
});

test('renameDeckSubmission treats unchanged trimmed names as a no-op', () => {
  assert.deepEqual(
    renameDeckSubmission({
      name: '  Biology  ',
      currentName: 'Biology',
      isSubmitting: false,
    }),
    {
      ok: false,
      blocked: false,
      unchanged: true,
    },
  );
});

test('renameDeckSubmission allows case-only renames', () => {
  assert.deepEqual(
    renameDeckSubmission({
      name: 'biology',
      currentName: 'Biology',
      isSubmitting: false,
    }),
    {
      ok: true,
      blocked: false,
      name: 'biology',
    },
  );
});

test('renameDeckSubmission blocks duplicate in-flight submissions before validation', () => {
  assert.deepEqual(
    renameDeckSubmission({
      name: 'Spanish',
      currentName: 'Biology',
      isSubmitting: true,
    }),
    {
      ok: false,
      blocked: true,
    },
  );
});

test('getRenameDeckFailureMessage surfaces server errors when present', () => {
  assert.equal(
    getRenameDeckFailureMessage({ error: 'Deck name already exists for this user' }),
    'Deck name already exists for this user',
  );
});

test('getRenameDeckFailureMessage falls back when response has no usable server error', () => {
  assert.equal(getRenameDeckFailureMessage({}), RENAME_DECK_MESSAGES.renameFailed);
  assert.equal(getRenameDeckFailureMessage({ error: '   ' }), RENAME_DECK_MESSAGES.renameFailed);
  assert.equal(getRenameDeckFailureMessage(null), RENAME_DECK_MESSAGES.renameFailed);
});
