const { getRedisClient } = require('../config/redis');

/**
 * Helper to manage execution leases and incrementing fencing tokens in Redis.
 */

async function publishMonitoringEvent(redis, event) {
  try {
    if (redis && typeof redis.publish === 'function') {
      await redis.publish('monitoring:events', JSON.stringify(event));
    }
  } catch (err) {
    console.error('Failed to publish monitoring event from leaseManager:', err.message);
  }
}

/**
 * Attempts to claim a lease for an execution using an incrementing fencing token.
 *
 * @param {string} executionId - The ID of the execution
 * @param {Object} [options]
 * @param {number} [options.ttlMs=30000] - Lease TTL in milliseconds
 * @param {Object} [options.redis] - Optional Redis client
 * @returns {Promise<{ acquired: boolean, fencingToken: number, leaseKey: string }>}
 */
async function acquireLease(executionId, options = {}) {
  const redis = options.redis || getRedisClient();
  const ttlMs = options.ttlMs || 30000;

  const fencingKey = `fencing:execution:${executionId}`;
  const leaseKey = `lease:execution:${executionId}`;

  // 1) Increment fencing token (monotonically increasing counter per execution)
  const fencingToken = await redis.incr(fencingKey);

  // 2) Attempt SET NX PX with fencing token
  const result = await redis.set(leaseKey, String(fencingToken), 'PX', ttlMs, 'NX');
  const acquired = result === 'OK';

  return {
    acquired,
    fencingToken,
    leaseKey,
  };
}

/**
 * Verifies if the current lease token in Redis matches the expected fencing token.
 *
 * @param {string} executionId
 * @param {number|string} expectedToken
 * @param {Object} [options]
 * @param {Object} [options.redis] - Optional Redis client
 * @returns {Promise<boolean>} True if current lease token matches expected token
 */
async function verifyLease(executionId, expectedToken, options = {}) {
  const redis = options.redis || getRedisClient();
  const leaseKey = `lease:execution:${executionId}`;

  const currentToken = await redis.get(leaseKey);
  return currentToken !== null && String(currentToken) === String(expectedToken);
}

/**
 * Refreshes the lease TTL and updates heartbeat key in Redis if fencing token matches.
 *
 * @param {string} executionId
 * @param {number|string} expectedToken
 * @param {number} [ttlMs=30000]
 * @param {Object} [options]
 * @param {Object} [options.redis] - Optional Redis client
 * @param {string} [options.workerId] - Optional worker identifier
 * @returns {Promise<boolean>} True if lease was refreshed, false if lost/preempted
 */
async function refreshLease(executionId, expectedToken, ttlMs = 30000, options = {}) {
  const redis = options.redis || getRedisClient();
  const isCurrent = await verifyLease(executionId, expectedToken, { redis });

  if (!isCurrent) {
    return false;
  }

  const workerId = options.workerId || `worker-${executionId}`;
  const leaseKey = `lease:execution:${executionId}`;
  const heartbeatKey = `heartbeat:execution:${executionId}`;
  const workerHeartbeatKey = `worker:heartbeat:${workerId}`;

  const now = Date.now();
  const heartbeatData = JSON.stringify({
    workerId,
    executionId,
    lastSeen: now,
    status: 'RUNNING',
  });

  await redis.pexpire(leaseKey, ttlMs);
  await redis.set(heartbeatKey, String(now), 'PX', ttlMs);
  await redis.set(workerHeartbeatKey, heartbeatData, 'PX', ttlMs);

  await publishMonitoringEvent(redis, {
    type: 'worker_heartbeat',
    workerId,
    executionId,
    lastSeen: now,
    tenantId: options.tenantId,
  });

  return true;
}

/**
 * Releases the lease if the fencing token matches.
 *
 * @param {string} executionId
 * @param {number|string} expectedToken
 * @param {Object} [options]
 * @param {Object} [options.redis] - Optional Redis client
 * @returns {Promise<boolean>}
 */
async function releaseLease(executionId, expectedToken, options = {}) {
  const redis = options.redis || getRedisClient();
  const isCurrent = await verifyLease(executionId, expectedToken, { redis });

  if (isCurrent) {
    const workerId = options.workerId || `worker-${executionId}`;
    const leaseKey = `lease:execution:${executionId}`;
    const heartbeatKey = `heartbeat:execution:${executionId}`;
    const workerHeartbeatKey = `worker:heartbeat:${workerId}`;
    await redis.del(leaseKey, heartbeatKey, workerHeartbeatKey);
    return true;
  }

  return false;
}

module.exports = {
  acquireLease,
  verifyLease,
  refreshLease,
  releaseLease,
};
