const { Queue } = require('bullmq');
const OutboxEvent = require('../models/OutboxEvent');
const { getRedisClient } = require('../config/redis');

let pollerInterval = null;
let defaultQueueInstance = null;
let isPolling = false;

/**
 * Gets or creates the default BullMQ Queue for "execution-queue".
 * @param {Object} [customQueue] Optional custom/mock queue
 * @returns {Object} BullMQ Queue
 */
function getExecutionQueue(customQueue) {
  if (customQueue) {
    return customQueue;
  }
  if (!defaultQueueInstance) {
    defaultQueueInstance = new Queue('execution-queue', {
      connection: getRedisClient(),
    });
  }
  return defaultQueueInstance;
}

/**
 * Polls for unpublished OutboxEvents, pushes them to the "execution-queue" BullMQ queue,
 * and marks them as published.
 *
 * If event.payload.delayMs is set (used by scheduler retries / event-processor
 * retries for exponential/linear backoff), it's passed through as BullMQ's
 * native `delay` option so retry timing is preserved even though dispatch
 * now goes through the outbox.
 *
 * @param {Object} [options]
 * @param {Object} [options.queue] - Custom or mock queue instance
 * @param {number} [options.batchSize=50] - Number of events per batch
 * @returns {Promise<number>} Number of successfully published events
 */
async function pollOnce(options = {}) {
  const queue = getExecutionQueue(options.queue);
  const batchSize = options.batchSize || 50;

  const events = await OutboxEvent.find({ published: false })
    .sort({ createdAt: 1 })
    .limit(batchSize);

  if (!events || events.length === 0) {
    return 0;
  }

  let publishedCount = 0;

  for (const event of events) {
    try {
      const delayMs = event.payload && event.payload.delayMs;
      const bullOptions = delayMs ? { delay: delayMs } : {};

      await queue.add(
        event.eventType,
        {
          outboxId: event._id.toString(),
          aggregateType: event.aggregateType,
          aggregateId: event.aggregateId.toString(),
          eventType: event.eventType,
          payload: event.payload,
          createdAt: event.createdAt,
        },
        bullOptions,
      );

      event.published = true;
      await event.save();
      publishedCount += 1;
    } catch (error) {
      console.error(`Failed to publish OutboxEvent ${event._id}:`, error);
      break;
    }
  }

  return publishedCount;
}

/**
 * Starts the periodic outbox publisher loop.
 *
 * @param {Object} [options]
 * @param {number} [options.intervalMs=1000] - Polling interval in milliseconds
 * @param {Object} [options.queue] - Custom queue instance
 */
function startOutboxPublisher(options = {}) {
  if (pollerInterval) {
    return;
  }

  const intervalMs = options.intervalMs || 1000;

  pollerInterval = setInterval(async () => {
    if (isPolling) return;
    isPolling = true;
    try {
      await pollOnce(options);
    } catch (err) {
      console.error('Error during OutboxEvent publisher polling cycle:', err);
    } finally {
      isPolling = false;
    }
  }, intervalMs);
}

/**
 * Stops the periodic outbox publisher loop and closes open resources.
 */
async function stopOutboxPublisher() {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
  if (defaultQueueInstance) {
    await defaultQueueInstance.close();
    defaultQueueInstance = null;
  }
}

module.exports = {
  pollOnce,
  startOutboxPublisher,
  stopOutboxPublisher,
  getExecutionQueue,
};