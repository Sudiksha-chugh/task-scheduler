const { loadEnv } = require('./src/config/env');
const { connectDb, disconnectDb } = require('./src/config/db');
const { connectRedis, disconnectRedis } = require('./src/config/redis');
const { startJobPolling } = require('./src/scheduler/jobPoller');
const { startLeaseReclaimer } = require('./src/scheduler/leaseReclaimer');

let pollTimer = null;
let reclaimTimer = null;

async function start() {
  console.log('Scheduler service starting...');

  const env = loadEnv();

  await connectDb();
  await connectRedis();

  pollTimer = startJobPolling({
    intervalMs: env.POLL_INTERVAL_MS,
  });

  reclaimTimer = startLeaseReclaimer({
    intervalMs: env.LEASE_RECLAIM_INTERVAL_MS,
    leaseTtlMs: env.LEASE_TTL_MS,
  });

  console.log(
    `Scheduler service running (poll every ${env.POLL_INTERVAL_MS}ms, ` +
    `reclaim every ${env.LEASE_RECLAIM_INTERVAL_MS}ms)`,
  );
}

async function stop() {
  console.log('Scheduler service shutting down...');
  if (pollTimer) clearInterval(pollTimer);
  if (reclaimTimer) clearInterval(reclaimTimer);
  await disconnectDb();
  await disconnectRedis();
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start scheduler service:', error);
    process.exit(1);
  });

  process.on('SIGTERM', () => stop().then(() => process.exit(0)));
  process.on('SIGINT', () => stop().then(() => process.exit(0)));
}

module.exports = { start, stop };