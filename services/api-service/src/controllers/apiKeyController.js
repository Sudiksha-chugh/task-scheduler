const crypto = require('crypto');
const ApiKey = require('../models/ApiKey');
const Project = require('../models/Project');
const { AppError } = require('../utils/errors');

function handleError(res, error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: error.message },
    });
  }

  console.error(error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}

const KEY_PREFIX_LABEL = 'jf_live_';

function generateRawKey() {
  return `${KEY_PREFIX_LABEL}${crypto.randomBytes(24).toString('hex')}`;
}

function hashKey(rawKey) {
  return crypto.createHash('sha256').update(rawKey).digest('hex');
}

/**
 * POST /api/v1/api-keys
 * Generates a new API key for the tenant. The raw key is returned exactly
 * once in this response -- only its hash is ever stored, so it cannot be
 * retrieved again after this call. If it's lost, the key must be revoked
 * and a new one generated.
 */
async function createApiKey(req, res) {
  try {
    const { name, projectId, expiresAt } = req.body;

    if (!name || !String(name).trim()) {
      throw new AppError('name is required', 400, 'VALIDATION_ERROR');
    }

    if (projectId) {
      const project = await Project.findOne({ _id: projectId, tenant: req.user.tenant }).lean();
      if (!project) {
        throw new AppError('Project not found', 404, 'NOT_FOUND');
      }
    }

    let parsedExpiresAt;
    if (expiresAt) {
      parsedExpiresAt = new Date(expiresAt);
      if (Number.isNaN(parsedExpiresAt.getTime())) {
        throw new AppError('expiresAt must be a valid date', 400, 'VALIDATION_ERROR');
      }
    }

    const rawKey = generateRawKey();
    const keyPrefix = rawKey.slice(0, 12);
    const keyHash = hashKey(rawKey);

    const apiKey = await ApiKey.create({
      tenant: req.user.tenant,
      project: projectId || undefined,
      name: String(name).trim(),
      keyPrefix,
      keyHash,
      createdBy: req.user.id,
      expiresAt: parsedExpiresAt,
    });

    return res.status(201).json({
      // the only time the raw key is ever sent to the client
      key: rawKey,
      apiKey: {
        id: apiKey._id.toString(),
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        project: apiKey.project,
        enabled: apiKey.enabled,
        expiresAt: apiKey.expiresAt,
        createdAt: apiKey.createdAt,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * GET /api/v1/api-keys
 * Lists API keys for the tenant. Never returns keyHash.
 */
async function listApiKeys(req, res) {
  try {
    const keys = await ApiKey.find({ tenant: req.user.tenant })
      .select('-keyHash')
      .populate('project', 'name slug')
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ apiKeys: keys });
  } catch (error) {
    return handleError(res, error);
  }
}

/**
 * DELETE /api/v1/api-keys/:id
 * Soft-revokes a key (enabled: false) rather than deleting the row, so
 * usage history / lastUsedAt is preserved for audit purposes.
 */
async function revokeApiKey(req, res) {
  try {
    const apiKey = await ApiKey.findOne({ _id: req.params.id, tenant: req.user.tenant });
    if (!apiKey) {
      throw new AppError('API key not found', 404, 'NOT_FOUND');
    }

    apiKey.enabled = false;
    await apiKey.save();

    return res.status(200).json({
      apiKey: {
        id: apiKey._id.toString(),
        name: apiKey.name,
        keyPrefix: apiKey.keyPrefix,
        enabled: apiKey.enabled,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { createApiKey, listApiKeys, revokeApiKey, hashKey };