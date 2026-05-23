const MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR = 'Malformed deck-management deck-list payload';
const { MAX_POSTGRES_SERIAL_ID } = require('./cardIdentifier');

function isObjectRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function descriptorHasValue(descriptor) {
  return (
    descriptor !== undefined
    && Object.prototype.hasOwnProperty.call(descriptor, 'value')
  );
}

function getOwnDataPropertyValue(value, key) {
  const descriptor = isObjectRecord(value)
    ? Object.getOwnPropertyDescriptor(value, key)
    : undefined;

  return descriptorHasValue(descriptor) ? descriptor.value : undefined;
}

function isNonBlankString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

const MAX_POSTGRES_SERIAL_ID_STRING = String(MAX_POSTGRES_SERIAL_ID);

function hasRouteSafeDeckManagementDeckId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_POSTGRES_SERIAL_ID;
  }

  if (typeof value === 'string') {
    return (
      /^[1-9]\d*$/.test(value)
      && (
        value.length < MAX_POSTGRES_SERIAL_ID_STRING.length
        || (
          value.length === MAX_POSTGRES_SERIAL_ID_STRING.length
          && value <= MAX_POSTGRES_SERIAL_ID_STRING
        )
      )
    );
  }

  return false;
}

function hasNonNegativeSafeIntegerCount(deck, key) {
  const count = getOwnDataPropertyValue(deck, key);

  return Number.isSafeInteger(count) && count >= 0;
}

function hasDeckManagementDeckRowPayload(deck) {
  const totalCards = getOwnDataPropertyValue(deck, 'totalCards');
  const dueCards = getOwnDataPropertyValue(deck, 'dueCards');

  return (
    isObjectRecord(deck)
    && hasRouteSafeDeckManagementDeckId(getOwnDataPropertyValue(deck, 'id'))
    && isNonBlankString(getOwnDataPropertyValue(deck, 'name'))
    && hasNonNegativeSafeIntegerCount(deck, 'totalCards')
    && hasNonNegativeSafeIntegerCount(deck, 'dueCards')
    && dueCards <= totalCards
  );
}

function hasDeckManagementDeckListPayload(payload) {
  return Array.isArray(payload) && payload.every(hasDeckManagementDeckRowPayload);
}

function parseDeckManagementDeckListPayload(payload) {
  if (!hasDeckManagementDeckListPayload(payload)) {
    throw new Error(MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_MANAGEMENT_DECK_LIST_PAYLOAD_ERROR,
  hasDeckManagementDeckListPayload,
  parseDeckManagementDeckListPayload,
};
