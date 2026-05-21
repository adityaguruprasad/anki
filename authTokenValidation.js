const { MAX_POSTGRES_SERIAL_ID } = require('./cardIdentifier');

const AUTH_TOKEN_MAX_LENGTH = 4096;
const AUTH_TOKEN_ALGORITHM = 'HS256';
const AUTH_TOKEN_TYPE = 'JWT';
const AUTH_TOKEN_COMPACT_PART_PATTERN = /^[A-Za-z0-9_-]+$/;
const AUTH_TOKEN_HEADER_FIELDS = Object.freeze(['alg', 'typ']);
const AUTH_TOKEN_PAYLOAD_FIELDS = Object.freeze(['userId', 'iat', 'exp']);

function decodeBase64UrlToUtf8(value) {
  if (value.length % 4 === 1) {
    return null;
  }

  try {
    let binary;

    if (typeof globalThis.atob === 'function') {
      const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
      const paddedBase64 = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
      binary = globalThis.atob(paddedBase64);
    } else if (typeof Buffer !== 'undefined') {
      binary = Buffer.from(value, 'base64url').toString('binary');
    } else {
      return null;
    }

    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

    if (typeof globalThis.TextDecoder === 'function') {
      return new globalThis.TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }

    return decodeURIComponent(
      Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, '0')}`).join('')
    );
  } catch {
    return null;
  }
}

function parseBase64UrlJsonObject(value) {
  const decoded = decodeBase64UrlToUtf8(value);
  if (decoded === null) {
    return null;
  }

  try {
    const parsed = JSON.parse(decoded);
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function isPositiveSafeInteger(value) {
  return Number.isSafeInteger(value) && value > 0;
}

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function isJwtUserIdClaim(value) {
  return isPositiveSafeInteger(value) && value <= MAX_POSTGRES_SERIAL_ID;
}

function isValidJwtCompactPart(part) {
  return (
    part.length > 0
    // Unpadded base64url lengths can be 0, 2, or 3 mod 4; 1 mod 4
    // cannot represent whole bytes.
    && part.length % 4 !== 1
    && AUTH_TOKEN_COMPACT_PART_PATTERN.test(part)
  );
}

function hasOnlyAuthTokenHeaderFields(header) {
  return Object.keys(header).every((field) => AUTH_TOKEN_HEADER_FIELDS.includes(field));
}

function hasOnlyAuthTokenPayloadFields(payload) {
  return Object.keys(payload).every((field) => AUTH_TOKEN_PAYLOAD_FIELDS.includes(field));
}

function hasUsableJwtEnvelope(token) {
  const parts = token.split('.');
  if (
    parts.length !== 3
    || parts.some((part) => !isValidJwtCompactPart(part))
  ) {
    return false;
  }

  const [encodedHeader, encodedPayload] = parts;
  const header = parseBase64UrlJsonObject(encodedHeader);
  if (
    header === null
    || !hasOnlyAuthTokenHeaderFields(header)
    || header.alg !== AUTH_TOKEN_ALGORITHM
    || header.typ !== AUTH_TOKEN_TYPE
  ) {
    return false;
  }

  const payload = parseBase64UrlJsonObject(encodedPayload);
  return (
    payload !== null
    && hasOnlyAuthTokenPayloadFields(payload)
    && isJwtUserIdClaim(payload.userId)
    && isNonNegativeSafeInteger(payload.iat)
    && isPositiveSafeInteger(payload.exp)
    && payload.iat < payload.exp
  );
}

// Client-side normalization only validates the compact JWT envelope shape,
// strict API-issued header contract, and app claims. Signature verification and
// chronological expiry enforcement remain owned by the API/auth boundary.
function normalizeAuthToken(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const token = value.trim();
  if (
    token.length === 0
    || token.length > AUTH_TOKEN_MAX_LENGTH
    || !hasUsableJwtEnvelope(token)
  ) {
    return null;
  }

  return token;
}

module.exports = {
  AUTH_TOKEN_MAX_LENGTH,
  normalizeAuthToken,
};
