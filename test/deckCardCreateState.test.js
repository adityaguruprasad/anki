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
  validateCardSubmissionContent,
} = require('../deckCardCreateState');

const VALID_NEXT_REVIEW = '2026-05-10T12:00:00.000Z';

function createValidCreatedCard(overrides = {}) {
  return {
    id: 11,
    front_content: 'Front',
    back_content: 'Back',
    next_review: VALID_NEXT_REVIEW,
    interval: 1,
    ease_factor: 2.5,
    review_count: 0,
    ...overrides,
  };
}

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

test('validateCardSubmissionContent rejects unsafe text before card mutations submit', () => {
  [
    [
      { frontContent: 'Front\u0000', backContent: 'Back' },
      CARD_CREATE_MESSAGES.frontUnsafe,
    ],
    [
      { frontContent: 'Question\u202E1', backContent: 'Back' },
      CARD_CREATE_MESSAGES.frontUnsafe,
    ],
    [
      { frontContent: 'Front', backContent: 'Back\u0000' },
      CARD_CREATE_MESSAGES.backUnsafe,
    ],
    [
      { frontContent: 'Front', backContent: 'Answer\u200B1' },
      CARD_CREATE_MESSAGES.backUnsafe,
    ],
  ].forEach(([input, error]) => {
    assert.deepEqual(validateCardSubmissionContent(input), {
      ok: false,
      error,
    });
  });
});

test('createCardSubmission rejects unsafe content without starting submission', () => {
  assert.deepEqual(
    createCardSubmission({
      frontContent: 'Front\u2066',
      backContent: 'Back',
      isSubmitting: false,
    }),
    {
      ok: false,
      blocked: false,
      error: CARD_CREATE_MESSAGES.frontUnsafe,
    },
  );
});

test('createCardSubmission blocks unsafe content while a submission is in flight', () => {
  assert.deepEqual(
    createCardSubmission({
      frontContent: 'Front\u2066',
      backContent: 'Back\u0000',
      isSubmitting: true,
    }),
    {
      ok: false,
      blocked: true,
    },
  );
});

test('validateCardSubmissionContent keeps allowed joiners in study text', () => {
  // ZWNJ/ZWJ can carry meaning in human-authored study text, so they are preserved.
  assert.deepEqual(
    validateCardSubmissionContent({
      frontContent: 'Biology\u200C101',
      backContent: 'Answer\u200D1',
    }),
    {
      ok: true,
      frontContent: 'Biology\u200C101',
      backContent: 'Answer\u200D1',
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

test('getCreateCardFailureMessage returns trimmed non-empty string server errors', () => {
  [
    [{ error: 'Deck not found' }, 'Deck not found'],
    [{ error: '  Deck not found  ' }, 'Deck not found'],
    [{ error: '\nDeck not found\t' }, 'Deck not found'],
    [{ error: 'Deck   not found' }, 'Deck   not found'],
  ].forEach(([payload, expected]) => {
    assert.equal(getCreateCardFailureMessage(payload), expected);
  });
});

test('getCreateCardFailureMessage preserves null-prototype own data server errors', () => {
  const payload = Object.create(null);
  payload.error = '  Deck not found  ';

  assert.equal(getCreateCardFailureMessage(payload), 'Deck not found');
});

test('getCreateCardFailureMessage ignores inherited server errors without invoking getters', () => {
  const dataBackedPayload = Object.create({
    error: 'Inherited error should not surface.',
  });

  assert.equal(
    getCreateCardFailureMessage(dataBackedPayload),
    CARD_CREATE_MESSAGES.createFailed,
  );

  let getterCalls = 0;
  const prototype = {};
  Object.defineProperty(prototype, 'error', {
    get() {
      getterCalls += 1;
      throw new Error('prototype error getter should not run');
    },
  });

  assert.equal(
    getCreateCardFailureMessage(Object.create(prototype)),
    CARD_CREATE_MESSAGES.createFailed,
  );
  assert.equal(getterCalls, 0);
});

test('getCreateCardFailureMessage ignores own accessor server errors without invoking getters', () => {
  let getterCalls = 0;
  const payload = {};

  Object.defineProperty(payload, 'error', {
    get() {
      getterCalls += 1;
      throw new Error('own error getter should not run');
    },
  });

  assert.equal(
    getCreateCardFailureMessage(payload),
    CARD_CREATE_MESSAGES.createFailed,
  );
  assert.equal(getterCalls, 0);
});

test('getCreateCardFailureMessage falls back when response has no usable server error', () => {
  const arrayPayload = [];
  arrayPayload.error = 'Array error should not surface.';

  [
    undefined,
    null,
    'Deck not found',
    404,
    true,
    {},
    arrayPayload,
    { error: '' },
    { error: '   ' },
    { error: 404 },
    { error: { message: 'Deck not found' } },
    { error: ['Deck not found'] },
  ].forEach((payload) => {
    assert.equal(
      getCreateCardFailureMessage(payload),
      CARD_CREATE_MESSAGES.createFailed,
    );
  });
});

test('card-create response completion trims non-OK string server errors', () => {
  assert.deepEqual(
    getCardCreateResponseCompletion({
      isCurrent: true,
      responseOk: false,
      payload: { error: '  Deck not found  ' },
    }),
    {
      type: CARD_CREATE_COMPLETION_TYPES.SERVER_ERROR,
      ignored: false,
      error: 'Deck not found',
    },
  );
});

test('card-create response completion returns current validated success plans', () => {
  const createdCard = createValidCreatedCard();

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

test('card-create response completion preserves legacy parser calls without an expected deck id', () => {
  const createdCard = createValidCreatedCard();

  assert.deepEqual(
    getCardCreateResponseCompletion({
      isCurrent: true,
      responseOk: true,
      payload: createdCard,
      parseCreatedCard(payload) {
        assert.equal(arguments.length, 1);
        assert.equal(payload, createdCard);
        return payload;
      },
    }),
    {
      type: CARD_CREATE_COMPLETION_TYPES.SUCCESS,
      ignored: false,
      createdCard,
      success: CARD_CREATE_MESSAGES.success,
    },
  );
});

test('card-create response completion can require created cards to match the target deck', () => {
  const createdCard = createValidCreatedCard({ deck_id: '00042' });

  assert.deepEqual(
    getCardCreateResponseCompletion({
      expectedDeckId: 42,
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

  assert.deepEqual(
    getCardCreateResponseCompletion({
      expectedDeckId: 41,
      isCurrent: true,
      responseOk: true,
      payload: createdCard,
    }),
    {
      type: CARD_CREATE_COMPLETION_TYPES.INVALID_RESPONSE,
      ignored: false,
      error: CARD_CREATE_MESSAGES.createFailed,
    },
  );
});

test('card-create response completion accepts null, past, and future next_review metadata', () => {
  [
    null,
    '2026-05-08T12:00:00.000Z',
    '2026-05-10T12:00:00.000Z',
  ].forEach((nextReview) => {
    const createdCard = createValidCreatedCard({ next_review: nextReview });

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

test('card-create response completion rejects untrustworthy next_review metadata', () => {
  [
    { id: 11, front_content: 'Front', back_content: 'Back' },
    createValidCreatedCard({ next_review: undefined }),
    createValidCreatedCard({ next_review: '' }),
    createValidCreatedCard({ next_review: '  ' }),
    createValidCreatedCard({ next_review: 'not-a-date' }),
    createValidCreatedCard({ next_review: '2026-05-10' }),
    createValidCreatedCard({ next_review: '2026-05-10T12:00:00.000Z ' }),
    createValidCreatedCard({ next_review: 0 }),
    createValidCreatedCard({ next_review: false }),
    createValidCreatedCard({ next_review: new Date(VALID_NEXT_REVIEW) }),
    createValidCreatedCard({ next_review: ['2026-05-10T12:00:00.000Z'] }),
  ].forEach((payload) => {
    assert.deepEqual(
      getCardCreateResponseCompletion({
        isCurrent: true,
        responseOk: true,
        payload,
      }),
      {
        type: CARD_CREATE_COMPLETION_TYPES.INVALID_RESPONSE,
        ignored: false,
        error: CARD_CREATE_MESSAGES.createFailed,
      },
    );
  });
});

test('card-create response completion rejects malformed scheduling metadata', () => {
  [
    { id: 11, front_content: 'Front', back_content: 'Back', next_review: VALID_NEXT_REVIEW },
    createValidCreatedCard({ interval: 0 }),
    createValidCreatedCard({ interval: 36501 }),
    createValidCreatedCard({ interval: '1' }),
    createValidCreatedCard({ ease_factor: 1.29 }),
    createValidCreatedCard({ ease_factor: Number.NaN }),
    createValidCreatedCard({ ease_factor: '2.5' }),
    createValidCreatedCard({ review_count: -1 }),
    createValidCreatedCard({ review_count: 1.5 }),
    createValidCreatedCard({ review_count: '0' }),
  ].forEach((payload) => {
    assert.deepEqual(
      getCardCreateResponseCompletion({
        isCurrent: true,
        responseOk: true,
        payload,
      }),
      {
        type: CARD_CREATE_COMPLETION_TYPES.INVALID_RESPONSE,
        ignored: false,
        error: CARD_CREATE_MESSAGES.createFailed,
      },
    );
  });
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
