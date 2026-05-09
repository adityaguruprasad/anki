const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getStudySessionAnswerShortcutQuality,
  isEditableShortcutTarget,
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
