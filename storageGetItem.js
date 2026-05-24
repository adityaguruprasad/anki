const { isDataPropertyDescriptor } = require('./recordDataProperty');

function isStorageLikeTarget(value) {
  return (
    value !== null
    && (typeof value === 'object' || typeof value === 'function')
  );
}

function getOwnGetItem(tokenSource) {
  const descriptor = Object.getOwnPropertyDescriptor(tokenSource, 'getItem');
  return isDataPropertyDescriptor(descriptor) && typeof descriptor.value === 'function'
    ? descriptor.value
    : null;
}

function getWebStoragePrototype() {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Storage');
  if (!isDataPropertyDescriptor(storageDescriptor) || typeof storageDescriptor.value !== 'function') {
    return null;
  }

  const prototypeDescriptor = Object.getOwnPropertyDescriptor(storageDescriptor.value, 'prototype');
  const storagePrototype = isDataPropertyDescriptor(prototypeDescriptor)
    ? prototypeDescriptor.value
    : null;

  return isStorageLikeTarget(storagePrototype) ? storagePrototype : null;
}

function getWebStoragePrototypeGetItem(tokenSource) {
  const storagePrototype = getWebStoragePrototype();
  if (storagePrototype === null) {
    return null;
  }

  let currentPrototype = Object.getPrototypeOf(tokenSource);
  while (currentPrototype !== null && currentPrototype !== storagePrototype) {
    currentPrototype = Object.getPrototypeOf(currentPrototype);
  }

  if (currentPrototype !== storagePrototype) {
    return null;
  }

  const descriptor = Object.getOwnPropertyDescriptor(storagePrototype, 'getItem');
  return isDataPropertyDescriptor(descriptor) && typeof descriptor.value === 'function'
    ? descriptor.value
    : null;
}

// Trust only own data-property getItem or the platform Storage.prototype method.
// This avoids Object.prototype pollution and accessor side effects during auth bootstrap.
function getStorageGetItem(tokenSource) {
  if (!isStorageLikeTarget(tokenSource)) {
    return null;
  }

  return getOwnGetItem(tokenSource) || getWebStoragePrototypeGetItem(tokenSource);
}

module.exports = {
  getStorageGetItem,
};
