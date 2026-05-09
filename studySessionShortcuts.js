const ANSWER_SHORTCUT_QUALITIES = Object.freeze({
  1: 1,
  2: 3,
  3: 5,
});

const REVEAL_SHORTCUT_KEYS = new Set([' ', 'Enter']);
const STUDY_SESSION_SHORTCUT_ACTIONS = Object.freeze({
  GRADE_ANSWER: 'grade-answer',
  NO_OP: 'no-op',
  REVEAL_ANSWER: 'reveal-answer',
});

const EDITABLE_TAG_NAMES = new Set(['input', 'textarea', 'select']);

function getTagName(target) {
  if (typeof target?.tagName === 'string') {
    return target.tagName.toLowerCase();
  }

  if (typeof target?.nodeName === 'string') {
    return target.nodeName.toLowerCase();
  }

  return '';
}

function hasEditableAttribute(target) {
  if (typeof target?.getAttribute !== 'function') {
    return false;
  }

  const contentEditable = target.getAttribute('contenteditable');

  return typeof contentEditable === 'string' && contentEditable.toLowerCase() !== 'false';
}

function hasEditableProperty(target) {
  if (target?.isContentEditable) {
    return true;
  }

  if (typeof target?.contentEditable !== 'string') {
    return false;
  }

  const contentEditable = target.contentEditable.toLowerCase();

  return contentEditable !== '' && contentEditable !== 'false' && contentEditable !== 'inherit';
}

function isEditableShortcutTarget(target) {
  let currentTarget = target;

  while (currentTarget) {
    if (EDITABLE_TAG_NAMES.has(getTagName(currentTarget))) {
      return true;
    }

    if (hasEditableProperty(currentTarget) || hasEditableAttribute(currentTarget)) {
      return true;
    }

    currentTarget = currentTarget.parentElement || null;
  }

  return false;
}

function isUnmodifiedShortcutEvent(event) {
  if (
    !event
    || event.altKey
    || event.ctrlKey
    || event.metaKey
    || event.shiftKey
    || isEditableShortcutTarget(event.target)
  ) {
    return false;
  }

  return true;
}

function isPlainShortcutEvent(event) {
  return isUnmodifiedShortcutEvent(event) && !event.repeat;
}

function getStudySessionAnswerShortcutQuality(event) {
  if (!isPlainShortcutEvent(event)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(ANSWER_SHORTCUT_QUALITIES, event.key)) {
    return null;
  }

  return ANSWER_SHORTCUT_QUALITIES[event.key];
}

function getStudySessionShortcutAction(event, state = {}) {
  if (!isUnmodifiedShortcutEvent(event)) {
    return null;
  }

  const hasCurrentCard = Boolean(state.currentCard);
  const isAnswerVisible = Boolean(state.showAnswer);
  const isLoading = Boolean(state.isLoading);
  const isSubmitting = Boolean(state.isSubmitting);

  if (event.key === ' ' && hasCurrentCard && isAnswerVisible) {
    return { type: STUDY_SESSION_SHORTCUT_ACTIONS.NO_OP };
  }

  if (event.repeat || isSubmitting) {
    return null;
  }

  if (
    REVEAL_SHORTCUT_KEYS.has(event.key)
    && hasCurrentCard
    && !isAnswerVisible
    && !isLoading
  ) {
    return { type: STUDY_SESSION_SHORTCUT_ACTIONS.REVEAL_ANSWER };
  }

  if (!hasCurrentCard || !isAnswerVisible) {
    return null;
  }

  const quality = getStudySessionAnswerShortcutQuality(event);

  if (quality === null) {
    return null;
  }

  return {
    type: STUDY_SESSION_SHORTCUT_ACTIONS.GRADE_ANSWER,
    quality,
  };
}

module.exports = {
  getStudySessionAnswerShortcutQuality,
  getStudySessionShortcutAction,
  isEditableShortcutTarget,
  STUDY_SESSION_SHORTCUT_ACTIONS,
};
