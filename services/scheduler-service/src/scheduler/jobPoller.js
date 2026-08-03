const { Queue } = require('bullmq');
const parser = require('cron-parser');
const { getRedisClient } = require('../config/redis');
const { getModels } = require('../models');

let executionQueue = null;

function getExecutionQueue(customQueue) {
  if (customQueue) return customQueue;
  if (!executionQueue) {
    executionQueue = new Queue('execution-queue', {
      connection: getRedisClient(),
    });
  }
  return executionQueue;
}

function computeNextRunAt(cronExpression, fromDate) {
  try {
    const interval = parser.parseExpression(cronExpression, { currentDate: fromDate || new Date() });
    return interval.next().toDate();
  } catch (err) {
    console.error(`Invalid cron expression "${cronExpression}":`, err.message);
    return null;
  }
}

/**
 * Atomically claims a single due job by matching its current nextRunAt.
 * Prevents two scheduler replicas from double-dispatching the same run.
 */
async function claimJob(Job, job) {
  let update;

  if (job.scheduleType === 'CRON') {
    const next = computeNextRunAt(job.cronExpression, new Date());
    update = { $set: { lastRunAt: new Date(), nextRunAt: next } };
  } else {
    // ONE_SHOT: don't reschedule, disable after firing
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
  const queue = getExecutionQueue(options.executionQueue);

  const execution = await Execution.create({
    job: job._id,
    status: 'PENDING',
  });

  await queue.add('run-execution', {
    executionId: execution._id.toString(),
    jobId: job._id.toString(),
  });

  console.log(`Dispatched job ${job._id} -> execution ${execution._id}`);
  return execution;
}

/**
 * Polls for enabled CRON/ONE_SHOT jobs whose nextRunAt has passed,
 * claims each atomically, and enqueues an execution for it.
 */
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
        // another scheduler instance already claimed this run
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

module.exports = { pollDueJobs, startJobPolling, computeNextRunAt, getExecutionQueue };