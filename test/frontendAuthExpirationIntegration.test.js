const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  FRONTEND_MODULES,
} = require('../scripts/sync-cra-src');

const repoRoot = path.join(__dirname, '..');

function readRepoFile(fileName) {
  return fs.readFileSync(path.join(repoRoot, fileName), 'utf8');
}

function countAuthExpirationCalls(source) {
  return (source.match(/handleAuthExpiredResponse\(response,\s*onAuthExpired\)/g) || []).length;
}

function countStudySessionAuthExpirationCalls(source) {
  return (source.match(/handleStudySessionAuthResponse\(\s*\{/g) || []).length;
}

test('App passes the stable auth-expired callback into protected route components', () => {
  const mainSource = readRepoFile('main.js');

  assert.match(mainSource, /import React,\s*\{[^}]*\buseCallback\b[^}]*\}/);
  assert.match(mainSource, /require\(['"]\.\/authBoundaryState['"]\)/);
  assert.match(mainSource, /const \[authNotice,\s*setAuthNotice\] = useState\(null\);/);
  assert.match(mainSource, /const clearAuthStorageAndLogout = useCallback\(\(\) => \{/);
  assert.match(mainSource, /localStorage\.removeItem\(AUTH_TOKEN_STORAGE_KEY\);/);
  assert.match(mainSource, /setIsLoggedIn\(false\);/);
  assert.match(
    mainSource,
    /const handleLogout = useCallback\(\(\) => \{[\s\S]*getAuthNoticeAfterLogout\(AUTH_LOGOUT_REASONS\.MANUAL\)/
  );
  assert.match(
    mainSource,
    /const handleAuthExpired = useCallback\(\(\) => \{[\s\S]*getAuthNoticeAfterLogout\(AUTH_LOGOUT_REASONS\.AUTH_EXPIRED\)/
  );
  assert.match(mainSource, /<Dashboard\s+env=\{apiEnv\}\s+onAuthExpired=\{handleAuthExpired\}\s*\/>/);
  assert.match(mainSource, /<StudySession\s+env=\{apiEnv\}\s+onAuthExpired=\{handleAuthExpired\}\s*\/>/);
  assert.match(mainSource, /<DeckManagement\s+env=\{apiEnv\}\s+onAuthExpired=\{handleAuthExpired\}\s*\/>/);
});

test('App wires auth-expiration notice state into Login', () => {
  const mainSource = readRepoFile('main.js');

  assert.match(mainSource, /const Login = \(\{ setIsLoggedIn,\s*env,\s*authNotice,\s*onAuthNoticeChange \}\) => \{/);
  assert.match(mainSource, /const noticeMessage = getAuthNoticeMessage\(authNotice\);/);
  assert.match(mainSource, /role="status"/);
  assert.match(mainSource, /aria-live="polite"/);
  assert.match(
    mainSource,
    /onAuthNoticeChange\(getAuthNoticeAfterModeToggle\(\)\);/
  );
  assert.match(
    mainSource,
    /onAuthNoticeChange\(getAuthNoticeAfterSubmissionStart\(\)\);/
  );
  assert.match(mainSource, /authNotice=\{authNotice\}/);
  assert.match(mainSource, /onAuthNoticeChange=\{setAuthNotice\}/);
});

test('protected components check auth-expired responses before generic failures', () => {
  [
    ['dashboard.js', 3],
    ['studySession.js', 3],
    ['deck.js', 8],
  ].forEach(([fileName, expectedCalls]) => {
    const source = readRepoFile(fileName);

    assert.match(source, /require\(['"]\.\/authExpiration['"]\)/);
    assert.match(source, /const \{ handleAuthExpiredResponse \} = authExpiration;/);
    assert.match(source, /onAuthExpired/);
    if (fileName === 'studySession.js') {
      assert.match(source, /handleStudySessionAuthResponse/);
      assert.equal(
        countStudySessionAuthExpirationCalls(source),
        expectedCalls,
        'Expected studySession.js to check every protected response through the freshness-aware helper'
      );
      return;
    }

    assert.equal(
      countAuthExpirationCalls(source),
      expectedCalls,
      `Expected ${fileName} to check every protected response`
    );
  });
});

test('CRA source sync mirrors frontend auth helpers', () => {
  assert.ok(
    FRONTEND_MODULES.includes('authExpiration.js'),
    'Expected authExpiration.js to be mirrored into CRA src'
  );
  assert.ok(
    FRONTEND_MODULES.includes('authBoundaryState.js'),
    'Expected authBoundaryState.js to be mirrored into CRA src'
  );
  assert.ok(
    FRONTEND_MODULES.includes('authReturnDestination.js'),
    'Expected authReturnDestination.js to be mirrored into CRA src'
  );
});
