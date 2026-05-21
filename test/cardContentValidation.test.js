const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MAX_CARD_CONTENT_LENGTH,
  isValidCardContent,
  validateCardContent,
} = require('../cardContentValidation');
const {
  FRONTEND_MODULES,
} = require('../scripts/sync-cra-src');
const {
  hasDeckCardBrowseRowPayload,
  parseDeckCardBrowseResponsePayload,
} = require('../deckCardBrowseResponse');
const {
  hasStudySessionDueCardRowPayload,
  selectValidatedStudySessionDueCard,
} = require('../studySessionDueCards');

test('validateCardContent preserves trimmed content under the shared API limit', () => {
  assert.deepEqual(validateCardContent('  Front\nBack  ', 'frontContent'), {
    ok: true,
    value: 'Front\nBack',
  });
  assert.equal(isValidCardContent('x'.repeat(MAX_CARD_CONTENT_LENGTH)), true);
});

test('validateCardContent rejects malformed or unsafe card text', () => {
  [
    undefined,
    null,
    42,
    '',
    '   ',
    '\n\t',
    'Front\u0000Back',
    'Front\u061CBack',
    'Front\u200BBack',
    'Front\u200EBack',
    'Front\u200FBack',
    'Front\u202EBack',
    'Front\u2060Back',
    'Front\u2066Back',
    'Front\uFEFFBack',
    'x'.repeat(MAX_CARD_CONTENT_LENGTH + 1),
  ].forEach((value) => {
    assert.equal(isValidCardContent(value), false, `Expected ${String(value)} to be rejected`);
  });
});

test('validateCardContent keeps ZWNJ and ZWJ available for human-authored study text', () => {
  assert.equal(isValidCardContent('Biology\u200C101'), true);
  assert.equal(isValidCardContent('Biology\u200D101'), true);
});

test('read-path card payload validators accept safe persisted content with surrounding whitespace', () => {
  const browseCard = {
    id: 1,
    front_content: '  Front  ',
    back_content: '\nBack\t',
  };
  const dueCard = {
    id: 2,
    front_content: '\tQuestion\n',
    back_content: '  Answer  ',
  };

  assert.equal(hasDeckCardBrowseRowPayload(browseCard), true);
  assert.equal(
    parseDeckCardBrowseResponsePayload({ cards: [browseCard], nextCursor: null }).cards[0],
    browseCard,
  );
  assert.equal(hasStudySessionDueCardRowPayload(dueCard), true);
  assert.equal(selectValidatedStudySessionDueCard([dueCard]), dueCard);
});

test('CRA source sync mirrors the shared card content validation helper', () => {
  assert.equal(
    Array.isArray(FRONTEND_MODULES),
    true,
    'Expected FRONTEND_MODULES to be an array',
  );
  assert.ok(
    FRONTEND_MODULES.includes('cardContentValidation.js'),
    'Expected cardContentValidation.js to be mirrored into CRA src',
  );
});
