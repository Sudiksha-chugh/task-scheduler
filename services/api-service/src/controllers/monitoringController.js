const { Queue } = require('bullmq');
const { getRedisClient } = require('../config/redis');

let executionQueueInstance = null;
let resultQueueInstance = null;

function getExecutionQueue(options = {}) {
  if (options.executionQueue) return options.executionQueue;
  if (!executionQueueInstance) {
    executionQueueInstance = new Queue('execution-queue', { connection: getRedisClient() });
  }
  return executionQueueInstance;
}

function getResultQueue(options = {}) {
  if (options.resultQueue) return options.resultQueue;
  if (!resultQueueInstance) {
    resultQueueInstance = new Queue('result-queue', { connection: getRedisClient() });
  }
  return resultQueueInstance;
}

/**
 * GET /api/v1/monitoring/stream
 * SSE endpoint broadcasting execution status changes, worker heartbeats, and queue metrics scoped per tenant.
 */
async function streamMonitoringEvents(req, res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  const userTenantId = req.user ? req.user.tenant : null;

  // Initial connection message
  res.write(
    `data: ${JSON.stringify({ type: 'connected', tenantId: userTenantId, timestamp: Date.now() })}\n\n`,
  );

  const redis = getRedisClient();
  let subClient;

  try {
    subClient = redis.duplicate();
    await subClient.subscribe('monitoring:events');

    const messageHandler = (_channel, message) => {
      try {
        const event = JSON.parse(message);
        // Tenant scoping: send if event is global or matches tenant
        if (!event.tenantId || String(event.tenantId) === String(userTenantId)) {
          res.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      } catch (err) {
        // ignore parse errors
      }
    };

    subClient.on('message', messageHandler);

    req.on('close', () => {
      subClient.removeListener('message', messageHandler);
      subClient.unsubscribe('monitoring:events').catch(() => {});
      subClient.quit().catch(() => {});
    });
  } catch (err) {
    console.error('Error establishing SSE Redis subscription:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: { code: 'SSE_ERROR', message: 'Failed to establish stream' } });
    }
  }
}

/**
 * GET /api/v1/monitoring/workers
 * Returns snapshot of active worker heartbeats from Redis.
 */
async function getWorkerHeartbeats(req, res) {
  try {
    const redis = req.redis || getRedisClient();
    const keys = await redis.keys('worker:heartbeat:*');

    const workers = [];
    if (keys && keys.length > 0) {
      for (const key of keys) {
        const raw = await redis.get(key);
        if (raw) {
          try {
            workers.push(JSON.parse(raw));
          } catch {
            workers.push({ workerId: key.replace('worker:heartbeat:', ''), raw });
          }
        }
      }
    }

    return res.status(200).json({ workers });
  } catch (error) {
    console.error('Error fetching worker heartbeats:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch worker heartbeats' },
    });
  }
}

/**
 * GET /api/v1/monitoring/queues
 * Returns BullMQ queue depth metrics via Queue.getJobCounts().
 */
async function getQueueDepths(req, res) {
  try {
    const executionQueue = getExecutionQueue(req.options);
    const resultQueue = getResultQueue(req.options);

    const [executionCounts, resultCounts] = await Promise.all([
      executionQueue.getJobCounts(),
      resultQueue.getJobCounts(),
    ]);

    return res.status(200).json({
      queues: {
        'execution-queue': executionCounts,
        'result-queue': resultCounts,
      },
    });
  } catch (error) {
    console.error('Error fetching queue depths:', error.message);
    return res.status(500).json({
      error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch queue depths' },
    });
  }
}

module.exports = {
  streamMonitoringEvents,
  getWorkerHeartbeats,
  getQueueDepths,
};
