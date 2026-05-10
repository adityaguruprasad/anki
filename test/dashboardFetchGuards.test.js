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
    },
    {
      functionName: 'fetchDecks',
      requestUrlName: 'deckListUrl',
      latestUrlRefName: 'latestDeckListUrlRef',
      sequenceRefName: 'deckRequestSequenceRef',
    },
    {
      functionName: 'fetchSchedulingInsights',
      requestUrlName: 'schedulingInsightsUrl',
      latestUrlRefName: 'latestSchedulingInsightsUrlRef',
      sequenceRefName: 'schedulingInsightsRequestSequenceRef',
    },
  ].forEach(({
    functionName,
    requestUrlName,
    latestUrlRefName,
    sequenceRefName,
  }) => {
    const body = extractConstFunctionBody(functionName);
    const skipGuardIndex = body.indexOf('if (shouldSkipRequest()) {');
    const sequenceClaimIndex = body.indexOf(`${sequenceRefName}.current = requestSequence;`);

    assert.match(
      body,
      new RegExp(
        `const shouldSkipRequest = \\(\\) => \\([\\s\\S]*!isMountedRef\\.current[\\s\\S]*\\|\\| shouldIgnore\\(\\)[\\s\\S]*\\|\\| ${requestUrlName} !== ${latestUrlRefName}\\.current[\\s\\S]*\\);`
      ),
      `Expected ${functionName} to keep unmounted, ignored, and stale URL pre-flight guards`
    );
    assert.notEqual(skipGuardIndex, -1, `Expected ${functionName} to check shouldSkipRequest`);
    assert.notEqual(sequenceClaimIndex, -1, `Expected ${functionName} to claim a request sequence`);
    assert.ok(
      skipGuardIndex < sequenceClaimIndex,
      `Expected ${functionName} to skip ignored calls before invalidating in-flight requests`
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
