const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getOwnDataPropertyDescriptor,
  getOwnDataPropertyValue,
  getOwnRecordPropertyDescriptor,
  hasOwnDataProperty,
  isDataPropertyDescriptor,
  isObjectRecord,
} = require('../recordDataProperty');

test('record data-property helper accepts null-prototype records with own data fields', () => {
  const record = Object.create(null);
  record.value = 'safe';

  assert.equal(isObjectRecord(record), true);
  assert.equal(hasOwnDataProperty(record, 'value'), true);
  assert.equal(getOwnDataPropertyValue(record, 'value'), 'safe');
  assert.equal(getOwnDataPropertyDescriptor(record, 'value').value, 'safe');
});

test('record data-property helper rejects arrays and non-objects as records', () => {
  const array = [];
  array.value = 'array value';

  [
    array,
    null,
    undefined,
    'value',
    42,
    true,
    function value() {},
  ].forEach((payload) => {
    assert.equal(isObjectRecord(payload), false);
    assert.equal(hasOwnDataProperty(payload, 'value'), false);
    assert.equal(getOwnDataPropertyValue(payload, 'value'), undefined);
    assert.equal(getOwnRecordPropertyDescriptor(payload, 'value'), undefined);
  });
});

test('record data-property helper ignores inherited fields', () => {
  const record = Object.create({ value: 'inherited' });

  assert.equal(isObjectRecord(record), true);
  assert.equal(hasOwnDataProperty(record, 'value'), false);
  assert.equal(getOwnDataPropertyValue(record, 'value'), undefined);
  assert.equal(getOwnRecordPropertyDescriptor(record, 'value'), undefined);
});

test('record data-property helper accepts own data fields with undefined values', () => {
  const record = {};
  Object.defineProperty(record, 'value', {
    enumerable: true,
    value: undefined,
  });

  const descriptor = getOwnDataPropertyDescriptor(record, 'value');

  assert.equal(hasOwnDataProperty(record, 'value'), true);
  assert.equal(Object.prototype.hasOwnProperty.call(descriptor, 'value'), true);
  assert.equal(getOwnDataPropertyValue(record, 'value'), undefined);
});

test('record data-property helper rejects own accessor-backed fields without invoking them', () => {
  let getterCalls = 0;
  const record = {};

  Object.defineProperty(record, 'value', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return 'accessor value';
    },
  });

  const descriptor = getOwnRecordPropertyDescriptor(record, 'value');

  assert.equal(isDataPropertyDescriptor(descriptor), false);
  assert.equal(hasOwnDataProperty(record, 'value'), false);
  assert.equal(getOwnDataPropertyDescriptor(record, 'value'), undefined);
  assert.equal(getOwnDataPropertyValue(record, 'value'), undefined);
  assert.equal(getterCalls, 0);
});

test('record data-property helper does not invoke throwing getters', () => {
  const record = {};

  Object.defineProperty(record, 'value', {
    enumerable: true,
    get() {
      throw new Error('getter should not run');
    },
  });

  assert.doesNotThrow(() => {
    assert.equal(hasOwnDataProperty(record, 'value'), false);
    assert.equal(getOwnDataPropertyValue(record, 'value'), undefined);
  });
});
