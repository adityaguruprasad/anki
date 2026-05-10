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
    'if (handleAuthExpiredResponse(response, onAuthExpired))',
  );
  const responseOkIndex = studySessionSource.indexOf('if (!response.ok) {');
  const staleGuardAfterJsonIndex = studySessionSource.indexOf(
    'if (!isCurrentRequest()) return;',
    jsonIndex,
  );
  const validationIndex = studySessionSource.indexOf(
    'const selectedCard = selectValidatedStudySessionDueCard(cards);',
  );
  const setCurrentCardIndex = studySessionSource.indexOf('setCurrentCard(selectedCard);');
  const dueBranchIndex = studySessionSource.indexOf('if (selectedCard) {');

  assert.ok(jsonIndex >= 0, 'Expected StudySession to parse due-card JSON');
  assert.ok(
    authExpiredIndex >= 0 && responseOkIndex > authExpiredIndex && responseOkIndex < jsonIndex,
    'Expected auth expiration handling to stay before generic due-card fetch handling',
  );
  assert.ok(
    jsonIndex < staleGuardAfterJsonIndex && staleGuardAfterJsonIndex < validationIndex,
    'Expected the stale-request guard to stay before due-card validation',
  );
  assert.ok(validationIndex > jsonIndex, 'Expected validation to happen after JSON parsing');
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

test('CRA source sync mirrors the due-card validation helper', () => {
  assert.ok(
    FRONTEND_MODULES.includes('studySessionDueCards.js'),
    'Expected studySessionDueCards.js to be mirrored into CRA src',
  );
});
