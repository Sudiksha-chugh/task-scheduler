const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

jest.mock('../../models', () => ({
  User: {
    findOne: jest.fn(),
    findById: jest.fn(),
  },
}));

jest.mock('../../config/redis', () => ({
  getRedisClient: jest.fn(),
}));

jest.mock('../../config/env', () => ({
  loadEnv: jest.fn(() => ({
    JWT_SECRET: 'test_secret_min_32_characters_long',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
  })),
}));

const { User } = require('../../models');
const { getRedisClient } = require('../../config/redis');
const authService = require('../authService');
const { AuthError } = require('../../utils/errors');
const {
  assertTenantAccess,
  tenantMatches,
  withTenantScope,
} = require('../../middleware/tenantScope');

describe('authService', () => {
  const tenantId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';
  const password = 'secure-password';
  let passwordHash;
  let mockRedis;

  const baseUser = {
    _id: userId,
    email: 'user@example.com',
    tenant: tenantId,
    role: 'ADMIN',
    passwordHash: '',
  };

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(password, 4);
    baseUser.passwordHash = passwordHash;
  });

  beforeEach(() => {
    jest.clearAllMocks();

    mockRedis = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
    };

    getRedisClient.mockReturnValue(mockRedis);
  });

  describe('hashPassword and verifyPassword', () => {
    it('hashes and verifies a password', async () => {
      const hash = await authService.hashPassword('my-password');
      expect(hash).not.toBe('my-password');
      await expect(authService.verifyPassword('my-password', hash)).resolves.toBe(true);
      await expect(authService.verifyPassword('wrong-password', hash)).resolves.toBe(false);
    });
  });

  describe('login', () => {
    it('returns tokens and sanitized user for valid credentials', async () => {
      User.findOne.mockResolvedValue({ ...baseUser });

      const result = await authService.login({
        email: 'user@example.com',
        password,
      });

      expect(User.findOne).toHaveBeenCalledWith({ email: 'user@example.com' });
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.user).toEqual({
        id: userId,
        email: 'user@example.com',
        tenant: tenantId,
        role: 'ADMIN',
      });
    });

    it('normalizes email before lookup', async () => {
      User.findOne.mockResolvedValue({ ...baseUser });

      await authService.login({
        email: '  User@Example.COM  ',
        password,
      });

      expect(User.findOne).toHaveBeenCalledWith({ email: 'user@example.com' });
    });

    it('throws AuthError when user is not found', async () => {
      User.findOne.mockResolvedValue(null);

      await expect(
        authService.login({ email: 'missing@example.com', password: 'x' }),
      ).rejects.toThrow(new AuthError('Invalid credentials'));
    });

    it('throws AuthError when password is invalid', async () => {
      User.findOne.mockResolvedValue({ ...baseUser });

      await expect(
        authService.login({ email: 'user@example.com', password: 'wrong-password' }),
      ).rejects.toThrow(new AuthError('Invalid credentials'));
    });
  });

  describe('refresh', () => {
    it('issues new tokens and revokes the previous refresh token', async () => {
      User.findById.mockResolvedValue({ ...baseUser });
      const refreshToken = authService.generateRefreshToken({ ...baseUser }).token;

      const result = await authService.refresh({ refreshToken });

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockRedis.set).toHaveBeenCalledWith(
        expect.stringMatching(/^auth:refresh:revoked:/),
        '1',
        'EX',
        expect.any(Number),
      );
      expect(result.accessToken).toEqual(expect.any(String));
      expect(result.refreshToken).toEqual(expect.any(String));
      expect(result.refreshToken).not.toBe(refreshToken);
      expect(result.user.id).toBe(userId);
    });

    it('throws AuthError for an invalid refresh token', async () => {
      await expect(authService.refresh({ refreshToken: 'not-a-token' })).rejects.toThrow(
        AuthError,
      );
    });

    it('throws AuthError when refresh token is revoked', async () => {
      const refreshToken = authService.generateRefreshToken({ ...baseUser }).token;
      mockRedis.get.mockResolvedValue('1');

      await expect(authService.refresh({ refreshToken })).rejects.toThrow(
        new AuthError('Refresh token has been revoked'),
      );
    });

    it('throws AuthError when user no longer exists', async () => {
      const refreshToken = authService.generateRefreshToken({ ...baseUser }).token;
      User.findById.mockResolvedValue(null);

      await expect(authService.refresh({ refreshToken })).rejects.toThrow(
        new AuthError('Invalid refresh token'),
      );
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      const { token, jti } = authService.generateRefreshToken({ ...baseUser });

      const result = await authService.logout({ refreshToken: token });

      expect(result).toEqual({ success: true });
      expect(mockRedis.set).toHaveBeenCalledWith(
        `auth:refresh:revoked:${jti}`,
        '1',
        'EX',
        expect.any(Number),
      );
    });

    it('prevents refresh after logout', async () => {
      const { token, jti } = authService.generateRefreshToken({ ...baseUser });

      await authService.logout({ refreshToken: token });

      mockRedis.get.mockImplementation(async (key) => {
        if (key === `auth:refresh:revoked:${jti}`) {
          return '1';
        }
        return null;
      });

      await expect(authService.refresh({ refreshToken: token })).rejects.toThrow(
        new AuthError('Refresh token has been revoked'),
      );
    });
  });

  describe('verifyAccessToken', () => {
    it('returns payload for a valid access token', () => {
      const accessToken = authService.generateAccessToken({ ...baseUser });
      const payload = authService.verifyAccessToken(accessToken);

      expect(payload.sub).toBe(userId);
      expect(payload.email).toBe('user@example.com');
      expect(payload.tenant).toBe(tenantId);
      expect(payload.role).toBe('ADMIN');
      expect(payload.type).toBe('access');
    });

    it('throws AuthError when token type is refresh', () => {
      const refreshToken = authService.generateRefreshToken({ ...baseUser }).token;

      expect(() => authService.verifyAccessToken(refreshToken)).toThrow(
        new AuthError('Invalid access token'),
      );
    });

    it('throws AuthError for tampered tokens', () => {
      const accessToken = authService.generateAccessToken({ ...baseUser });
      const tamperedToken = `${accessToken}x`;

      expect(() => authService.verifyAccessToken(tamperedToken)).toThrow();
    });
  });
});

describe('tenantScope helpers', () => {
  const req = {
    user: {
      tenant: '507f1f77bcf86cd799439011',
    },
  };

  it('tenantMatches compares tenant ids as strings', () => {
    expect(tenantMatches('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439011')).toBe(true);
    expect(tenantMatches('507f1f77bcf86cd799439011', '507f1f77bcf86cd799439099')).toBe(false);
  });

  it('assertTenantAccess passes for matching tenant', () => {
    expect(() => assertTenantAccess(req, '507f1f77bcf86cd799439011')).not.toThrow();
  });

  it('assertTenantAccess throws ForbiddenError for mismatched tenant', () => {
    expect(() => assertTenantAccess(req, '507f1f77bcf86cd799439099')).toThrow('Access denied');
  });

  it('withTenantScope injects tenant into query filters', () => {
    expect(withTenantScope(req.user, { email: 'a@b.com' })).toEqual({
      email: 'a@b.com',
      tenant: '507f1f77bcf86cd799439011',
    });
  });
});
