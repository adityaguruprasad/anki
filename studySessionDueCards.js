const { hasRouteSafeCardId } = require('./cardIdentifier');

const MALFORMED_DUE_CARD_PAYLOAD_ERROR = 'Malformed due-card payload';

function hasSafeStudySessionCardId(value) {
  return hasRouteSafeCardId(value);
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
