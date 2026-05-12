const test = require('node:test');
const assert = require('node:assert/strict');

const {
  RENAME_DECK_COMPLETION_TYPES,
  RENAME_DECK_MESSAGES,
  getRenameDeckFailureMessage,
  getRenameDeckResponseCompletion,
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

test('rename-deck response completion ignores stale responses before parsing payloads', () => {
  let parseCalls = 0;
  const completion = getRenameDeckResponseCompletion({
    deckId: 7,
    isCurrent: false,
    responseOk: true,
    payload: {
      id: 7,
      name: 'Spanish',
    },
    parseRenamedDeck() {
      parseCalls += 1;
      return {};
    },
  });

  assert.deepEqual(completion, {
    type: RENAME_DECK_COMPLETION_TYPES.IGNORED,
    ignored: true,
  });
  assert.equal(parseCalls, 0);
});

test('rename-deck response completion preserves non-OK server error behavior', () => {
  let parseCalls = 0;
  const completion = getRenameDeckResponseCompletion({
    deckId: 7,
    isCurrent: true,
    responseOk: false,
    payload: { error: 'Deck not found' },
    parseRenamedDeck() {
      parseCalls += 1;
      return {};
    },
  });

  assert.deepEqual(completion, {
    type: RENAME_DECK_COMPLETION_TYPES.SERVER_ERROR,
    ignored: false,
    error: 'Deck not found',
  });
  assert.equal(parseCalls, 0);
});

test('rename-deck response completion validates successful deck rows against the requested deck id', () => {
  const renamedDeck = {
    id: 7,
    name: 'Organic Chemistry',
    totalCards: 4,
    dueCards: 1,
  };
  let receivedOptions;

  assert.deepEqual(
    getRenameDeckResponseCompletion({
      deckId: '7',
      isCurrent: true,
      responseOk: true,
      payload: renamedDeck,
      parseRenamedDeck(payload, options) {
        receivedOptions = options;
        return payload;
      },
    }),
    {
      type: RENAME_DECK_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      renamedDeck,
    },
  );
  assert.deepEqual(receivedOptions, { expectedId: '7' });
});

test('rename-deck response completion rejects malformed 2xx payloads before local mutation data exists', () => {
  const completion = getRenameDeckResponseCompletion({
    deckId: 7,
    isCurrent: true,
    responseOk: true,
    payload: {
      id: 8,
      name: 'Wrong deck',
    },
  });

  assert.deepEqual(completion, {
    type: RENAME_DECK_COMPLETION_TYPES.INVALID_RESPONSE,
    ignored: false,
    error: RENAME_DECK_MESSAGES.renameFailed,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(completion, 'renamedDeck'), false);
});
