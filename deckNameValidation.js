const MAX_DECK_NAME_LENGTH = 120;

function validateDeckName(name) {
  if (typeof name !== 'string') {
    return { ok: false, error: 'Invalid deck name: must be a string' };
  }

  const trimmedName = name.trim();
  if (trimmedName.length === 0) {
    return { ok: false, error: 'Invalid deck name: cannot be blank' };
  }

  if (trimmedName.length > MAX_DECK_NAME_LENGTH) {
    return { ok: false, error: `Invalid deck name: must be at most ${MAX_DECK_NAME_LENGTH} characters` };
  }

  return { ok: true, value: trimmedName };
}

module.exports = {
  MAX_DECK_NAME_LENGTH,
  validateDeckName,
};
