const authService = require('../services/authService');
const { AuthError } = require('../utils/errors');

async function requireAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AuthError('Missing or invalid authorization header');
    }

    const token = authHeader.slice('Bearer '.length);
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
