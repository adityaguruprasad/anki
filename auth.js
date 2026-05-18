// auth.js
const crypto = require('node:crypto');
const {
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_PASSWORD_MIN_LENGTH,
  validateLoginPassword,
  validateRegistrationPassword,
} = require('./authPasswordValidation');
const { MAX_POSTGRES_SERIAL_ID } = require('./cardIdentifier');

const DEFAULT_DEV_JWT_SECRET = 'your_secret_key';
const DEFAULT_JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24;
const JWT_TOKEN_ALGORITHM = 'HS256';
const JWT_TOKEN_TYPE = 'JWT';
const JWT_SECRET_DEFAULT_PRODUCTION_ERROR =
  'JWT_SECRET must not use the default development secret in production';
const JWT_SECRET_EMPTY_ERROR = 'JWT_SECRET must not be empty';
const JWT_SECRET_TYPE_ERROR = 'JWT_SECRET must be a string';
const JWT_SECRET_MIN_PRODUCTION_BYTES = 32;
const JWT_SECRET_MIN_PRODUCTION_BYTES_ERROR =
  `JWT_SECRET must be at least ${JWT_SECRET_MIN_PRODUCTION_BYTES} UTF-8 bytes in production`;
const JWT_EXPIRES_IN_SECONDS_ERROR =
  'JWT_EXPIRES_IN_SECONDS must be a positive integer not greater than Number.MAX_SAFE_INTEGER';
// App-issued HS256 JWTs carry only compact userId/iat/exp claims; 4096 leaves generous
// headroom while bounding split, JSON parsing, and HMAC work before verification.
const MAX_JWT_TOKEN_LENGTH = 4096;
const JWT_TOKEN_TOO_LONG_ERROR = `JWT token must be ${MAX_JWT_TOKEN_LENGTH} characters or fewer`;
const JWT_COMPACT_PART_PATTERN = /^[A-Za-z0-9_-]+$/;
// users.id is a PostgreSQL SERIAL/INTEGER id, matching the protected API route id contract.
if (!Number.isSafeInteger(MAX_POSTGRES_SERIAL_ID)) {
  throw new Error('MAX_POSTGRES_SERIAL_ID must remain a safe integer');
}
const MAX_POSTGRES_SERIAL_ID_BIGINT = BigInt(MAX_POSTGRES_SERIAL_ID);
const LOGIN_RATE_LIMIT_ERROR = 'Too many login attempts. Please try again later.';
const REGISTRATION_RATE_LIMIT_ERROR = 'Too many registration attempts. Please try again later.';
const DEFAULT_LOGIN_RATE_LIMIT_MAX_FAILURES = 5;
const DEFAULT_LOGIN_SOURCE_RATE_LIMIT_MAX_FAILURES = 25;
const DEFAULT_REGISTRATION_RATE_LIMIT_MAX_ATTEMPTS = 10;
const DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOGIN_RATE_LIMIT_MAX_KEYS = 10000;
// Keep these aligned with anki.db users.username VARCHAR(50), users.email VARCHAR(100),
// and users.password_hash VARCHAR(100).
const AUTH_USERNAME_MAX_LENGTH = 50;
const AUTH_EMAIL_MAX_LENGTH = 100;
const AUTH_PASSWORD_HASH_MAX_LENGTH = 100;
const PASSWORD_HASH_COST = 10;
const DUPLICATE_ACCOUNT_CONSTRAINTS = new Set([
  'users_username_key',
  'users_email_key',
  'users_normalized_email_unique_idx',
]);
const USERNAME_UNSAFE_CHARACTER_PATTERN =
  /[\x00-\x1F\x7F-\x9F\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
const EMAIL_UNSAFE_CHARACTER_PATTERN =
  /[\s\x00-\x1F\x7F-\x9F\u061C\u200B-\u200F\u202A-\u202E\u2060\u2066-\u2069\uFEFF]/u;
// Bcrypt hash of a non-secret placeholder; used only to equalize missing-account login work.
const MISSING_ACCOUNT_DUMMY_PASSWORD_HASH =
  '$2b$10$xnS.9dA.hjbGf20CAaG6xuMuScJF.XYy.xwfX5K5UHddi5gJdzBKK';

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlJson(value) {
  return base64UrlEncode(JSON.stringify(value));
}

function resolveJwtSecret(env = process.env) {
  if (env.JWT_SECRET !== undefined) {
    if (typeof env.JWT_SECRET !== 'string') {
      throw new TypeError(JWT_SECRET_TYPE_ERROR);
    }

    const jwtSecret = env.JWT_SECRET.trim();
    if (jwtSecret === '') {
      throw new Error(JWT_SECRET_EMPTY_ERROR);
    }

    if (env.NODE_ENV === 'production' && jwtSecret === DEFAULT_DEV_JWT_SECRET) {
      throw new Error(JWT_SECRET_DEFAULT_PRODUCTION_ERROR);
    }

    if (
      env.NODE_ENV === 'production'
      && Buffer.byteLength(jwtSecret, 'utf8') < JWT_SECRET_MIN_PRODUCTION_BYTES
    ) {
      throw new Error(JWT_SECRET_MIN_PRODUCTION_BYTES_ERROR);
    }

    return jwtSecret;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return DEFAULT_DEV_JWT_SECRET;
}

function validateJwtExpiresInSeconds(value) {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(JWT_EXPIRES_IN_SECONDS_ERROR);
    }

    return value;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(JWT_EXPIRES_IN_SECONDS_ERROR);
    }

    const parsed = BigInt(trimmed);
    if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error(JWT_EXPIRES_IN_SECONDS_ERROR);
    }

    return Number(parsed);
  }

  throw new Error(JWT_EXPIRES_IN_SECONDS_ERROR);
}

function resolveJwtExpiresInSeconds(env = process.env) {
  if (env.JWT_EXPIRES_IN_SECONDS == null || env.JWT_EXPIRES_IN_SECONDS === '') {
    return DEFAULT_JWT_EXPIRES_IN_SECONDS;
  }

  return validateJwtExpiresInSeconds(env.JWT_EXPIRES_IN_SECONDS);
}

function decodeJsonPart(value) {
  return JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
}

function isValidJwtCompactPart(part) {
  return (
    part.length > 0
    && part.length % 4 !== 1
    && JWT_COMPACT_PART_PATTERN.test(part)
  );
}

function validateJwtExpirationTimestamp(exp) {
  if (typeof exp !== 'number' || !Number.isSafeInteger(exp) || exp <= 0) {
    throw new Error('Token expiration must be a positive safe integer');
  }

  return exp;
}

function validateJwtPayloadUserId(payload) {
  if (
    payload === null ||
    typeof payload !== 'object' ||
    Array.isArray(payload) ||
    !Object.hasOwn(payload, 'userId')
  ) {
    throw new Error('Token userId is required');
  }

  const normalizedUserId = normalizeTokenUserId(payload.userId);
  if (normalizedUserId == null) {
    throw new Error('Token userId is required');
  }

  return normalizedUserId;
}

function validateJwtTokenText(token) {
  if (typeof token !== 'string' || token.length === 0) {
    throw new Error('Invalid token');
  }

  if (token.length > MAX_JWT_TOKEN_LENGTH) {
    throw new Error(JWT_TOKEN_TOO_LONG_ERROR);
  }

  // Return the three compact JWT parts only after enforcing the canonical
  // three-part base64url shape. Node's decoder can ignore impossible trailing
  // base64url quanta, so reject those before JSON parsing or HMAC work.
  const parts = token.split('.');
  if (
    parts.length !== 3
    || parts.some((part) => !isValidJwtCompactPart(part))
  ) {
    throw new Error('Invalid token');
  }

  return parts;
}

function validateJwtHeader(header) {
  if (header === null || typeof header !== 'object' || Array.isArray(header)) {
    throw new Error('Invalid token header');
  }

  if (header.alg !== JWT_TOKEN_ALGORITHM) {
    throw new Error('Invalid token algorithm');
  }

  if (header.typ !== JWT_TOKEN_TYPE) {
    throw new Error('Invalid token type');
  }

  if (Object.hasOwn(header, 'crit')) {
    throw new Error('Unsupported token header');
  }
}

function signToken(payload, secret = resolveJwtSecret(), options = {}) {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const expiresInSeconds =
    options.expiresInSeconds == null
      ? resolveJwtExpiresInSeconds(options.env)
      : validateJwtExpiresInSeconds(options.expiresInSeconds);
  // Duration inputs are checked independently, and the computed NumericDate is checked too
  // so large safe durations cannot overflow past the safe integer range after adding now.
  const exp = validateJwtExpirationTimestamp(now + expiresInSeconds);
  const userId = validateJwtPayloadUserId(payload);
  const header = { alg: JWT_TOKEN_ALGORITHM, typ: JWT_TOKEN_TYPE };
  const tokenPayload = {
    ...payload,
    userId,
    iat: now,
    exp,
  };
  const body = `${base64UrlJson(header)}.${base64UrlJson(tokenPayload)}`;
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token, secret = resolveJwtSecret(), options = {}) {
  const [encodedHeader, encodedPayload, signature] = validateJwtTokenText(token);
  const header = decodeJsonPart(encodedHeader);
  validateJwtHeader(header);

  const body = `${encodedHeader}.${encodedPayload}`;
  const expectedSignature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const actual = Buffer.from(signature);
  const expected = Buffer.from(expectedSignature);
  if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
    throw new Error('Invalid token signature');
  }

  const payload = decodeJsonPart(encodedPayload);
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Invalid token payload');
  }

  if (payload.exp == null) {
    throw new Error('Token expiration is required');
  }
  const exp = validateJwtExpirationTimestamp(payload.exp);

  const normalizedUserId = normalizeTokenUserId(payload.userId);
  if (normalizedUserId == null) {
    throw new Error('Token userId is required');
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (exp <= now) {
    throw new Error('Token expired');
  }

  return { ...payload, userId: normalizedUserId };
}

function normalizeTokenUserId(userId) {
  if (typeof userId === 'number') {
    return Number.isSafeInteger(userId) && userId > 0 && userId <= MAX_POSTGRES_SERIAL_ID
      ? userId
      : null;
  }

  if (typeof userId === 'string') {
    const trimmed = userId.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const parsed = BigInt(trimmed);
    if (parsed <= 0n || parsed > MAX_POSTGRES_SERIAL_ID_BIGINT) {
      return null;
    }

    return Number(parsed);
  }

  return null;
}

function extractBearerToken(authHeader) {
  if (typeof authHeader !== 'string') {
    return null;
  }

  const match = authHeader.match(/^\s*Bearer\s+(\S+)\s*$/i);
  return match ? match[1] : null;
}

function getDefaultPasswordHasher() {
  try {
    return require('bcrypt');
  } catch (error) {
    throw new Error('bcrypt is required for password hashing; install bcrypt or inject passwordHasher');
  }
}

function normalizeEmail(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const email = value.trim().toLowerCase();
  if (EMAIL_UNSAFE_CHARACTER_PATTERN.test(email)) {
    return null;
  }

  const parts = email.split('@');
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
    return null;
  }

  return email;
}

function isDuplicateAccountError(error) {
  return error?.code === '23505' && DUPLICATE_ACCOUNT_CONSTRAINTS.has(error.constraint);
}

function validatePasswordHash(passwordHash) {
  return (
    typeof passwordHash === 'string'
    && passwordHash.length > 0
    && passwordHash.length <= AUTH_PASSWORD_HASH_MAX_LENGTH
  );
}

function resolvePositiveIntegerOption(options, fieldName, defaultValue, optionName) {
  const value = options[fieldName];
  if (value == null) {
    return defaultValue;
  }

  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${optionName}.${fieldName} must be a positive safe integer`);
  }

  return value;
}

function resolveLoginRateLimitNow(options, optionName) {
  if (options.now == null) {
    return () => Date.now();
  }

  if (typeof options.now !== 'function') {
    throw new TypeError(`${optionName}.now must be a function`);
  }

  return options.now;
}

function createLoginFailureTracker(options = {}, optionName = 'loginRateLimit') {
  const config = options ?? {};
  const maxFailures = resolvePositiveIntegerOption(
    config,
    'maxFailures',
    DEFAULT_LOGIN_RATE_LIMIT_MAX_FAILURES,
    optionName
  );
  const windowMs = resolvePositiveIntegerOption(
    config,
    'windowMs',
    DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
    optionName
  );
  const maxKeys = resolvePositiveIntegerOption(
    config,
    'maxKeys',
    DEFAULT_LOGIN_RATE_LIMIT_MAX_KEYS,
    optionName
  );
  const now = resolveLoginRateLimitNow(config, optionName);
  const records = new Map();

  function isExpired(record, currentTime) {
    return currentTime - record.firstFailureAt >= windowMs;
  }

  function trimOldestRecordIfNeeded() {
    if (records.size < maxKeys) {
      return;
    }

    const oldestKey = records.keys().next().value;
    if (oldestKey !== undefined) {
      records.delete(oldestKey);
    }
  }

  function getActiveRecord(key, currentTime) {
    const record = records.get(key);
    if (!record) {
      return null;
    }

    if (isExpired(record, currentTime)) {
      records.delete(key);
      return null;
    }

    return record;
  }

  return {
    isBlocked(key) {
      const record = getActiveRecord(key, now());
      return record !== null && record.failures >= maxFailures;
    },
    recordFailure(key) {
      const currentTime = now();
      let record = getActiveRecord(key, currentTime);

      if (record === null) {
        trimOldestRecordIfNeeded();
        record = { failures: 0, firstFailureAt: currentTime };
      }

      record.failures += 1;
      records.set(key, record);
    },
    recordSuccess(key) {
      records.delete(key);
    },
  };
}

function resolveLoginSourceRateLimitOptions(loginRateLimitOptions, loginSourceRateLimitOptions) {
  const loginRateLimitConfig = loginRateLimitOptions ?? {};
  const sourceRateLimitConfig = loginSourceRateLimitOptions ?? {};

  return {
    maxFailures:
      sourceRateLimitConfig.maxFailures ?? DEFAULT_LOGIN_SOURCE_RATE_LIMIT_MAX_FAILURES,
    windowMs: sourceRateLimitConfig.windowMs ?? loginRateLimitConfig.windowMs,
    maxKeys: sourceRateLimitConfig.maxKeys ?? loginRateLimitConfig.maxKeys,
    now: sourceRateLimitConfig.now ?? loginRateLimitConfig.now,
  };
}

function resolveRegistrationRateLimitOptions(registrationRateLimitOptions) {
  const config = registrationRateLimitOptions ?? {};

  return {
    maxFailures: resolvePositiveIntegerOption(
      config,
      'maxAttempts',
      DEFAULT_REGISTRATION_RATE_LIMIT_MAX_ATTEMPTS,
      'registrationRateLimit'
    ),
    windowMs: resolvePositiveIntegerOption(
      config,
      'windowMs',
      DEFAULT_LOGIN_RATE_LIMIT_WINDOW_MS,
      'registrationRateLimit'
    ),
    maxKeys: resolvePositiveIntegerOption(
      config,
      'maxKeys',
      DEFAULT_LOGIN_RATE_LIMIT_MAX_KEYS,
      'registrationRateLimit'
    ),
    now: config.now,
  };
}

function getRequestIp(req = {}) {
  const candidates = [
    req.ip,
    req.socket?.remoteAddress,
    req.connection?.remoteAddress,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim() !== '') {
      return candidate.trim();
    }
  }

  return 'unknown';
}

function getLoginRateLimitKey(req, normalizedEmail) {
  // Bounded in-memory per-normalized-email + per-source-IP mitigation; multi-instance
  // deployments still need shared or edge rate limiting.
  return `${normalizedEmail}\n${getRequestIp(req)}`;
}

function getLoginSourceRateLimitKey(req) {
  // Source-wide spray throttling is IP-only; missing IPs share the 'unknown'
  // sentinel to fail closed, with a higher default threshold to limit NAT amplification.
  return getRequestIp(req);
}

function getRegistrationRateLimitKey(req) {
  // Registration hashing is expensive and source-scoped; successful signups do
  // not reset this counter, which keeps bulk account creation bounded.
  return getRequestIp(req);
}

function resolveAuthHandlerJwtSecret(options = {}) {
  // Only undefined means "not provided"; other falsy values must fail closed.
  if (options.jwtSecret !== undefined) {
    return resolveJwtSecret({
      ...options.env,
      JWT_SECRET: options.jwtSecret,
    });
  }

  return resolveJwtSecret(options.env);
}

function createAuthHandlers(db, options = {}) {
  if (!db || typeof db.query !== 'function') {
    throw new TypeError('createAuthHandlers requires a database object with a query method');
  }

  const jwtSecret = resolveAuthHandlerJwtSecret(options);
  const jwtExpiresInSeconds =
    options.jwtExpiresInSeconds == null
      ? resolveJwtExpiresInSeconds(options.env)
      : validateJwtExpiresInSeconds(options.jwtExpiresInSeconds);
  const passwordHasher = options.passwordHasher || getDefaultPasswordHasher();
  const loginFailureTracker = createLoginFailureTracker(options.loginRateLimit);
  const loginSourceFailureTracker = createLoginFailureTracker(
    resolveLoginSourceRateLimitOptions(options.loginRateLimit, options.loginSourceRateLimit),
    'loginSourceRateLimit'
  );
  // Reuse the login-failure tracker as a source-scoped registration attempt counter;
  // maxFailures means max registration attempts for this boundary.
  const registrationAttemptTracker = createLoginFailureTracker(
    resolveRegistrationRateLimitOptions(options.registrationRateLimit),
    'registrationRateLimit'
  );

  const register = async (req, res) => {
    const { username, email, password } = req.body || {};
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedEmail = normalizeEmail(email);
    if (trimmedUsername === '') {
      return res.status(400).json({ error: 'Username is required' });
    }
    if (USERNAME_UNSAFE_CHARACTER_PATTERN.test(trimmedUsername)) {
      return res.status(400).json({
        error: 'Username cannot contain line breaks, control characters, or invisible formatting characters',
      });
    }
    if (trimmedUsername.length > AUTH_USERNAME_MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `Username must be ${AUTH_USERNAME_MAX_LENGTH} characters or fewer` });
    }
    if (normalizedEmail == null) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (normalizedEmail.length > AUTH_EMAIL_MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `Email must be ${AUTH_EMAIL_MAX_LENGTH} characters or fewer` });
    }
    const passwordValidation = validateRegistrationPassword(password);
    if (!passwordValidation.ok) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const registrationRateLimitKey = getRegistrationRateLimitKey(req);
    if (registrationAttemptTracker.isBlocked(registrationRateLimitKey)) {
      return res.status(429).json({ error: REGISTRATION_RATE_LIMIT_ERROR });
    }
    // recordFailure is the shared tracker API; here it records one valid
    // registration attempt regardless of whether account creation succeeds.
    registrationAttemptTracker.recordFailure(registrationRateLimitKey);

    try {
      const hashedPassword = await passwordHasher.hash(passwordValidation.value, PASSWORD_HASH_COST);
      if (!validatePasswordHash(hashedPassword)) {
        throw new Error('Password hash provider returned invalid password hash');
      }

      const result = await db.query(
        'INSERT INTO users (username, email, password_hash) VALUES ($1, $2, $3) RETURNING id',
        [trimmedUsername, normalizedEmail, hashedPassword]
      );
      const token = signToken({ userId: result.rows[0].id }, jwtSecret, {
        expiresInSeconds: jwtExpiresInSeconds,
      });
      res.status(201).json({ token });
    } catch (error) {
      if (isDuplicateAccountError(error)) {
        return res.status(409).json({ error: 'Account already exists' });
      }

      res.status(500).json({ error: 'Error registering user' });
    }
  };

  const login = async (req, res) => {
    const { email, password } = req.body || {};
    const normalizedEmail = normalizeEmail(email);
    if (normalizedEmail == null) {
      return res.status(400).json({ error: 'Valid email is required' });
    }
    if (normalizedEmail.length > AUTH_EMAIL_MAX_LENGTH) {
      return res
        .status(400)
        .json({ error: `Email must be ${AUTH_EMAIL_MAX_LENGTH} characters or fewer` });
    }
    const passwordValidation = validateLoginPassword(password);
    if (!passwordValidation.ok) {
      return res.status(400).json({ error: passwordValidation.error });
    }

    const loginRateLimitKey = getLoginRateLimitKey(req, normalizedEmail);
    const loginSourceRateLimitKey = getLoginSourceRateLimitKey(req);
    if (
      loginFailureTracker.isBlocked(loginRateLimitKey)
      || loginSourceFailureTracker.isBlocked(loginSourceRateLimitKey)
    ) {
      return res.status(429).json({ error: LOGIN_RATE_LIMIT_ERROR });
    }

    const recordLoginFailure = () => {
      loginFailureTracker.recordFailure(loginRateLimitKey);
      loginSourceFailureTracker.recordFailure(loginSourceRateLimitKey);
    };
    const recordLoginSuccess = () => {
      // Success proves only this email+IP pair recovered; source-wide spray state
      // spans rotated emails, so it is left to age out by window.
      loginFailureTracker.recordSuccess(loginRateLimitKey);
    };

    try {
      const result = await db.query(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [normalizedEmail]
      );
      if (result.rows.length === 0) {
        // Ignore the dummy result; missing accounts must never authenticate.
        await passwordHasher.compare(password, MISSING_ACCOUNT_DUMMY_PASSWORD_HASH);
        recordLoginFailure();
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const user = result.rows[0];
      if (!validatePasswordHash(user.password_hash)) {
        // Treat malformed persisted hashes like credential failures while still
        // doing dummy hash work.
        await passwordHasher.compare(password, MISSING_ACCOUNT_DUMMY_PASSWORD_HASH);
        recordLoginFailure();
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const isValidPassword = await passwordHasher.compare(password, user.password_hash);
      if (!isValidPassword) {
        recordLoginFailure();
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      recordLoginSuccess();
      const token = signToken({ userId: user.id }, jwtSecret, {
        expiresInSeconds: jwtExpiresInSeconds,
      });
      return res.json({ token });
    } catch (error) {
      return res.status(500).json({ error: 'Error logging in' });
    }
  };

  const authenticateToken = (req, res, next) => {
    const token = extractBearerToken(req.headers?.authorization);
    if (token == null) return res.sendStatus(401);

    try {
      const user = verifyToken(token, jwtSecret);
      req.user = { userId: user.userId };
      return next();
    } catch {
      return res.sendStatus(403);
    }
  };

  return { register, login, authenticateToken };
}

module.exports = {
  AUTH_EMAIL_MAX_LENGTH,
  AUTH_PASSWORD_HASH_MAX_LENGTH,
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_USERNAME_MAX_LENGTH,
  DEFAULT_JWT_EXPIRES_IN_SECONDS,
  DEFAULT_DEV_JWT_SECRET,
  LOGIN_RATE_LIMIT_ERROR,
  REGISTRATION_RATE_LIMIT_ERROR,
  JWT_SECRET_MIN_PRODUCTION_BYTES,
  JWT_SECRET_MIN_PRODUCTION_BYTES_ERROR,
  JWT_TOKEN_TOO_LONG_ERROR,
  MAX_JWT_TOKEN_LENGTH,
  MISSING_ACCOUNT_DUMMY_PASSWORD_HASH,
  PASSWORD_HASH_COST,
  createAuthHandlers,
  extractBearerToken,
  resolveJwtExpiresInSeconds,
  resolveJwtSecret,
  signToken,
  verifyToken,
};
