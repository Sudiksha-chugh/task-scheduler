const mongoose = require('mongoose');
const { Queue } = require('bullmq');
const { calculateRetryBehavior } = require('./retryPolicy');
const { processDagOnNodeCompletion } = require('./dagEngine');
const { getRedisClient } = require('../config/redis');
const { getOutbox } = require('../outbox');

let defaultExecutionQueue = null;

async function publishMonitoringEvent(redis, event) {
  try {
    if (redis && typeof redis.publish === 'function') {
      await redis.publish('monitoring:events', JSON.stringify(event));
    }
  } catch (err) {
    console.error('Failed to publish monitoring event from event processor:', err.message);
  }
}

// Kept for test compatibility; not used on the normal production path anymore
// (retries now go through the outbox so they get the same crash-safety
// guarantee as every other dispatch path).
function getExecutionQueue(customQueue) {
  if (customQueue) {
    return customQueue;
  }
  if (!defaultExecutionQueue) {
    defaultExecutionQueue = new Queue('execution-queue', {
      connection: getRedisClient(),
    });
  }
  return defaultExecutionQueue;
}

function getModels(options = {}) {
  if (options.models) {
    return options.models;
  }
  return require('@jobflow/shared/models');
}

/**
 * Handles incoming execution result messages from "result-queue":
 * 1) Verifies result fencing token matches Execution current fencing token.
 * 2) Updates Execution and appends attempt record.
 * 3) Applies retry policy (exponential/linear/fixed) if FAILED and retries remain, else marks DEAD.
 * 4) If associated with a WorkflowRun node, triggers DAG fan-out/fan-in processing.
 *
 * @param {Object} bullJob - BullMQ job object
 * @param {Object} [options] - Optional overrides for testing
 * @returns {Promise<Object>} Summary object
 */
async function processEventResult(bullJob, options = {}) {
  const result = bullJob.data || {};
  const executionId = result.executionId;

  if (!executionId) {
    throw new Error('Result payload must contain executionId');
  }

  const redis = options.redis || getRedisClient();
  const { Execution, Job, NodeExecution, Project } = getModels(options);

  const execution = await Execution.findById(executionId);
  if (!execution) {
    console.error(`Execution ${executionId} not found in database.`);
    return { status: 'REJECTED', reason: 'execution_not_found' };
  }

  // 1) Verify the result's fencing token matches the Execution's current fencing token
  if (
    result.fencingToken !== undefined &&
    execution.fencingToken !== undefined &&
    String(result.fencingToken) !== String(execution.fencingToken)
  ) {
    console.warn(
      `Stale result fencing token ${result.fencingToken} for execution ${executionId} (current: ${execution.fencingToken}). Rejecting result.`,
    );
    return { status: 'REJECTED', reason: 'stale_fencing_token' };
  }

  // 2) Update Execution and append attempt record
  const attemptRecord = {
    httpStatusCode: result.httpStatusCode,
    responseBody: result.responseBody,
    errorMessage: result.errorMessage,
    startedAt: result.startedAt ? new Date(result.startedAt) : new Date(),
    finishedAt: result.finishedAt ? new Date(result.finishedAt) : new Date(),
  };

  if (!execution.attempts) {
    execution.attempts = [];
  }
  execution.attempts.push(attemptRecord);

  // Load associated Job for retry policy calculation and tenant resolution
  const job = await Job.findById(execution.job);
  let tenantId = result.tenantId || options.tenantId;

  if (!tenantId && job && job.project && Project) {
    try {
      const projectDoc = await Project.findById(job.project);
      if (projectDoc) {
        tenantId = projectDoc.tenant ? projectDoc.tenant.toString() : null;
      }
    } catch {
      // ignore
    }
  }

  if (result.status === 'SUCCESS') {
    execution.status = 'SUCCESS';
    await execution.save();
  } else {
    // 3) Apply retry policy if FAILED
    execution.retryCount = (execution.retryCount || 0) + 1;
    const { shouldRetry, delayMs, nextStatus } = calculateRetryBehavior(
      job || {},
      execution.retryCount,
    );

    if (shouldRetry) {
      // Execution save + outbox write happen in one transaction: if the
      // process dies between them, we don't end up with an execution
      // stuck at PENDING that nothing will ever pick back up.
      const { createOutboxEvent } = getOutbox(options);
      const session = options.session || (await mongoose.startSession());
      const ownsSession = !options.session;
      if (ownsSession) session.startTransaction();

      try {
        execution.status = 'PENDING';
        await execution.save({ session });

        const retryPayload = {
          executionId: execution._id.toString(),
          jobId: (execution.job || (job && job._id)).toString(),
          tenantId,
          retry: true,
          delayMs,
        };

        if (options.onEnqueueRetry) {
          // test hook -- bypasses outbox, calls the provided function directly
          await options.onEnqueueRetry(retryPayload, delayMs);
        } else {
          await createOutboxEvent(
            {
              aggregateType: 'Execution',
              aggregateId: execution._id,
              eventType: 'EXECUTION_CREATED',
              payload: retryPayload,
            },
            session,
          );
        }

        if (ownsSession) await session.commitTransaction();
      } catch (err) {
        if (ownsSession) await session.abortTransaction();
        throw err;
      } finally {
        if (ownsSession) session.endSession();
      }
    } else {
      execution.status = nextStatus || 'DEAD';
      await execution.save();
    }
  }

  // Publish execution status monitoring event
  await publishMonitoringEvent(redis, {
    type: 'execution_status',
    executionId: execution._id.toString(),
    jobId: (execution.job || (job && job._id) || '').toString(),
    tenantId,
    status: execution.status,
    retryCount: execution.retryCount || 0,
    timestamp: Date.now(),
  });

  // 4) If the execution belongs to a WorkflowRun node, run DAG fan-out/fan-in
  const nodeExecution = await NodeExecution.findOne({ execution: execution._id });
  if (nodeExecution) {
    nodeExecution.status = execution.status;
    await nodeExecution.save();

    const monitoringEvents = require('@jobflow/shared/utils/monitoringEvents');

    if (monitoringEvents) {
      await publishMonitoringEvent(
        redis,
        monitoringEvents.buildNodeExecutionEvent({
          workflowRunId: nodeExecution.workflowRun,
          nodeId: nodeExecution.nodeId,
          jobId: nodeExecution.job,
          executionId: execution._id,
          tenantId,
          status: nodeExecution.status,
        }),
      );
    }

    await processDagOnNodeCompletion(nodeExecution, { ...options, redis, tenantId });
  }

  return {
    status: execution.status,
    executionId: execution._id.toString(),
    fencingTokenVerified: true,
  };
}

module.exports = {
  processEventResult,
  getExecutionQueue,
};
