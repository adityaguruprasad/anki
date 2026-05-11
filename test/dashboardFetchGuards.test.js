const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const dashboardSource = fs.readFileSync(path.join(__dirname, '..', 'dashboard.js'), 'utf8');

function extractConstFunctionBody(name) {
  const marker = `const ${name} =`;
  const start = dashboardSource.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${name} to be defined`);

  const arrowStart = dashboardSource.indexOf('=> {', start);
  assert.notEqual(arrowStart, -1, `Expected ${name} to be an arrow function`);

  const bodyStart = dashboardSource.indexOf('{', arrowStart);
  assert.notEqual(bodyStart, -1, `Expected ${name} to have a block body`);

  let depth = 0;
  for (let index = bodyStart; index < dashboardSource.length; index += 1) {
    const char = dashboardSource[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return dashboardSource.slice(bodyStart + 1, index);
      }
    }
  }

  assert.fail(`Expected ${name} block body to close`);
}

test('dashboard fetch helpers skip before claiming a new request sequence', () => {
  [
    {
      functionName: 'fetchStats',
      requestUrlName: 'statsUrl',
      latestUrlRefName: 'latestStatsUrlRef',
      sequenceRefName: 'statsRequestSequenceRef',
      requestDomainName: 'STATS',
    },
    {
      functionName: 'fetchDecks',
      requestUrlName: 'deckListUrl',
      latestUrlRefName: 'latestDeckListUrlRef',
      sequenceRefName: 'deckRequestSequenceRef',
      requestDomainName: 'DECK_LIST',
    },
    {
      functionName: 'fetchSchedulingInsights',
      requestUrlName: 'schedulingInsightsUrl',
      latestUrlRefName: 'latestSchedulingInsightsUrlRef',
      sequenceRefName: 'schedulingInsightsRequestSequenceRef',
      requestDomainName: 'SCHEDULING_INSIGHTS',
    },
  ].forEach(({
    functionName,
    requestUrlName,
    latestUrlRefName,
    sequenceRefName,
    requestDomainName,
  }) => {
    const body = extractConstFunctionBody(functionName);
    const skipGuardIndex = body.indexOf('if (shouldSkipRequest()) {');
    const inFlightBeginIndex = body.indexOf('const requestGuard = beginDashboardRequest(');
    const inFlightSkipIndex = body.indexOf('if (!requestGuard) {');
    const sequenceClaimIndex = body.indexOf(`${sequenceRefName}.current = requestSequence;`);
    const fetchIndex = body.indexOf(`const response = await fetch(${requestUrlName},`);
    const staleGuardIndex = body.indexOf('if (shouldSkipUpdate()) {', fetchIndex);
    const authExpiredIndex = body.indexOf('if (handleAuthExpiredResponse(response, onAuthExpired))', fetchIndex);
    const completionIndex = body.indexOf('completeDashboardRequest(dashboardRequestsInFlightRef.current, requestGuard);');

    assert.match(
      body,
      new RegExp(
        `const shouldSkipRequest = \\(\\) => \\([\\s\\S]*!isMountedRef\\.current[\\s\\S]*\\|\\| shouldIgnore\\(\\)[\\s\\S]*\\|\\| ${requestUrlName} !== ${latestUrlRefName}\\.current[\\s\\S]*\\);`
      ),
      `Expected ${functionName} to keep unmounted, ignored, and stale URL pre-flight guards`
    );
    assert.notEqual(skipGuardIndex, -1, `Expected ${functionName} to check shouldSkipRequest`);
    assert.notEqual(inFlightBeginIndex, -1, `Expected ${functionName} to begin an in-flight request guard`);
    assert.notEqual(inFlightSkipIndex, -1, `Expected ${functionName} to skip duplicate in-flight requests`);
    assert.notEqual(sequenceClaimIndex, -1, `Expected ${functionName} to claim a request sequence`);
    assert.notEqual(fetchIndex, -1, `Expected ${functionName} to fetch the current URL`);
    assert.notEqual(staleGuardIndex, -1, `Expected ${functionName} to guard stale responses before auth handling`);
    assert.notEqual(authExpiredIndex, -1, `Expected ${functionName} to keep auth-expiration handling`);
    assert.notEqual(completionIndex, -1, `Expected ${functionName} to release its in-flight request guard`);
    assert.match(
      body,
      new RegExp(
        `beginDashboardRequest\\([\\s\\S]*dashboardRequestsInFlightRef\\.current,[\\s\\S]*DASHBOARD_REQUEST_DOMAINS\\.${requestDomainName},[\\s\\S]*${requestUrlName}[\\s\\S]*\\);`
      ),
      `Expected ${functionName} to guard by Dashboard request domain and current URL`
    );
    assert.ok(
      skipGuardIndex < sequenceClaimIndex,
      `Expected ${functionName} to skip ignored calls before invalidating in-flight requests`
    );
    assert.ok(
      skipGuardIndex < inFlightBeginIndex,
      `Expected ${functionName} to keep stale/unmounted pre-flight checks before the in-flight guard`
    );
    assert.ok(
      inFlightBeginIndex < sequenceClaimIndex,
      `Expected ${functionName} to skip duplicate in-flight requests before claiming a sequence`
    );
    assert.ok(
      inFlightSkipIndex < fetchIndex,
      `Expected ${functionName} to skip duplicate in-flight requests before fetch`
    );
    assert.ok(
      staleGuardIndex < authExpiredIndex,
      `Expected ${functionName} to preserve stale/current guard before auth-expiration handling`
    );
    assert.ok(
      fetchIndex < completionIndex,
      `Expected ${functionName} to release its in-flight guard after the fetch attempt starts`
    );
    assert.match(
      body,
      new RegExp(`requestSequence !== ${sequenceRefName}\\.current`),
      `Expected ${functionName} to keep sequence stale-response protection`
    );
    assert.match(
      body,
      new RegExp(`${requestUrlName} !== ${latestUrlRefName}\\.current`),
      `Expected ${functionName} to keep URL stale-response protection`
    );
  });
});

test('dashboard imports request in-flight guards for all fetch helpers', () => {
  assert.match(
    dashboardSource,
    /const dashboardRequestInFlightState = require\('\.\/dashboardRequestInFlightState'\);/
  );
  assert.match(
    dashboardSource,
    /const \{\s*DASHBOARD_REQUEST_DOMAINS,\s*beginDashboardRequest,\s*completeDashboardRequest,\s*\} = dashboardRequestInFlightState;/
  );
  assert.match(
    dashboardSource,
    /const dashboardRequestsInFlightRef = useRef\(\{\}\);/
  );
});

test('fetchSchedulingInsights rejects malformed successful payloads before storing them', () => {
  const body = extractConstFunctionBody('fetchSchedulingInsights');
  const jsonIndex = body.indexOf('const data = await response.json();');
  const validationIndex = body.indexOf('if (!hasSchedulingInsightsPayload(data)) {');
  const setInsightsIndex = body.indexOf('setSchedulingInsights(data);');

  assert.notEqual(jsonIndex, -1, 'Expected fetchSchedulingInsights to parse response JSON');
  assert.notEqual(validationIndex, -1, 'Expected fetchSchedulingInsights to validate parsed insights');
  assert.notEqual(setInsightsIndex, -1, 'Expected fetchSchedulingInsights to store valid insights');
  assert.ok(jsonIndex < validationIndex, 'Expected validation after parsing JSON');
  assert.ok(validationIndex < setInsightsIndex, 'Expected validation before storing insights');
  assert.match(
    body.slice(validationIndex, setInsightsIndex),
    /throw new Error\('Malformed scheduling insights payload'\);/,
    'Expected malformed insights to flow through retryable load failure handling'
  );
});

test('dashboard builds scheduling summary only after the display gate allows it', () => {
  const displayStateIndex = dashboardSource.indexOf(
    'const schedulingInsightsDisplay = buildSchedulingInsightsDisplayState({'
  );
  const summaryIndex = dashboardSource.indexOf(
    'const schedulingSummary = schedulingInsightsDisplay.showSummary'
  );
  const returnIndex = dashboardSource.indexOf('return (', summaryIndex);

  assert.notEqual(displayStateIndex, -1, 'Expected Dashboard to build scheduling display state');
  assert.notEqual(summaryIndex, -1, 'Expected Dashboard to gate scheduling summary construction');
  assert.notEqual(returnIndex, -1, 'Expected Dashboard render body after summary setup');
  assert.ok(
    displayStateIndex < summaryIndex,
    'Expected scheduling display state to be available before building the summary'
  );
  assert.match(
    dashboardSource.slice(summaryIndex, returnIndex),
    /const schedulingSummary = schedulingInsightsDisplay\.showSummary\s*\?\s*buildSchedulingInsightsSummary\(schedulingInsights\)\s*:\s*null;/,
    'Expected Dashboard to call the summary mapper only for valid display-ready insights'
  );
});

test('fetchStats rejects malformed successful payloads after stale guards before storing them', () => {
  const body = extractConstFunctionBody('fetchStats');
  const jsonIndex = body.indexOf('const data = await response.json();');
  const staleGuardAfterJsonIndex = body.indexOf('if (shouldSkipUpdate()) {', jsonIndex);
  const validationIndex = body.indexOf('if (!hasStatsPayload(data)) {');
  const setStatsIndex = body.indexOf('setStats(data);');

  assert.match(
    dashboardSource,
    /const \{ buildDashboardStatsDisplayState, hasStatsPayload \} = dashboardStatsDisplayState;/,
    'Expected dashboard to import the stats payload validator'
  );
  assert.notEqual(jsonIndex, -1, 'Expected fetchStats to parse response JSON');
  assert.notEqual(staleGuardAfterJsonIndex, -1, 'Expected fetchStats to keep stale guard after parsing JSON');
  assert.notEqual(validationIndex, -1, 'Expected fetchStats to validate parsed stats');
  assert.notEqual(setStatsIndex, -1, 'Expected fetchStats to store valid stats');
  assert.ok(jsonIndex < staleGuardAfterJsonIndex, 'Expected stale guard after parsing JSON');
  assert.ok(staleGuardAfterJsonIndex < validationIndex, 'Expected validation after the stale guard');
  assert.ok(validationIndex < setStatsIndex, 'Expected validation before storing stats');
  assert.match(
    body.slice(validationIndex, setStatsIndex),
    /throw new Error\('Malformed stats payload'\);/,
    'Expected malformed stats to flow through retryable load failure handling'
  );
});

test('fetchDecks rejects malformed successful payloads before setting the target or clearing failure', () => {
  const body = extractConstFunctionBody('fetchDecks');
  const jsonIndex = body.indexOf('const data = await response.json();');
  const staleGuardAfterJsonIndex = body.indexOf('if (shouldSkipUpdate()) {', jsonIndex);
  const validationIndex = body.indexOf('if (!hasDashboardDeckListPayload(data)) {');
  const setTargetIndex = body.indexOf('setStudyDeckTarget(selectStudyDeckTarget(data));');
  const clearFailureIndex = body.indexOf('setDeckLoadFailed(false);');

  assert.match(
    dashboardSource,
    /const \{ getStudyDeckTargetPath, hasDashboardDeckListPayload, selectStudyDeckTarget \} = dashboardDeckTarget;/,
    'Expected dashboard to import the deck-list payload validator'
  );
  assert.notEqual(jsonIndex, -1, 'Expected fetchDecks to parse response JSON');
  assert.notEqual(staleGuardAfterJsonIndex, -1, 'Expected fetchDecks to keep stale guard after parsing JSON');
  assert.notEqual(validationIndex, -1, 'Expected fetchDecks to validate parsed decks');
  assert.notEqual(setTargetIndex, -1, 'Expected fetchDecks to set the study target from valid decks');
  assert.notEqual(clearFailureIndex, -1, 'Expected fetchDecks to clear the deck load failure after success');
  assert.ok(jsonIndex < staleGuardAfterJsonIndex, 'Expected stale guard after parsing JSON');
  assert.ok(staleGuardAfterJsonIndex < validationIndex, 'Expected validation after the stale guard');
  assert.ok(validationIndex < setTargetIndex, 'Expected validation before setting the study target');
  assert.ok(validationIndex < clearFailureIndex, 'Expected validation before clearing deck load failure');
  assert.match(
    body.slice(validationIndex, setTargetIndex),
    /throw new Error\('Malformed deck list payload'\);/,
    'Expected malformed deck lists to flow through retryable load failure handling'
  );
});
