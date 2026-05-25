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
const SHORTCUT_MODIFIER_PROPERTIES = Object.freeze(['altKey', 'ctrlKey', 'metaKey', 'shiftKey']);

function getTagName(target) {
  const tagName = target?.tagName;
  if (typeof tagName === 'string') {
    return tagName.toLowerCase();
  }

  const nodeName = target?.nodeName;
  if (typeof nodeName === 'string') {
    return nodeName.toLowerCase();
  }

  return '';
}

function hasEditableAttribute(target) {
  const getAttribute = target?.getAttribute;
  if (typeof getAttribute !== 'function') {
    return false;
  }

  const contentEditable = getAttribute.call(target, 'contenteditable');

  return typeof contentEditable === 'string' && contentEditable.toLowerCase() !== 'false';
}

function hasEditableProperty(target) {
  if (target?.isContentEditable) {
    return true;
  }

  const contentEditableProperty = target?.contentEditable;
  if (typeof contentEditableProperty !== 'string') {
    return false;
  }

  const contentEditable = contentEditableProperty.toLowerCase();

  return contentEditable !== '' && contentEditable !== 'false' && contentEditable !== 'inherit';
}

function inspectEditableShortcutTarget(target) {
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

function isEditableShortcutTarget(target) {
  try {
    return inspectEditableShortcutTarget(target);
  } catch {
    return false;
  }
}

function getEligibleShortcutEvent(event) {
  try {
    if (!event) {
      return null;
    }

    for (const modifierProperty of SHORTCUT_MODIFIER_PROPERTIES) {
      if (event[modifierProperty]) {
        return null;
      }
    }

    if (inspectEditableShortcutTarget(event.target)) {
      return null;
    }

    return {
      key: event.key,
      repeat: event.repeat,
    };
  } catch {
    return null;
  }
}

function isPlainShortcutEvent(shortcutEvent) {
  return Boolean(shortcutEvent) && !shortcutEvent.repeat;
}

function getAnswerShortcutQuality(shortcutEvent) {
  if (!isPlainShortcutEvent(shortcutEvent)) {
    return null;
  }

  if (!Object.prototype.hasOwnProperty.call(ANSWER_SHORTCUT_QUALITIES, shortcutEvent.key)) {
    return null;
  }

  return ANSWER_SHORTCUT_QUALITIES[shortcutEvent.key];
}

function getStudySessionShortcutState(state) {
  try {
    return {
      hasCurrentCard: Boolean(state?.currentCard),
      isAnswerVisible: Boolean(state?.showAnswer),
      isLoading: Boolean(state?.isLoading),
      isSubmitting: Boolean(state?.isSubmitting),
    };
  } catch {
    return null;
  }
}

function getStudySessionAnswerShortcutQuality(event) {
  return getAnswerShortcutQuality(getEligibleShortcutEvent(event));
}

function getStudySessionShortcutAction(event, state = {}) {
  const shortcutEvent = getEligibleShortcutEvent(event);
  if (!shortcutEvent) {
    return null;
  }

  const shortcutState = getStudySessionShortcutState(state);
  if (!shortcutState) {
    return null;
  }

  const {
    hasCurrentCard,
    isAnswerVisible,
    isLoading,
    isSubmitting,
  } = shortcutState;

  if (shortcutEvent.key === ' ' && hasCurrentCard && isAnswerVisible) {
    return { type: STUDY_SESSION_SHORTCUT_ACTIONS.NO_OP };
  }

  if (shortcutEvent.repeat || isSubmitting) {
    return null;
  }

  if (
    REVEAL_SHORTCUT_KEYS.has(shortcutEvent.key)
    && hasCurrentCard
    && !isAnswerVisible
    && !isLoading
  ) {
    return { type: STUDY_SESSION_SHORTCUT_ACTIONS.REVEAL_ANSWER };
  }

  if (!hasCurrentCard || !isAnswerVisible) {
    return null;
  }

  const quality = getAnswerShortcutQuality(shortcutEvent);

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
