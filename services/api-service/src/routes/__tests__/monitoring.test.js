const authService = require('../../services/authService');
const { getWorkerHeartbeats, getQueueDepths } = require('../../controllers/monitoringController');

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

describe('Monitoring Controllers & Endpoints', () => {
  const tenantId = '507f1f77bcf86cd799439011';
  const userId = '507f1f77bcf86cd799439012';
  let accessToken;

  beforeAll(() => {
    accessToken = authService.generateAccessToken({
      _id: userId,
      email: 'user@example.com',
      tenant: tenantId,
      role: 'ADMIN',
    });
  });

  describe('getWorkerHeartbeats', () => {
    it('returns empty array when no worker heartbeats exist', async () => {
      const mockRedis = {
        keys: jest.fn().mockResolvedValue([]),
      };

      const req = { redis: mockRedis };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getWorkerHeartbeats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ workers: [] });
    });

    it('returns parsed worker heartbeat snapshots', async () => {
      const mockRedis = {
        keys: jest.fn().mockResolvedValue(['worker:heartbeat:w1']),
        get: jest.fn().mockImplementation(async (key) => {
          if (key === 'worker:heartbeat:w1') {
            return JSON.stringify({ workerId: 'w1', executionId: 'ex1', status: 'RUNNING' });
          }
          return null;
        }),
      };

      const req = { redis: mockRedis };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getWorkerHeartbeats(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        workers: [{ workerId: 'w1', executionId: 'ex1', status: 'RUNNING' }],
      });
    });
  });

  describe('getQueueDepths', () => {
    it('returns job counts for execution-queue and result-queue', async () => {
      const mockExecQueue = {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 2, active: 1, completed: 10, failed: 0 }),
      };

      const mockResultQueue = {
        getJobCounts: jest.fn().mockResolvedValue({ waiting: 0, active: 0, completed: 5, failed: 0 }),
      };

      const req = {
        options: {
          executionQueue: mockExecQueue,
          resultQueue: mockResultQueue,
        },
      };

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      };

      await getQueueDepths(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        queues: {
          'execution-queue': { waiting: 2, active: 1, completed: 10, failed: 0 },
          'result-queue': { waiting: 0, active: 0, completed: 5, failed: 0 },
        },
      });
    });
  });
});
