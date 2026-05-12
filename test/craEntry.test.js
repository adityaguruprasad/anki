const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const {
  FRONTEND_MODULES,
} = require('../scripts/sync-cra-src');

const repoRoot = path.join(__dirname, '..');

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

test('CRA document shell provides the root mount node', () => {
  const html = readRepoFile('public', 'index.html');

  assert.match(html, /<div\s+id="root"><\/div>/);
});

test('CRA entry imports and renders the existing App mirror', () => {
  const indexSource = readRepoFile('src', 'index.js');

  assert.match(
    indexSource,
    /import\s+App\s+from\s+['"]\.\/__app__\/main['"];/
  );
  assert.match(indexSource, /<App\s*\/>/);
  assert.match(
    indexSource,
    /document\.getElementById\(['"]root['"]\)/
  );
});

test('CRA source sync keeps the root App and its component closure in the build', () => {
  [
    'main.js',
    'authPasswordValidation.js',
    'dashboard.js',
    'dashboardRequestInFlightState.js',
    'deck.js',
    'studySession.js',
  ].forEach((fileName) => {
    assert.ok(
      FRONTEND_MODULES.includes(fileName),
      `Expected ${fileName} to be mirrored into CRA src`
    );
    assert.ok(
      fs.existsSync(path.join(repoRoot, fileName)),
      `Expected root source module ${fileName} to exist`
    );
  });
});

test('CRA build resolves the existing UI alias inside src', () => {
  const jsconfig = JSON.parse(readRepoFile('jsconfig.json'));

  assert.equal(jsconfig.compilerOptions.baseUrl, 'src');

  [
    ['button.js', /export\s+const\s+Button\b/],
    ['card.js', /export\s+const\s+Card\b/],
    ['input.js', /export\s+const\s+Input\b/],
  ].forEach(([fileName, exportPattern]) => {
    const source = readRepoFile('src', '@', 'components', 'ui', fileName);
    assert.match(source, exportPattern);
  });
});
