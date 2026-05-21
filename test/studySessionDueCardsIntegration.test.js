const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  FRONTEND_MODULES,
} = require('../scripts/sync-cra-src');

const studySessionSource = fs.readFileSync(path.join(__dirname, '..', 'studySession.js'), 'utf8');

test('StudySession validates due-card JSON before storing or branching on cards', () => {
  assert.match(
    studySessionSource,
    /require\(['"]\.\/studySessionDueCards['"]\)/,
    'studySession.js should import the due-card validation helper',
  );

  const jsonIndex = studySessionSource.indexOf('const cards = await response.json();');
  const authExpiredIndex = studySessionSource.indexOf(
    'if (handleStudySessionAuthResponse({',
  );
  const responseOkIndex = studySessionSource.indexOf('if (!response.ok) {');
  const staleGuardAfterJsonIndex = studySessionSource.indexOf(
    'if (!isCurrentRequest()) return;',
    jsonIndex,
  );
  const validationIndex = studySessionSource.indexOf(
    'const selectedCard = selectValidatedStudySessionDueCard(cards, {',
  );
  const expectedDeckIndex = studySessionSource.indexOf(
    'expectedDeckId: requestDeckId,',
    validationIndex,
  );
  const setCurrentCardIndex = studySessionSource.indexOf('setCurrentCard(selectedCard);');
  const dueBranchIndex = studySessionSource.indexOf('if (selectedCard) {');

  assert.ok(jsonIndex >= 0, 'Expected StudySession to parse due-card JSON');
  assert.ok(
    authExpiredIndex >= 0
      && responseOkIndex > authExpiredIndex
      && responseOkIndex < jsonIndex,
    'Expected auth expiration handling to stay before generic due-card fetch handling',
  );
  assert.ok(
    jsonIndex < staleGuardAfterJsonIndex && staleGuardAfterJsonIndex < validationIndex,
    'Expected the stale-request guard to stay before due-card validation',
  );
  assert.ok(validationIndex > jsonIndex, 'Expected validation to happen after JSON parsing');
  assert.ok(
    expectedDeckIndex > validationIndex && expectedDeckIndex < setCurrentCardIndex,
    'Expected due-card validation to require the requested deck id before storing a card',
  );
  assert.ok(
    validationIndex < setCurrentCardIndex,
    'Expected validation to happen before storing the selected card',
  );
  assert.ok(
    validationIndex < dueBranchIndex,
    'Expected validation to happen before the due/no-due branch',
  );
  assert.doesNotMatch(
    studySessionSource,
    /setCurrentCard\(cards\[0\]\)/,
    'StudySession should not store unvalidated card rows directly',
  );
});

test('StudySession shows actionable no-due notices for initial deck loads only', () => {
  assert.match(
    studySessionSource,
    /shouldShowNoDueNoticeForInitialStudySessionRequest/,
    'StudySession should import the initial no-due notice policy helper',
  );
  assert.match(
    studySessionSource,
    /await fetchNextCard\(initialRequest\.deckId,\s*requestSearch,\s*\{\s*showNoDueNotice: shouldShowNoDueNoticeForInitialStudySessionRequest\(initialRequest\),\s*\}\);/,
    'Expected explicit initial deck sessions to use the no-due notice policy',
  );
  assert.match(
    studySessionSource,
    /await fetchNextCard\(selectedRequest\.deckId,\s*requestSearch,\s*\{\s*showNoDueNotice: shouldShowNoDueNoticeForInitialStudySessionRequest\(selectedRequest\),\s*\}\);/,
    'Expected auto-selected initial deck sessions to use the no-due notice policy',
  );
  assert.match(
    studySessionSource,
    /await fetchNextCard\(requestDeckId,\s*requestSearch\);/,
    'Expected post-answer next-card fetches to keep the existing terminal-session behavior',
  );
});

test('CRA source sync mirrors the due-card validation helper', () => {
  assert.ok(
    FRONTEND_MODULES.includes('studySessionDueCards.js'),
    'Expected studySessionDueCards.js to be mirrored into CRA src',
  );
});
