const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getStudySessionAnswerShortcutQuality,
  getStudySessionShortcutAction,
  isEditableShortcutTarget,
  STUDY_SESSION_SHORTCUT_ACTIONS,
} = require('../studySessionShortcuts');

function withThrowingGetter(target, propertyName) {
  Object.defineProperty(target, propertyName, {
    configurable: true,
    get() {
      throw new Error(`${propertyName} getter failed`);
    },
  });
  return target;
}

class PrototypeBackedTarget {
  constructor({
    tagName = 'DIV',
    nodeName,
    contentEditable = 'inherit',
    isContentEditable = false,
    attributes = {},
    parentElement = null,
  } = {}) {
    this.values = {
      attributes,
      contentEditable,
      isContentEditable,
      nodeName,
      parentElement,
      tagName,
    };
  }

  get tagName() {
    return this.values.tagName;
  }

  get nodeName() {
    return this.values.nodeName;
  }

  get contentEditable() {
    return this.values.contentEditable;
  }

  get isContentEditable() {
    return this.values.isContentEditable;
  }

  get parentElement() {
    return this.values.parentElement;
  }

  getAttribute(attributeName) {
    return this.values.attributes[attributeName] ?? null;
  }
}

class PrototypeBackedKeyboardEvent {
  constructor({
    key,
    target = new PrototypeBackedTarget(),
    repeat = false,
    altKey = false,
    ctrlKey = false,
    metaKey = false,
    shiftKey = false,
  } = {}) {
    this.values = {
      altKey,
      ctrlKey,
      key,
      metaKey,
      repeat,
      shiftKey,
      target,
    };
  }

  get altKey() {
    return this.values.altKey;
  }

  get ctrlKey() {
    return this.values.ctrlKey;
  }

  get metaKey() {
    return this.values.metaKey;
  }

  get shiftKey() {
    return this.values.shiftKey;
  }

  get target() {
    return this.values.target;
  }

  get key() {
    return this.values.key;
  }

  get repeat() {
    return this.values.repeat;
  }
}

class PrototypeBackedShortcutState {
  constructor({
    currentCard = { id: 1 },
    showAnswer = true,
    isLoading = false,
    isSubmitting = false,
  } = {}) {
    this.values = {
      currentCard,
      isLoading,
      isSubmitting,
      showAnswer,
    };
  }

  get currentCard() {
    return this.values.currentCard;
  }

  get showAnswer() {
    return this.values.showAnswer;
  }

  get isLoading() {
    return this.values.isLoading;
  }

  get isSubmitting() {
    return this.values.isSubmitting;
  }
}

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

test('isEditableShortcutTarget fails closed when target inspection accessors throw', () => {
  const cases = [
    ['tagName', withThrowingGetter({}, 'tagName')],
    ['nodeName', withThrowingGetter({ tagName: null }, 'nodeName')],
    ['isContentEditable', withThrowingGetter({ tagName: 'DIV' }, 'isContentEditable')],
    [
      'contentEditable',
      withThrowingGetter({ tagName: 'DIV', isContentEditable: false }, 'contentEditable'),
    ],
    [
      'getAttribute property',
      withThrowingGetter({
        tagName: 'DIV',
        isContentEditable: false,
        contentEditable: 'inherit',
      }, 'getAttribute'),
    ],
    [
      'getAttribute method',
      {
        tagName: 'DIV',
        isContentEditable: false,
        contentEditable: 'inherit',
        getAttribute() {
          throw new Error('getAttribute failed');
        },
      },
    ],
    [
      'parentElement',
      withThrowingGetter({
        tagName: 'DIV',
        isContentEditable: false,
        contentEditable: 'inherit',
        getAttribute() {
          return null;
        },
      }, 'parentElement'),
    ],
  ];

  for (const [name, target] of cases) {
    assert.equal(isEditableShortcutTarget(target), false, name);
  }
});

test('isEditableShortcutTarget stops inspecting a target after an accessor throws', () => {
  let nodeNameReads = 0;
  const target = {
    get tagName() {
      throw new Error('tagName failed');
    },
    get nodeName() {
      nodeNameReads += 1;
      return 'INPUT';
    },
  };

  assert.equal(isEditableShortcutTarget(target), false);
  assert.equal(nodeNameReads, 0);
});

test('getStudySessionAnswerShortcutQuality allows normal non-editable targets', () => {
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '1', target: { tagName: 'BUTTON' } }), 1);
  assert.equal(getStudySessionAnswerShortcutQuality({ key: '3', target: { tagName: 'DIV' } }), 5);
});

test('getStudySessionAnswerShortcutQuality fails closed when event accessors throw', () => {
  const eventProperties = ['altKey', 'ctrlKey', 'metaKey', 'shiftKey', 'target', 'key', 'repeat'];

  for (const propertyName of eventProperties) {
    const event = {
      key: '1',
      repeat: false,
      target: { tagName: 'DIV' },
    };
    withThrowingGetter(event, propertyName);

    assert.equal(getStudySessionAnswerShortcutQuality(event), null, propertyName);
  }

  assert.equal(
    getStudySessionAnswerShortcutQuality({
      key: '1',
      repeat: false,
      target: withThrowingGetter({ tagName: 'DIV' }, 'contentEditable'),
    }),
    null,
  );
});

test('getStudySessionAnswerShortcutQuality stops reading event fields after an accessor throws', () => {
  let keyReads = 0;
  const event = withThrowingGetter({}, 'altKey');
  Object.defineProperty(event, 'key', {
    get() {
      keyReads += 1;
      return '1';
    },
  });

  assert.equal(getStudySessionAnswerShortcutQuality(event), null);
  assert.equal(keyReads, 0);
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

test('getStudySessionShortcutAction fails closed when shortcut-relevant accessors throw', () => {
  const visibleAnswerState = {
    currentCard: { id: 1 },
    isLoading: false,
    isSubmitting: false,
    showAnswer: true,
  };
  const baseEvent = () => ({
    key: '1',
    repeat: false,
    target: { tagName: 'DIV' },
  });
  const baseState = () => ({ ...visibleAnswerState });
  const cases = [
    ['event key', withThrowingGetter({ repeat: false, target: { tagName: 'DIV' } }, 'key'), baseState()],
    ['event repeat', withThrowingGetter({ key: '1', target: { tagName: 'DIV' } }, 'repeat'), baseState()],
    ['event target', withThrowingGetter({ key: '1', repeat: false }, 'target'), baseState()],
    [
      'target parentElement',
      {
        key: '1',
        repeat: false,
        target: withThrowingGetter({
          tagName: 'DIV',
          isContentEditable: false,
          contentEditable: 'inherit',
          getAttribute() {
            return null;
          },
        }, 'parentElement'),
      },
      baseState(),
    ],
    [
      'target getAttribute property',
      {
        key: '1',
        repeat: false,
        target: withThrowingGetter({
          tagName: 'DIV',
          isContentEditable: false,
          contentEditable: 'inherit',
        }, 'getAttribute'),
      },
      baseState(),
    ],
    [
      'target getAttribute method',
      {
        key: '1',
        repeat: false,
        target: {
          tagName: 'DIV',
          isContentEditable: false,
          contentEditable: 'inherit',
          getAttribute() {
            throw new Error('getAttribute failed');
          },
        },
      },
      baseState(),
    ],
    ['state currentCard', baseEvent(), withThrowingGetter({
      isLoading: false,
      isSubmitting: false,
      showAnswer: true,
    }, 'currentCard')],
    ['state showAnswer', baseEvent(), withThrowingGetter({
      currentCard: { id: 1 },
      isLoading: false,
      isSubmitting: false,
    }, 'showAnswer')],
    ['state isLoading', baseEvent(), withThrowingGetter({
      currentCard: { id: 1 },
      isSubmitting: false,
      showAnswer: true,
    }, 'isLoading')],
    ['state isSubmitting', baseEvent(), withThrowingGetter({
      currentCard: { id: 1 },
      isLoading: false,
      showAnswer: true,
    }, 'isSubmitting')],
  ];

  for (const [name, event, state] of cases) {
    assert.equal(getStudySessionShortcutAction(event, state), null, name);
  }
});

test('shortcut helpers support prototype-backed DOM-like event target and state properties', () => {
  const parent = new PrototypeBackedTarget({
    attributes: { contenteditable: 'true' },
    tagName: 'DIV',
  });
  const child = new PrototypeBackedTarget({
    parentElement: parent,
    tagName: 'SPAN',
  });
  const event = new PrototypeBackedKeyboardEvent({
    key: '2',
    target: new PrototypeBackedTarget({ tagName: 'DIV' }),
  });
  const state = new PrototypeBackedShortcutState();

  assert.equal(isEditableShortcutTarget(child), true);
  assert.equal(
    getStudySessionAnswerShortcutQuality(new PrototypeBackedKeyboardEvent({
      key: '3',
      target: new PrototypeBackedTarget({ nodeName: 'BUTTON', tagName: undefined }),
    })),
    5,
  );
  assert.deepEqual(
    getStudySessionShortcutAction(event, state),
    { type: STUDY_SESSION_SHORTCUT_ACTIONS.GRADE_ANSWER, quality: 3 },
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
