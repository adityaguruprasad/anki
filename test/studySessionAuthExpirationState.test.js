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

const authResponseCheck = 'if (handleStudySessionAuthResponse({';

test('fetchNextCard clears in-flight state on current auth-expired due-card responses', () => {
  const body = extractConstFunctionBody('fetchNextCard');
  const fetchIndex = requiredIndex(
    body,
    'const response = await fetch(apiRequests.dueCardUrl(requestDeckId), {',
    'Expected due-card loading to fetch the next card',
  );
  const authExpiredIndex = requiredIndex(
    body,
    authResponseCheck,
    'Expected due-card responses to keep auth-expiration handling',
    fetchIndex,
  );
  const responseOkIndex = requiredIndex(
    body,
    'if (!response.ok) {',
    'Expected due-card responses to keep generic failure handling',
    authExpiredIndex,
  );
  const authExpiredBranch = body.slice(authExpiredIndex, responseOkIndex);

  assert.ok(
    authExpiredIndex < responseOkIndex,
    'Expected auth handling before generic due-card failures',
  );
  assert.match(
    authExpiredBranch,
    /isCurrent: isCurrentRequest,/,
    'Expected due-card auth handling to guard stale responses through the lifecycle predicate',
  );
  assert.match(
    authExpiredBranch,
    /onCurrentAuthExpired: \(\) => \{\s*setSubmitInFlight\(false\);\s*setIsLoading\(false\);\s*\},[\s\S]*return;/,
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
  const authExpiredIndex = requiredIndex(
    body,
    authResponseCheck,
    'Expected deck-list responses to keep auth-expiration handling',
    fetchIndex,
  );
  const responseOkIndex = requiredIndex(
    body,
    'if (!response.ok) {',
    'Expected deck-list responses to keep generic failure handling',
    authExpiredIndex,
  );
  const authExpiredBranch = body.slice(authExpiredIndex, responseOkIndex);

  assert.ok(
    authExpiredIndex < responseOkIndex,
    'Expected auth handling before generic deck-list failures',
  );
  assert.match(
    authExpiredBranch,
    /isCurrent: isCurrentRequest,/,
    'Expected deck-list auth handling to guard stale responses through the lifecycle predicate',
  );
  assert.match(
    authExpiredBranch,
    /onCurrentAuthExpired: \(\) => \{\s*setSubmitInFlight\(false\);\s*setIsLoading\(false\);\s*\},[\s\S]*return;/,
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
  const authExpiredIndex = requiredIndex(
    body,
    authResponseCheck,
    'Expected submit responses to keep auth-expiration handling',
    fetchIndex,
  );
  const recoveryIndex = requiredIndex(
    body,
    'const submissionRecovery = getStudySessionSubmissionRecovery(response);',
    'Expected submit responses to keep stale-card conflict recovery',
    authExpiredIndex,
  );
  const authExpiredBranch = body.slice(authExpiredIndex, recoveryIndex);

  assert.ok(
    authExpiredIndex < recoveryIndex,
    'Expected submit auth handling before stale-card conflict recovery',
  );
  assert.match(
    authExpiredBranch,
    /isCurrent: isCurrentSubmitRequest,/,
    'Expected submit auth handling to guard stale responses through the lifecycle predicate',
  );
  assert.match(
    authExpiredBranch,
    /onCurrentAuthExpired: \(\) => \{\s*setSubmitInFlight\(false\);\s*\},[\s\S]*return;/,
    'Expected current auth-expired submit responses to clear submit state',
  );
});
