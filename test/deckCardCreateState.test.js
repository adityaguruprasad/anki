const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CARD_CREATE_MESSAGES,
  MAX_CARD_CONTENT_LENGTH,
  createCardSubmission,
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
