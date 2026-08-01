const { processExecutionJob } = require('../processor');

describe('Worker Service Job Processor', () => {
  let mockRedis;
  let mockResultQueue;
  let mockAxios;
  let mockExecutionModel;
  let mockJobModel;
  let mockExecutionDoc;
  let mockJobDoc;
  let fencingCounter = 0;
  let redisStore = {};

  beforeEach(() => {
    jest.clearAllMocks();
    fencingCounter = 0;
    redisStore = {};

    mockRedis = {
      incr: jest.fn().mockImplementation(async (key) => {
        fencingCounter += 1;
        redisStore[key] = String(fencingCounter);
        return fencingCounter;
      }),
      set: jest.fn().mockImplementation(async (key, val, mode, ttl, flag) => {
        if (flag === 'NX' && redisStore[key]) {
          return null;
        }
        redisStore[key] = String(val);
        return 'OK';
      }),
      get: jest.fn().mockImplementation(async (key) => {
        return redisStore[key] !== undefined ? redisStore[key] : null;
      }),
      pexpire: jest.fn().mockResolvedValue(1),
      del: jest.fn().mockImplementation(async (...keys) => {
        for (const k of keys) {
          delete redisStore[k];
        }
        return 1;
      }),
    };

    mockResultQueue = {
      add: jest.fn().mockResolvedValue({ id: 'res-1' }),
    };

    mockAxios = jest.fn().mockResolvedValue({
      status: 200,
      data: { success: true },
    });

    mockJobDoc = {
      _id: '507f1f77bcf86cd799439011',
      name: 'Sample Job',
      targetUrl: 'https://example.com/api',
      httpMethod: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { foo: 'bar' },
      timeoutSeconds: 30,
    };

    mockExecutionDoc = {
      _id: '507f1f77bcf86cd799439022',
      job: mockJobDoc._id,
      status: 'PENDING',
      fencingToken: null,
      attempts: [],
      save: jest.fn().mockImplementation(function () {
        return Promise.resolve(this);
      }),
    };

    mockExecutionModel = {
      findById: jest.fn().mockResolvedValue(mockExecutionDoc),
    };

    mockJobModel = {
      findById: jest.fn().mockResolvedValue(mockJobDoc),
    };
  });

  it('claims lease with fencing token, updates status to LEASED then RUNNING, dispatches HTTP, publishes result', async () => {
    const bullJob = {
      data: {
        executionId: mockExecutionDoc._id,
        jobId: mockJobDoc._id,
      },
    };

    const options = {
      redis: mockRedis,
      resultQueue: mockResultQueue,
      axios: mockAxios,
      models: { Execution: mockExecutionModel, Job: mockJobModel },
      heartbeatIntervalMs: 100,
    };

    const result = await processExecutionJob(bullJob, options);

    // 1. Verify lease acquired with fencing token = 1
    expect(mockRedis.incr).toHaveBeenCalledWith(`fencing:execution:${mockExecutionDoc._id}`);
    expect(mockRedis.set).toHaveBeenCalledWith(
      `lease:execution:${mockExecutionDoc._id}`,
      '1',
      'PX',
      30000,
      'NX',
    );

    // 2. Verify Execution status updated LEASED -> RUNNING -> SUCCESS
    expect(mockExecutionDoc.fencingToken).toBe(1);
    expect(mockExecutionDoc.status).toBe('SUCCESS');
    expect(mockExecutionDoc.attempts).toHaveLength(1);
    expect(mockExecutionDoc.attempts[0].httpStatusCode).toBe(200);

    // 3. Verify HTTP request dispatched via axios
    expect(mockAxios).toHaveBeenCalledWith({
      method: 'post',
      url: 'https://example.com/api',
      headers: { 'Content-Type': 'application/json' },
      data: { foo: 'bar' },
      timeout: 30000,
    });

    // 4. Verify result published to result-queue
    expect(mockResultQueue.add).toHaveBeenCalledWith(
      'execution-result',
      expect.objectContaining({
        executionId: mockExecutionDoc._id,
        jobId: mockJobDoc._id,
        status: 'SUCCESS',
        fencingToken: 1,
        httpStatusCode: 200,
      }),
    );
    expect(result.status).toBe('SUCCESS');
  });

  it('skips execution if lease is already claimed by another worker', async () => {
    // Pre-claim lease in Redis
    redisStore[`lease:execution:${mockExecutionDoc._id}`] = '99';

    const bullJob = {
      data: {
        executionId: mockExecutionDoc._id,
        jobId: mockJobDoc._id,
      },
    };

    const options = {
      redis: mockRedis,
      resultQueue: mockResultQueue,
      axios: mockAxios,
      models: { Execution: mockExecutionModel, Job: mockJobModel },
    };

    const result = await processExecutionJob(bullJob, options);

    expect(result.status).toBe('SKIPPED');
    expect(result.reason).toBe('already_leased');
    expect(mockAxios).not.toHaveBeenCalled();
    expect(mockResultQueue.add).not.toHaveBeenCalled();
  });

  it('discards result if fencing token is modified/invalidated before publishing', async () => {
    mockAxios.mockImplementation(async () => {
      // Simulate another node stealing lease with a higher fencing token (token = 2)
      redisStore[`lease:execution:${mockExecutionDoc._id}`] = '2';
      return { status: 200, data: 'OK' };
    });

    const bullJob = {
      data: {
        executionId: mockExecutionDoc._id,
        jobId: mockJobDoc._id,
      },
    };

    const options = {
      redis: mockRedis,
      resultQueue: mockResultQueue,
      axios: mockAxios,
      models: { Execution: mockExecutionModel, Job: mockJobModel },
    };

    const result = await processExecutionJob(bullJob, options);

    expect(result.status).toBe('DISCARDED');
    expect(result.reason).toBe('fencing_token_invalid');
    expect(mockResultQueue.add).not.toHaveBeenCalled();
  });

  it('handles HTTP error as FAILED result and publishes to result-queue', async () => {
    mockAxios.mockRejectedValue({
      message: 'Network Error',
      response: {
        status: 500,
        data: { error: 'Internal Server Error' },
      },
    });

    const bullJob = {
      data: {
        executionId: mockExecutionDoc._id,
        jobId: mockJobDoc._id,
      },
    };

    const options = {
      redis: mockRedis,
      resultQueue: mockResultQueue,
      axios: mockAxios,
      models: { Execution: mockExecutionModel, Job: mockJobModel },
    };

    const result = await processExecutionJob(bullJob, options);

    expect(result.status).toBe('FAILED');
    expect(mockExecutionDoc.status).toBe('FAILED');
    expect(mockResultQueue.add).toHaveBeenCalledWith(
      'execution-result',
      expect.objectContaining({
        executionId: mockExecutionDoc._id,
        status: 'FAILED',
        httpStatusCode: 500,
        errorMessage: 'Network Error',
      }),
    );
  });
});
