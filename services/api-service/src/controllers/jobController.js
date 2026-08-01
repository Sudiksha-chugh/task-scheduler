const mongoose = require('mongoose');
const Job = require('../models/Job');
const Execution = require('../models/Execution');
const Project = require('../models/Project');
const { createOutboxEvent } = require('../outbox');
const { AppError } = require('../utils/errors');
const { validateJobBody, validateJobListQuery } = require('../validators/jobValidator');

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

async function getTenantProjectIds(tenantId) {
  const projects = await Project.find({ tenant: tenantId }).select('_id').lean();
  return projects.map((p) => p._id);
}

async function assertProjectAccess(projectId, tenantId) {
  const project = await Project.findOne({ _id: projectId, tenant: tenantId }).lean();
  if (!project) {
    throw new AppError('Project not found', 404, 'NOT_FOUND');
  }
  return project;
}

async function assertJobAccess(jobId, tenantId) {
  const job = await Job.findById(jobId).populate('project', 'tenant name slug').lean();
  if (!job) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }

  const projectTenant = job.project?.tenant || job.project;
  if (String(projectTenant) !== String(tenantId)) {
    throw new AppError('Job not found', 404, 'NOT_FOUND');
  }

  return job;
}

async function listJobs(req, res) {
  try {
    const { page, limit, sortBy, sortOrder } = validateJobListQuery(req.query);
    const projectId = req.params.projectId;

    const filter = {};

    if (projectId) {
      await assertProjectAccess(projectId, req.user.tenant);
      filter.project = projectId;
    } else {
      const projectIds = await getTenantProjectIds(req.user.tenant);
      filter.project = { $in: projectIds };
    }

    const sort = { [sortBy]: sortOrder === 'asc' ? 1 : -1 };
    const skip = (page - 1) * limit;

    const [jobs, total] = await Promise.all([
      Job.find(filter)
        .populate('project', 'name slug')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Job.countDocuments(filter),
    ]);

    return res.status(200).json({
      jobs,
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

async function createJob(req, res) {
  try {
    const { projectId } = req.params;
    await assertProjectAccess(projectId, req.user.tenant);

    const body = validateJobBody(req.body);
    const job = await Job.create({
      ...body,
      project: projectId,
    });

    const populated = await Job.findById(job._id).populate('project', 'name slug').lean();
    return res.status(201).json(populated);
  } catch (error) {
    return handleError(res, error);
  }
}

async function getJobById(req, res) {
  try {
    const job = await assertJobAccess(req.params.jobId, req.user.tenant);
    return res.status(200).json(job);
  } catch (error) {
    return handleError(res, error);
  }
}

async function updateJob(req, res) {
  try {
    const existing = await Job.findById(req.params.jobId).populate('project', 'tenant');
    if (!existing) {
      throw new AppError('Job not found', 404, 'NOT_FOUND');
    }

    if (String(existing.project.tenant) !== String(req.user.tenant)) {
      throw new AppError('Job not found', 404, 'NOT_FOUND');
    }

    const body = validateJobBody(req.body);

    Object.assign(existing, body);
    await existing.save();

    const updated = await Job.findById(existing._id).populate('project', 'name slug').lean();
    return res.status(200).json(updated);
  } catch (error) {
    return handleError(res, error);
  }
}

async function triggerJob(req, res) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { projectId, jobId } = req.params;
    await assertProjectAccess(projectId, req.user.tenant);

    const job = await Job.findOne({ _id: jobId, project: projectId }).session(session);
    if (!job) {
      throw new AppError('Job not found', 404, 'NOT_FOUND');
    }

    if (!job.enabled) {
      throw new AppError('Job is disabled', 400, 'JOB_DISABLED');
    }

    const [execution] = await Execution.create(
      [{ job: job._id, status: 'PENDING' }],
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
        },
      },
      session,
    );

    job.lastRunAt = new Date();
    await job.save({ session });

    await session.commitTransaction();

    const populated = await Execution.findById(execution._id)
      .populate({ path: 'job', select: 'name targetUrl project', populate: { path: 'project', select: 'name slug' } })
      .lean();

    return res.status(201).json({ execution: populated });
  } catch (error) {
    await session.abortTransaction();
    return handleError(res, error);
  } finally {
    session.endSession();
  }
}

module.exports = {
  listJobs,
  createJob,
  getJobById,
  updateJob,
  triggerJob,
};
