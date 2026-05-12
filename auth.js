// auth.js
const crypto = require('node:crypto');
const {
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_PASSWORD_MIN_LENGTH,
  validateLoginPassword,
  validateRegistrationPassword,
} = require('./authPasswordValidation');

const DEFAULT_DEV_JWT_SECRET = 'your_secret_key';
const DEFAULT_JWT_EXPIRES_IN_SECONDS = 60 * 60 * 24;
// Keep these aligned with anki.db users.username VARCHAR(50) and users.email VARCHAR(100).
const AUTH_USERNAME_MAX_LENGTH = 50;
const AUTH_EMAIL_MAX_LENGTH = 100;
const DUPLICATE_ACCOUNT_CONSTRAINTS = new Set(['users_username_key', 'users_email_key']);

function base64UrlEncode(value) {
  return Buffer.from(value).toString('base64url');
}

function base64UrlJson(value) {
  return base64UrlEncode(JSON.stringify(value));
}

function resolveJwtSecret(env = process.env) {
  if (env.JWT_SECRET) {
    return env.JWT_SECRET;
  }

  if (env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET must be set in production');
  }

  return DEFAULT_DEV_JWT_SECRET;
}

function validateJwtExpiresInSeconds(value) {
  const expiresInSeconds = Number(value);
  if (!Number.isInteger(expiresInSeconds) || expiresInSeconds <= 0) {
    throw new Error('JWT_EXPIRES_IN_SECONDS must be a positive integer');
  }

  return expiresInSeconds;
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

function signToken(payload, secret = resolveJwtSecret(), options = {}) {
  const now = options.now ?? Math.floor(Date.now() / 1000);
  const expiresInSeconds =
    options.expiresInSeconds == null
      ? resolveJwtExpiresInSeconds(options.env)
      : validateJwtExpiresInSeconds(options.expiresInSeconds);
  const header = { alg: 'HS256', typ: 'JWT' };
  const tokenPayload = {
    ...payload,
    iat: now,
    exp: now + expiresInSeconds,
  };
  const body = `${base64UrlJson(header)}.${base64UrlJson(tokenPayload)}`;
  const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${signature}`;
}

function verifyToken(token, secret = resolveJwtSecret(), options = {}) {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new Error('Invalid token');
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const header = decodeJsonPart(encodedHeader);
  if (!header || header.alg !== 'HS256') {
    throw new Error('Invalid token algorithm');
  }

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

  if (!Number.isFinite(payload.exp)) {
    throw new Error('Token expiration is required');
  }

  const normalizedUserId = normalizeTokenUserId(payload.userId);
  if (normalizedUserId == null) {
    throw new Error('Token userId is required');
  }

  const now = options.now ?? Math.floor(Date.now() / 1000);
  if (payload.exp <= now) {
    throw new Error('Token expired');
  }

  return { ...payload, userId: normalizedUserId };
}

function normalizeTokenUserId(userId) {
  if (typeof userId === 'number') {
    return Number.isSafeInteger(userId) && userId > 0 ? userId : null;
  }

  if (typeof userId === 'string') {
    const trimmed = userId.trim();
    if (!/^\d+$/.test(trimmed)) {
      return null;
    }

    const parsed = BigInt(trimmed);
    if (parsed <= 0n || parsed > BigInt(Number.MAX_SAFE_INTEGER)) {
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
  const parts = email.split('@');
  if (parts.length !== 2 || parts[0] === '' || parts[1] === '') {
    return null;
  }

  return email;
}

function isDuplicateAccountError(error) {
  return error?.code === '23505' && DUPLICATE_ACCOUNT_CONSTRAINTS.has(error.constraint);
}

function createAuthHandlers(db, options = {}) {
  if (!db || typeof db.query !== 'function') {
    throw new TypeError('createAuthHandlers requires a database object with a query method');
  }

  const jwtSecret = options.jwtSecret || resolveJwtSecret(options.env);
  const jwtExpiresInSeconds =
    options.jwtExpiresInSeconds == null
      ? resolveJwtExpiresInSeconds(options.env)
      : validateJwtExpiresInSeconds(options.jwtExpiresInSeconds);
  const passwordHasher = options.passwordHasher || getDefaultPasswordHasher();

  const register = async (req, res) => {
    const { username, email, password } = req.body || {};
    const trimmedUsername = typeof username === 'string' ? username.trim() : '';
    const normalizedEmail = normalizeEmail(email);
    if (trimmedUsername === '') {
      return res.status(400).json({ error: 'Username is required' });
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

    try {
      const hashedPassword = await passwordHasher.hash(passwordValidation.value, 10);
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

    try {
      const result = await db.query(
        'SELECT id, email, password_hash FROM users WHERE email = $1',
        [normalizedEmail]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
      const user = result.rows[0];
      const isValidPassword = await passwordHasher.compare(password, user.password_hash);
      if (!isValidPassword) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }
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
      req.user = user;
      return next();
    } catch {
      return res.sendStatus(403);
    }
  };

  return { register, login, authenticateToken };
}

module.exports = {
  AUTH_EMAIL_MAX_LENGTH,
  AUTH_PASSWORD_MAX_BYTES,
  AUTH_PASSWORD_MIN_LENGTH,
  AUTH_USERNAME_MAX_LENGTH,
  DEFAULT_JWT_EXPIRES_IN_SECONDS,
  DEFAULT_DEV_JWT_SECRET,
  createAuthHandlers,
  extractBearerToken,
  resolveJwtExpiresInSeconds,
  resolveJwtSecret,
  signToken,
  verifyToken,
};
