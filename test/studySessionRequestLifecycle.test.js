const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  isCurrentStudySessionFetchRequest,
  isCurrentStudySessionRouteRequest,
  isMountedStudySessionRequest,
} = require('../studySessionRequestLifecycle');
const {
  FRONTEND_MODULES,
} = require('../scripts/sync-cra-src');

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

test('isMountedStudySessionRequest accepts only mounted refs', () => {
  assert.equal(isMountedStudySessionRequest({ current: true }), true);
  assert.equal(isMountedStudySessionRequest({ current: false }), false);
  assert.equal(isMountedStudySessionRequest(null), false);
  assert.equal(isMountedStudySessionRequest({}), false);
});

test('isCurrentStudySessionRouteRequest requires mounted component and captured route search', () => {
  const mountedRef = { current: true };
  const locationSearchRef = { current: '?deckId=1' };

  assert.equal(
    isCurrentStudySessionRouteRequest({ mountedRef, locationSearchRef, requestSearch: '?deckId=1' }),
    true,
  );
  assert.equal(
    isCurrentStudySessionRouteRequest({ mountedRef, locationSearchRef, requestSearch: '?deckId=2' }),
    false,
  );

  mountedRef.current = false;

  assert.equal(
    isCurrentStudySessionRouteRequest({ mountedRef, locationSearchRef, requestSearch: '?deckId=1' }),
    false,
  );
});

test('isCurrentStudySessionFetchRequest requires mounted component, route, and latest request id', () => {
  const request = {
    mountedRef: { current: true },
    requestIdRef: { current: 7 },
    requestId: 7,
    locationSearchRef: { current: '?deckId=1' },
    requestSearch: '?deckId=1',
  };

  assert.equal(isCurrentStudySessionFetchRequest(request), true);

  assert.equal(
    isCurrentStudySessionFetchRequest({ ...request, requestId: 6 }),
    false,
  );
  assert.equal(
    isCurrentStudySessionFetchRequest({ ...request, requestSearch: '?deckId=2' }),
    false,
  );
  assert.equal(
    isCurrentStudySessionFetchRequest({ ...request, mountedRef: { current: false } }),
    false,
  );
});

test('StudySession wires lifecycle checks into async request completions', () => {
  assert.match(
    studySessionSource,
    /require\(['"]\.\/studySessionRequestLifecycle['"]\)/,
    'Expected StudySession to import the request lifecycle helper',
  );
  assert.match(
    studySessionSource,
    /const mountedRef = useRef\(true\);/,
    'Expected StudySession to track mounted state with a ref',
  );
  assert.match(
    studySessionSource,
    /mountedRef\.current = false;/,
    'Expected StudySession cleanup to mark the component unmounted',
  );

  const fetchLifecycleGuardCount = (
    studySessionSource.match(/isCurrentStudySessionFetchRequest\(\{/g) || []
  ).length;
  const currentSubmitGuardCount = (
    studySessionSource.match(/if \(!isCurrentSubmitRequest\(\)\) \{/g) || []
  ).length;
  const routeLifecycleGuardCount = (
    studySessionSource.match(/isCurrentStudySessionRouteRequest\(\{/g) || []
  ).length;

  assert.equal(
    fetchLifecycleGuardCount,
    2,
    'Expected due-card and deck-list completions to use lifecycle request guards',
  );
  assert.equal(
    routeLifecycleGuardCount,
    3,
    'Expected fetchNextCard, loadStudySession, and submit to use route lifecycle checks',
  );
  assert.equal(
    currentSubmitGuardCount,
    3,
    'Expected submit continuations and failures to check route and mounted state before state updates',
  );
  assert.ok(
    FRONTEND_MODULES.includes('studySessionRequestLifecycle.js'),
    'Expected the lifecycle helper to be mirrored into CRA src',
  );
});

test('StudySession guards initial fetch and load state updates', () => {
  const fetchNextCardBody = extractConstFunctionBody('fetchNextCard');
  const fetchRouteGuardIndex = requiredIndex(
    fetchNextCardBody,
    'if (!isCurrentStudySessionRouteRequest({ mountedRef, locationSearchRef, requestSearch })) {',
    'Expected fetchNextCard to guard route and mounted state before request setup',
  );
  const fetchRequestIdIndex = requiredIndex(
    fetchNextCardBody,
    'const requestId = fetchRequestRef.current + 1;',
    'Expected fetchNextCard to keep request id setup',
  );
  const fetchLoadingIndex = requiredIndex(
    fetchNextCardBody,
    'setIsLoading(true);',
    'Expected fetchNextCard to keep loading state update',
  );

  assert.ok(fetchRouteGuardIndex < fetchRequestIdIndex, 'Expected fetchNextCard guard before request id mutation');
  assert.ok(fetchRouteGuardIndex < fetchLoadingIndex, 'Expected fetchNextCard guard before initial loading state');

  const loadStudySessionBody = extractConstFunctionBody('loadStudySession');
  const loadRouteGuardIndex = requiredIndex(
    loadStudySessionBody,
    'if (!isCurrentStudySessionRouteRequest({ mountedRef, locationSearchRef, requestSearch })) {',
    'Expected loadStudySession to guard route and mounted state before request setup',
  );
  const initialRequestIndex = requiredIndex(
    loadStudySessionBody,
    'const initialRequest = getStudySessionRequest(requestSearch);',
    'Expected loadStudySession to keep initial request parsing',
  );
  const feedbackResetIndex = requiredIndex(
    loadStudySessionBody,
    'setSubmissionFeedback(null);',
    'Expected loadStudySession to keep feedback reset',
  );

  assert.ok(loadRouteGuardIndex < initialRequestIndex, 'Expected loadStudySession guard before parsing the request');
  assert.ok(loadRouteGuardIndex < feedbackResetIndex, 'Expected loadStudySession guard before initial feedback state');
});
