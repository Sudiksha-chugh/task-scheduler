const mongoose = require('mongoose');
const { Queue } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const { getOutbox } = require('../outbox');

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
  return require('@jobflow/shared/utils/monitoringEvents');
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

// Kept for test compatibility (options.onEnqueue can still be passed to bypass
// the outbox in tests); not used on the normal production path anymore.
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

function getPredecessorNodeIds(definition = {}, nodeId) {
  const edges = definition.edges || [];
  return edges
    .filter((edge) => String(edge.target) === String(nodeId))
    .map((edge) => String(edge.source));
}

function getDownstreamNodeIds(definition = {}, nodeId) {
  const edges = definition.edges || [];
  return edges
    .filter((edge) => String(edge.source) === String(nodeId))
    .map((edge) => String(edge.target));
}

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
 * Creates the child Execution (+ NodeExecution) and dispatches it via the
 * outbox pattern -- Execution/NodeExecution writes and the OutboxEvent that
 * will eventually push it onto execution-queue all happen in one Mongo
 * transaction, so a crash mid-fan-out can't leave an orphaned PENDING
 * execution that nothing will ever pick up.
 */
async function createAndDispatchChildExecution(run, childId, childJobId, existingChildNode, options) {
  const { Execution, NodeExecution } = getModels(options);
  const { createOutboxEvent } = getOutbox(options);

  const session = options.session || (await mongoose.startSession());
  const ownsSession = !options.session;
  if (ownsSession) session.startTransaction();

  let childExecution;
  let createdNodeExecution = null;

  try {
    [childExecution] = await Execution.create(
      [{ job: childJobId, status: 'PENDING' }],
      { session },
    );

    if (existingChildNode) {
      existingChildNode.execution = childExecution._id;
      existingChildNode.status = 'PENDING';
      await existingChildNode.save({ session });
    } else {
      [createdNodeExecution] = await NodeExecution.create(
        [
          {
            workflowRun: run._id,
            nodeId: childId,
            job: childJobId,
            execution: childExecution._id,
            status: 'PENDING',
          },
        ],
        { session },
      );
    }

    const payload = {
      executionId: childExecution._id.toString(),
      jobId: childJobId.toString(),
    };

    if (options.onEnqueue) {
      // test hook -- bypasses outbox, calls the provided function directly
      await options.onEnqueue(payload);
    } else {
      await createOutboxEvent(
        {
          aggregateType: 'Execution',
          aggregateId: childExecution._id,
          eventType: 'EXECUTION_CREATED',
          payload,
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

  return { childExecution, createdNodeExecution };
}

async function processDagOnNodeCompletion(nodeExecutionDoc, options = {}) {
  const models = getModels(options);
  const { WorkflowRun, NodeExecution } = models;

  const run = await WorkflowRun.findById(nodeExecutionDoc.workflowRun);
  if (!run) {
    return;
  }

  if (run.status === 'PENDING') {
    run.status = 'RUNNING';
    await run.save();
    await publishWorkflowRunStatus(run, run.status, options);
  }

  if (nodeExecutionDoc.status === 'SUCCESS') {
    const downstreamIds = getDownstreamNodeIds(run.definition, nodeExecutionDoc.nodeId);

    for (const childId of downstreamIds) {
      const existingChildNode = await NodeExecution.findOne({
        workflowRun: run._id,
        nodeId: childId,
      });

      if (existingChildNode && existingChildNode.status !== 'PENDING') {
        continue;
      }

      const predsDone = await allPredecessorsSucceeded(run._id, childId, run.definition, models);
      if (predsDone && (!existingChildNode || !existingChildNode.execution)) {
        const nodesList = run.definition.nodes || [];
        const childNodeSpec = nodesList.find((n) => String(n.id) === String(childId));
        const childJobId = childNodeSpec
          ? childNodeSpec.jobId || (childNodeSpec.data && childNodeSpec.data.jobId)
          : null;

        if (childJobId) {
          const { childExecution, createdNodeExecution } = await createAndDispatchChildExecution(
            run,
            childId,
            childJobId,
            existingChildNode,
            options,
          );

          if (createdNodeExecution) {
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
        }
      }
    }
  }

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
