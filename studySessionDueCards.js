const MALFORMED_DUE_CARD_PAYLOAD_ERROR = 'Malformed due-card payload';
const MAX_SAFE_INTEGER_STRING = String(Number.MAX_SAFE_INTEGER);

function isSafePositiveIntegerString(value) {
  const normalized = value.replace(/^0+/, '');

  if (normalized.length === 0) {
    return false;
  }

  return (
    normalized.length < MAX_SAFE_INTEGER_STRING.length
    || (
      normalized.length === MAX_SAFE_INTEGER_STRING.length
      && normalized <= MAX_SAFE_INTEGER_STRING
    )
  );
}

function hasSafeStudySessionCardId(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value > 0;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (!/^\d+$/.test(trimmed)) {
      return false;
    }

    return isSafePositiveIntegerString(trimmed);
  }

  return false;
}

function isNonBlankCardContent(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function hasStudySessionDueCardRowPayload(card) {
  return (
    card !== null
    && typeof card === 'object'
    && !Array.isArray(card)
    && hasSafeStudySessionCardId(card.id)
    && isNonBlankCardContent(card.front_content)
    && isNonBlankCardContent(card.back_content)
  );
}

function selectValidatedStudySessionDueCard(payload) {
  if (!Array.isArray(payload)) {
    throw new Error(MALFORMED_DUE_CARD_PAYLOAD_ERROR);
  }

  for (const card of payload) {
    if (!hasStudySessionDueCardRowPayload(card)) {
      throw new Error(MALFORMED_DUE_CARD_PAYLOAD_ERROR);
    }
  }

  return payload.length > 0 ? payload[0] : null;
}

module.exports = {
  MALFORMED_DUE_CARD_PAYLOAD_ERROR,
  hasSafeStudySessionCardId,
  hasStudySessionDueCardRowPayload,
  selectValidatedStudySessionDueCard,
};
