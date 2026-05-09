const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const mainSource = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');

test('authenticated app navigation uses SPA links for internal routes', () => {
  assert.match(
    mainSource,
    /import\s*\{[^}]*\bLink\b[^}]*\}\s*from\s*['"]react-router-dom['"]/,
    'main.js should import Link from react-router-dom'
  );

  [
    { path: '/', label: 'Dashboard' },
    { path: '/study', label: 'Study' },
    { path: '/decks', label: 'Manage Decks' },
  ].forEach((item) => {
    const escapedPath = item.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const linkPattern = new RegExp(`<Link\\s+to="${escapedPath}"[^>]*>${item.label}</Link>`);
    const anchorPattern = new RegExp(`<a\\s+href="${escapedPath}"[^>]*>${item.label}</a>`);

    assert.match(mainSource, linkPattern);
    assert.doesNotMatch(mainSource, anchorPattern);
  });
});
