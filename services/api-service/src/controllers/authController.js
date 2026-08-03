const authService = require('../services/authService');
const { AppError } = require('../utils/errors');

function handleError(res, error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: {
        code: error.code,
        message: error.message,
      },
    });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: error.message },
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'That value is already in use' },
    });
  }

  console.error(error);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
}

async function register(req, res) {
  try {
    const { tenantName, email, password } = req.body;

    if (!tenantName || !email || !password) {
      throw new AppError('tenantName, email, and password are required', 400, 'VALIDATION_ERROR');
    }

    if (String(password).length < 8) {
      throw new AppError('Password must be at least 8 characters', 400, 'VALIDATION_ERROR');
    }

    const result = await authService.register({ tenantName, email, password });
    return res.status(201).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

async function login(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      throw new AppError('Email and password are required', 400, 'VALIDATION_ERROR');
    }

    const result = await authService.login({ email, password });
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

async function refresh(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400, 'VALIDATION_ERROR');
    }

    const result = await authService.refresh({ refreshToken });
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

async function logout(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      throw new AppError('Refresh token is required', 400, 'VALIDATION_ERROR');
    }

    const result = await authService.logout({ refreshToken });
    return res.status(200).json(result);
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = { register, login, refresh, logout };