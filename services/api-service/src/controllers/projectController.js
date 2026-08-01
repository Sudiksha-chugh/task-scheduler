const Project = require('../models/Project');
const { AppError } = require('../utils/errors');

function handleError(res, error) {
  if (error instanceof AppError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message },
    });
  }

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: { code: 'VALIDATION_ERROR', message: error.message },
    });
  }

  if (error.code === 11000) {
    return res.status(409).json({
      error: { code: 'CONFLICT', message: 'A project with this slug already exists' },
    });
  }

  console.error(error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
  });
}

async function listProjects(req, res) {
  try {
    const projects = await Project.find({ tenant: req.user.tenant })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ projects });
  } catch (error) {
    return handleError(res, error);
  }
}

async function createProject(req, res) {
  try {
    const { name, slug, description } = req.body;

    if (!name || !slug) {
      throw new AppError('Name and slug are required', 400, 'VALIDATION_ERROR');
    }

    const project = await Project.create({
      tenant: req.user.tenant,
      name: String(name).trim(),
      slug: String(slug).trim().toLowerCase(),
      description: description ? String(description).trim() : undefined,
    });

    return res.status(201).json(project);
  } catch (error) {
    return handleError(res, error);
  }
}

async function getProjectById(req, res) {
  try {
    const project = await Project.findOne({
      _id: req.params.projectId,
      tenant: req.user.tenant,
    }).lean();

    if (!project) {
      throw new AppError('Project not found', 404, 'NOT_FOUND');
    }

    return res.status(200).json(project);
  } catch (error) {
    return handleError(res, error);
  }
}

module.exports = {
  listProjects,
  createProject,
  getProjectById,
};
