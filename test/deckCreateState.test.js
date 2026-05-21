const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CREATE_DECK_COMPLETION_TYPES,
  CREATE_DECK_MESSAGES,
  createDeckSubmission,
  getCreateDeckFailureMessage,
  getCreateDeckResponseCompletion,
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

test('create-deck response completion ignores stale responses before parsing payloads', () => {
  let parseCalls = 0;
  const completion = getCreateDeckResponseCompletion({
    isCurrent: false,
    responseOk: true,
    payload: {
      id: 7,
      name: 'Spanish',
    },
    parseCreatedDeck() {
      parseCalls += 1;
      return {};
    },
  });

  assert.deepEqual(completion, {
    type: CREATE_DECK_COMPLETION_TYPES.IGNORED,
    ignored: true,
  });
  assert.equal(parseCalls, 0);
});

test('create-deck response completion preserves non-OK server error behavior', () => {
  let parseCalls = 0;
  const completion = getCreateDeckResponseCompletion({
    isCurrent: true,
    responseOk: false,
    payload: { error: 'Deck name already exists for this user' },
    parseCreatedDeck() {
      parseCalls += 1;
      return {};
    },
  });

  assert.deepEqual(completion, {
    type: CREATE_DECK_COMPLETION_TYPES.SERVER_ERROR,
    ignored: false,
    error: 'Deck name already exists for this user',
  });
  assert.equal(parseCalls, 0);
});

test('create-deck response completion exposes only validated successful deck rows', () => {
  const createdDeck = {
    id: 8,
    user_id: 1,
    name: 'Biology',
    description: null,
    created_at: '2026-05-10T12:00:00.000Z',
    totalCards: 0,
    dueCards: 0,
  };

  assert.deepEqual(
    getCreateDeckResponseCompletion({
      isCurrent: true,
      responseOk: true,
      payload: createdDeck,
    }),
    {
      type: CREATE_DECK_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      createdDeck,
      success: CREATE_DECK_MESSAGES.success,
    },
  );
});

test('create-deck response completion rejects malformed 2xx payloads before local mutation data exists', () => {
  const completion = getCreateDeckResponseCompletion({
    isCurrent: true,
    responseOk: true,
    payload: { id: 8 },
  });

  assert.deepEqual(completion, {
    type: CREATE_DECK_COMPLETION_TYPES.INVALID_RESPONSE,
    ignored: false,
    error: CREATE_DECK_MESSAGES.createFailed,
  });
  assert.equal(Object.prototype.hasOwnProperty.call(completion, 'createdDeck'), false);
});
