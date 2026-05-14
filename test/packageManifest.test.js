const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.join(__dirname, '..');

function readPackageManifest() {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
}

function getPackageNameFromBareSpecifier(specifier) {
  if (specifier.startsWith('@')) {
    const [scope, packageName] = specifier.split('/');
    return packageName ? `${scope}/${packageName}` : specifier;
  }

  return specifier.split('/')[0];
}

function getBareRequirePackageNames(source) {
  const requires = new Set();
  const requirePattern = /\brequire\(['"]([^.'"/][^'"]*)['"]\)/g;

  for (const match of source.matchAll(requirePattern)) {
    requires.add(getPackageNameFromBareSpecifier(match[1]));
  }

  return [...requires].sort();
}

function readServerBareRequires() {
  const serverSource = fs.readFileSync(path.join(repoRoot, 'server.js'), 'utf8');
  return getBareRequirePackageNames(serverSource);
}

test('bare require package parser preserves scoped packages and normalizes subpaths', () => {
  assert.deepEqual(
    getBareRequirePackageNames(`
      require('pg/lib/native/client');
      require('@scope/pkg');
      require('@scope/pkg/submodule');
      require('./localModule');
      require('../parentModule');
    `),
    ['@scope/pkg', 'pg'],
  );
});

test('package manifest declares every server runtime dependency', () => {
  const packageManifest = readPackageManifest();
  const runtimeDependencies = packageManifest.dependencies || {};
  const serverDependencies = readServerBareRequires();

  assert.deepEqual(serverDependencies, ['cors', 'express', 'pg']);

  for (const packageName of serverDependencies) {
    assert.equal(
      typeof runtimeDependencies[packageName],
      'string',
      `Expected package.json dependencies to declare ${packageName}`,
    );
  }
});

test('package manifest exposes an API server start script', () => {
  const packageManifest = readPackageManifest();

  assert.equal(packageManifest.scripts?.['start:api'], 'node server.js');
});
