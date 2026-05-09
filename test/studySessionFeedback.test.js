const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getStudySessionQualityLabel,
  getStudySessionSubmissionFeedback,
  parseStudySessionSubmissionResponse,
} = require('../studySessionFeedback');

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
