const {
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_PASSWORD_MIN_LENGTH,
  validateLoginPassword,
  validateRegistrationPassword,
} = require('./authPasswordValidation');
const { normalizeAuthToken } = require('./authTokenValidation');

const AUTH_MODES = Object.freeze({
  LOGIN: 'login',
  REGISTER: 'register',
});

const AUTH_TOKEN_STORAGE_KEY = 'token';
const DEFAULT_API_BASE_URL = 'http://localhost:3001';
const INVALID_AUTH_RESPONSE_ERROR = 'Authentication response was invalid. Please try again.';
const MAX_BACKEND_AUTH_ERROR_LENGTH = 240;
const ABSOLUTE_URL_SCHEME_PATTERN = /^[a-z][a-z\d+\-.]*:/i;
const API_BASE_UNSAFE_CHARACTER_PATTERN = /[\u0000-\u0020\u007f\\]/u;
const RELATIVE_API_BASE_PATH_PATTERN =
  /^(?:[A-Za-z0-9._~!$&()*+,;=:@/-]|%[0-9A-Fa-f]{2})+$/u;
// Mirrors auth.js and the anki.db users schema. Register derives username from email,
// so registration must honor the backend username cap before submitting.
const AUTH_EMAIL_MAX_LENGTH = 100;
const AUTH_USERNAME_MAX_LENGTH = 50;
// After surrounding trim, reject embedded whitespace, controls, and invisible
// formatting marks that can make account identifiers visually misleading.
const AUTH_EMAIL_UNSAFE_CHARACTER_PATTERN =
  /[\s\x00-\x1F\x7F-\x9F\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const GENERIC_AUTH_ERRORS = Object.freeze({
  [AUTH_MODES.LOGIN]: 'Login failed. Please check your credentials.',
  [AUTH_MODES.REGISTER]: 'Could not create account. Please check your email and password.',
});

function stripTrailingSlashes(value) {
  return value.replace(/\/+$/, '');
}

function hasMalformedUrlEscapes(value) {
  // This is only a malformed percent-escape check; URL parsing keeps escapes encoded.
  try {
    decodeURI(value);
  } catch {
    return true;
  }

  return false;
}

function normalizeRelativeApiBaseUrl(value) {
  if (
    value[0] !== '/'
    || value[1] === '/'
    || API_BASE_UNSAFE_CHARACTER_PATTERN.test(value)
    || value.includes('?')
    || value.includes('#')
    || !RELATIVE_API_BASE_PATH_PATTERN.test(value)
    || hasMalformedUrlEscapes(value)
  ) {
    return '';
  }

  return stripTrailingSlashes(value);
}

function normalizeAbsoluteApiBaseUrl(value) {
  if (
    API_BASE_UNSAFE_CHARACTER_PATTERN.test(value)
    || hasMalformedUrlEscapes(value)
  ) {
    return '';
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(value);
  } catch {
    return '';
  }

  if (
    (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:')
    || parsedUrl.username !== ''
    || parsedUrl.password !== ''
    || parsedUrl.search !== ''
    || parsedUrl.hash !== ''
  ) {
    return '';
  }

  return `${parsedUrl.origin}${stripTrailingSlashes(parsedUrl.pathname)}`;
}

function getOwnConfigValue(config, fieldName) {
  if (config === null || typeof config !== 'object' || Array.isArray(config)) {
    return undefined;
  }

  const descriptor = Object.getOwnPropertyDescriptor(config, fieldName);
  return descriptor !== undefined && Object.hasOwn(descriptor, 'value')
    ? descriptor.value
    : undefined;
}

function normalizeConfiguredApiBaseUrl(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const configuredUrl = value.trim();
  if (configuredUrl === '') {
    return '';
  }

  if (configuredUrl[0] === '/') {
    return normalizeRelativeApiBaseUrl(configuredUrl);
  }

  // The regex only separates absolute URL candidates from bare hosts.
  // URL parsing below validates and normalizes the actual scheme/origin.
  if (!ABSOLUTE_URL_SCHEME_PATTERN.test(configuredUrl)) {
    return '';
  }

  return normalizeAbsoluteApiBaseUrl(configuredUrl);
}

function resolveApiBaseUrl(env) {
  const baseUrl = normalizeConfiguredApiBaseUrl(
    getOwnConfigValue(env, 'REACT_APP_API_BASE_URL')
  );

  return baseUrl || DEFAULT_API_BASE_URL;
}

function normalizeAuthMode(mode) {
  return mode === AUTH_MODES.REGISTER ? AUTH_MODES.REGISTER : AUTH_MODES.LOGIN;
}

function getGenericAuthError(mode) {
  return GENERIC_AUTH_ERRORS[normalizeAuthMode(mode)];
}

function normalizeBackendAuthError(value) {
  if (typeof value !== 'string') {
    return '';
  }

  const message = value.trim().replace(/\s+/g, ' ');
  if (message.length === 0 || message.length > MAX_BACKEND_AUTH_ERROR_LENGTH) {
    return '';
  }

  return message;
}

function getBackendAuthError(body) {
  if (body === null || typeof body !== 'object') {
    return '';
  }

  return normalizeBackendAuthError(body.error) || normalizeBackendAuthError(body.message);
}

function parseAuthResponse({ mode, ok, body, bodyParseError }) {
  const authMode = normalizeAuthMode(mode);

  if (!ok) {
    if (authMode === AUTH_MODES.LOGIN || bodyParseError) {
      return { ok: false, error: getGenericAuthError(authMode) };
    }

    return {
      ok: false,
      error: getBackendAuthError(body) || getGenericAuthError(authMode),
    };
  }

  if (bodyParseError || body === null || typeof body !== 'object') {
    return { ok: false, error: INVALID_AUTH_RESPONSE_ERROR };
  }

  const token = normalizeAuthToken(body.token);
  if (token === null) {
    return { ok: false, error: INVALID_AUTH_RESPONSE_ERROR };
  }

  return { ok: true, token };
}

function getAuthEndpoint(mode, env) {
  const authMode = normalizeAuthMode(mode);
  return `${resolveApiBaseUrl(env)}/api/${authMode}`;
}

function getNextAuthMode(mode) {
  return normalizeAuthMode(mode) === AUTH_MODES.LOGIN ? AUTH_MODES.REGISTER : AUTH_MODES.LOGIN;
}

function readInitialAuthToken(tokenSource) {
  if (typeof tokenSource === 'function') {
    return tokenSource();
  }

  if (tokenSource && typeof tokenSource.getItem === 'function') {
    return tokenSource.getItem(AUTH_TOKEN_STORAGE_KEY);
  }

  return tokenSource;
}

function loggedOutInitialAuthSession(cleanupNeeded = false) {
  return {
    isLoggedIn: false,
    token: '',
    cleanupNeeded,
  };
}

function createInitialAuthSession(tokenSource) {
  let token;

  try {
    token = readInitialAuthToken(tokenSource);
  } catch {
    return loggedOutInitialAuthSession(true);
  }

  if (token == null) {
    return loggedOutInitialAuthSession();
  }

  const normalizedToken = normalizeAuthToken(token);
  if (normalizedToken === null) {
    return loggedOutInitialAuthSession(true);
  }

  return {
    isLoggedIn: true,
    token: normalizedToken,
    cleanupNeeded: false,
  };
}

function cleanupStoredAuthTokenIfNeeded(storage, authSession) {
  if (!authSession || !authSession.cleanupNeeded) {
    return false;
  }

  if (!storage || typeof storage.removeItem !== 'function') {
    return false;
  }

  try {
    storage.removeItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return false;
  }

  return true;
}

function validateAuthInput({ mode, email, password }) {
  const authMode = normalizeAuthMode(mode);
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';

  if (trimmedEmail.length === 0) {
    return { ok: false, error: 'Email is required' };
  }

  if (AUTH_EMAIL_UNSAFE_CHARACTER_PATTERN.test(trimmedEmail)) {
    return { ok: false, error: 'Valid email is required' };
  }

  const emailParts = trimmedEmail.split('@');
  if (emailParts.length !== 2 || emailParts[0] === '' || emailParts[1] === '') {
    return { ok: false, error: 'Valid email is required' };
  }

  if (authMode === AUTH_MODES.REGISTER && trimmedEmail.length > AUTH_USERNAME_MAX_LENGTH) {
    return {
      ok: false,
      error: `Email must be ${AUTH_USERNAME_MAX_LENGTH} characters or fewer to create an account`,
    };
  }

  if (trimmedEmail.length > AUTH_EMAIL_MAX_LENGTH) {
    return {
      ok: false,
      error: `Email must be ${AUTH_EMAIL_MAX_LENGTH} characters or fewer`,
    };
  }

  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'Password is required' };
  }

  const passwordValidation = authMode === AUTH_MODES.REGISTER
    ? validateRegistrationPassword(password)
    : validateLoginPassword(password);
  if (!passwordValidation.ok) {
    return { ok: false, error: passwordValidation.error };
  }

  return {
    ok: true,
    value: {
      mode: authMode,
      email: trimmedEmail,
      password: passwordValidation.value,
    },
  };
}

function createAuthRequest({ mode, email, password, env }) {
  const validation = validateAuthInput({ mode, email, password });
  if (!validation.ok) {
    return validation;
  }

  const { mode: authMode, email: trimmedEmail, password: validatedPassword } = validation.value;
  // Register derives username from the trimmed email, so validation must honor both schema caps.
  const body =
    authMode === AUTH_MODES.REGISTER
      ? { username: trimmedEmail, email: trimmedEmail, password: validatedPassword }
      : { email: trimmedEmail, password: validatedPassword };

  return {
    ok: true,
    url: getAuthEndpoint(authMode, env),
    body,
  };
}

function createAuthSubmission({ mode, email, password, isSubmitting, env }) {
  if (isSubmitting) {
    return { ok: false, blocked: true };
  }

  const request = createAuthRequest({ mode, email, password, env });
  if (!request.ok) {
    return {
      ok: false,
      blocked: false,
      error: request.error,
    };
  }

  return {
    ok: true,
    blocked: false,
    url: request.url,
    body: request.body,
  };
}

module.exports = {
  AUTH_MODES,
  AUTH_EMAIL_MAX_LENGTH,
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_USERNAME_MAX_LENGTH,
  AUTH_TOKEN_STORAGE_KEY,
  cleanupStoredAuthTokenIfNeeded,
  createInitialAuthSession,
  createAuthRequest,
  createAuthSubmission,
  getAuthEndpoint,
  getNextAuthMode,
  normalizeAuthMode,
  parseAuthResponse,
  resolveApiBaseUrl,
  validateAuthInput,
};
