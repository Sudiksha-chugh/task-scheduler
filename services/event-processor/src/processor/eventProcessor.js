const { Queue } = require('bullmq');
const { calculateRetryBehavior } = require('./retryPolicy');
const { processDagOnNodeCompletion } = require('./dagEngine');
const { getRedisClient } = require('../config/redis');

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
  try {
    return require('../../../api-service/src/models');
  } catch (err) {
    const mongoose = require('mongoose');
    return {
      Execution: mongoose.model('Execution'),
      Job: mongoose.model('Job'),
      NodeExecution: mongoose.model('NodeExecution'),
      WorkflowRun: mongoose.model('WorkflowRun'),
    };
  }
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
  const executionQueue = getExecutionQueue(options.executionQueue);

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
      execution.status = 'PENDING';
      await execution.save();

      const retryPayload = {
        executionId: execution._id.toString(),
        jobId: (execution.job || (job && job._id)).toString(),
        tenantId,
      };

      if (options.onEnqueueRetry) {
        await options.onEnqueueRetry(retryPayload, delayMs);
      } else {
        await executionQueue.add('execution', retryPayload, { delay: delayMs });
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

    await processDagOnNodeCompletion(nodeExecution, options);
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
