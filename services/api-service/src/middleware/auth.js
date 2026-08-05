const crypto = require('crypto');
const authService = require('../services/authService');
const { ApiKey } = require('../models');
const { AuthError } = require('../utils/errors');

const API_KEY_PREFIX = 'jf_live_';

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * Authenticates a raw API key against the ApiKey collection.
 * Returns a req.user-shaped object on success, throws AuthError otherwise.
 *
 * Note: a key scoped to a specific project (apiKey.project set) currently
 * authenticates the same as a tenant-wide key -- it is NOT restricted to
 * just that project's resources. Enforcing that would need every
 * controller's tenant-scoping check to also check req.apiKey.project,
 * which none of them currently do. Flagging this as a known gap rather
 * than silently pretending project-scoped keys are enforced.
 */
async function authenticateApiKey(rawKey) {
  const keyHash = hashKey(rawKey);
  const apiKey = await ApiKey.findOne({ keyHash });

  if (!apiKey) {
    throw new AuthError('Invalid API key');
  }

  if (!apiKey.enabled) {
    throw new AuthError('API key has been revoked');
  }

  if (apiKey.expiresAt && apiKey.expiresAt.getTime() < Date.now()) {
    throw new AuthError('API key has expired');
  }

  // Fire-and-forget -- don't make every authenticated request wait on this write.
  ApiKey.updateOne({ _id: apiKey._id }, { lastUsedAt: new Date() }).catch((err) => {
    console.error(`Failed to update lastUsedAt for API key ${apiKey._id}:`, err.message);
  });

  return {
    id: apiKey.createdBy ? apiKey.createdBy.toString() : null,
    email: null,
    tenant: apiKey.tenant.toString(),
    role: 'API_KEY',
    apiKeyId: apiKey._id.toString(),
    apiKeyProject: apiKey.project ? apiKey.project.toString() : null,
  };
}

async function requireAuth(req, res, next) {
  try {
    let token = null;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice('Bearer '.length);
    } else if (req.query && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      throw new AuthError('Missing or invalid authorization token');
    }

    if (token.startsWith(API_KEY_PREFIX)) {
      req.user = await authenticateApiKey(token);
      return next();
    }

    const payload = authService.verifyAccessToken(token);

    req.user = {
      id: payload.sub,
      email: payload.email,
      tenant: payload.tenant,
      role: payload.role,
    };

    return next();
  } catch (error) {
    if (error instanceof AuthError) {
      return res.status(error.statusCode).json({
        error: {
          code: error.code,
          message: error.message,
        },
      });
    }

    return res.status(401).json({
      error: {
        code: 'AUTH_ERROR',
        message: 'Unauthorized',
      },
    });
  }
}

module.exports = { requireAuth };