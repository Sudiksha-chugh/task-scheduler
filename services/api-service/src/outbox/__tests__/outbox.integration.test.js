const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { createOutboxEvent } = require('../index');
const { pollOnce } = require('../publisher');
const OutboxEvent = require('../../models/OutboxEvent');
const Job = require('../../models/Job');
const Execution = require('../../models/Execution');
const Project = require('../../models/Project');

describe('Transactional Outbox Integration Test', () => {
  let replSet;

  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1 },
    });
    const uri = replSet.getUri();
    await mongoose.connect(uri);
    await Promise.all([
      Project.init(),
      Job.init(),
      Execution.init(),
      OutboxEvent.init(),
    ]);
  }, 60000);

  afterAll(async () => {
    await mongoose.disconnect();
    if (replSet) {
      await replSet.stop();
    }
  }, 60000);

  beforeEach(async () => {
    await OutboxEvent.deleteMany({});
    await Execution.deleteMany({});
    await Job.deleteMany({});
    await Project.deleteMany({});
  });

  it('writing a job trigger produces exactly one outbox event, and the poller publishes it to a mocked queue', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    let execution;
    let outboxEvent;

    try {
      const project = new Project({
        name: 'Test Project',
        slug: 'test-project',
        tenant: new mongoose.Types.ObjectId(),
      });
      await project.save({ session });

      const job = new Job({
        project: project._id,
        name: 'Triggered Job',
        targetUrl: 'https://example.com/api/job',
        scheduleType: 'MANUAL',
      });
      await job.save({ session });

      execution = new Execution({
        job: job._id,
        status: 'PENDING',
      });
      await execution.save({ session });

      outboxEvent = await createOutboxEvent(
        {
          aggregateType: 'Execution',
          aggregateId: execution._id,
          eventType: 'EXECUTION_CREATED',
          payload: {
            executionId: execution._id.toString(),
            jobId: job._id.toString(),
            targetUrl: job.targetUrl,
          },
        },
        session,
      );

      await session.commitTransaction();
    } catch (error) {
      await session.abortTransaction();
      throw error;
    } finally {
      session.endSession();
    }

    // 1. Verify writing a job trigger produces exactly one outbox event in MongoDB
    const events = await OutboxEvent.find({ aggregateId: execution._id });
    expect(events).toHaveLength(1);
    expect(events[0]._id.toString()).toBe(outboxEvent._id.toString());
    expect(events[0].published).toBe(false);
    expect(events[0].eventType).toBe('EXECUTION_CREATED');

    // 2. Verify poller publishes to mocked queue and marks event published
    const mockQueue = {
      add: jest.fn().mockResolvedValue({ id: 'job-123' }),
    };

    const publishedCount = await pollOnce({ queue: mockQueue });
    expect(publishedCount).toBe(1);

    expect(mockQueue.add).toHaveBeenCalledTimes(1);
    expect(mockQueue.add).toHaveBeenCalledWith(
      'EXECUTION_CREATED',
      expect.objectContaining({
        outboxId: outboxEvent._id.toString(),
        aggregateType: 'Execution',
        aggregateId: execution._id.toString(),
        eventType: 'EXECUTION_CREATED',
        payload: {
          executionId: execution._id.toString(),
          jobId: expect.any(String),
          targetUrl: 'https://example.com/api/job',
        },
      }),
    );

    // Check DB state: published is now true
    const updatedEvent = await OutboxEvent.findById(outboxEvent._id);
    expect(updatedEvent.published).toBe(true);
  });

  it('rolls back outbox event if transaction aborts', async () => {
    const session = await mongoose.startSession();
    session.startTransaction();

    let executionId;

    try {
      const project = new Project({
        name: 'Aborted Project',
        slug: 'aborted-project',
        tenant: new mongoose.Types.ObjectId(),
      });
      await project.save({ session });

      const job = new Job({
        project: project._id,
        name: 'Aborted Job',
        targetUrl: 'https://example.com/webhook',
        scheduleType: 'MANUAL',
      });
      await job.save({ session });

      const execution = new Execution({
        job: job._id,
        status: 'PENDING',
      });
      await execution.save({ session });
      executionId = execution._id;

      await createOutboxEvent(
        {
          aggregateType: 'Execution',
          aggregateId: execution._id,
          eventType: 'EXECUTION_CREATED',
          payload: { executionId: execution._id.toString() },
        },
        session,
      );

      await session.abortTransaction();
    } finally {
      session.endSession();
    }

    const events = await OutboxEvent.find({ aggregateId: executionId });
    expect(events).toHaveLength(0);
  });
});
