const { normalizeAuthToken } = require('./authTokenValidation');

const AUTH_TOKEN_STORAGE_KEY = 'token';

function getOwnGetItem(tokenSource) {
  const descriptor = Object.getOwnPropertyDescriptor(tokenSource, 'getItem');
  return descriptor && typeof descriptor.value === 'function'
    ? descriptor.value
    : null;
}

function getWebStoragePrototypeGetItem(tokenSource) {
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'Storage');
  if (!storageDescriptor || typeof storageDescriptor.value !== 'function') {
    return null;
  }

  const prototypeDescriptor = Object.getOwnPropertyDescriptor(storageDescriptor.value, 'prototype');
  const storagePrototype = prototypeDescriptor && prototypeDescriptor.value;
  if (
    storagePrototype === null
    || (typeof storagePrototype !== 'object' && typeof storagePrototype !== 'function')
  ) {
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
  return descriptor && typeof descriptor.value === 'function'
    ? descriptor.value
    : null;
}

function getStorageGetItem(tokenSource) {
  if (
    tokenSource === null
    || (typeof tokenSource !== 'object' && typeof tokenSource !== 'function')
  ) {
    return null;
  }

  return getOwnGetItem(tokenSource) || getWebStoragePrototypeGetItem(tokenSource);
}

function readToken(tokenSource) {
  if (typeof tokenSource === 'function') {
    return tokenSource();
  }

  const getItem = getStorageGetItem(tokenSource);
  if (getItem) {
    return getItem.call(tokenSource, AUTH_TOKEN_STORAGE_KEY);
  }

  return tokenSource;
}

function buildAuthHeaders(tokenSource) {
  let token;

  try {
    token = readToken(tokenSource);
  } catch {
    return {};
  }

  const normalizedToken = normalizeAuthToken(token);
  if (normalizedToken === null) {
    return {};
  }

  return {
    Authorization: `Bearer ${normalizedToken}`,
  };
}

module.exports = {
  AUTH_TOKEN_STORAGE_KEY,
  buildAuthHeaders,
};
