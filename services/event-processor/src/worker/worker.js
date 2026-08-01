const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const { processEventResult } = require('../processor/eventProcessor');

let workerInstance = null;

/**
 * Starts the BullMQ worker consuming from "result-queue".
 * @param {Object} [options]
 * @returns {Worker} BullMQ Worker instance
 */
function startWorker(options = {}) {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker(
    'result-queue',
    async (job) => {
      return processEventResult(job, options);
    },
    {
      connection: getRedisClient(),
      concurrency: options.concurrency || 5,
    },
  );

  workerInstance.on('completed', (job, result) => {
    console.log(`Event processor completed job ${job.id} (execution ${result?.executionId}):`, result?.status);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`Event processor failed job ${job?.id}:`, err.message);
  });

  console.log('Event processor started listening on "result-queue"');
  return workerInstance;
}

/**
 * Stops the BullMQ worker gracefully.
 */
async function stopWorker() {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    console.log('Event processor worker stopped');
  }
}

module.exports = {
  startWorker,
  stopWorker,
};
