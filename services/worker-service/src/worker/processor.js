const defaultAxios = require('axios');
const { Queue } = require('bullmq');
const { acquireLease, verifyLease, refreshLease, releaseLease } = require('../lease/leaseManager');
const { getRedisClient } = require('../config/redis');

let defaultResultQueue = null;

async function publishMonitoringEvent(redis, event) {
  try {
    if (redis && typeof redis.publish === 'function') {
      await redis.publish('monitoring:events', JSON.stringify(event));
    }
  } catch (err) {
    console.error('Failed to publish monitoring event from worker processor:', err.message);
  }
}

function getResultQueue(customQueue) {
  if (customQueue) {
    return customQueue;
  }
  if (!defaultResultQueue) {
    defaultResultQueue = new Queue('result-queue', {
      connection: getRedisClient(),
    });
  }
  return defaultResultQueue;
}

function getMonitoringEventsHelper() {
  try {
    return require('../../../services/api-service/src/utils/monitoringEvents');
  } catch {
    try {
      return require('../../../api-service/src/utils/monitoringEvents');
    } catch {
      return null;
    }
  }
}

async function publishWorkflowNodeStatus(redis, nodeExecution, status, tenantId, executionId) {
  const monitoringEvents = getMonitoringEventsHelper();
  if (!monitoringEvents || !nodeExecution) {
    return;
  }

  await publishMonitoringEvent(
    redis,
    monitoringEvents.buildNodeExecutionEvent({
      workflowRunId: nodeExecution.workflowRun,
      nodeId: nodeExecution.nodeId,
      jobId: nodeExecution.job,
      executionId: executionId || nodeExecution.execution,
      tenantId,
      status,
    }),
  );
}

function getModels(options = {}) {
  if (options.models) {
    return options.models;
  }
  try {
    return require('../../../services/api-service/src/models');
  } catch (err) {
    const mongoose = require('mongoose');
    return {
      Execution: mongoose.model('Execution'),
      Job: mongoose.model('Job'),
    };
  }
}

/**
 * Process a single execution job:
 * 1) Claim lease via Redis SET NX PX with fencing token
 * 2) Update Execution status to LEASED then RUNNING
 * 3) Dispatch HTTP request to job.targetUrl using axios
 * 4) Send heartbeats (refreshed every 10s while running)
 * 5) Re-check fencing token before publishing result (discard if stolen)
 * 6) Publish result to "result-queue"
 *
 * @param {Object} bullJob - BullMQ job object
 * @param {Object} [options] - Options for overrides (testing)
 * @returns {Promise<Object>} Execution result object
 */
async function processExecutionJob(bullJob, options = {}) {
  const data = bullJob.data || {};
  const executionId = data.executionId || (data.payload && data.payload.executionId);
  const jobId = data.jobId || (data.payload && data.payload.jobId);

  if (!executionId) {
    throw new Error('Job payload must contain executionId');
  }

  const redis = options.redis || getRedisClient();
  const resultQueue = getResultQueue(options.resultQueue);
  const axiosClient = options.axios || defaultAxios;
  const { Execution, Job, NodeExecution } = getModels(options);

  const leaseTtlMs = options.leaseTtlMs || 30000;
  const heartbeatIntervalMs = options.heartbeatIntervalMs || 10000;

  // 1) Claim lease via Redis SET NX PX with an incrementing fencing token
  const { acquired, fencingToken } = await acquireLease(executionId, {
    ttlMs: leaseTtlMs,
    redis,
  });

  if (!acquired) {
    console.log(`Lease for execution ${executionId} already claimed. Skipping job.`);
    return { status: 'SKIPPED', reason: 'already_leased' };
  }

  // 2) Update Execution status to LEASED then RUNNING with fencingToken
  const executionDoc = await Execution.findById(executionId);
  if (!executionDoc) {
    console.error(`Execution ${executionId} not found in database.`);
    await releaseLease(executionId, fencingToken, { redis });
    return { status: 'FAILED', reason: 'execution_not_found' };
  }

  // Load Job details to get tenantId if available
  const jobDoc = await Job.findById(executionDoc.job || jobId);
  const nodeExecutionDoc = NodeExecution
    ? await NodeExecution.findOne({ execution: executionDoc._id })
    : null;
  let tenantId = options.tenantId || (data.tenantId || (data.payload && data.payload.tenantId));

  if (!tenantId && jobDoc && jobDoc.project) {
    try {
      const { Project } = getModels(options);
      if (Project) {
        const projectDoc = await Project.findById(jobDoc.project);
        if (projectDoc) {
          tenantId = projectDoc.tenant ? projectDoc.tenant.toString() : null;
        }
      }
    } catch {
      // ignore
    }
  }

  executionDoc.status = 'LEASED';
  executionDoc.fencingToken = fencingToken;
  await executionDoc.save();

  await publishMonitoringEvent(redis, {
    type: 'execution_status',
    executionId: executionDoc._id.toString(),
    jobId: (jobDoc ? jobDoc._id : jobId || '').toString(),
    tenantId,
    status: 'LEASED',
    fencingToken,
    timestamp: Date.now(),
  });
  if (nodeExecutionDoc) {
    nodeExecutionDoc.status = 'LEASED';
    await nodeExecutionDoc.save();
    await publishWorkflowNodeStatus(
      redis,
      nodeExecutionDoc,
      'LEASED',
      tenantId,
      executionDoc._id,
    );
  }

  executionDoc.status = 'RUNNING';
  await executionDoc.save();

  await publishMonitoringEvent(redis, {
    type: 'execution_status',
    executionId: executionDoc._id.toString(),
    jobId: (jobDoc ? jobDoc._id : jobId || '').toString(),
    tenantId,
    status: 'RUNNING',
    fencingToken,
    timestamp: Date.now(),
  });
  if (nodeExecutionDoc) {
    nodeExecutionDoc.status = 'RUNNING';
    await nodeExecutionDoc.save();
    await publishWorkflowNodeStatus(
      redis,
      nodeExecutionDoc,
      'RUNNING',
      tenantId,
      executionDoc._id,
    );
  }

  if (!jobDoc) {
    console.error(`Job for execution ${executionId} not found in database.`);
    executionDoc.status = 'FAILED';
    await executionDoc.save();
    await releaseLease(executionId, fencingToken, { redis });
    return { status: 'FAILED', reason: 'job_not_found' };
  }

  // 6) Heartbeat timer (refreshed every 10s while running)
  let heartbeatTimer = null;
  heartbeatTimer = setInterval(async () => {
    try {
      await refreshLease(executionId, fencingToken, leaseTtlMs, { redis, tenantId });
    } catch (err) {
      console.error(`Error sending heartbeat for execution ${executionId}:`, err.message);
    }
  }, heartbeatIntervalMs);

  let responseStatusCode = null;
  let responseBody = null;
  let errorMessage = null;
  let executionStatus = 'FAILED';
  const startedAt = new Date();

  // 3) Dispatch HTTP request using axios
  try {
    const method = (jobDoc.httpMethod || 'POST').toLowerCase();
    const timeout = (jobDoc.timeoutSeconds || 30) * 1000;

    const response = await axiosClient({
      method,
      url: jobDoc.targetUrl,
      headers: jobDoc.headers || {},
      data: jobDoc.body || null,
      timeout,
    });

    responseStatusCode = response.status;
    responseBody =
      typeof response.data === 'object'
        ? JSON.stringify(response.data)
        : String(response.data || '');

    if (response.status >= 200 && response.status < 300) {
      executionStatus = 'SUCCESS';
    } else {
      executionStatus = 'FAILED';
      errorMessage = `HTTP status code ${response.status}`;
    }
  } catch (error) {
    executionStatus = 'FAILED';
    if (error.response) {
      responseStatusCode = error.response.status;
      responseBody =
        typeof error.response.data === 'object'
          ? JSON.stringify(error.response.data)
          : String(error.response.data || '');
      errorMessage = error.message;
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = `Request timed out after ${jobDoc.timeoutSeconds || 30} seconds`;
    } else {
      errorMessage = error.message;
    }
  } finally {
    if (heartbeatTimer) {
      clearInterval(heartbeatTimer);
    }
  }

  const finishedAt = new Date();

  // 4) Before publishing the result, re-check the lease's fencing token is still current
  const isLeaseCurrent = await verifyLease(executionId, fencingToken, { redis });
  if (!isLeaseCurrent) {
    console.warn(
      `Fencing token mismatch for execution ${executionId}. Expected token ${fencingToken}. Discarding result.`,
    );
    return { status: 'DISCARDED', reason: 'fencing_token_invalid' };
  }

  // Record attempt on Execution document
  executionDoc.status = executionStatus;
  executionDoc.attempts.push({
    httpStatusCode: responseStatusCode,
    responseBody,
    errorMessage,
    startedAt,
    finishedAt,
  });
  await executionDoc.save();

  await publishMonitoringEvent(redis, {
    type: 'execution_status',
    executionId: executionDoc._id.toString(),
    jobId: jobDoc._id.toString(),
    tenantId,
    status: executionStatus,
    fencingToken,
    timestamp: Date.now(),
  });

  // 5) Publish result to "result-queue"
  const resultPayload = {
    executionId: executionDoc._id.toString(),
    jobId: jobDoc._id.toString(),
    tenantId,
    status: executionStatus,
    fencingToken,
    httpStatusCode: responseStatusCode,
    responseBody,
    errorMessage,
    startedAt,
    finishedAt,
  };

  await resultQueue.add('execution-result', resultPayload);

  await releaseLease(executionId, fencingToken, { redis, tenantId });

  return resultPayload;
}

module.exports = {
  processExecutionJob,
  getResultQueue,
};
