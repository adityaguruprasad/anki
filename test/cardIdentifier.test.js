const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FRONTEND_MODULES,
} = require('../scripts/sync-cra-src');
const {
  MAX_POSTGRES_SERIAL_ID,
  hasRouteSafeCardId,
  hasSameRouteSafeCardId,
  normalizeRouteSafeCardId,
} = require('../cardIdentifier');

test('normalizeRouteSafeCardId canonicalizes PostgreSQL SERIAL card ids', () => {
  assert.equal(normalizeRouteSafeCardId(7), '7');
  assert.equal(normalizeRouteSafeCardId(MAX_POSTGRES_SERIAL_ID), String(MAX_POSTGRES_SERIAL_ID));
  assert.equal(normalizeRouteSafeCardId(' 0007 '), '7');
  assert.equal(
    normalizeRouteSafeCardId(`\t000${MAX_POSTGRES_SERIAL_ID}\n`),
    String(MAX_POSTGRES_SERIAL_ID),
  );
});

test('normalizeRouteSafeCardId rejects card ids outside the backend SERIAL contract', () => {
  [
    undefined,
    null,
    '',
    '  ',
    'card-7',
    '1.2',
    '1e2',
    '0',
    '000',
    '-1',
    String(MAX_POSTGRES_SERIAL_ID + 1),
    '9007199254740992',
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX_POSTGRES_SERIAL_ID + 1,
    Number.MAX_SAFE_INTEGER,
    Number.MAX_SAFE_INTEGER + 1,
    {},
    [],
  ].forEach((id) => {
    assert.equal(normalizeRouteSafeCardId(id), null, `Expected ${String(id)} to be rejected`);
    assert.equal(hasRouteSafeCardId(id), false, `Expected ${String(id)} to be unusable`);
  });
});

test('hasSameRouteSafeCardId compares ids after route-safe normalization', () => {
  assert.equal(hasSameRouteSafeCardId(7, '7'), true);
  assert.equal(hasSameRouteSafeCardId(7, ' 0007 '), true);
  assert.equal(hasSameRouteSafeCardId('8', 7), false);
  assert.equal(hasSameRouteSafeCardId('card-7', 'card-7'), false);
  assert.equal(hasSameRouteSafeCardId(0, '0'), false);
});

test('CRA source sync mirrors the shared card identifier helper', () => {
  assert.ok(
    FRONTEND_MODULES.includes('cardIdentifier.js'),
    'Expected cardIdentifier.js to be mirrored into CRA src',
  );
});
