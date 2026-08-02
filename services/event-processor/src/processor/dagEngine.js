const { Queue } = require('bullmq');
const { getRedisClient } = require('../config/redis');

let defaultExecutionQueue = null;

async function publishMonitoringEvent(redis, event) {
  try {
    if (redis && typeof redis.publish === 'function') {
      await redis.publish('monitoring:events', JSON.stringify(event));
    }
  } catch (err) {
    console.error('Failed to publish monitoring event from DAG engine:', err.message);
  }
}

function getMonitoringEventsHelper() {
  try {
    return require('../../../api-service/src/utils/monitoringEvents');
  } catch {
    return null;
  }
}

async function publishWorkflowRunStatus(run, status, options = {}) {
  const monitoringEvents = getMonitoringEventsHelper();
  if (!monitoringEvents) {
    return;
  }

  const redis = options.redis || getRedisClient();
  await publishMonitoringEvent(
    redis,
    monitoringEvents.buildWorkflowRunEvent({
      workflowRunId: run._id,
      tenantId: options.tenantId,
      status,
    }),
  );
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
      WorkflowRun: mongoose.model('WorkflowRun'),
      NodeExecution: mongoose.model('NodeExecution'),
      Execution: mongoose.model('Execution'),
      Job: mongoose.model('Job'),
    };
  }
}

/**
 * Returns all predecessor node IDs for a given nodeId from the DAG definition.
 */
function getPredecessorNodeIds(definition = {}, nodeId) {
  const edges = definition.edges || [];
  return edges
    .filter((edge) => String(edge.target) === String(nodeId))
    .map((edge) => String(edge.source));
}

/**
 * Returns all downstream child node IDs for a given nodeId from the DAG definition.
 */
function getDownstreamNodeIds(definition = {}, nodeId) {
  const edges = definition.edges || [];
  return edges
    .filter((edge) => String(edge.source) === String(nodeId))
    .map((edge) => String(edge.target));
}

/**
 * Checks if all predecessor nodes for a given nodeId have status === 'SUCCESS'.
 */
async function allPredecessorsSucceeded(workflowRunId, nodeId, definition, models) {
  const predecessorIds = getPredecessorNodeIds(definition, nodeId);
  if (predecessorIds.length === 0) {
    return true;
  }

  const { NodeExecution } = models;
  const predExecutions = await NodeExecution.find({
    workflowRun: workflowRunId,
    nodeId: { $in: predecessorIds },
  });

  if (predExecutions.length < predecessorIds.length) {
    return false;
  }

  return predExecutions.every((ne) => ne.status === 'SUCCESS');
}

/**
 * Handles DAG workflow node completion:
 * 1) Enqueues downstream children if all their predecessors succeeded.
 * 2) Marks WorkflowRun status SUCCESS/FAILED when appropriate.
 */
async function processDagOnNodeCompletion(nodeExecutionDoc, options = {}) {
  const models = getModels(options);
  const { WorkflowRun, NodeExecution, Execution } = models;
  const executionQueue = getExecutionQueue(options.executionQueue);

  const run = await WorkflowRun.findById(nodeExecutionDoc.workflowRun);
  if (!run) {
    return;
  }

  // Update WorkflowRun status to RUNNING if it's currently PENDING
  if (run.status === 'PENDING') {
    run.status = 'RUNNING';
    await run.save();
    await publishWorkflowRunStatus(run, run.status, options);
  }

  // If completed node succeeded, attempt fan-out to downstream nodes
  if (nodeExecutionDoc.status === 'SUCCESS') {
    const downstreamIds = getDownstreamNodeIds(run.definition, nodeExecutionDoc.nodeId);

    for (const childId of downstreamIds) {
      // Check if child node is already enqueued/running/finished
      const existingChildNode = await NodeExecution.findOne({
        workflowRun: run._id,
        nodeId: childId,
      });

      if (existingChildNode && existingChildNode.status !== 'PENDING') {
        continue;
      }

      const predsDone = await allPredecessorsSucceeded(run._id, childId, run.definition, models);
      if (predsDone && (!existingChildNode || !existingChildNode.execution)) {
        // Find child node spec from definition
        const nodesList = run.definition.nodes || [];
        const childNodeSpec = nodesList.find((n) => String(n.id) === String(childId));
        const childJobId = childNodeSpec
          ? childNodeSpec.jobId || (childNodeSpec.data && childNodeSpec.data.jobId)
          : null;

        if (childJobId) {
          // Create new Execution for child node
          const childExecution = new Execution({
            job: childJobId,
            status: 'PENDING',
          });
          await childExecution.save();

          // Create or update NodeExecution
          if (existingChildNode) {
            existingChildNode.execution = childExecution._id;
            existingChildNode.status = 'PENDING';
            await existingChildNode.save();
          } else {
            const createdNodeExecution = await NodeExecution.create({
              workflowRun: run._id,
              nodeId: childId,
              job: childJobId,
              execution: childExecution._id,
              status: 'PENDING',
            });

            const monitoringEvents = getMonitoringEventsHelper();
            if (monitoringEvents) {
              const redis = options.redis || getRedisClient();
              await publishMonitoringEvent(
                redis,
                monitoringEvents.buildNodeExecutionEvent({
                  workflowRunId: run._id,
                  nodeId: childId,
                  jobId: childJobId,
                  executionId: childExecution._id,
                  tenantId: options.tenantId,
                  status: createdNodeExecution.status,
                }),
              );
            }
          }

          // Enqueue onto execution-queue
          const payload = {
            executionId: childExecution._id.toString(),
            jobId: childJobId.toString(),
          };

          if (options.onEnqueue) {
            await options.onEnqueue(payload);
          } else {
            await executionQueue.add('execution', payload);
          }
        }
      }
    }
  }

  // Evaluate overall WorkflowRun status
  const allNodeExecutions = await NodeExecution.find({ workflowRun: run._id });
  const totalNodesInDef = (run.definition && run.definition.nodes && run.definition.nodes.length) || 0;

  const hasFailedNode = allNodeExecutions.some(
    (ne) => ne.status === 'FAILED' || ne.status === 'DEAD',
  );

  if (hasFailedNode) {
    run.status = 'FAILED';
    await run.save();
    await publishWorkflowRunStatus(run, run.status, options);
    return;
  }

  const successCount = allNodeExecutions.filter((ne) => ne.status === 'SUCCESS').length;
  if (totalNodesInDef > 0 && successCount === totalNodesInDef) {
    run.status = 'SUCCESS';
    await run.save();
    await publishWorkflowRunStatus(run, run.status, options);
  }
}

module.exports = {
  getPredecessorNodeIds,
  getDownstreamNodeIds,
  allPredecessorsSucceeded,
  processDagOnNodeCompletion,
  getExecutionQueue,
};
