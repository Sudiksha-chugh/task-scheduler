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

  console.error(error);
  return res.status(500).json({
    error: {
      code: 'INTERNAL_ERROR',
      message: 'Internal server error',
    },
  });
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

module.exports = { login, refresh, logout };
