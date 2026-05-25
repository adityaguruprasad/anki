function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isObjectLike(value) {
  return value !== null && (typeof value === 'object' || typeof value === 'function');
}

// Object-like descriptor helpers support request/function boundary inspection without changing stricter record semantics.
function isDataPropertyDescriptor(descriptor) {
  // Any own value slot is a data property, including value: undefined or non-writable fields.
  // Accessors do not have a value slot, so getters are rejected without invoking them.
  return (
    descriptor !== undefined
    && Object.prototype.hasOwnProperty.call(descriptor, 'value')
  );
}

function getOwnRecordPropertyDescriptor(value, key) {
  return isObjectRecord(value) ? Object.getOwnPropertyDescriptor(value, key) : undefined;
}

function getOwnObjectLikePropertyDescriptor(value, key) {
  return isObjectLike(value) ? Object.getOwnPropertyDescriptor(value, key) : undefined;
}

function getInheritedObjectLikePropertyDescriptor(value, key) {
  if (!isObjectLike(value)) {
    return undefined;
  }

  let prototype = Object.getPrototypeOf(value);

  while (prototype !== null) {
    const descriptor = Object.getOwnPropertyDescriptor(prototype, key);
    if (descriptor !== undefined) {
      return descriptor;
    }

    prototype = Object.getPrototypeOf(prototype);
  }

  return undefined;
}

function getOwnDataPropertyDescriptor(value, key) {
  const descriptor = getOwnRecordPropertyDescriptor(value, key);
  return isDataPropertyDescriptor(descriptor) ? descriptor : undefined;
}

function hasOwnDataProperty(value, key) {
  return getOwnDataPropertyDescriptor(value, key) !== undefined;
}

function getOwnDataPropertyValue(value, key) {
  const descriptor = getOwnDataPropertyDescriptor(value, key);
  return descriptor === undefined ? undefined : descriptor.value;
}

function hasOwnDataPropertyValue(value, key, expectedValue) {
  const descriptor = getOwnDataPropertyDescriptor(value, key);
  return descriptor !== undefined && descriptor.value === expectedValue;
}

/**
 * Returns undefined for non-arrays, missing entries, and non-data entries, so
 * do not use this when undefined is a valid array element to distinguish.
 */
function getOwnArrayDataPropertyValue(value, key) {
  const descriptor = Array.isArray(value)
    ? Object.getOwnPropertyDescriptor(value, key)
    : undefined;

  return isDataPropertyDescriptor(descriptor) ? descriptor.value : undefined;
}

function getOwnEnumerableDataProperties(value) {
  const properties = {};

  if (!isObjectRecord(value)) {
    return properties;
  }

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!isDataPropertyDescriptor(descriptor) || !descriptor.enumerable) {
      continue;
    }

    // Define descriptor values directly so keys like __proto__ cannot invoke setters.
    Object.defineProperty(properties, key, {
      value: descriptor.value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
  }

  return properties;
}

module.exports = {
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
};
