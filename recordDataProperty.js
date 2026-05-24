function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

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

module.exports = {
  getOwnDataPropertyDescriptor,
  getOwnDataPropertyValue,
  getOwnRecordPropertyDescriptor,
  hasOwnDataProperty,
  isDataPropertyDescriptor,
  isObjectRecord,
};
