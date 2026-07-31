const { z } = require('zod');

const envSchema = z.object({
  MONGO_URI: z
    .string()
    .min(1, 'MONGO_URI is required')
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGO_URI must be a valid MongoDB connection string'),
  REDIS_URL: z
    .string()
    .min(1, 'REDIS_URL is required')
    .regex(/^redis(s)?:\/\//, 'REDIS_URL must be a valid Redis connection string'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  PORT: z.coerce.number().int().positive().default(4000),
  CORS_ORIGIN: z.string().min(1, 'CORS_ORIGIN is required'),
});

let cachedEnv = null;

function loadEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    console.error('Invalid environment variables:', formatted);
    process.exit(1);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

module.exports = { envSchema, loadEnv };
