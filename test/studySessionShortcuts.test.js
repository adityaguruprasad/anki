const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getStudySessionAnswerShortcutQuality,
  getStudySessionShortcutAction,
  isEditableShortcutTarget,
  STUDY_SESSION_SHORTCUT_ACTIONS,
} = require('../studySessionShortcuts');

test('getStudySessionAnswerShortcutQuality maps number keys to visible answer qualities', () => {
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '1', target: { tagName: 'DIV' } }), 1);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '2', target: { tagName: 'DIV' } }), 3);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '3', target: { tagName: 'DIV' } }), 5);
});

test('getStudySessionAnswerShortcutQuality rejects non-answer keys and modified key presses', () => {
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '0', target: { tagName: 'DIV' } }), null);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '4', target: { tagName: 'DIV' } }), null);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '5', target: { tagName: 'DIV' } }), null);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: 'a', target: { tagName: 'DIV' } }), null);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: 'ArrowRight', target: { tagName: 'DIV' } }), null);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '1', ctrlKey: true, target: { tagName: 'DIV' } }), null);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '1', repeat: true, target: { tagName: 'DIV' } }), null);
});

test('getStudySessionAnswerShortcutQuality rejects editable targets', () => {
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '1', target: { tagName: 'INPUT' } }), null);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '2', target: { tagName: 'textarea' } }), null);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '3', target: { tagName: 'select' } }), null);
  assert.equal(
    getStudySessionAnswerShortcutQuality({ key: '1', target: { tagName: 'DIV', isContentEditable: true } }),
    null,
  );
});

test('isEditableShortcutTarget rejects inherited contenteditable targets', () => {
  assert.equal(
    isEditableShortcutTarget({
      tagName: 'SPAN',
      parentElement: { tagName: 'DIV', contentEditable: 'true' },
    }),
    true,
  );
});

test('getStudySessionAnswerShortcutQuality allows normal non-editable targets', () => {
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '1', target: { tagName: 'BUTTON' } }), 1);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '3', target: { tagName: 'DIV' } }), 5);
});

test('getStudySessionShortcutAction maps reveal keys when answer is hidden', () => {
  const state = {
    currentCard: { id: 1 },
    isLoading: false,
    showAnswer: false,
  };

  assert.deepEqual(
    getStudySessionShortcutAction({ key: ' ', target: { tagName: 'DIV' } }, state),
    { type: STUDY_SESSION_SHORTCUT_ACTIONS.REVEAL_ANSWER },
  );
  assert.deepEqual(
    getStudySessionShortcutAction({ key: 'Enter', target: { tagName: 'DIV' } }, state),
    { type: STUDY_SESSION_SHORTCUT_ACTIONS.REVEAL_ANSWER },
  );
  assert.equal(getStudySessionShortcutAction({ key: 'Space', target: { tagName: 'DIV' } }, state), null);
});

test('getStudySessionShortcutAction only reveals with a card while hidden and not loading', () => {
  const event = { key: ' ', target: { tagName: 'DIV' } };

  assert.equal(
    getStudySessionShortcutAction(event, { currentCard: null, isLoading: false, showAnswer: false }),
    null,
  );
  assert.equal(
    getStudySessionShortcutAction(event, { currentCard: { id: 1 }, isLoading: true, showAnswer: false }),
    null,
  );
  assert.equal(
    getStudySessionShortcutAction(
      { key: 'Enter', target: { tagName: 'DIV' } },
      { currentCard: { id: 1 }, isLoading: false, showAnswer: true },
    ),
    null,
  );
});

test('getStudySessionShortcutAction swallows Space as a no-op when answer is visible', () => {
  const state = {
    currentCard: { id: 1 },
    isLoading: false,
    showAnswer: true,
  };

  assert.deepEqual(
    getStudySessionShortcutAction({ key: ' ', target: { tagName: 'DIV' } }, state),
    { type: STUDY_SESSION_SHORTCUT_ACTIONS.NO_OP },
  );
  assert.deepEqual(
    getStudySessionShortcutAction({ key: ' ', repeat: true, target: { tagName: 'DIV' } }, state),
    { type: STUDY_SESSION_SHORTCUT_ACTIONS.NO_OP },
  );
  assert.equal(getStudySessionShortcutAction({ key: 'Space', target: { tagName: 'DIV' } }, state), null);
});

test('getStudySessionShortcutAction ignores repeated reveal and grade shortcut actions', () => {
  const hiddenAnswerState = {
    currentCard: { id: 1 },
    isLoading: false,
    showAnswer: false,
  };
  const visibleAnswerState = {
    currentCard: { id: 1 },
    isLoading: false,
    showAnswer: true,
  };

  assert.equal(
    getStudySessionShortcutAction({ key: ' ', repeat: true, target: { tagName: 'DIV' } }, hiddenAnswerState),
    null,
  );
  assert.equal(
    getStudySessionShortcutAction({ key: 'Enter', repeat: true, target: { tagName: 'DIV' } }, hiddenAnswerState),
    null,
  );
  assert.equal(
    getStudySessionShortcutAction({ key: '1', repeat: true, target: { tagName: 'DIV' } }, visibleAnswerState),
    null,
  );
  assert.equal(
    getStudySessionShortcutAction({ key: '2', repeat: true, target: { tagName: 'DIV' } }, visibleAnswerState),
    null,
  );
  assert.equal(
    getStudySessionShortcutAction({ key: '3', repeat: true, target: { tagName: 'DIV' } }, visibleAnswerState),
    null,
  );
});

test('getStudySessionShortcutAction rejects editable targets for reveal and grade shortcuts', () => {
  assert.equal(
    getStudySessionShortcutAction(
      { key: 'Enter', target: { tagName: 'INPUT' } },
      { currentCard: { id: 1 }, isLoading: false, showAnswer: false },
    ),
    null,
  );
  assert.equal(
    getStudySessionShortcutAction(
      {
        key: ' ',
        target: {
          tagName: 'SPAN',
          parentElement: { tagName: 'DIV', contentEditable: 'true' },
        },
      },
      { currentCard: { id: 1 }, isLoading: false, showAnswer: false },
    ),
    null,
  );
  assert.equal(
    getStudySessionShortcutAction(
      { key: '1', target: { tagName: 'TEXTAREA' } },
      { currentCard: { id: 1 }, isLoading: false, showAnswer: true },
    ),
    null,
  );
});

test('getStudySessionShortcutAction rejects grade shortcuts while answer is hidden', () => {
  const state = {
    currentCard: { id: 1 },
    isLoading: false,
    showAnswer: false,
  };

  assert.equal(getStudySessionShortcutAction({ key: '1', target: { tagName: 'DIV' } }, state), null);
  assert.equal(getStudySessionShortcutAction({ key: '2', target: { tagName: 'DIV' } }, state), null);
  assert.equal(getStudySessionShortcutAction({ key: '3', target: { tagName: 'DIV' } }, state), null);
});

test('getStudySessionShortcutAction maps grade shortcuts when answer is visible', () => {
  const state = {
    currentCard: { id: 1 },
    isLoading: false,
    showAnswer: true,
  };

  assert.deepEqual(
    getStudySessionShortcutAction({ key: '1', target: { tagName: 'DIV' } }, state),
    { type: STUDY_SESSION_SHORTCUT_ACTIONS.GRADE_ANSWER, quality: 1 },
  );
  assert.deepEqual(
    getStudySessionShortcutAction({ key: '2', target: { tagName: 'DIV' } }, state),
    { type: STUDY_SESSION_SHORTCUT_ACTIONS.GRADE_ANSWER, quality: 3 },
  );
  assert.deepEqual(
    getStudySessionShortcutAction({ key: '3', target: { tagName: 'DIV' } }, state),
    { type: STUDY_SESSION_SHORTCUT_ACTIONS.GRADE_ANSWER, quality: 5 },
  );
  assert.deepEqual(
    getStudySessionShortcutAction({ key: ' ', target: { tagName: 'DIV' } }, state),
    { type: STUDY_SESSION_SHORTCUT_ACTIONS.NO_OP },
  );
});
