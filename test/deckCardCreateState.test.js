const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CARD_CREATE_COMPLETION_TYPES,
  CARD_CREATE_MESSAGES,
  MAX_CARD_CONTENT_LENGTH,
  createCardSubmission,
  getCardCreateNetworkFailureCompletion,
  getCardCreateResponseCompletion,
  getCreateCardFailureMessage,
  shouldRunCardCreateFinallyCleanup,
} = require('../deckCardCreateState');

test('createCardSubmission returns trimmed content for valid input', () => {
  assert.deepEqual(
    createCardSubmission({
      frontContent: '  Front  ',
      backContent: '\nBack\t',
      isSubmitting: false,
    }),
    {
      ok: true,
      blocked: false,
      frontContent: 'Front',
      backContent: 'Back',
    },
  );
});

test('createCardSubmission rejects missing content with the existing message', () => {
  assert.deepEqual(
    createCardSubmission({
      frontContent: '   ',
      backContent: 'Back',
      isSubmitting: false,
    }),
    {
      ok: false,
      blocked: false,
      error: 'Front and back content are required.',
    },
  );

  assert.deepEqual(
    createCardSubmission({
      frontContent: 'Front',
      backContent: '\n\t',
      isSubmitting: false,
    }),
    {
      ok: false,
      blocked: false,
      error: 'Front and back content are required.',
    },
  );
});

test('createCardSubmission accepts exactly 10,000 trimmed characters', () => {
  const boundaryContent = 'x'.repeat(MAX_CARD_CONTENT_LENGTH);
  const result = createCardSubmission({
    frontContent: ` ${boundaryContent} `,
    backContent: boundaryContent,
    isSubmitting: false,
  });

  assert.equal(result.ok, true);
  assert.equal(result.blocked, false);
  assert.equal(result.frontContent.length, MAX_CARD_CONTENT_LENGTH);
  assert.equal(result.backContent.length, MAX_CARD_CONTENT_LENGTH);
});

test('createCardSubmission rejects front content over 10,000 trimmed characters', () => {
  assert.deepEqual(
    createCardSubmission({
      frontContent: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1),
      backContent: 'Back',
      isSubmitting: false,
    }),
    {
      ok: false,
      blocked: false,
      error: CARD_CREATE_MESSAGES.frontTooLong,
    },
  );
});

test('createCardSubmission rejects back content over 10,000 trimmed characters', () => {
  assert.deepEqual(
    createCardSubmission({
      frontContent: 'Front',
      backContent: 'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1),
      isSubmitting: false,
    }),
    {
      ok: false,
      blocked: false,
      error: CARD_CREATE_MESSAGES.backTooLong,
    },
  );
});

test('createCardSubmission blocks already in-flight submissions before validation', () => {
  assert.deepEqual(
    createCardSubmission({
      frontContent: '',
      backContent: '',
      isSubmitting: true,
    }),
    {
      ok: false,
      blocked: true,
    },
  );
});

test('createCardSubmission blocks valid content while a submission is in flight', () => {
  assert.deepEqual(
    createCardSubmission({
      frontContent: 'Front',
      backContent: 'Back',
      isSubmitting: true,
    }),
    {
      ok: false,
      blocked: true,
    },
  );
});

test('card-create response completion ignores stale responses before parsing payloads', () => {
  let parseCalls = 0;
  const completion = getCardCreateResponseCompletion({
    isCurrent: false,
    responseOk: true,
    payload: {
      id: 10,
      front_content: 'Front',
      back_content: 'Back',
    },
    parseCreatedCard() {
      parseCalls += 1;
      return {};
    },
  });

  assert.deepEqual(completion, {
    type: CARD_CREATE_COMPLETION_TYPES.IGNORED,
    ignored: true,
  });
  assert.equal(parseCalls, 0);
});

test('card-create response completion ignores stale server failures before UI error plans', () => {
  const completion = getCardCreateResponseCompletion({
    isCurrent: false,
    responseOk: false,
    payload: { error: 'Token expired' },
  });

  assert.deepEqual(completion, {
    type: CARD_CREATE_COMPLETION_TYPES.IGNORED,
    ignored: true,
  });
});

test('card-create response completion preserves current non-OK error behavior', () => {
  let parseCalls = 0;
  assert.deepEqual(
    getCardCreateResponseCompletion({
      isCurrent: true,
      responseOk: false,
      payload: { error: 'Deck not found' },
      parseCreatedCard() {
        parseCalls += 1;
        return {};
      },
    }),
    {
      type: CARD_CREATE_COMPLETION_TYPES.SERVER_ERROR,
      ignored: false,
      error: 'Deck not found',
    },
  );
  assert.equal(parseCalls, 0);
  assert.equal(getCreateCardFailureMessage({}), CARD_CREATE_MESSAGES.createFailed);
});

test('card-create response completion returns current validated success plans', () => {
  const createdCard = {
    id: 11,
    front_content: 'Front',
    back_content: 'Back',
  };

  assert.deepEqual(
    getCardCreateResponseCompletion({
      isCurrent: true,
      responseOk: true,
      payload: createdCard,
    }),
    {
      type: CARD_CREATE_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      createdCard,
      success: CARD_CREATE_MESSAGES.success,
    },
  );
});

test('card-create response completion converts malformed current successes to generic error plans', () => {
  assert.deepEqual(
    getCardCreateResponseCompletion({
      isCurrent: true,
      responseOk: true,
      payload: { id: 11, front_content: 'Front' },
    }),
    {
      type: CARD_CREATE_COMPLETION_TYPES.INVALID_RESPONSE,
      ignored: false,
      error: CARD_CREATE_MESSAGES.createFailed,
    },
  );
});

test('card-create network and finally completions honor the current guard', () => {
  assert.deepEqual(
    getCardCreateNetworkFailureCompletion({ isCurrent: false }),
    {
      type: CARD_CREATE_COMPLETION_TYPES.IGNORED,
      ignored: true,
    },
  );
  assert.deepEqual(
    getCardCreateNetworkFailureCompletion({ isCurrent: true }),
    {
      type: CARD_CREATE_COMPLETION_TYPES.NETWORK_ERROR,
      ignored: false,
      error: CARD_CREATE_MESSAGES.networkFailed,
    },
  );
  assert.equal(shouldRunCardCreateFinallyCleanup({ isCurrent: false }), false);
  assert.equal(shouldRunCardCreateFinallyCleanup({ isCurrent: true }), true);
});
