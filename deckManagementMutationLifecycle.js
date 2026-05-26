const {
  getOwnDataPropertyValue,
  getOwnRecordPropertyDescriptor,
  isDataPropertyDescriptor,
  isObjectRecord,
} = require('./recordDataProperty');

function isMountedDeckManagementMutation(mountedRef) {
  return Boolean(getOwnDataPropertyValue(mountedRef, 'current'));
}

function normalizeMutationKey(mutationKey) {
  if (typeof mutationKey === 'string' && mutationKey.trim()) {
    return mutationKey;
  }

  if (typeof mutationKey === 'number' && Number.isFinite(mutationKey)) {
    return String(mutationKey);
  }

  return '';
}

function normalizeMutationSequence(sequence) {
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : 0;
}

function getSequenceStoreKey(mutationKey) {
  return `mutation:${mutationKey}`;
}

function setOwnDataProperty(record, key, value) {
  const descriptor = getOwnRecordPropertyDescriptor(record, key);
  if (descriptor !== undefined && !isDataPropertyDescriptor(descriptor)) {
    return false;
  }

  try {
    Object.defineProperty(record, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true,
    });
    return true;
  } catch {
    return false;
  }
}

function setSequenceStore(sequenceRef, sequences) {
  return isObjectRecord(sequenceRef)
    && setOwnDataProperty(sequenceRef, 'current', sequences);
}

function ensureMutationSequences(sequenceRef) {
  if (!isObjectRecord(sequenceRef)) {
    return null;
  }

  const current = getOwnDataPropertyValue(sequenceRef, 'current');
  if (isObjectRecord(current)) {
    return current;
  }

  const sequences = Object.create(null);
  return setSequenceStore(sequenceRef, sequences) ? sequences : null;
}

function getMutationSequences(sequenceRef) {
  if (!isObjectRecord(sequenceRef)) {
    return null;
  }

  const sequences = getOwnDataPropertyValue(sequenceRef, 'current');
  return isObjectRecord(sequences) ? sequences : null;
}

function beginDeckManagementMutation(sequenceRef, mutationKey) {
  const key = normalizeMutationKey(mutationKey);
  if (!key) {
    return { key: '', sequence: 0 };
  }

  // Sequence 0 is a failed-claim sentinel; current guards only accept positive stored sequences.
  const sequences = ensureMutationSequences(sequenceRef);
  if (!sequences) {
    return { key, sequence: 0 };
  }

  const storeKey = getSequenceStoreKey(key);
  const sequence = normalizeMutationSequence(getOwnDataPropertyValue(sequences, storeKey)) + 1;
  if (!setOwnDataProperty(sequences, storeKey, sequence)) {
    return { key, sequence: 0 };
  }

  return { key, sequence };
}

function invalidateDeckManagementMutations(sequenceRef) {
  return setSequenceStore(sequenceRef, Object.create(null));
}

function isCurrentDeckManagementMutation(options = {}) {
  const mountedRef = getOwnDataPropertyValue(options, 'mountedRef');
  const sequenceRef = getOwnDataPropertyValue(options, 'sequenceRef');
  const mutation = getOwnDataPropertyValue(options, 'mutation');
  const key = normalizeMutationKey(getOwnDataPropertyValue(mutation, 'key'));
  const mutationSequence = getOwnDataPropertyValue(mutation, 'sequence');
  const sequences = getMutationSequences(sequenceRef);
  const currentSequence = getOwnDataPropertyValue(sequences, getSequenceStoreKey(key));

  return isMountedDeckManagementMutation(mountedRef)
    && Boolean(key)
    && Boolean(sequences)
    && Number.isSafeInteger(mutationSequence)
    && mutationSequence > 0
    && currentSequence === mutationSequence;
}

module.exports = {
  beginDeckManagementMutation,
  invalidateDeckManagementMutations,
  isCurrentDeckManagementMutation,
  isMountedDeckManagementMutation,
};
