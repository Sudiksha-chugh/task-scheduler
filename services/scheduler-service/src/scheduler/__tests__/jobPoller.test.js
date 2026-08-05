const { pollDueJobs, computeNextRunAt } = require('../jobPoller');

function fakeSession() {
  return {
    startTransaction: jest.fn(),
    commitTransaction: jest.fn().mockResolvedValue(undefined),
    abortTransaction: jest.fn().mockResolvedValue(undefined),
    endSession: jest.fn(),
  };
}

describe('computeNextRunAt', () => {
  it('computes the next fire time for a valid cron expression', () => {
    const from = new Date('2026-01-01T00:00:00.000Z');
    const next = computeNextRunAt('*/5 * * * *', from);
    expect(next).toBeInstanceOf(Date);
    expect(next.getTime()).toBeGreaterThan(from.getTime());
  });

  it('returns null for an invalid cron expression', () => {
    expect(computeNextRunAt('not a cron expression', new Date())).toBeNull();
  });
});

describe('pollDueJobs', () => {
  function makeJobDoc(overrides = {}) {
    return {
      _id: 'job1',
      scheduleType: 'CRON',
      cronExpression: '*/5 * * * *',
      targetUrl: 'https://example.com/webhook',
      nextRunAt: new Date('2026-01-01T00:00:00.000Z'),
      enabled: true,
      ...overrides,
    };
  }

  it('dispatches a due CRON job: atomically claims it, creates an Execution, writes an outbox event', async () => {
    const dueJob = makeJobDoc();
    const claimedJob = { ...dueJob, nextRunAt: new Date('2026-01-01T00:05:00.000Z') };

    const findOneAndUpdate = jest.fn().mockResolvedValue(claimedJob);
    const Job = {
      find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([dueJob]) }),
      findOneAndUpdate,
    };

    const createdExecution = { _id: 'exec1' };
    const Execution = { create: jest.fn().mockResolvedValue([createdExecution]) };

    const createOutboxEvent = jest.fn().mockResolvedValue({});
    const session = fakeSession();

    const dispatched = await pollDueJobs({
      models: { Job, Execution },
      outbox: { createOutboxEvent },
      session,
    });

    expect(dispatched).toBe(1);

    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: dueJob._id, nextRunAt: dueJob.nextRunAt },
      { $set: { lastRunAt: expect.any(Date), nextRunAt: expect.any(Date) } },
      { new: true },
    );

    expect(Execution.create).toHaveBeenCalledWith(
      [{ job: claimedJob._id, status: 'PENDING' }],
      { session },
    );

    expect(createOutboxEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        aggregateType: 'Execution',
        aggregateId: createdExecution._id,
        eventType: 'EXECUTION_CREATED',
        payload: {
          executionId: createdExecution._id,
          jobId: claimedJob._id,
          targetUrl: claimedJob.targetUrl,
        },
      }),
      session,
    );
  });

  it('skips a job another scheduler replica already claimed (findOneAndUpdate returns null)', async () => {
    const dueJob = makeJobDoc();
    const Job = {
      find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([dueJob]) }),
      findOneAndUpdate: jest.fn().mockResolvedValue(null),
    };
    const Execution = { create: jest.fn() };
    const createOutboxEvent = jest.fn();

    const dispatched = await pollDueJobs({
      models: { Job, Execution },
      outbox: { createOutboxEvent },
      session: fakeSession(),
    });

    expect(dispatched).toBe(0);
    expect(Execution.create).not.toHaveBeenCalled();
    expect(createOutboxEvent).not.toHaveBeenCalled();
  });

  it('disables a ONE_SHOT job and clears nextRunAt after it fires (no reschedule)', async () => {
    const dueJob = makeJobDoc({
      scheduleType: 'ONE_SHOT',
      cronExpression: undefined,
      nextRunAt: new Date('2026-01-01T09:00:00.000Z'),
    });
    const claimedJob = { ...dueJob, nextRunAt: null, enabled: false };

    const findOneAndUpdate = jest.fn().mockResolvedValue(claimedJob);
    const Job = {
      find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([dueJob]) }),
      findOneAndUpdate,
    };
    const Execution = { create: jest.fn().mockResolvedValue([{ _id: 'exec2' }]) };
    const createOutboxEvent = jest.fn().mockResolvedValue({});

    const dispatched = await pollDueJobs({
      models: { Job, Execution },
      outbox: { createOutboxEvent },
      session: fakeSession(),
    });

    expect(dispatched).toBe(1);
    expect(findOneAndUpdate).toHaveBeenCalledWith(
      { _id: dueJob._id, nextRunAt: dueJob.nextRunAt },
      { $set: { lastRunAt: expect.any(Date), nextRunAt: null, enabled: false } },
      { new: true },
    );
  });

  it('does not dispatch a job that is not yet due (none returned by the query)', async () => {
    const Job = {
      find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([]) }),
      findOneAndUpdate: jest.fn(),
    };
    const Execution = { create: jest.fn() };
    const createOutboxEvent = jest.fn();

    const dispatched = await pollDueJobs({
      models: { Job, Execution },
      outbox: { createOutboxEvent },
      session: fakeSession(),
    });

    expect(dispatched).toBe(0);
    expect(Job.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('continues polling remaining jobs even if dispatching one throws', async () => {
    const jobOk = makeJobDoc({ _id: 'jobOk' });
    const jobBad = makeJobDoc({ _id: 'jobBad' });

    const Job = {
      find: jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue([jobBad, jobOk]) }),
      findOneAndUpdate: jest.fn()
        .mockResolvedValueOnce({ ...jobBad, nextRunAt: new Date() })
        .mockResolvedValueOnce({ ...jobOk, nextRunAt: new Date() }),
    };
    const Execution = {
      create: jest.fn()
        .mockRejectedValueOnce(new Error('DB write failed'))
        .mockResolvedValueOnce([{ _id: 'execOk' }]),
    };
    const createOutboxEvent = jest.fn().mockResolvedValue({});

    const dispatched = await pollDueJobs({
      models: { Job, Execution },
      outbox: { createOutboxEvent },
      session: fakeSession(),
    });

    // jobBad's dispatch threw and was caught per-job; jobOk still got dispatched
    expect(dispatched).toBe(1);
    expect(Execution.create).toHaveBeenCalledTimes(2);
  });
});