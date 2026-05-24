const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  FRONTEND_MODULES,
  checkCraSrc,
  runSyncCraSrcCli,
  syncCraSrc,
} = require('../scripts/sync-cra-src');

const repoRoot = path.join(__dirname, '..');

function readRepoFile(...segments) {
  return fs.readFileSync(path.join(repoRoot, ...segments), 'utf8');
}

function createTempCraSyncRoot(t) {
  const rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'anki-cra-src-'));

  t.after(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  for (const fileName of FRONTEND_MODULES) {
    fs.writeFileSync(path.join(rootDir, fileName), `// ${fileName}\n`);
  }

  return rootDir;
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
    'cardIdentifier.js',
    'dashboard.js',
    'dashboardRequestInFlightState.js',
    'deck.js',
    'isoTimestampValidation.js',
    'spacedRepetition.js',
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

test('CRA source sync check passes for a freshly generated mirror', (t) => {
  const rootDir = createTempCraSyncRoot(t);

  syncCraSrc(rootDir);
  const status = checkCraSrc(rootDir);

  assert.equal(status.outputDir, path.join(rootDir, 'src', '__app__'));
  assert.deepEqual(status.checkedFiles, FRONTEND_MODULES);
  assert.deepEqual(status.staleFiles, []);
  assert.deepEqual(status.unexpectedFiles, []);
});

test('CRA source sync check detects stale mirrors without rewriting them', (t) => {
  const rootDir = createTempCraSyncRoot(t);
  syncCraSrc(rootDir);

  const mirroredMainPath = path.join(rootDir, 'src', '__app__', 'main.js');
  fs.writeFileSync(mirroredMainPath, '// stale main mirror\n');

  assert.throws(
    () => runSyncCraSrcCli(['--check'], rootDir),
    /CRA source mirror is stale\.[\s\S]*main\.js \(content differs from root source\)/
  );
  assert.equal(fs.readFileSync(mirroredMainPath, 'utf8'), '// stale main mirror\n');
});

test('CRA source sync check reports missing and unexpected mirror files', (t) => {
  const rootDir = createTempCraSyncRoot(t);
  syncCraSrc(rootDir);

  const outputDir = path.join(rootDir, 'src', '__app__');
  fs.rmSync(path.join(outputDir, 'studySession.js'));
  fs.writeFileSync(path.join(outputDir, 'orphan.js'), '// not generated\n');

  assert.throws(
    () => runSyncCraSrcCli(['--check'], rootDir),
    /studySession\.js \(missing from src\/__app__\)[\s\S]*orphan\.js \(unexpected in src\/__app__\)/
  );
  assert.equal(fs.readFileSync(path.join(outputDir, 'orphan.js'), 'utf8'), '// not generated\n');
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
