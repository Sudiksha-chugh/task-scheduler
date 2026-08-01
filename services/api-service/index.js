const { createApp } = require('./src/app');
const { connectDb } = require('./src/config/db');
const { connectRedis } = require('./src/config/redis');
const { loadEnv } = require('./src/config/env');
const { startOutboxPublisher } = require('./src/outbox/publisher');

async function start() {
  const env = loadEnv();
  await connectDb();
  await connectRedis();

  startOutboxPublisher();

  const app = createApp();

  app.listen(env.PORT, () => {
    console.log(`API service listening on port ${env.PORT}`);
  });
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start API service:', error);
    process.exit(1);
  });
}

module.exports = { start };
