const mongoose = require('mongoose');
const Execution = require('../models/Execution');
const Job = require('../models/Job');
const Project = require('../models/Project');
const { createOutboxEvent } = require('../outbox');
const { AppError } = require('../utils/errors');
const { validateExecutionListQuery } = require('../validators/jobValidator');

function handleError(res, error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
  }

  if (error.name === 'ZodError') {
    return res.status(400).json({
      error: {
        code: 'VALIDATION_ERROR',
        message: error.issues?.[0]?.message || 'Validation failed',
      },
    });
  }

  console.error(error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}

async function getTenantJobIds(tenantId) {
  const projects = await Project.find({ tenant: tenantId }).select('_id').lean();
  const projectIds = projects.map((p) => p._id);
  const jobs = await Job.find({ project: { $in: projectIds } }).select('_id').lean();
  return jobs.map((j) => j._id);
}

async function assertExecutionAccess(executionId, tenantId) {
  const execution = await Execution.findById(executionId)
    .populate({
      path: 'job',
      select: 'name targetUrl project retryMaxAttempts',
      populate: { path: 'project', select: 'tenant name slug' },
    })
    .lean();

  if (!execution) {
    throw new AppError('Execution not found', 404, 'NOT_FOUND');
  }

  const projectTenant = execution.job?.project?.tenant;
  if (String(projectTenant) !== String(tenantId)) {
    throw new AppError('Execution not found', 404, 'NOT_FOUND');
  }

  return execution;
}

async function listExecutions(req, res) {
  try {
    const { status, jobId, startDate, endDate, page, limit } = validateExecutionListQuery(
      req.query,
    );

    const jobIds = await getTenantJobIds(req.user.tenant);
    const filter = { job: { $in: jobIds } };

    if (status) {
      filter.status = status;
    }

    if (jobId) {
      const allowed = jobIds.some((id) => String(id) === String(jobId));
      if (!allowed) {
        throw new AppError('Job not found', 404, 'NOT_FOUND');
      }
      filter.job = jobId;
    }

    if (startDate || endDate) {
      filter.createdAt = {};
      if (startDate) {
        filter.createdAt.$gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        if (String(endDate).length <= 10) {
          end.setHours(23, 59, 59, 999);
        }
        filter.createdAt.$lte = end;
      }
    }

    const skip = (page - 1) * limit;

    const [executions, total] = await Promise.all([
      Execution.find(filter)
        .populate({
          path: 'job',
          select: 'name targetUrl',
          populate: { path: 'project', select: 'name slug' },
        })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Execution.countDocuments(filter),
    ]);

    return res.status(200).json({
      executions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    });
  } catch (error) {
    return handleError(res, error);
  }
}

async function getExecutionById(req, res) {
  try {
    const execution = await assertExecutionAccess(req.params.id, req.user.tenant);
    return res.status(200).json(execution);
  } catch (error) {
    return handleError(res, error);
  }
}

async function retryExecution(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const execution = await Execution.findById(req.params.id)
      .populate({ path: 'job', select: 'targetUrl project', populate: { path: 'project', select: 'tenant' } })
      .session(session);

    if (!execution) {
      throw new AppError('Execution not found', 404, 'NOT_FOUND');
    }

    if (String(execution.job.project.tenant) !== String(req.user.tenant)) {
      throw new AppError('Execution not found', 404, 'NOT_FOUND');
    }

    if (!['FAILED', 'DEAD'].includes(execution.status)) {
      throw new AppError('Only failed or dead executions can be retried', 400, 'INVALID_STATE');
    }

    execution.status = 'PENDING';
    execution.retryCount = (execution.retryCount || 0) + 1;
    execution.fencingToken = undefined;
    await execution.save({ session });

    await createOutboxEvent(
      {
        aggregateType: 'Execution',
        aggregateId: execution._id,
        eventType: 'EXECUTION_CREATED',
        payload: {
          executionId: execution._id.toString(),
          jobId: execution.job._id.toString(),
          targetUrl: execution.job.targetUrl,
          retry: true,
        },
      },
      session,
    );

    await session.commitTransaction();

    const populated = await Execution.findById(execution._id)
      .populate({
        path: 'job',
        select: 'name targetUrl',
        populate: { path: 'project', select: 'name slug' },
      })
      .lean();

    return res.status(200).json({ execution: populated });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error);
  } finally {
    session.endSession();
  }
}

module.exports = {
  listExecutions,
  getExecutionById,
  retryExecution,
};
