const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const Module = require('node:module');
const path = require('node:path');

const API_HANDLERS_PATH = path.join(__dirname, '..', 'apiHandlers.js');

function loadApiHandlersPrivateExports() {
  const source = fs.readFileSync(API_HANDLERS_PATH, 'utf8');
  const apiHandlersModule = new Module(`${API_HANDLERS_PATH}:private`, module);
  apiHandlersModule.filename = API_HANDLERS_PATH;
  apiHandlersModule.paths = Module._nodeModulePaths(path.dirname(API_HANDLERS_PATH));
  apiHandlersModule._compile(
    `${source}\nmodule.exports.__private = { normalizeAllowedEmptySidecarFields };\n`,
    API_HANDLERS_PATH
  );

  return apiHandlersModule.exports.__private;
}

const { normalizeAllowedEmptySidecarFields } = loadApiHandlersPrivateExports();

function defineAllowedEmptySidecarFields(options, value) {
  Object.defineProperty(options, 'allowedEmptySidecarFields', {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

test('normalizeAllowedEmptySidecarFields preserves omitted and own data options', () => {
  const plainFields = ['__is_due'];
  const nullPrototypeFields = ['__cursor_created_at'];
  const nullPrototypeOptions = Object.create(null);
  defineAllowedEmptySidecarFields(nullPrototypeOptions, nullPrototypeFields);

  assert.deepEqual(normalizeAllowedEmptySidecarFields(), []);
  assert.deepEqual(normalizeAllowedEmptySidecarFields(null), []);
  assert.equal(
    normalizeAllowedEmptySidecarFields({ allowedEmptySidecarFields: plainFields }),
    plainFields
  );
  assert.equal(
    normalizeAllowedEmptySidecarFields(nullPrototypeOptions),
    nullPrototypeFields
  );
});

test('normalizeAllowedEmptySidecarFields ignores inherited allowed sidecar fields', () => {
  let inheritedAccessorCalls = 0;
  const inheritedDataOptions = Object.create({
    allowedEmptySidecarFields: ['__is_due'],
  });
  const inheritedAccessorPrototype = {};
  Object.defineProperty(inheritedAccessorPrototype, 'allowedEmptySidecarFields', {
    configurable: true,
    enumerable: true,
    get() {
      inheritedAccessorCalls += 1;
      throw new Error('inherited allowed-empty-sidecar getter should not run');
    },
  });
  const inheritedAccessorOptions = Object.create(inheritedAccessorPrototype);

  assert.deepEqual(normalizeAllowedEmptySidecarFields(inheritedDataOptions), []);
  assert.deepEqual(normalizeAllowedEmptySidecarFields(inheritedAccessorOptions), []);
  assert.equal(inheritedAccessorCalls, 0);
});

test('normalizeAllowedEmptySidecarFields ignores own accessor fields without reading them', () => {
  let ownAccessorCalls = 0;
  const options = {};
  Object.defineProperty(options, 'allowedEmptySidecarFields', {
    configurable: true,
    enumerable: true,
    get() {
      ownAccessorCalls += 1;
      throw new Error('own allowed-empty-sidecar getter should not run');
    },
  });

  assert.deepEqual(normalizeAllowedEmptySidecarFields(options), []);
  assert.equal(ownAccessorCalls, 0);
});

test('normalizeAllowedEmptySidecarFields ignores array-shaped options', () => {
  const options = [];
  defineAllowedEmptySidecarFields(options, ['__is_due']);

  assert.deepEqual(normalizeAllowedEmptySidecarFields(options), []);
});

test('normalizeAllowedEmptySidecarFields still rejects non-array own data fields', () => {
  assert.throws(
    () => normalizeAllowedEmptySidecarFields({ allowedEmptySidecarFields: '__is_due' }),
    TypeError
  );
});
