const test = require('node:test');
const assert = require('node:assert/strict');

const { getUtf8ByteLength } = require('../authPasswordValidation');

test('getUtf8ByteLength counts UTF-8 bytes using Node semantics', () => {
  assert.equal(getUtf8ByteLength('password'), 8);
  assert.equal(getUtf8ByteLength('é'), 2);
  assert.equal(getUtf8ByteLength('界'), 3);
  assert.equal(getUtf8ByteLength('🙂'), 4);
  assert.equal(getUtf8ByteLength('\uD800'), 3);
});
