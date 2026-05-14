const test = require('node:test');
const assert = require('node:assert/strict');

const { isValidIsoTimestamp } = require('../isoTimestampValidation');

test('isValidIsoTimestamp accepts strict API cursor timestamp formats', () => {
  [
    '2026-05-08T13:00:00Z',
    '2026-05-08T13:00:00.1Z',
    '2026-05-08T13:00:00.000Z',
    '2026-05-08T13:00:00.123456Z',
    '2026-05-08T13:00:00+00:00',
    '2026-05-08T13:00:00-07:00',
  ].forEach((timestamp) => {
    assert.equal(isValidIsoTimestamp(timestamp), true);
  });
});

test('isValidIsoTimestamp rejects malformed or impossible timestamps', () => {
  [
    undefined,
    null,
    '',
    '  ',
    '2026-05-08',
    '2026-05-08T13:00:00',
    '2026-05-08T13:00Z',
    '2026-05-08T13:00:00.Z',
    '2026-05-08T13:00:00.1234567Z',
    `2026-05-08T13:00:00.${'1'.repeat(200)}Z`,
    '2026-13-08T13:00:00.000Z',
    '2026-05-32T13:00:00.000Z',
    '2026-02-31T13:00:00.000Z',
    '2026-05-08T24:00:00.000Z',
    '2026-05-08T13:60:00.000Z',
    '2026-05-08T13:00:60.000Z',
    '2026-05-08T13:00:00.000Z ',
    ['2026-05-08T13:00:00.000Z'],
  ].forEach((timestamp) => {
    assert.equal(isValidIsoTimestamp(timestamp), false);
  });
});
