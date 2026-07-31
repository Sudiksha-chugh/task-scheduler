const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { loadEnv } = require('../config/env');
const { getRedisClient } = require('../config/redis');
const { User } = require('../models');
const { AuthError } = require('../utils/errors');

const BCRYPT_ROUNDS = 12;
const REVOKED_REFRESH_PREFIX = 'auth:refresh:revoked:';

function sanitizeUser(user) {
  return {
    id: user._id.toString(),
    email: user.email,
    tenant: user.tenant.toString(),
    role: user.role,
  };
}

function getJwtConfig() {
  const env = loadEnv();
  return {
    secret: env.JWT_SECRET,
    accessExpiresIn: env.JWT_ACCESS_EXPIRES_IN,
    refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
  };
}

function generateAccessToken(user) {
  const { secret, accessExpiresIn } = getJwtConfig();

  return jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      tenant: user.tenant.toString(),
      role: user.role,
      type: 'access',
    },
    secret,
    { expiresIn: accessExpiresIn },
  );
}

function generateRefreshToken(user) {
  const { secret, refreshExpiresIn } = getJwtConfig();
  const jti = crypto.randomUUID();

  const token = jwt.sign(
    {
      sub: user._id.toString(),
      jti,
      type: 'refresh',
    },
    secret,
    { expiresIn: refreshExpiresIn },
  );

  return { token, jti, expiresIn: refreshExpiresIn };
}

function verifyAccessToken(token) {
  const { secret } = getJwtConfig();
  const payload = jwt.verify(token, secret);

  if (payload.type !== 'access') {
    throw new AuthError('Invalid access token');
  }

  return payload;
}

async function verifyRefreshToken(token) {
  const { secret } = getJwtConfig();
  let payload;

  try {
    payload = jwt.verify(token, secret);
  } catch {
    throw new AuthError('Invalid refresh token');
  }

  if (payload.type !== 'refresh' || !payload.jti) {
    throw new AuthError('Invalid refresh token');
  }

  const redis = getRedisClient();
  const isRevoked = await redis.get(`${REVOKED_REFRESH_PREFIX}${payload.jti}`);

  if (isRevoked) {
    throw new AuthError('Refresh token has been revoked');
  }

  return payload;
}

async function revokeRefreshToken(jti, expiresIn) {
  const redis = getRedisClient();
  const ttlSeconds = parseExpiresInToSeconds(expiresIn);

  await redis.set(`${REVOKED_REFRESH_PREFIX}${jti}`, '1', 'EX', ttlSeconds);
}

function parseExpiresInToSeconds(value) {
  if (typeof value === 'number') {
    return value;
  }

  const match = /^(\d+)([smhd])$/.exec(value);

  if (!match) {
    return 7 * 24 * 60 * 60;
  }

  const amount = Number(match[1]);
  const unit = match[2];

  switch (unit) {
    case 's':
      return amount;
    case 'm':
      return amount * 60;
    case 'h':
      return amount * 60 * 60;
    case 'd':
      return amount * 24 * 60 * 60;
    default:
      return 7 * 24 * 60 * 60;
  }
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

async function login({ email, password }) {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    throw new AuthError('Invalid credentials');
  }

  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    throw new AuthError('Invalid credentials');
  }

  const accessToken = generateAccessToken(user);
  const refresh = generateRefreshToken(user);

  return {
    accessToken,
    refreshToken: refresh.token,
    user: sanitizeUser(user),
  };
}

async function refresh({ refreshToken }) {
  const payload = await verifyRefreshToken(refreshToken);
  const user = await User.findById(payload.sub);

  if (!user) {
    throw new AuthError('Invalid refresh token');
  }

  const { refreshExpiresIn } = getJwtConfig();
  await revokeRefreshToken(payload.jti, refreshExpiresIn);

  const accessToken = generateAccessToken(user);
  const refresh = generateRefreshToken(user);

  return {
    accessToken,
    refreshToken: refresh.token,
    user: sanitizeUser(user),
  };
}

async function logout({ refreshToken }) {
  const payload = await verifyRefreshToken(refreshToken);
  const { refreshExpiresIn } = getJwtConfig();

  await revokeRefreshToken(payload.jti, refreshExpiresIn);

  return { success: true };
}

module.exports = {
  login,
  refresh,
  logout,
  hashPassword,
  verifyPassword,
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  revokeRefreshToken,
  sanitizeUser,
};
