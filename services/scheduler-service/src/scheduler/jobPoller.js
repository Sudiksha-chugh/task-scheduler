const mongoose = require('mongoose');
const parser = require('cron-parser');
const { getModels } = require('../models');
const { getOutbox } = require('../outbox');

function computeNextRunAt(cronExpression, fromDate) {
  try {
    const interval = parser.parseExpression(cronExpression, { currentDate: fromDate || new Date() });
    return interval.next().toDate();
  } catch (err) {
    console.error(`Invalid cron expression "${cronExpression}":`, err.message);
    return null;
  }
}

async function claimJob(Job, job) {
  let update;

  if (job.scheduleType === 'CRON') {
    const next = computeNextRunAt(job.cronExpression, new Date());
    update = { $set: { lastRunAt: new Date(), nextRunAt: next } };
  } else {
    update = { $set: { lastRunAt: new Date(), nextRunAt: null, enabled: false } };
  }

  const claimed = await Job.findOneAndUpdate(
    { _id: job._id, nextRunAt: job.nextRunAt },
    update,
    { new: true },
  );

  return claimed;
}

async function dispatchJob(job, options = {}) {
  const { Execution } = getModels(options);
  const { createOutboxEvent } = getOutbox(options);

  const session = options.session || (await mongoose.startSession());
  const ownsSession = !options.session;
  if (ownsSession) session.startTransaction();

  try {
    const [execution] = await Execution.create(
      [{ job: job._id, status: 'PENDING' }],
      { session },
    );

    await createOutboxEvent(
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

    if (ownsSession) await session.commitTransaction();
    console.log(`Dispatched job ${job._id} -> execution ${execution._id} (via outbox)`);
    return execution;
  } catch (err) {
    if (ownsSession) await session.abortTransaction();
    throw err;
  } finally {
    if (ownsSession) session.endSession();
  }
}

async function pollDueJobs(options = {}) {
  const { Job } = getModels(options);
  const now = new Date();

  const dueJobs = await Job.find({
    enabled: true,
    scheduleType: { $in: ['CRON', 'ONE_SHOT'] },
    nextRunAt: { $lte: now },
  }).limit(options.batchSize || 100);

  let dispatched = 0;

  for (const job of dueJobs) {
    try {
      const claimed = await claimJob(Job, job);
      if (!claimed) {
        continue;
      }
      await dispatchJob(claimed, options);
      dispatched += 1;
    } catch (err) {
      console.error(`Failed to dispatch job ${job._id}:`, err.message);
    }
  }

  return dispatched;
}

function startJobPolling(options = {}) {
  const intervalMs = options.intervalMs || 5000;
  const timer = setInterval(() => {
    pollDueJobs(options).catch((err) => {
      console.error('Error during job poll cycle:', err.message);
    });
  }, intervalMs);
  return timer;
}

module.exports = { pollDueJobs, startJobPolling, computeNextRunAt };