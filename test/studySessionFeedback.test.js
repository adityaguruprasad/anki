const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS,
  getStudySessionQualityLabel,
  getStudySessionSubmissionFeedback,
  getStudySessionSubmissionRecovery,
  getValidatedStudySessionSubmissionResponse,
  parseStudySessionSubmissionResponse,
} = require('../studySessionFeedback');
const { MAX_POSTGRES_SERIAL_ID } = require('../cardIdentifier');

test('getStudySessionQualityLabel maps visible study answer qualities', () => {
  assert.equal(getStudySessionQualityLabel(1), 'Hard');
  assert.equal(getStudySessionQualityLabel(3), 'Good');
  assert.equal(getStudySessionQualityLabel(5), 'Easy');
});

test('getStudySessionSubmissionFeedback includes recognized quality and next review time', () => {
  const feedback = getStudySessionSubmissionFeedback({
    quality: 3,
    response: {
      success: true,
      card: {
        next_review: '2026-05-09T14:30:00.000Z',
      },
    },
    formatDate: (date) => date.toISOString(),
  });

  assert.deepEqual(feedback, {
    message: 'Answered Good. Next review: 2026-05-09T14:30:00.000Z.',
  });
});

test('getStudySessionSubmissionFeedback falls back when scheduling metadata is missing', () => {
  const feedback = getStudySessionSubmissionFeedback({
    quality: 5,
    response: { success: true },
  });

  assert.deepEqual(feedback, {
    message: 'Answered Easy. Review schedule updated.',
  });
});

test('getStudySessionSubmissionFeedback falls back for unrecognized quality and invalid next review', () => {
  const feedback = getStudySessionSubmissionFeedback({
    quality: 4,
    response: {
      success: true,
      card: {
        next_review: 'not-a-date',
      },
    },
  });

  assert.deepEqual(feedback, {
    message: 'Answer submitted. Review schedule updated.',
  });
});

test('getStudySessionSubmissionFeedback ignores parseable timestamps outside the API contract', () => {
  [
    '2026-05-09',
    '2026-05-09T14:30:00',
    '2026-05-09T14:30:00.000Z ',
  ].forEach((nextReview) => {
    let formatDateCallCount = 0;
    const feedback = getStudySessionSubmissionFeedback({
      quality: 3,
      response: {
        success: true,
        card: {
          next_review: nextReview,
        },
      },
      formatDate() {
        formatDateCallCount += 1;
        return 'unexpected date';
      },
    });

    assert.deepEqual(feedback, {
      message: 'Answered Good. Review schedule updated.',
    });
    assert.equal(formatDateCallCount, 0, `formatDate was called for ${JSON.stringify(nextReview)}`);
  });
});

test('getStudySessionSubmissionRecovery maps stale-card conflicts to next-card recovery', () => {
  assert.deepEqual(getStudySessionSubmissionRecovery({ status: 409 }), {
    action: STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS.LOAD_NEXT_DUE_CARD,
    message: 'This card was already rescheduled and is no longer due. Moving to the next due card.',
  });
});

test('getStudySessionSubmissionRecovery ignores non-conflict submission responses', () => {
  [
    null,
    undefined,
    {},
    { status: 200 },
    { status: 400 },
    { status: 500 },
    { status: '409' },
  ].forEach((response) => {
    assert.equal(getStudySessionSubmissionRecovery(response), null);
  });
});

test('parseStudySessionSubmissionResponse returns parsed objects and ignores unsafe bodies', () => {
  assert.deepEqual(
    parseStudySessionSubmissionResponse('{"success":true,"card":{"next_review":"2026-05-09T14:30:00.000Z"}}'),
    {
      success: true,
      card: {
        next_review: '2026-05-09T14:30:00.000Z',
      },
    },
  );
  assert.equal(parseStudySessionSubmissionResponse(''), null);
  assert.equal(parseStudySessionSubmissionResponse('not json'), null);
  assert.equal(parseStudySessionSubmissionResponse('[{"success":true}]'), null);
});

test('getValidatedStudySessionSubmissionResponse preserves valid submission payloads', () => {
  const response = {
    success: true,
    card: {
      id: 7,
      next_review: '2026-05-09T14:30:00.000Z',
      last_reviewed: '2026-05-08T14:30:00.000Z',
      interval: 3,
      ease_factor: 2.6,
      review_count: 4,
    },
    message: 'Answer submitted',
  };

  assert.equal(getValidatedStudySessionSubmissionResponse(response), response);
  // Passing expectedId matches the submitted card; omitting it keeps legacy helper behavior.
  assert.equal(
    getValidatedStudySessionSubmissionResponse(response, { expectedId: ' 0007 ' }),
    response,
  );

  const boundaryResponse = {
    success: true,
    card: {
      id: MAX_POSTGRES_SERIAL_ID,
      next_review: '2026-05-09T14:30:00.000Z',
      last_reviewed: '2026-05-08T14:30:00.000Z',
      interval: 36500,
      ease_factor: 1.3,
      review_count: 0,
    },
  };
  assert.equal(getValidatedStudySessionSubmissionResponse(boundaryResponse), boundaryResponse);

  const sameInstantResponse = {
    success: true,
    card: {
      id: 2,
      next_review: '2026-05-09T14:30:00.000Z',
      last_reviewed: '2026-05-09T14:30:00.000Z',
      interval: 1,
      ease_factor: 1.3,
      review_count: 0,
    },
  };
  assert.equal(getValidatedStudySessionSubmissionResponse(sameInstantResponse), sameInstantResponse);
});

test('getValidatedStudySessionSubmissionResponse rejects malformed submission payloads', () => {
  const validCard = {
    id: 1,
    next_review: '2026-05-09T14:30:00.000Z',
    last_reviewed: '2026-05-08T14:30:00.000Z',
    interval: 3,
    ease_factor: 2.6,
    review_count: 4,
  };

  [
    null,
    [],
    'response',
    { success: true },
    { card: validCard },
    { success: false, card: validCard },
    { success: 'true', card: validCard },
    { success: true, card: null },
    { success: true, card: [] },
    { success: true, card: { ...validCard, id: 0 } },
    { success: true, card: { ...validCard, id: -1 } },
    { success: true, card: { ...validCard, id: 1.5 } },
    { success: true, card: { ...validCard, id: MAX_POSTGRES_SERIAL_ID + 1 } },
    { success: true, card: { ...validCard, id: Number.MAX_SAFE_INTEGER } },
    { success: true, card: { ...validCard, id: Number.MAX_SAFE_INTEGER + 1 } },
    { success: true, card: { ...validCard, id: '1' } },
    { success: true, card: { ...validCard, next_review: '' } },
    { success: true, card: { ...validCard, next_review: 'not-a-date' } },
    { success: true, card: { ...validCard, next_review: '2026-05-09' } },
    { success: true, card: { ...validCard, next_review: '2026-05-09T14:30:00' } },
    { success: true, card: { ...validCard, next_review: '2026-05-09T14:30:00.000Z ' } },
    { success: true, card: { ...validCard, next_review: new Date('2026-05-09T14:30:00.000Z') } },
    { success: true, card: { ...validCard, last_reviewed: undefined } },
    { success: true, card: { ...validCard, last_reviewed: null } },
    { success: true, card: { ...validCard, last_reviewed: 'not-a-date' } },
    { success: true, card: { ...validCard, last_reviewed: '2026-05-08' } },
    { success: true, card: { ...validCard, last_reviewed: '2026-05-08T14:30:00' } },
    { success: true, card: { ...validCard, last_reviewed: '2026-05-09T14:30:00.001Z' } },
    { success: true, card: { ...validCard, interval: undefined } },
    { success: true, card: { ...validCard, interval: 0 } },
    { success: true, card: { ...validCard, interval: 36501 } },
    { success: true, card: { ...validCard, interval: 1.5 } },
    { success: true, card: { ...validCard, interval: '3' } },
    { success: true, card: { ...validCard, ease_factor: undefined } },
    { success: true, card: { ...validCard, ease_factor: 1.29 } },
    { success: true, card: { ...validCard, ease_factor: Number.NaN } },
    { success: true, card: { ...validCard, ease_factor: Number.POSITIVE_INFINITY } },
    { success: true, card: { ...validCard, ease_factor: '2.6' } },
    { success: true, card: { ...validCard, review_count: undefined } },
    { success: true, card: { ...validCard, review_count: -1 } },
    { success: true, card: { ...validCard, review_count: 1.5 } },
    { success: true, card: { ...validCard, review_count: '4' } },
  ].forEach((response) => {
    assert.equal(getValidatedStudySessionSubmissionResponse(response), null);
  });
});

test('getValidatedStudySessionSubmissionResponse rejects malformed card ids even when expected', () => {
  const response = {
    success: true,
    card: {
      id: '../7',
      next_review: '2026-05-09T14:30:00.000Z',
      last_reviewed: '2026-05-08T14:30:00.000Z',
      interval: 3,
      ease_factor: 2.6,
      review_count: 4,
    },
  };

  assert.equal(getValidatedStudySessionSubmissionResponse(response, { expectedId: '7' }), null);
});

test('getValidatedStudySessionSubmissionResponse rejects stale card ids when expected', () => {
  const response = {
    success: true,
    card: {
      id: 8,
      next_review: '2026-05-09T14:30:00.000Z',
      last_reviewed: '2026-05-08T14:30:00.000Z',
      interval: 3,
      ease_factor: 2.6,
      review_count: 4,
    },
  };

  assert.equal(getValidatedStudySessionSubmissionResponse(response, { expectedId: 7 }), null);
  assert.equal(getValidatedStudySessionSubmissionResponse(response, { expectedId: '7' }), null);
  assert.equal(getValidatedStudySessionSubmissionResponse(response, { expectedId: null }), null);
});
