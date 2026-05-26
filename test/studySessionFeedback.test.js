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

function createValidSubmissionCard(overrides = {}) {
  return {
    id: 7,
    next_review: '2026-05-09T14:30:00.000Z',
    last_reviewed: '2026-05-08T14:30:00.000Z',
    interval: 3,
    ease_factor: 2.6,
    review_count: 4,
    ...overrides,
  };
}

function createNullPrototypeRecord(properties) {
  const record = Object.create(null);

  Object.entries(properties).forEach(([fieldName, value]) => {
    Object.defineProperty(record, fieldName, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  });

  return record;
}

function defineThrowingGetter(object, fieldName) {
  Object.defineProperty(object, fieldName, {
    configurable: true,
    get() {
      throw new Error(`Unexpected ${fieldName} getter invocation`);
    },
  });
}

function defineTrackedThrowingGetter(object, fieldName) {
  const tracker = { calls: 0 };

  Object.defineProperty(object, fieldName, {
    configurable: true,
    get() {
      tracker.calls += 1;
      throw new Error(`Unexpected ${fieldName} getter invocation`);
    },
  });

  return tracker;
}

function getDefaultFormattedNextReview(nextReview) {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(nextReview));
}

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

test('getStudySessionSubmissionFeedback ignores accessor-backed response fields without invoking getters', () => {
  const accessorResponse = {};
  defineThrowingGetter(accessorResponse, 'card');

  assert.deepEqual(
    getStudySessionSubmissionFeedback({
      quality: 3,
      response: accessorResponse,
      formatDate() {
        throw new Error('formatDate should not run');
      },
    }),
    { message: 'Answered Good. Review schedule updated.' },
  );

  const accessorCard = {};
  defineThrowingGetter(accessorCard, 'next_review');

  assert.deepEqual(
    getStudySessionSubmissionFeedback({
      quality: 3,
      response: { card: accessorCard },
      formatDate() {
        throw new Error('formatDate should not run');
      },
    }),
    { message: 'Answered Good. Review schedule updated.' },
  );
});

test('getStudySessionSubmissionFeedback accepts null-prototype own-data options', () => {
  const nextReview = '2026-05-09T14:30:00.000Z';
  const options = createNullPrototypeRecord({
    quality: 3,
    response: createNullPrototypeRecord({
      success: true,
      card: createNullPrototypeRecord({
        next_review: nextReview,
      }),
    }),
    formatDate: (date) => date.toISOString(),
  });

  assert.deepEqual(getStudySessionSubmissionFeedback(options), {
    message: `Answered Good. Next review: ${nextReview}.`,
  });
});

test('getStudySessionSubmissionFeedback ignores inherited option fields without invoking getters', () => {
  const inheritedDataOptions = Object.create({
    quality: 3,
    response: {
      success: true,
      card: {
        next_review: '2026-05-09T14:30:00.000Z',
      },
    },
    formatDate() {
      return 'inherited date';
    },
  });

  assert.deepEqual(getStudySessionSubmissionFeedback(inheritedDataOptions), {
    message: 'Answer submitted. Review schedule updated.',
  });

  const accessorPrototype = {};
  const qualityTracker = defineTrackedThrowingGetter(accessorPrototype, 'quality');
  const responseTracker = defineTrackedThrowingGetter(accessorPrototype, 'response');
  const formatDateTracker = defineTrackedThrowingGetter(accessorPrototype, 'formatDate');

  assert.deepEqual(getStudySessionSubmissionFeedback(Object.create(accessorPrototype)), {
    message: 'Answer submitted. Review schedule updated.',
  });
  assert.equal(qualityTracker.calls, 0);
  assert.equal(responseTracker.calls, 0);
  assert.equal(formatDateTracker.calls, 0);

  const nextReview = '2026-05-09T14:30:00.000Z';
  const inheritedFormatDateOptions = Object.create({
    formatDate() {
      return 'inherited date';
    },
  });
  inheritedFormatDateOptions.quality = 3;
  inheritedFormatDateOptions.response = {
    success: true,
    card: {
      next_review: nextReview,
    },
  };

  assert.deepEqual(getStudySessionSubmissionFeedback(inheritedFormatDateOptions), {
    message: `Answered Good. Next review: ${getDefaultFormattedNextReview(nextReview)}.`,
  });
});

test('getStudySessionSubmissionFeedback ignores own accessor-backed option fields without invoking getters', () => {
  const accessorOptions = {};
  const qualityTracker = defineTrackedThrowingGetter(accessorOptions, 'quality');
  const responseTracker = defineTrackedThrowingGetter(accessorOptions, 'response');
  const formatDateTracker = defineTrackedThrowingGetter(accessorOptions, 'formatDate');

  assert.deepEqual(getStudySessionSubmissionFeedback(accessorOptions), {
    message: 'Answer submitted. Review schedule updated.',
  });
  assert.equal(qualityTracker.calls, 0);
  assert.equal(responseTracker.calls, 0);
  assert.equal(formatDateTracker.calls, 0);

  const nextReview = '2026-05-09T14:30:00.000Z';
  const formatDateAccessorOptions = {
    quality: 3,
    response: {
      success: true,
      card: {
        next_review: nextReview,
      },
    },
  };
  const fallbackFormatDateTracker = defineTrackedThrowingGetter(
    formatDateAccessorOptions,
    'formatDate',
  );

  assert.deepEqual(getStudySessionSubmissionFeedback(formatDateAccessorOptions), {
    message: `Answered Good. Next review: ${getDefaultFormattedNextReview(nextReview)}.`,
  });
  assert.equal(fallbackFormatDateTracker.calls, 0);
});

test('getStudySessionSubmissionFeedback ignores array-shaped options even with own named fields', () => {
  const options = [];
  options.quality = 3;
  options.response = {
    success: true,
    card: {
      next_review: '2026-05-09T14:30:00.000Z',
    },
  };
  options.formatDate = () => 'array date';

  assert.deepEqual(getStudySessionSubmissionFeedback(options), {
    message: 'Answer submitted. Review schedule updated.',
  });

  const accessorOptions = [];
  const qualityTracker = defineTrackedThrowingGetter(accessorOptions, 'quality');
  const responseTracker = defineTrackedThrowingGetter(accessorOptions, 'response');
  const formatDateTracker = defineTrackedThrowingGetter(accessorOptions, 'formatDate');

  assert.deepEqual(getStudySessionSubmissionFeedback(accessorOptions), {
    message: 'Answer submitted. Review schedule updated.',
  });
  assert.equal(qualityTracker.calls, 0);
  assert.equal(responseTracker.calls, 0);
  assert.equal(formatDateTracker.calls, 0);
});

test('getStudySessionSubmissionRecovery maps validated stale-card conflicts to next-card recovery', () => {
  assert.deepEqual(getStudySessionSubmissionRecovery({ status: 409 }, { error: 'Card is not due' }), {
    action: STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS.LOAD_NEXT_DUE_CARD,
    message: 'This card was already rescheduled and is no longer due. Moving to the next due card.',
  });
});

test('getStudySessionSubmissionRecovery reads stale conflict errors from own data properties only', () => {
  const prototype = {};
  defineThrowingGetter(prototype, 'error');
  const payload = Object.create(prototype);
  Object.defineProperty(payload, 'error', {
    value: 'Card is not due',
    enumerable: false,
  });

  assert.deepEqual(getStudySessionSubmissionRecovery({ status: 409 }, payload), {
    action: STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS.LOAD_NEXT_DUE_CARD,
    message: 'This card was already rescheduled and is no longer due. Moving to the next due card.',
  });
});

test('getStudySessionSubmissionRecovery ignores non-conflict or malformed submission responses', () => {
  const throwingStatusResponse = {};
  Object.defineProperty(throwingStatusResponse, 'status', {
    get() {
      throw new Error('status unavailable');
    },
  });

  [
    [null, { error: 'Card is not due' }],
    [undefined, { error: 'Card is not due' }],
    [{}, { error: 'Card is not due' }],
    [throwingStatusResponse, { error: 'Card is not due' }],
    [{ status: 200 }, { error: 'Card is not due' }],
    [{ status: 400 }, { error: 'Card is not due' }],
    [{ status: 500 }, { error: 'Card is not due' }],
    [{ status: '409' }, { error: 'Card is not due' }],
    [{ status: 409 }, null],
    [{ status: 409 }, undefined],
    [{ status: 409 }, {}],
    [{ status: 409 }, []],
    [{ status: 409 }, { error: null }],
    [{ status: 409 }, { error: 409 }],
    [{ status: 409 }, { error: 'Deck name already exists for this user' }],
    [{ status: 409 }, { error: 'card is not due' }],
  ].forEach(([response, payload]) => {
    assert.equal(getStudySessionSubmissionRecovery(response, payload), null);
  });
});

test('getStudySessionSubmissionRecovery rejects inherited and accessor-backed error payloads without invoking getters', () => {
  assert.equal(
    getStudySessionSubmissionRecovery(
      { status: 409 },
      Object.create({ error: 'Card is not due' }),
    ),
    null,
  );

  const accessorPayload = {};
  defineThrowingGetter(accessorPayload, 'error');
  assert.equal(getStudySessionSubmissionRecovery({ status: 409 }, accessorPayload), null);

  const accessorPrototype = {};
  defineThrowingGetter(accessorPrototype, 'error');
  assert.equal(
    getStudySessionSubmissionRecovery({ status: 409 }, Object.create(accessorPrototype)),
    null,
  );
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
});

test('getValidatedStudySessionSubmissionResponse accepts null-prototype response and card records', () => {
  const card = createNullPrototypeRecord(createValidSubmissionCard());
  const response = createNullPrototypeRecord({
    success: true,
    card,
    message: 'Answer submitted',
  });

  assert.equal(getValidatedStudySessionSubmissionResponse(response), response);
  assert.equal(
    getValidatedStudySessionSubmissionResponse(response, { expectedId: ' 0007 ' }),
    response,
  );
});

test('getValidatedStudySessionSubmissionResponse accepts null-prototype own-data options', () => {
  const response = {
    success: true,
    card: createValidSubmissionCard(),
  };

  assert.equal(
    getValidatedStudySessionSubmissionResponse(
      response,
      createNullPrototypeRecord({ expectedId: ' 0007 ' }),
    ),
    response,
  );
  assert.equal(
    getValidatedStudySessionSubmissionResponse(
      response,
      createNullPrototypeRecord({ expectedId: 8 }),
    ),
    null,
  );
});

test('getValidatedStudySessionSubmissionResponse ignores inherited option fields without invoking getters', () => {
  const response = {
    success: true,
    card: createValidSubmissionCard(),
  };

  assert.equal(
    getValidatedStudySessionSubmissionResponse(
      response,
      Object.create({ expectedId: 8 }),
    ),
    response,
  );

  const accessorPrototype = {};
  const expectedIdTracker = defineTrackedThrowingGetter(accessorPrototype, 'expectedId');

  assert.equal(
    getValidatedStudySessionSubmissionResponse(response, Object.create(accessorPrototype)),
    response,
  );
  assert.equal(expectedIdTracker.calls, 0);
});

test('getValidatedStudySessionSubmissionResponse ignores own accessor-backed option fields without invoking getters', () => {
  const response = {
    success: true,
    card: createValidSubmissionCard(),
  };
  const options = {};
  const expectedIdTracker = defineTrackedThrowingGetter(options, 'expectedId');

  assert.equal(getValidatedStudySessionSubmissionResponse(response, options), response);
  assert.equal(expectedIdTracker.calls, 0);
});

test('getValidatedStudySessionSubmissionResponse ignores array-shaped options even with own named fields', () => {
  const response = {
    success: true,
    card: createValidSubmissionCard(),
  };
  const options = [];
  options.expectedId = 8;

  assert.equal(getValidatedStudySessionSubmissionResponse(response, options), response);

  const accessorOptions = [];
  const expectedIdTracker = defineTrackedThrowingGetter(accessorOptions, 'expectedId');

  assert.equal(getValidatedStudySessionSubmissionResponse(response, accessorOptions), response);
  assert.equal(expectedIdTracker.calls, 0);
});

test('getValidatedStudySessionSubmissionResponse rejects inherited response and card fields without invoking getters', () => {
  const inheritedResponse = Object.create({
    success: true,
    card: createValidSubmissionCard(),
  });
  assert.equal(getValidatedStudySessionSubmissionResponse(inheritedResponse), null);

  assert.equal(
    getValidatedStudySessionSubmissionResponse({
      success: true,
      card: Object.create(createValidSubmissionCard()),
    }),
    null,
  );

  const accessorPrototype = {};
  defineThrowingGetter(accessorPrototype, 'success');
  defineThrowingGetter(accessorPrototype, 'card');
  assert.equal(getValidatedStudySessionSubmissionResponse(Object.create(accessorPrototype)), null);

  const validCard = createValidSubmissionCard();
  ['id', 'next_review', 'last_reviewed', 'interval', 'ease_factor', 'review_count'].forEach(
    (fieldName) => {
      const accessorCardPrototype = {};
      defineThrowingGetter(accessorCardPrototype, fieldName);
      const card = { ...validCard };
      delete card[fieldName];
      Object.setPrototypeOf(card, accessorCardPrototype);

      assert.equal(
        getValidatedStudySessionSubmissionResponse({ success: true, card }),
        null,
        fieldName,
      );
    },
  );
});

test('getValidatedStudySessionSubmissionResponse rejects accessor-backed response and card fields without invoking getters', () => {
  const accessorSuccessResponse = {};
  defineThrowingGetter(accessorSuccessResponse, 'success');
  assert.equal(getValidatedStudySessionSubmissionResponse(accessorSuccessResponse), null);

  const accessorCardResponse = { success: true };
  defineThrowingGetter(accessorCardResponse, 'card');
  assert.equal(getValidatedStudySessionSubmissionResponse(accessorCardResponse), null);

  const validCard = createValidSubmissionCard();
  ['id', 'next_review', 'last_reviewed', 'interval', 'ease_factor', 'review_count'].forEach(
    (fieldName) => {
      const card = { ...validCard };
      defineThrowingGetter(card, fieldName);

      assert.equal(
        getValidatedStudySessionSubmissionResponse({ success: true, card }),
        null,
        fieldName,
      );
    },
  );
});

test('getValidatedStudySessionSubmissionResponse requires next review after the review time', () => {
  const validCard = {
    id: 2,
    next_review: '2026-05-09T14:30:00.001Z',
    last_reviewed: '2026-05-09T14:30:00.000Z',
    interval: 1,
    ease_factor: 1.3,
    review_count: 0,
  };
  const response = {
    success: true,
    card: validCard,
  };
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

  assert.equal(getValidatedStudySessionSubmissionResponse(response), response);
  assert.equal(getValidatedStudySessionSubmissionResponse(sameInstantResponse), null);
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
