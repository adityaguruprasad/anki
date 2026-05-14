const MAX_POSTGRES_SERIAL_ID = 2147483647;
const MAX_POSTGRES_SERIAL_ID_TEXT = String(MAX_POSTGRES_SERIAL_ID);
const ROUTE_SAFE_ID_ERROR_SUFFIX = 'must be a positive integer route id';

function normalizeRouteSafeId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 && value <= MAX_POSTGRES_SERIAL_ID
      ? String(value)
      : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const normalized = trimmed.replace(/^0+/, '');
  if (normalized.length === 0) {
    return null;
  }

  if (
    normalized.length > MAX_POSTGRES_SERIAL_ID_TEXT.length
    || (
      normalized.length === MAX_POSTGRES_SERIAL_ID_TEXT.length
      && normalized > MAX_POSTGRES_SERIAL_ID_TEXT
    )
  ) {
    return null;
  }

  return normalized;
}

function requireRouteSafeId(value, fieldName = 'id') {
  const normalized = normalizeRouteSafeId(value);
  if (normalized === null) {
    throw new TypeError(`Invalid ${fieldName}: ${ROUTE_SAFE_ID_ERROR_SUFFIX}`);
  }

  return normalized;
}

function normalizeRouteSafeCardId(value) {
  return normalizeRouteSafeId(value);
}

function hasRouteSafeId(value) {
  return normalizeRouteSafeId(value) !== null;
}

function hasRouteSafeCardId(value) {
  return hasRouteSafeId(value);
}

function hasSameRouteSafeCardId(leftId, rightId) {
  const normalizedLeftId = normalizeRouteSafeCardId(leftId);
  const normalizedRightId = normalizeRouteSafeCardId(rightId);

  return normalizedLeftId !== null && normalizedLeftId === normalizedRightId;
}

module.exports = {
  MAX_POSTGRES_SERIAL_ID,
  hasRouteSafeId,
  hasRouteSafeCardId,
  hasSameRouteSafeCardId,
  normalizeRouteSafeId,
  normalizeRouteSafeCardId,
  requireRouteSafeId,
};
