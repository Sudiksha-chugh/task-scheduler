const { reclaimStaleLeases } = require('../leaseReclaimer');

function fakeSession() {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn(),
  };
}

function makeStaleExecution(overrides = {}) {
  return {
    _id: 'exec1',
    job: 'job1',
    status: 'RUNNING',
    retryCount: 0,
    save: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe('reclaimStaleLeases', () => {
  it('leaves an execution alone if its Redis lease is still actively held', async () => {
    const exec = makeStaleExecution();
    const Execution = { find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([exec]) }) };
    const Job = { findById: jest.fn().mockResolvedValue({ retryMaxAttempts: 3 }) };
    const redis = { get: jest.fn().mockResolvedValue('42') }; // lease key still present
    const createOutboxEvent = jest.fn();

    const result = await reclaimStaleLeases({
      models: { Execution, Job },
      redis,
      outbox: { createOutboxEvent },
    });

    expect(result).toEqual({ reclaimed: 0, deadLettered: 0, checked: 1 });
    expect(exec.save).not.toHaveBeenCalled();
    expect(createOutboxEvent).not.toHaveBeenCalled();
  });

  it('marks an execution DEAD once retries are exhausted (retryCount + 1 >= maxAttempts)', async () => {
    const exec = makeStaleExecution({ retryCount: 2 });
    const Execution = { find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([exec]) }) };
    const Job = { findById: jest.fn().mockResolvedValue({ retryMaxAttempts: 3 }) };
    const redis = { get: jest.fn().mockResolvedValue(null) }; // lease expired -- worker crashed
    const createOutboxEvent = jest.fn();

    const result = await reclaimStaleLeases({
      models: { Execution, Job },
      redis,
      outbox: { createOutboxEvent },
    });

    expect(exec.status).toBe('DEAD');
    expect(exec.retryCount).toBe(3);
    expect(exec.save).toHaveBeenCalledTimes(1);
    expect(exec.save).toHaveBeenCalledWith(); // no session -- DEAD path saves outside a transaction
    expect(result).toEqual({ reclaimed: 0, deadLettered: 1, checked: 1 });
    expect(createOutboxEvent).not.toHaveBeenCalled();
  });

  it('requeues a crashed execution via the outbox when retries remain', async () => {
    const exec = makeStaleExecution({ retryCount: 0 });
    const Execution = { find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([exec]) }) };
    const Job = { findById: jest.fn().mockResolvedValue({ retryMaxAttempts: 3, targetUrl: 'https://example.com/webhook' }) };
    const redis = { get: jest.fn().mockResolvedValue(null) };
    const createOutboxEvent = jest.fn().mockResolvedValue({});
    const session = fakeSession();

    const result = await reclaimStaleLeases({
      models: { Execution, Job },
      redis,
      outbox: { createOutboxEvent },
      session,
    });

    expect(exec.status).toBe('PENDING');
    expect(exec.retryCount).toBe(1);
    expect(exec.fencingToken).toBeUndefined();
    expect(exec.save).toHaveBeenCalledWith({ session });

    expect(createOutboxEvent).toHaveBeenCalledWith(
      {
        aggregateType: 'Execution',
        aggregateId: exec._id,
        eventType: 'EXECUTION_CREATED',
        payload: {
          executionId: exec._id,
          jobId: exec.job,
          targetUrl: 'https://example.com/webhook',
          retry: true,
        },
      },
      session,
    );

    expect(result).toEqual({ reclaimed: 1, deadLettered: 0, checked: 1 });
  });

  it('checks multiple stale candidates independently in one pass', async () => {
    const execDead = makeStaleExecution({ _id: 'execDead', retryCount: 2 });
    const execRequeue = makeStaleExecution({ _id: 'execRequeue', retryCount: 0 });
    const execSkip = makeStaleExecution({ _id: 'execSkip' });

    const Execution = {
      find: jest.fn().mockReturnValue({
        limit: jest.fn().mockResolvedValue([execDead, execRequeue, execSkip]),
      }),
    };
    const Job = { findById: jest.fn().mockResolvedValue({ retryMaxAttempts: 3, targetUrl: 'https://x.com' }) };
    const redis = {
      get: jest.fn()
        .mockResolvedValueOnce(null)   // execDead -- lease gone
        .mockResolvedValueOnce(null)   // execRequeue -- lease gone
        .mockResolvedValueOnce('99'),  // execSkip -- lease still held
    };
    const createOutboxEvent = jest.fn().mockResolvedValue({});

    const result = await reclaimStaleLeases({
      models: { Execution, Job },
      redis,
      outbox: { createOutboxEvent },
      session: fakeSession(),
    });

    expect(result).toEqual({ reclaimed: 1, deadLettered: 1, checked: 3 });
    expect(execSkip.save).not.toHaveBeenCalled();
  });
});