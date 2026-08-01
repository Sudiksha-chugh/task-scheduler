const { connectDb } = require('./src/config/db');
const { connectRedis } = require('./src/config/redis');
const { loadEnv } = require('./src/config/env');
const { startWorker } = require('./src/worker/worker');

async function start() {
  loadEnv();
  await connectDb();
  await connectRedis();

  startWorker();
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start event processor service:', error);
    process.exit(1);
  });
}

module.exports = { start };
