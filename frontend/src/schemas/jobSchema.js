import { z } from 'zod';

function jsonStringField(label, { optional = false } = {}) {
  return z.string().superRefine((val, ctx) => {
    if (!val.trim()) {
      if (optional) return;
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `${label} is required` });
      return;
    }
    try {
      JSON.parse(val);
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Invalid JSON in ${label}` });
    }
  });
}

export const jobFormSchema = z
  .object({
    projectId: z.string().min(1, 'Project is required'),
    name: z.string().trim().min(1, 'Job name is required').max(200),
    targetUrl: z.string().trim().url('Target URL must be valid'),
    httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    scheduleType: z.enum(['MANUAL', 'CRON', 'ONE_SHOT']),
    cronExpression: z.string().optional(),
    retryStrategy: z.enum(['EXPONENTIAL_BACKOFF', 'LINEAR', 'FIXED', 'NONE']),
    retryMaxAttempts: z.coerce.number().int().min(0).max(10),
    timeoutSeconds: z.coerce.number().int().min(1).max(300).optional(),
    enabled: z.boolean().optional(),
    headersJson: jsonStringField('Headers'),
    bodyJson: jsonStringField('Payload body', { optional: true }),
  })
  .superRefine((data, ctx) => {
    if (data.scheduleType === 'CRON' && !data.cronExpression?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['cronExpression'],
        message: 'Cron expression is required for CRON schedule type',
      });
    }
  });

export const jobFormDefaults = {
  projectId: '',
  name: '',
  targetUrl: 'https://httpbin.org/post',
  httpMethod: 'POST',
  scheduleType: 'MANUAL',
  cronExpression: '*/5 * * * *',
  retryStrategy: 'EXPONENTIAL_BACKOFF',
  retryMaxAttempts: 3,
  timeoutSeconds: 30,
  enabled: true,
  headersJson: '{\n  "Content-Type": "application/json"\n}',
  bodyJson: '{\n  "event": "triggered_job"\n}',
};

export function jobToFormValues(job) {
  return {
    projectId: job.project?._id || job.project || '',
    name: job.name || '',
    targetUrl: job.targetUrl || '',
    httpMethod: job.httpMethod || 'POST',
    scheduleType: job.scheduleType || 'MANUAL',
    cronExpression: job.cronExpression || '*/5 * * * *',
    retryStrategy: job.retryStrategy || 'EXPONENTIAL_BACKOFF',
    retryMaxAttempts: job.retryMaxAttempts ?? 3,
    timeoutSeconds: job.timeoutSeconds ?? 30,
    enabled: job.enabled ?? true,
    headersJson: job.headers ? JSON.stringify(job.headers, null, 2) : '{}',
    bodyJson: job.body != null ? JSON.stringify(job.body, null, 2) : '',
  };
}

export function formValuesToJobPayload(values) {
  return {
    name: values.name,
    targetUrl: values.targetUrl,
    httpMethod: values.httpMethod,
    scheduleType: values.scheduleType,
    cronExpression: values.scheduleType === 'CRON' ? values.cronExpression : undefined,
    retryStrategy: values.retryStrategy,
    retryMaxAttempts: values.retryMaxAttempts,
    timeoutSeconds: values.timeoutSeconds,
    enabled: values.enabled,
    headers: values.headersJson.trim() ? JSON.parse(values.headersJson) : {},
    body: values.bodyJson.trim() ? JSON.parse(values.bodyJson) : null,
  };
}
