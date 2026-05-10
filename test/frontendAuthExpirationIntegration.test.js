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

test('App passes the stable logout callback into protected route components', () => {
  const mainSource = readRepoFile('main.js');

  assert.match(mainSource, /import React,\s*\{[^}]*\buseCallback\b[^}]*\}/);
  assert.match(mainSource, /const handleLogout = useCallback\(\(\) => \{/);
  assert.match(mainSource, /localStorage\.removeItem\(AUTH_TOKEN_STORAGE_KEY\);/);
  assert.match(mainSource, /setIsLoggedIn\(false\);/);
  assert.match(mainSource, /<Dashboard\s+env=\{apiEnv\}\s+onAuthExpired=\{handleLogout\}\s*\/>/);
  assert.match(mainSource, /<StudySession\s+env=\{apiEnv\}\s+onAuthExpired=\{handleLogout\}\s*\/>/);
  assert.match(mainSource, /<DeckManagement\s+env=\{apiEnv\}\s+onAuthExpired=\{handleLogout\}\s*\/>/);
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
    assert.equal(
      countAuthExpirationCalls(source),
      expectedCalls,
      `Expected ${fileName} to check every protected response`
    );
  });
});

test('CRA source sync mirrors the auth-expiration helper', () => {
  assert.ok(
    FRONTEND_MODULES.includes('authExpiration.js'),
    'Expected authExpiration.js to be mirrored into CRA src'
  );
});
