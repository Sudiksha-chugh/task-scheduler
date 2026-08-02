const express = require('express');
const authRoutes = require('./routes/authRoutes');
const monitoringRoutes = require('./routes/monitoringRoutes');
const projectRoutes = require('./routes/projectRoutes');
const jobRoutes = require('./routes/jobRoutes');
const projectJobRoutes = require('./routes/projectJobRoutes');
const executionRoutes = require('./routes/executionRoutes');
const workflowRoutes = require('./routes/workflowRoutes');
const { AppError } = require('./utils/errors');

function createApp() {
  const app = express();

  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/monitoring', monitoringRoutes);
  app.use('/api/v1/projects', projectRoutes);
  app.use('/api/v1/projects/:projectId/jobs', projectJobRoutes);
  app.use('/api/v1/projects/:projectId/workflows', workflowRoutes);
  app.use('/api/v1/jobs', jobRoutes);
  app.use('/api/v1/executions', executionRoutes);

  app.use((err, _req, res, _next) => {
    if (err instanceof AppError) {
      return res.status(err.statusCode).json({
        error: {
          code: err.code,
          message: err.message,
        },
      });
    }

    console.error(err);
    return res.status(500).json({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Internal server error',
      },
    });
  });

  return app;
}

module.exports = { createApp };
