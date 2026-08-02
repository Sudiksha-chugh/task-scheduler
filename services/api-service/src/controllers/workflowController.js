const mongoose = require('mongoose');
const Project = require('../models/Project');
const Job = require('../models/Job');
const Execution = require('../models/Execution');
const WorkflowDefinition = require('../models/WorkflowDefinition');
const WorkflowRun = require('../models/WorkflowRun');
const NodeExecution = require('../models/NodeExecution');
const { createOutboxEvent } = require('../outbox');
const { AppError } = require('../utils/errors');
const {
  getNodeJobId,
  getEntryNodeIds,
  validateWorkflowDefinition,
} = require('../utils/dagValidation');
const {
  publishMonitoringEvent,
  buildNodeExecutionEvent,
  buildWorkflowRunEvent,
} = require('../utils/monitoringEvents');

function handleError(res, error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
  }

  if (error.message === 'CYCLE_DETECTED') {
    return res.status(400).json({
      error: {
        code: 'CYCLE_DETECTED',
        message: 'Workflow definition contains a cycle and must be a DAG',
      },
    });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: error.message },
    });
  }

  console.error(error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}

async function assertProjectAccess(projectId, tenantId) {
  const project = await Project.findOne({ _id: projectId, tenant: tenantId }).lean();
  if (!project) {
    throw new AppError('Project not found', 404, 'NOT_FOUND');
  }
  return project;
}

async function listWorkflows(req, res) {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(projectId, req.user.tenant);

    const workflows = await WorkflowDefinition.find({ project: projectId })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ workflows });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createWorkflow(req, res) {
  try {
    const { projectId } = req.params;
    const project = await assertProjectAccess(projectId, req.user.tenant);

    const { name, definition } = req.body;
    if (!name || !String(name).trim()) {
      throw new AppError('Workflow name is required', 400, 'VALIDATION_ERROR');
    }

    validateWorkflowDefinition(definition);

    const workflow = await WorkflowDefinition.create({
      project: project._id,
      name: String(name).trim(),
      definition,
    });

    return res.status(201).json(workflow);
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateWorkflow(req, res) {
  try {
    const { projectId, workflowId } = req.params;
    await assertProjectAccess(projectId, req.user.tenant);

    const { name, definition } = req.body;
    if (!name || !String(name).trim()) {
      throw new AppError('Workflow name is required', 400, 'VALIDATION_ERROR');
    }

    validateWorkflowDefinition(definition);

    const workflow = await WorkflowDefinition.findOneAndUpdate(
      { _id: workflowId, project: projectId },
      {
        name: String(name).trim(),
        definition,
      },
      { new: true, runValidators: true },
    ).lean();

    if (!workflow) {
      throw new AppError('Workflow not found', 404, 'NOT_FOUND');
    }

    return res.status(200).json(workflow);
  } catch (error) {
    return handleError(res, error);
  }
}

async function triggerWorkflow(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { projectId, workflowId } = req.params;
    const project = await assertProjectAccess(projectId, req.user.tenant);

    const workflow = await WorkflowDefinition.findOne({
      _id: workflowId,
      project: projectId,
    }).session(session);

    if (!workflow) {
      throw new AppError('Workflow not found', 404, 'NOT_FOUND');
    }

    validateWorkflowDefinition(workflow.definition);

    const entryNodeIds = getEntryNodeIds(workflow.definition);
    if (entryNodeIds.length === 0) {
      throw new AppError(
        'Workflow has no entry nodes. Remove cycles or add root nodes.',
        400,
        'INVALID_DAG',
      );
    }

    const [workflowRun] = await WorkflowRun.create(
      [
        {
          workflowDefinition: workflow._id,
          status: 'PENDING',
          definition: workflow.definition,
        },
      ],
      { session },
    );

    const nodesById = new Map(
      (workflow.definition.nodes || []).map((node) => [String(node.id), node]),
    );

    const nodeExecutions = [];

    for (const nodeId of entryNodeIds) {
      const nodeSpec = nodesById.get(nodeId);
      const jobId = getNodeJobId(nodeSpec);

      const job = await Job.findOne({ _id: jobId, project: projectId }).session(session);
      if (!job) {
        throw new AppError(`Job not found for node "${nodeId}"`, 404, 'NOT_FOUND');
      }

      if (!job.enabled) {
        throw new AppError(`Job "${job.name}" is disabled`, 400, 'JOB_DISABLED');
      }

      const [execution] = await Execution.create([{ job: job._id, status: 'PENDING' }], {
        session,
      });

      const [nodeExecution] = await NodeExecution.create(
        [
          {
            workflowRun: workflowRun._id,
            nodeId,
            job: job._id,
            execution: execution._id,
            status: 'PENDING',
          },
        ],
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
            workflowRunId: workflowRun._id.toString(),
            nodeId,
          },
        },
        session,
      );

      nodeExecutions.push(nodeExecution);
    }

    workflowRun.status = 'RUNNING';
    await workflowRun.save({ session });

    await session.commitTransaction();

    const tenantId = project.tenant ? project.tenant.toString() : req.user.tenant.toString();

    await publishMonitoringEvent(
      buildWorkflowRunEvent({
        workflowRunId: workflowRun._id,
        tenantId,
        status: workflowRun.status,
      }),
    );

    for (const nodeExecution of nodeExecutions) {
      await publishMonitoringEvent(
        buildNodeExecutionEvent({
          workflowRunId: workflowRun._id,
          nodeId: nodeExecution.nodeId,
          jobId: nodeExecution.job,
          executionId: nodeExecution.execution,
          tenantId,
          status: nodeExecution.status,
        }),
      );
    }

    return res.status(201).json({
      workflowRun: workflowRun.toObject(),
      nodeExecutions: nodeExecutions.map((doc) => doc.toObject()),
    });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error);
  } finally {
    session.endSession();
  }
}

module.exports = {
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  triggerWorkflow,
};
