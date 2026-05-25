const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getInheritedObjectLikePropertyDescriptor,
  getOwnArrayDataPropertyValue,
  getOwnDataPropertyDescriptor,
  getOwnDataPropertyValue,
  getOwnEnumerableDataProperties,
  getOwnObjectLikePropertyDescriptor,
  getOwnRecordPropertyDescriptor,
  hasOwnDataProperty,
  hasOwnDataPropertyValue,
  isDataPropertyDescriptor,
  isObjectRecord,
} = require('../recordDataProperty');

test('record data-property helper accepts null-prototype records with own data fields', () => {
  const record = Object.create(null);
  record.value = 'safe';

  assert.equal(isObjectRecord(record), true);
  assert.equal(hasOwnDataProperty(record, 'value'), true);
  assert.equal(hasOwnDataPropertyValue(record, 'value', 'safe'), true);
  assert.equal(getOwnDataPropertyValue(record, 'value'), 'safe');
  assert.equal(getOwnDataPropertyDescriptor(record, 'value').value, 'safe');
});

test('record data-property value helper matches only own data field values', () => {
  let getterCalls = 0;
  const record = Object.create({ inherited: 'safe' });
  record.value = 'safe';
  Object.defineProperty(record, 'accessor', {
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('getter should not run');
    },
  });

  assert.equal(hasOwnDataPropertyValue(record, 'value', 'safe'), true);
  assert.equal(hasOwnDataPropertyValue(record, 'value', 'unsafe'), false);
  assert.equal(hasOwnDataPropertyValue(record, 'missing', 'safe'), false);
  assert.equal(hasOwnDataPropertyValue(record, 'inherited', 'safe'), false);
  assert.equal(hasOwnDataPropertyValue(record, 'accessor', 'safe'), false);
  assert.equal(getterCalls, 0);
});

test('record data-property value helper distinguishes own undefined from absent fields', () => {
  let getterCalls = 0;
  const record = {};

  Object.defineProperty(record, 'value', {
    enumerable: true,
    value: undefined,
  });
  Object.defineProperty(record, 'accessor', {
    enumerable: true,
    get() {
      getterCalls += 1;
      return undefined;
    },
  });

  assert.equal(hasOwnDataPropertyValue(record, 'value', undefined), true);
  assert.equal(hasOwnDataPropertyValue(record, 'missing', undefined), false);
  assert.equal(hasOwnDataPropertyValue(record, 'accessor', undefined), false);
  assert.equal(getterCalls, 0);
});

test('record data-property value helper rejects non-records even when apparent values match', () => {
  const array = ['array entry'];
  array.value = 'array value';

  [
    { payload: array, key: '0', expectedValue: array[0] },
    { payload: array, key: 'value', expectedValue: array.value },
    { payload: 'value', key: '0', expectedValue: 'value'[0] },
    { payload: 'value', key: 'length', expectedValue: 'value'.length },
    { payload: 42, key: 'toString', expectedValue: Number.prototype.toString },
    { payload: true, key: 'valueOf', expectedValue: Boolean.prototype.valueOf },
    { payload: null, key: 'value', expectedValue: undefined },
    { payload: undefined, key: 'value', expectedValue: undefined },
  ].forEach(({ payload, key, expectedValue }) => {
    assert.equal(hasOwnDataPropertyValue(payload, key, expectedValue), false);
  });
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

test('array data-property helper accepts dense own entries without changing record semantics', () => {
  const row = Object.create(null);
  row.id = 42;
  const rows = [row];
  const nullPrototypeRows = [row];
  Object.setPrototypeOf(nullPrototypeRows, null);

  assert.equal(getOwnArrayDataPropertyValue(rows, 0), row);
  assert.equal(getOwnArrayDataPropertyValue(rows, '0'), row);
  assert.equal(getOwnArrayDataPropertyValue(nullPrototypeRows, 0), row);
  assert.equal(getOwnDataPropertyValue(rows, '0'), undefined);
});

test('array data-property helper rejects non-arrays and descriptor-invalid entries without invoking getters', () => {
  let ownAccessorCalls = 0;
  let inheritedAccessorCalls = 0;
  const sparseRows = [];
  sparseRows.length = 1;

  const inheritedDataRows = [];
  const inheritedDataPrototype = Object.create(Array.prototype);
  inheritedDataRows.length = 1;
  Object.defineProperty(inheritedDataPrototype, '0', {
    configurable: true,
    enumerable: true,
    value: 'inherited row',
  });
  Object.setPrototypeOf(inheritedDataRows, inheritedDataPrototype);

  const ownAccessorRows = [];
  ownAccessorRows.length = 1;
  Object.defineProperty(ownAccessorRows, '0', {
    configurable: true,
    enumerable: true,
    get() {
      ownAccessorCalls += 1;
      throw new Error('own array entry getter should not run');
    },
  });

  const inheritedAccessorRows = [];
  const inheritedAccessorPrototype = Object.create(Array.prototype);
  inheritedAccessorRows.length = 1;
  Object.defineProperty(inheritedAccessorPrototype, '0', {
    configurable: true,
    enumerable: true,
    get() {
      inheritedAccessorCalls += 1;
      throw new Error('inherited array entry getter should not run');
    },
  });
  Object.setPrototypeOf(inheritedAccessorRows, inheritedAccessorPrototype);

  [
    { 0: 'array-like object' },
    null,
    undefined,
    'value',
    42,
    sparseRows,
    inheritedDataRows,
    ownAccessorRows,
    inheritedAccessorRows,
  ].forEach((payload) => {
    assert.equal(getOwnArrayDataPropertyValue(payload, 0), undefined);
  });
  assert.equal(ownAccessorCalls, 0);
  assert.equal(inheritedAccessorCalls, 0);
});

test('object-like descriptor helper accepts arrays and functions without changing record semantics', () => {
  const array = [];
  function request() {}

  Object.defineProperty(array, 'value', {
    configurable: true,
    enumerable: true,
    value: 'array value',
    writable: true,
  });
  Object.defineProperty(request, 'value', {
    configurable: true,
    enumerable: true,
    value: 'function value',
    writable: true,
  });

  assert.equal(isObjectRecord(array), false);
  assert.equal(isObjectRecord(request), false);
  assert.equal(getOwnRecordPropertyDescriptor(array, 'value'), undefined);
  assert.equal(getOwnRecordPropertyDescriptor(request, 'value'), undefined);
  assert.equal(getOwnObjectLikePropertyDescriptor(array, 'value').value, 'array value');
  assert.equal(getOwnObjectLikePropertyDescriptor(request, 'value').value, 'function value');
});

test('object-like descriptor helper inspects own accessors without invoking getters', () => {
  let getterCalls = 0;
  const record = {};

  Object.defineProperty(record, 'value', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('getter should not run');
    },
  });

  const descriptor = getOwnObjectLikePropertyDescriptor(record, 'value');

  assert.equal(isDataPropertyDescriptor(descriptor), false);
  assert.equal(typeof descriptor.get, 'function');
  assert.equal(getterCalls, 0);
});

test('inherited object-like descriptor helper walks prototype chains without invoking getters', () => {
  let getterCalls = 0;
  const grandparent = {};
  const parent = Object.create(grandparent);
  const record = Object.create(parent);

  Object.defineProperty(grandparent, 'value', {
    configurable: true,
    enumerable: true,
    get() {
      getterCalls += 1;
      throw new Error('getter should not run');
    },
  });

  const descriptor = getInheritedObjectLikePropertyDescriptor(record, 'value');

  assert.equal(getOwnObjectLikePropertyDescriptor(record, 'value'), undefined);
  assert.equal(isDataPropertyDescriptor(descriptor), false);
  assert.equal(typeof descriptor.get, 'function');
  assert.equal(getterCalls, 0);
  assert.equal(getInheritedObjectLikePropertyDescriptor(null, 'value'), undefined);
  assert.equal(getInheritedObjectLikePropertyDescriptor('value', 'value'), undefined);
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
  assert.equal(hasOwnDataPropertyValue(record, 'value', undefined), true);
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

test('enumerable data-property helper copies only own enumerable data fields', () => {
  const symbolKey = Symbol('symbolKey');
  const inheritedSymbolKey = Symbol('inheritedSymbolKey');
  let getterCalls = 0;
  const prototype = {
    inherited: 'skip inherited string key',
  };

  Object.defineProperty(prototype, inheritedSymbolKey, {
    enumerable: true,
    value: 'skip inherited symbol key',
  });

  const record = Object.create(prototype);
  Object.defineProperties(record, {
    visible: {
      enumerable: true,
      value: 'copy me',
    },
    hidden: {
      enumerable: false,
      value: 'skip non-enumerable data',
    },
    undefinedValue: {
      enumerable: true,
      value: undefined,
    },
    accessor: {
      enumerable: true,
      get() {
        getterCalls += 1;
        throw new Error('getter should not run');
      },
    },
    [symbolKey]: {
      enumerable: true,
      value: 'copy symbol',
    },
  });

  const properties = getOwnEnumerableDataProperties(record);

  assert.equal(Object.getPrototypeOf(properties), Object.prototype);
  assert.deepEqual(Object.keys(properties), ['visible', 'undefinedValue']);
  assert.equal(properties.visible, 'copy me');
  assert.equal(Object.prototype.hasOwnProperty.call(properties, 'undefinedValue'), true);
  assert.equal(properties.undefinedValue, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(properties, 'hidden'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(properties, 'accessor'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(properties, 'inherited'), false);
  assert.deepEqual(Object.getOwnPropertySymbols(properties), [symbolKey]);
  assert.equal(properties[symbolKey], 'copy symbol');
  assert.equal(Object.prototype.hasOwnProperty.call(properties, inheritedSymbolKey), false);
  assert.equal(getterCalls, 0);
});

test('enumerable data-property helper accepts null-prototype records', () => {
  const record = Object.create(null);
  record.value = 'safe';

  assert.deepEqual(getOwnEnumerableDataProperties(record), { value: 'safe' });
});

test('enumerable data-property helper defines __proto__ as data without changing prototype', () => {
  const unsafePrototype = { polluted: true };
  const record = {};

  Object.defineProperty(record, '__proto__', {
    enumerable: true,
    value: unsafePrototype,
  });

  const properties = getOwnEnumerableDataProperties(record);
  const descriptor = Object.getOwnPropertyDescriptor(properties, '__proto__');

  assert.equal(Object.getPrototypeOf(properties), Object.prototype);
  assert.equal(descriptor.value, unsafePrototype);
  assert.equal(descriptor.enumerable, true);
  assert.equal(Object.prototype.hasOwnProperty.call(properties, '__proto__'), true);
  assert.notEqual(Object.getPrototypeOf(properties), unsafePrototype);
});

test('enumerable data-property helper rejects arrays and non-objects', () => {
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
    assert.deepEqual(Reflect.ownKeys(getOwnEnumerableDataProperties(payload)), []);
  });
});
