const { hasDeckCardMutationPayload } = require('./deckCardMutationResponse');
const {
  getOwnDataPropertyValue,
  getOwnRecordPropertyDescriptor,
  isDataPropertyDescriptor,
  isObjectRecord,
} = require('./recordDataProperty');

const MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR = 'Malformed deck-card removal payload';
// Forward only caller-controlled match options accepted by hasDeckCardMutationPayload;
// delete echoes always fix requireSchedulingMetadata to false internally. Non-enumerable
// descriptors are skipped first to match object-spread visibility without invoking getters.
const DECK_CARD_REMOVAL_MATCH_OPTION_FIELDS = Object.freeze([
  'expectedId',
  'expectedDeckId',
]);

function getDeckCardRemovalCardValidationOptions(options) {
  const validationOptions = {
    requireSchedulingMetadata: false,
  };

  if (!isObjectRecord(options)) {
    return validationOptions;
  }

  for (const fieldName of DECK_CARD_REMOVAL_MATCH_OPTION_FIELDS) {
    const descriptor = getOwnRecordPropertyDescriptor(options, fieldName);
    if (descriptor === undefined) {
      continue;
    }

    if (!descriptor.enumerable) {
      continue;
    }

    if (!isDataPropertyDescriptor(descriptor)) {
      return null;
    }

    validationOptions[fieldName] = descriptor.value;
  }

  return validationOptions;
}

function hasDeckCardRemovalSuccessPayload(payload, options = {}) {
  if (!isObjectRecord(payload)) {
    return false;
  }

  const success = getOwnDataPropertyValue(payload, 'success');
  const card = getOwnDataPropertyValue(payload, 'card');
  const cardValidationOptions = getDeckCardRemovalCardValidationOptions(options);

  return (
    success === true
    // Delete echoes intentionally use a smaller card contract than create/update
    // responses because scheduling metadata is irrelevant after removal.
    && cardValidationOptions !== null
    && hasDeckCardMutationPayload(card, cardValidationOptions)
  );
}

function parseDeckCardRemovalSuccessPayload(payload, options = {}) {
  if (!hasDeckCardRemovalSuccessPayload(payload, options)) {
    throw new Error(MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR);
  }

  return payload;
}

module.exports = {
  MALFORMED_DECK_CARD_REMOVAL_PAYLOAD_ERROR,
  hasDeckCardRemovalSuccessPayload,
  parseDeckCardRemovalSuccessPayload,
};
