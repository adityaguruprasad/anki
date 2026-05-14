const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const studySessionSource = fs.readFileSync(path.join(__dirname, '..', 'studySession.js'), 'utf8');

function extractConstFunctionBody(name) {
  const marker = `const ${name} =`;
  const start = studySessionSource.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${name} to be defined`);

  const arrowStart = studySessionSource.indexOf('=>', start);
  assert.notEqual(arrowStart, -1, `Expected ${name} to be an arrow function`);

  const bodyStart = studySessionSource.indexOf('{', arrowStart);
  assert.notEqual(bodyStart, -1, `Expected ${name} to have a block body`);

  let depth = 0;
  for (let index = bodyStart; index < studySessionSource.length; index += 1) {
    const char = studySessionSource[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return studySessionSource.slice(bodyStart + 1, index);
      }
    }
  }

  assert.fail(`Expected ${name} block body to close`);
}

function requiredIndex(source, needle, message, fromIndex = 0) {
  const index = source.indexOf(needle, fromIndex);
  assert.notEqual(index, -1, message);
  return index;
}

const authExpiredCheck = 'if (handleAuthExpiredResponse(response, onAuthExpired)) {';

test('fetchNextCard clears in-flight state on current auth-expired due-card responses', () => {
  const body = extractConstFunctionBody('fetchNextCard');
  const fetchIndex = requiredIndex(
    body,
    'const response = await fetch(apiRequests.dueCardUrl(requestDeckId), {',
    'Expected due-card loading to fetch the next card',
  );
  const currentGuardIndex = requiredIndex(
    body,
    'if (!isCurrentRequest()) return;',
    'Expected due-card responses to keep the stale-request guard',
    fetchIndex,
  );
  const authExpiredIndex = requiredIndex(
    body,
    authExpiredCheck,
    'Expected due-card responses to keep auth-expiration handling',
    currentGuardIndex,
  );
  const responseOkIndex = requiredIndex(
    body,
    'if (!response.ok) {',
    'Expected due-card responses to keep generic failure handling',
    authExpiredIndex,
  );
  const authExpiredBranch = body.slice(authExpiredIndex, responseOkIndex);

  assert.ok(
    currentGuardIndex < authExpiredIndex,
    'Expected stale due-card responses to return before auth-expiration state updates',
  );
  assert.match(
    authExpiredBranch,
    /setSubmitInFlight\(false\);\s*setIsLoading\(false\);\s*return;/,
    'Expected current auth-expired due-card responses to clear submit and loading state',
  );
});

test('loadStudySession clears in-flight state on current auth-expired deck-list responses', () => {
  const body = extractConstFunctionBody('loadStudySession');
  const fetchIndex = requiredIndex(
    body,
    'const response = await fetch(apiRequests.deckListUrl, {',
    'Expected automatic study-session loading to fetch decks',
  );
  const currentGuardIndex = requiredIndex(
    body,
    'if (!isCurrentRequest()) return;',
    'Expected deck-list responses to keep the stale-request guard',
    fetchIndex,
  );
  const authExpiredIndex = requiredIndex(
    body,
    authExpiredCheck,
    'Expected deck-list responses to keep auth-expiration handling',
    currentGuardIndex,
  );
  const responseOkIndex = requiredIndex(
    body,
    'if (!response.ok) {',
    'Expected deck-list responses to keep generic failure handling',
    authExpiredIndex,
  );
  const authExpiredBranch = body.slice(authExpiredIndex, responseOkIndex);

  assert.ok(
    currentGuardIndex < authExpiredIndex,
    'Expected stale deck-list responses to return before auth-expiration state updates',
  );
  assert.match(
    authExpiredBranch,
    /setSubmitInFlight\(false\);\s*setIsLoading\(false\);\s*return;/,
    'Expected current auth-expired deck-list responses to clear submit and loading state',
  );
});

test('handleAnswer clears submit state on current auth-expired submit responses', () => {
  const body = extractConstFunctionBody('handleAnswer');
  const fetchIndex = requiredIndex(
    body,
    'const response = await fetch(apiRequests.submitUrl, {',
    'Expected answer handling to submit the review result',
  );
  const currentGuardIndex = requiredIndex(
    body,
    'if (!isCurrentSubmitRequest()) {',
    'Expected submit responses to keep the stale-route guard',
    fetchIndex,
  );
  const authExpiredIndex = requiredIndex(
    body,
    authExpiredCheck,
    'Expected submit responses to keep auth-expiration handling',
    currentGuardIndex,
  );
  const recoveryIndex = requiredIndex(
    body,
    'const submissionRecovery = getStudySessionSubmissionRecovery(response);',
    'Expected submit responses to keep stale-card conflict recovery',
    authExpiredIndex,
  );
  const authExpiredBranch = body.slice(authExpiredIndex, recoveryIndex);

  assert.ok(
    currentGuardIndex < authExpiredIndex,
    'Expected stale submit responses to return before auth-expiration state updates',
  );
  assert.match(
    authExpiredBranch,
    /setSubmitInFlight\(false\);\s*return;/,
    'Expected current auth-expired submit responses to clear submit state',
  );
});
