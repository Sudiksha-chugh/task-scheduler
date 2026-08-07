const express = require('express');

// Reusing worker-service's connectDb/connectRedis for the shared Mongo/Redis
// connections this whole process uses -- functionally identical to
// scheduler-service's or event-processor's own copies, so it doesn't matter
// which one we borrow. Each of the three startX() functions below still
// opens its own dedicated Redis connection internally (via their own
// config/redis.js) for its BullMQ Worker/Queue -- this is normal even in
// properly separated microservices (each BullMQ consumer typically gets its
// own connection) and is not a bug.
const { connectDb } = require('@jobflow/worker-service/src/config/db');
const { connectRedis } = require('@jobflow/worker-service/src/config/redis');
const { loadEnv: loadWorkerEnv } = require('@jobflow/worker-service/src/config/env');
const { startWorker } = require('@jobflow/worker-service/src/worker/worker');

const { loadEnv: loadSchedulerEnv } = require('scheduler-service/src/config/env');
const { startJobPolling } = require('scheduler-service/src/scheduler/jobPoller');
const { startLeaseReclaimer } = require('scheduler-service/src/scheduler/leaseReclaimer');

const { loadEnv: loadEventProcessorEnv } = require('@jobflow/event-processor/src/config/env');
const { startWorker: startEventProcessorWorker } = require('@jobflow/event-processor/src/worker/worker');

async function start() {
  // Each service's own env loader validates its own subset of vars (they
  // overlap heavily on MONGO_URI/REDIS_URL). None of the three have hard
  // requirements beyond sensible defaults, so calling all three is safe.
  loadWorkerEnv();
  loadSchedulerEnv();
  loadEventProcessorEnv();

  await connectDb();
  await connectRedis();

  // BullMQ worker consuming "execution-queue" -- dispatches the HTTP calls
  startWorker();

  // Scheduler loops: polls due CRON/ONE_SHOT jobs, reclaims stale leases
  // from crashed workers
  startJobPolling({ intervalMs: 5000 });
  startLeaseReclaimer({ intervalMs: 15000, leaseTtlMs: 30000 });

  // Event processor: consumes "result-queue" -- applies retry policy,
  // advances DAG workflows
  startEventProcessorWorker();

  // This HTTP server exists ONLY so Render classifies this as a free-tier
  // "Web Service" instead of a paid-only "Background Worker" -- it serves
  // no real API traffic. Point an external free pinger (e.g. UptimeRobot,
  // every 5-10 min) at /health to stop Render's free tier from sleeping
  // this after 15 minutes of no inbound HTTP traffic, which would silently
  // stop all job processing until the next request wakes it back up.
  const app = express();

  app.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      services: ['worker', 'scheduler', 'event-processor'],
    });
  });

  const port = process.env.PORT || 4100;
  app.listen(port, () => {
    console.log(`Combined background services: HTTP keep-alive listening on port ${port}`);
  });

  console.log('Combined background services started: worker + scheduler + event-processor');
}

if (require.main === module) {
  start().catch((error) => {
    console.error('Failed to start combined background services:', error);
    process.exit(1);
  });
}

module.exports = { start };