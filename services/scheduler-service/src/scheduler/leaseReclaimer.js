const mongoose = require('mongoose');
const { getRedisClient } = require('../config/redis');
const { getModels } = require('../models');
const { getOutbox } = require('../outbox');

/**
 * Executions stuck in LEASED/RUNNING whose Mongo doc hasn't been touched
 * in at least this long are candidates -- avoids checking executions that
 * just started a second ago.
 */
function staleCandidateCutoff(leaseTtlMs) {
  return new Date(Date.now() - leaseTtlMs);
}

async function reclaimStaleLeases(options = {}) {
  const { Execution, Job } = getModels(options);
  const { createOutboxEvent } = getOutbox(options);
  const redis = options.redis || getRedisClient();
  const leaseTtlMs = options.leaseTtlMs || 30000;

  const candidates = await Execution.find({
    status: { $in: ['LEASED', 'RUNNING'] },
    updatedAt: { $lte: staleCandidateCutoff(leaseTtlMs) },
  }).limit(options.batchSize || 100);

  let reclaimed = 0;
  let deadLettered = 0;

  for (const execution of candidates) {
    const leaseKey = `lease:execution:${execution._id}`;
    const currentLease = await redis.get(leaseKey);

    if (currentLease) {
      // lease is still held and being renewed by a live worker; leave it alone
      continue;
    }

    const job = await Job.findById(execution.job);
    const maxAttempts = (job && job.retryMaxAttempts) || 3;

    if (execution.retryCount + 1 >= maxAttempts) {
      execution.status = 'DEAD';
      execution.retryCount += 1;
      await execution.save();
      deadLettered += 1;
      console.warn(`Execution ${execution._id} exceeded retry limit (${maxAttempts}); marked DEAD`);
      continue;
    }

    const session = options.session || (await mongoose.startSession());
    const ownsSession = !options.session;
    if (ownsSession) session.startTransaction();
    try {
      execution.status = 'PENDING';
      execution.retryCount += 1;
      execution.fencingToken = undefined;
      await execution.save({ session });

      await createOutboxEvent(
        {
          aggregateType: 'Execution',
          aggregateId: execution._id,
          eventType: 'EXECUTION_CREATED',
          payload: {
            executionId: execution._id.toString(),
            jobId: execution.job.toString(),
            targetUrl: job ? job.targetUrl : undefined,
            retry: true,
          },
        },
        session,
      );

      if (ownsSession) await session.commitTransaction();
      reclaimed += 1;
      console.log(
        `Reclaimed stale lease for execution ${execution._id}; requeued via outbox ` +
        `(attempt ${execution.retryCount + 1}/${maxAttempts})`,
      );
    } catch (err) {
      if (ownsSession) await session.abortTransaction();
      console.error(`Failed to requeue execution ${execution._id}:`, err.message);
    } finally {
      if (ownsSession) session.endSession();
    }
  }

  return { reclaimed, deadLettered, checked: candidates.length };
}

function startLeaseReclaimer(options = {}) {
  const intervalMs = options.intervalMs || 15000;
  const timer = setInterval(() => {
    reclaimStaleLeases(options).catch((err) => {
      console.error('Error during lease reclaim cycle:', err.message);
    });
  }, intervalMs);
  return timer;
}

module.exports = { reclaimStaleLeases, startLeaseReclaimer };