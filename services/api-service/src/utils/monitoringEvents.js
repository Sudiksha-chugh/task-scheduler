const { getRedisClient } = require('../config/redis');

async function publishMonitoringEvent(event, redis = getRedisClient()) {
  try {
    if (redis && typeof redis.publish === 'function') {
      await redis.publish('monitoring:events', JSON.stringify(event));
    }
  } catch (err) {
    console.error('Failed to publish monitoring event:', err.message);
  }
}

function buildNodeExecutionEvent({
  workflowRunId,
  nodeId,
  jobId,
  executionId,
  tenantId,
  status,
}) {
  return {
    type: 'node_execution_updated',
    eventType: 'NODE_EXECUTION_UPDATED',
    workflowRunId: String(workflowRunId),
    nodeId: String(nodeId),
    jobId: jobId ? String(jobId) : undefined,
    executionId: executionId ? String(executionId) : undefined,
    tenantId: tenantId ? String(tenantId) : undefined,
    status,
    payload: {
      workflowRunId: String(workflowRunId),
      nodeId: String(nodeId),
      jobId: jobId ? String(jobId) : undefined,
      executionId: executionId ? String(executionId) : undefined,
      status,
    },
    timestamp: Date.now(),
  };
}

function buildWorkflowRunEvent({ workflowRunId, tenantId, status }) {
  return {
    type: 'workflow_run_updated',
    eventType: 'WORKFLOW_RUN_UPDATED',
    workflowRunId: String(workflowRunId),
    tenantId: tenantId ? String(tenantId) : undefined,
    status,
    payload: {
      workflowRunId: String(workflowRunId),
      status,
    },
    timestamp: Date.now(),
  };
}

module.exports = {
  publishMonitoringEvent,
  buildNodeExecutionEvent,
  buildWorkflowRunEvent,
};
