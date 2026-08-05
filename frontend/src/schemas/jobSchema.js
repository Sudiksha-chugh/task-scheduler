import { z } from 'zod';

function jsonStringField(label, { optional = false } = {}) {
  return z.string().superRefine((val, ctx) => {
    if (!val || !val.trim()) {
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
    targetUrl: z.string().trim().url('Target URL must be a valid URL (e.g. https://example.com/webhook)'),
    httpMethod: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    scheduleType: z.enum(['MANUAL', 'CRON', 'ONE_SHOT']),
    cronExpression: z.string().optional(),
    runAt: z.string().optional(),
    retryStrategy: z.enum(['EXPONENTIAL_BACKOFF', 'LINEAR', 'FIXED', 'NONE']),
    retryMaxAttempts: z.coerce.number().int().min(0, 'Max attempts cannot be negative').max(10),
    timeoutSeconds: z.coerce.number().int().min(1, 'Timeout must be at least 1 second').max(300).optional(),
    enabled: z.boolean().optional(),
    headersJson: jsonStringField('Headers', { optional: true }),
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
    if (data.scheduleType === 'ONE_SHOT') {
      if (!data.runAt) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['runAt'],
          message: 'Run date/time is required for One Shot schedule type',
        });
      } else if (Number.isNaN(new Date(data.runAt).getTime())) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['runAt'],
          message: 'Run date/time must be valid',
        });
      } else if (new Date(data.runAt).getTime() <= Date.now()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['runAt'],
          message: 'Run date/time must be in the future',
        });
      }
    }
  });

export const jobFormDefaults = {
  projectId: '',
  name: '',
  targetUrl: 'https://httpbin.org/post',
  httpMethod: 'POST',
  scheduleType: 'MANUAL',
  cronExpression: '*/5 * * * *',
  runAt: '',
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
    // nextRunAt is what the scheduler set for ONE_SHOT jobs; feed it back
    // into the datetime-local input (which needs "YYYY-MM-DDTHH:mm", no
    // seconds/timezone suffix) when editing an existing one-shot job.
    runAt: job.scheduleType === 'ONE_SHOT' && job.nextRunAt
      ? new Date(job.nextRunAt).toISOString().slice(0, 16)
      : '',
    retryStrategy: job.retryStrategy || 'EXPONENTIAL_BACKOFF',
    retryMaxAttempts: job.retryMaxAttempts ?? 3,
    timeoutSeconds: job.timeoutSeconds ?? 30,
    enabled: job.enabled ?? true,
    headersJson: job.headers ? JSON.stringify(job.headers, null, 2) : '{\n  "Content-Type": "application/json"\n}',
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
    // datetime-local gives "YYYY-MM-DDTHH:mm" with no timezone -- new Date()
    // parses that as local time, .toISOString() converts to UTC for the API
    runAt: values.scheduleType === 'ONE_SHOT' && values.runAt
      ? new Date(values.runAt).toISOString()
      : undefined,
    retryStrategy: values.retryStrategy,
    retryMaxAttempts: Number(values.retryMaxAttempts),
    timeoutSeconds: Number(values.timeoutSeconds),
    enabled: values.enabled ?? true,
    headers: values.headersJson && values.headersJson.trim() ? JSON.parse(values.headersJson) : {},
    body: values.bodyJson && values.bodyJson.trim() ? JSON.parse(values.bodyJson) : null,
  };
}