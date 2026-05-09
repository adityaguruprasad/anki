const test = require('node:test');
const assert = require('node:assert/strict');

const {
  STUDY_SESSION_NOTICE_TYPES,
  getStudySessionNotice,
} = require('../studySessionNotice');

test('getStudySessionNotice makes due-card fetch failures retryable with a deck-management fallback', () => {
  const notice = getStudySessionNotice(STUDY_SESSION_NOTICE_TYPES.DUE_CARD_FETCH_ERROR);

  assert.equal(notice.title, 'Unable to load cards for this deck');
  assert.equal(notice.message, 'Try again or manage your decks to choose another deck.');
  assert.equal(notice.canRetry, true);
  assert.equal(notice.canManageDecks, true);
  assert.deepEqual(Object.keys(notice).sort(), ['canManageDecks', 'canRetry', 'message', 'title']);
});

test('getStudySessionNotice keeps no-due cards non-retryable while still offering deck management', () => {
  const notice = getStudySessionNotice(STUDY_SESSION_NOTICE_TYPES.NO_DUE_CARDS);

  assert.equal(notice.title, 'No due cards right now');
  assert.equal(notice.canRetry, false);
  assert.equal(notice.canManageDecks, true);
});

test('getStudySessionNotice keeps deck availability fetch failures retryable', () => {
  const notice = getStudySessionNotice(STUDY_SESSION_NOTICE_TYPES.DECK_AVAILABILITY_ERROR);

  assert.equal(notice.title, 'Unable to check deck availability');
  assert.equal(notice.canRetry, true);
  assert.equal(notice.canManageDecks, true);
});

test('getStudySessionNotice throws for unknown notice types', () => {
  assert.throws(
    () => getStudySessionNotice('unsupported-notice'),
    /Unknown study session notice type: unsupported-notice/,
  );
});
