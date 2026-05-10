const AUTH_MODES = Object.freeze({
  LOGIN: 'login',
  REGISTER: 'register',
});

const DEFAULT_API_BASE_URL = 'http://localhost:3001';
const INVALID_AUTH_RESPONSE_ERROR = 'Authentication response was invalid. Please try again.';
const MAX_BACKEND_AUTH_ERROR_LENGTH = 240;
const GENERIC_AUTH_ERRORS = Object.freeze({
  [AUTH_MODES.LOGIN]: 'Login failed. Please check your credentials.',
  [AUTH_MODES.REGISTER]: 'Could not create account. Please check your email and password.',
});

function resolveApiBaseUrl(env) {
  const configuredUrl =
    env && typeof env.REACT_APP_API_BASE_URL === 'string'
      ? env.REACT_APP_API_BASE_URL.trim()
      : '';
  const baseUrl = configuredUrl.replace(/\/+$/, '');

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

  const token = typeof body.token === 'string' ? body.token.trim() : '';
  if (token.length === 0) {
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

function validateAuthInput({ mode, email, password }) {
  const authMode = normalizeAuthMode(mode);
  const trimmedEmail = typeof email === 'string' ? email.trim() : '';

  if (trimmedEmail.length === 0) {
    return { ok: false, error: 'Email is required' };
  }

  const emailParts = trimmedEmail.split('@');
  if (emailParts.length !== 2 || emailParts[0] === '' || emailParts[1] === '') {
    return { ok: false, error: 'Valid email is required' };
  }

  if (typeof password !== 'string' || password.length === 0) {
    return { ok: false, error: 'Password is required' };
  }

  if (authMode === AUTH_MODES.REGISTER && password.length < 8) {
    return { ok: false, error: 'Password must be at least 8 characters' };
  }

  return {
    ok: true,
    value: {
      mode: authMode,
      email: trimmedEmail,
      password,
    },
  };
}

function createAuthRequest({ mode, email, password, env }) {
  const validation = validateAuthInput({ mode, email, password });
  if (!validation.ok) {
    return validation;
  }

  const { mode: authMode, email: trimmedEmail, password: validatedPassword } = validation.value;
  // The current backend still requires username, so register derives it from the trimmed email.
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
  createAuthRequest,
  createAuthSubmission,
  getAuthEndpoint,
  getNextAuthMode,
  normalizeAuthMode,
  parseAuthResponse,
  resolveApiBaseUrl,
  validateAuthInput,
};
