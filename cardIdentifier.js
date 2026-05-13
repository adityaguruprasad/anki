const MAX_SAFE_INTEGER_TEXT = String(Number.MAX_SAFE_INTEGER);

function normalizeRouteSafeCardId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0 ? String(value) : null;
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
    normalized.length > MAX_SAFE_INTEGER_TEXT.length
    || (
      normalized.length === MAX_SAFE_INTEGER_TEXT.length
      && normalized > MAX_SAFE_INTEGER_TEXT
    )
  ) {
    return null;
  }

  return normalized;
}

function hasRouteSafeCardId(value) {
  return normalizeRouteSafeCardId(value) !== null;
}

function hasSameRouteSafeCardId(leftId, rightId) {
  const normalizedLeftId = normalizeRouteSafeCardId(leftId);
  const normalizedRightId = normalizeRouteSafeCardId(rightId);

  return normalizedLeftId !== null && normalizedLeftId === normalizedRightId;
}

module.exports = {
  hasRouteSafeCardId,
  hasSameRouteSafeCardId,
  normalizeRouteSafeCardId,
};
