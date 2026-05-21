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

const currentSubmitGuard = 'if (!isCurrentSubmitRequest()) {';
const authResponseCheck = 'if (handleStudySessionAuthResponse({';

test('handleAnswer guards stale or unmounted submit responses before auth and generic failure handling', () => {
  const body = extractConstFunctionBody('handleAnswer');
  const fetchIndex = requiredIndex(
    body,
    'const response = await fetch(apiRequests.submitUrl, {',
    'Expected answer submission to keep the submit fetch',
  );
  const authExpiredIndex = requiredIndex(
    body,
    authResponseCheck,
    'Expected answer submission to keep auth-expiration handling',
    fetchIndex,
  );
  const responseOkIndex = requiredIndex(
    body,
    'if (!response.ok) {',
    'Expected answer submission to keep non-OK handling',
  );
  const responseTextIndex = requiredIndex(
    body,
    "let responseText = '';",
    'Expected successful answer submission to parse response text',
  );

  assert.match(
    body,
    /const isCurrentSubmitRequest = \(\) => isCurrentStudySessionRouteRequest\(\{\s*mountedRef,\s*locationSearchRef,\s*requestSearch,\s*\}\);/,
    'Expected submit checks to use the route lifecycle helper with the captured route search',
  );
  assert.ok(
    fetchIndex < authExpiredIndex,
    'Expected submit responses to enter lifecycle-aware auth handling after fetch resolution',
  );
  assert.ok(
    authExpiredIndex < responseOkIndex,
    'Expected lifecycle-aware auth handling before generic non-OK handling',
  );
  assert.ok(
    authExpiredIndex < responseTextIndex,
    'Expected lifecycle-aware auth handling before successful response parsing',
  );
  assert.match(
    body.slice(authExpiredIndex, responseOkIndex),
    /isCurrent: isCurrentSubmitRequest,/,
    'Expected auth handling to check stale or unmounted submit responses through the lifecycle predicate',
  );
  assert.match(
    body.slice(authExpiredIndex, responseOkIndex),
    /return;/,
    'Expected handled auth or stale submit responses to return without response side effects',
  );
});

test('handleAnswer preserves current submit success behavior behind lifecycle guards', () => {
  const body = extractConstFunctionBody('handleAnswer');
  const authExpiredIndex = requiredIndex(
    body,
    authResponseCheck,
    'Expected answer submission to keep auth-expiration handling',
  );
  const responseOkIndex = requiredIndex(
    body,
    'if (!response.ok) {',
    'Expected answer submission to keep non-OK handling',
  );
  const responseTextIndex = requiredIndex(
    body,
    "let responseText = '';",
    'Expected successful answer submission to parse response text',
  );
  const currentGuardAfterTextIndex = requiredIndex(
    body,
    currentSubmitGuard,
    'Expected current submit guard before applying parsed success state',
    responseTextIndex,
  );
  const parseIndex = requiredIndex(
    body,
    'const parsedSubmissionResponse = parseStudySessionSubmissionResponse(responseText);',
    'Expected successful answer submission to parse response text through the helper',
  );
  const validationIndex = requiredIndex(
    body,
    'const submissionResponse = getValidatedStudySessionSubmissionResponse(',
    'Expected successful answer submission to validate parsed success data for the submitted card',
  );
  const expectedIdIndex = requiredIndex(
    body,
    '{ expectedId: currentCard.id },',
    'Expected successful answer submission validation to require the submitted card id',
    validationIndex,
  );
  const feedbackIndex = requiredIndex(
    body,
    'setSubmissionFeedback(getStudySessionSubmissionFeedback({',
    'Expected successful answer submission to show submission feedback',
  );
  const nextCardIndex = requiredIndex(
    body,
    'await fetchNextCard(requestDeckId, requestSearch);',
    'Expected successful answer submission to fetch the next card',
    feedbackIndex,
  );

  assert.ok(authExpiredIndex < responseOkIndex, 'Expected auth handling before generic failures');
  assert.ok(responseOkIndex < responseTextIndex, 'Expected response text parsing only after OK');
  assert.ok(
    responseTextIndex < currentGuardAfterTextIndex,
    'Expected route changes or unmounts during response text parsing to stay guarded',
  );
  assert.ok(currentGuardAfterTextIndex < parseIndex, 'Expected lifecycle guard before parsing success data');
  assert.ok(parseIndex < validationIndex, 'Expected parsed success data before validation');
  assert.ok(validationIndex < expectedIdIndex, 'Expected submitted card id to be part of validation');
  assert.ok(validationIndex < feedbackIndex, 'Expected validated success data before feedback');
  assert.ok(feedbackIndex < nextCardIndex, 'Expected feedback before next-card fetch');
});

test('handleAnswer rejects malformed successful submit responses before fetching next card', () => {
  const body = extractConstFunctionBody('handleAnswer');
  const responseTextIndex = requiredIndex(
    body,
    "let responseText = '';",
    'Expected successful answer submission to parse response text',
  );
  const currentGuardAfterTextIndex = requiredIndex(
    body,
    currentSubmitGuard,
    'Expected current submit guard before applying parsed success state',
    responseTextIndex,
  );
  const validationIndex = requiredIndex(
    body,
    'const submissionResponse = getValidatedStudySessionSubmissionResponse(',
    'Expected successful submit responses to be validated',
  );
  requiredIndex(
    body,
    '{ expectedId: currentCard.id },',
    'Expected successful submit responses to be matched to the submitted card',
    validationIndex,
  );
  const rejectionIndex = requiredIndex(
    body,
    'if (!submissionResponse) {',
    'Expected malformed successful submit responses to be rejected',
    validationIndex,
  );
  const feedbackIndex = requiredIndex(
    body,
    'setSubmissionFeedback(getStudySessionSubmissionFeedback({',
    'Expected submission feedback to be stored only after validation',
  );
  const nextCardIndex = requiredIndex(
    body,
    'await fetchNextCard(requestDeckId, requestSearch);',
    'Expected next card fetch to stay behind validation',
    feedbackIndex,
  );

  assert.ok(
    currentGuardAfterTextIndex < validationIndex,
    'Expected the post-body lifecycle guard before successful response validation',
  );
  assert.ok(validationIndex < rejectionIndex, 'Expected validation before the malformed response branch');
  assert.match(
    body.slice(rejectionIndex, feedbackIndex),
    /throw new Error\('Invalid study session submission response'\);/,
    'Expected malformed successful responses to throw into the retryable submit path',
  );
  assert.ok(rejectionIndex < feedbackIndex, 'Expected malformed responses rejected before feedback');
  assert.ok(rejectionIndex < nextCardIndex, 'Expected malformed responses rejected before fetchNextCard');
});

test('handleAnswer recovers stale-card submit conflicts without the generic retry error', () => {
  const body = extractConstFunctionBody('handleAnswer');
  const authExpiredIndex = requiredIndex(
    body,
    authResponseCheck,
    'Expected answer submission to keep auth-expiration handling',
  );
  const recoveryIndex = requiredIndex(
    body,
    'const submissionRecovery = getStudySessionSubmissionRecovery(response);',
    'Expected answer submission to classify stale-card conflict responses',
    authExpiredIndex,
  );
  const recoveryBranchIndex = requiredIndex(
    body,
    'if (submissionRecovery?.action === STUDY_SESSION_SUBMISSION_RECOVERY_ACTIONS.LOAD_NEXT_DUE_CARD) {',
    'Expected stale-card conflicts to use explicit next-card recovery semantics',
    recoveryIndex,
  );
  const clearCardIndex = requiredIndex(
    body,
    'setCurrentCard(null);',
    'Expected stale-card conflicts to clear the stale current card',
    recoveryBranchIndex,
  );
  const hideAnswerIndex = requiredIndex(
    body,
    'setShowAnswer(false);',
    'Expected stale-card conflicts to reset answer visibility',
    recoveryBranchIndex,
  );
  const feedbackIndex = requiredIndex(
    body,
    'setSubmissionFeedback({ message: submissionRecovery.message });',
    'Expected stale-card conflicts to show deterministic recovery copy',
    recoveryBranchIndex,
  );
  const nextCardIndex = requiredIndex(
    body,
    'await fetchNextCard(requestDeckId, requestSearch);',
    'Expected stale-card conflicts to request the next due card for the same study target',
    recoveryBranchIndex,
  );
  const branchReturnIndex = requiredIndex(
    body,
    'return;',
    'Expected stale-card conflict recovery to exit before generic non-OK handling',
    nextCardIndex,
  );
  const responseOkIndex = requiredIndex(
    body,
    'if (!response.ok) {',
    'Expected answer submission to keep non-OK handling',
  );
  const retryErrorIndex = requiredIndex(
    body,
    "setSubmitError('Unable to submit your answer. Please try again.');",
    'Expected other submit failures to keep retryable inline error copy',
  );

  assert.ok(authExpiredIndex < recoveryIndex, 'Expected auth handling before conflict recovery');
  assert.ok(recoveryIndex < recoveryBranchIndex, 'Expected conflict classification before recovery branching');
  assert.ok(
    recoveryBranchIndex < responseOkIndex,
    'Expected stale-card conflict recovery before generic non-OK handling',
  );
  assert.ok(clearCardIndex < nextCardIndex, 'Expected stale card clearing before next-card fetch');
  assert.ok(hideAnswerIndex < nextCardIndex, 'Expected answer reset before next-card fetch');
  assert.ok(feedbackIndex < nextCardIndex, 'Expected recovery feedback before next-card fetch');
  assert.ok(
    nextCardIndex < branchReturnIndex && branchReturnIndex < responseOkIndex,
    'Expected stale-card conflict recovery to return before generic non-OK handling',
  );
  assert.doesNotMatch(
    body.slice(recoveryBranchIndex, branchReturnIndex),
    /setSubmitError\('Unable to submit your answer\. Please try again\.'\)/,
    'Expected stale-card conflict recovery not to show the generic retry error',
  );
  assert.ok(responseOkIndex < retryErrorIndex, 'Expected retryable submit errors to remain outside recovery');
});

test('handleAnswer keeps retryable submit errors only on non-stale failures', () => {
  const body = extractConstFunctionBody('handleAnswer');
  const responseOkIndex = requiredIndex(
    body,
    'if (!response.ok) {',
    'Expected answer submission to keep non-OK handling',
  );
  const throwIndex = requiredIndex(
    body,
    "throw new Error('Unable to submit answer');",
    'Expected non-OK submit responses to throw into the retryable error path',
    responseOkIndex,
  );
  const catchIndex = requiredIndex(
    body,
    '} catch (error) {',
    'Expected answer submission to keep a retryable error path',
  );
  const catchCurrentGuardIndex = requiredIndex(
    body,
    currentSubmitGuard,
    'Expected submit failures to skip UI updates when the route is stale or unmounted',
    catchIndex,
  );
  const submitErrorIndex = requiredIndex(
    body,
    "setSubmitError('Unable to submit your answer. Please try again.');",
    'Expected non-stale submit failures to show retryable inline error copy',
  );
  const releaseIndex = requiredIndex(
    body,
    'setSubmitInFlight(false);',
    'Expected non-stale submit failures to release the submit in-flight guard',
    submitErrorIndex,
  );

  assert.ok(throwIndex < catchIndex, 'Expected non-OK responses to reach catch handling');
  assert.ok(
    catchIndex < catchCurrentGuardIndex,
    'Expected catch handling to check route/current lifecycle first',
  );
  assert.ok(
    catchCurrentGuardIndex < submitErrorIndex,
    'Expected stale or unmounted submit failures not to show retryable submit error UI',
  );
  assert.ok(submitErrorIndex < releaseIndex, 'Expected retryable error UI before guard release');
});
