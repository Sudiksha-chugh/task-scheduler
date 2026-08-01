const { z } = require('zod');

const envSchema = z.object({
  MONGO_URI: z.string().default('mongodb://localhost:27017/jobflow'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
});

let cachedEnv = null;

function loadEnv() {
  if (cachedEnv) {
    return cachedEnv;
  }

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    console.error('Invalid environment variables in event-processor:', formatted);
    process.exit(1);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

module.exports = { envSchema, loadEnv };
