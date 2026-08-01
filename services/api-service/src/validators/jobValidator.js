const { z } = require('zod');

const httpMethods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];
const scheduleTypes = ['CRON', 'ONE_SHOT', 'MANUAL'];
const retryStrategies = ['EXPONENTIAL_BACKOFF', 'LINEAR', 'FIXED', 'NONE'];

const jobBodySchema = z
  .object({
    name: z.string().trim().min(1, 'Name is required'),
    targetUrl: z.string().trim().url('Target URL must be valid'),
    httpMethod: z.enum(httpMethods).optional().default('POST'),
    headers: z.record(z.unknown()).optional().default({}),
    body: z.unknown().nullable().optional().default(null),
    scheduleType: z.enum(scheduleTypes),
    cronExpression: z.string().trim().optional(),
    timeoutSeconds: z.coerce.number().int().min(1).optional(),
    retryStrategy: z.enum(retryStrategies).optional(),
    retryMaxAttempts: z.coerce.number().int().min(0).optional(),
    enabled: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.scheduleType === 'CRON' && !data.cronExpression) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cronExpression'],
        message: 'Cron expression is required for CRON schedule type',
      });
    }
  });

const jobListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(10),
  sortBy: z
    .enum(['name', 'scheduleType', 'createdAt', 'updatedAt', 'httpMethod'])
    .optional()
    .default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

const executionListQuerySchema = z.object({
  status: z
    .enum(['PENDING', 'LEASED', 'RUNNING', 'SUCCESS', 'FAILED', 'DEAD'])
    .optional(),
  jobId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
});

function validateJobBody(body) {
  return jobBodySchema.parse(body);
}

function validateJobListQuery(query) {
  return jobListQuerySchema.parse(query);
}

function validateExecutionListQuery(query) {
  return executionListQuerySchema.parse(query);
}

module.exports = {
  validateJobBody,
  validateJobListQuery,
  validateExecutionListQuery,
  jobBodySchema,
};
