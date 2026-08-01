const { Worker } = require('bullmq');
const { getRedisClient } = require('../config/redis');
const { processExecutionJob } = require('./processor');

let workerInstance = null;

/**
 * Starts the BullMQ worker consuming from "execution-queue".
 * @param {Object} [options]
 * @returns {Worker} BullMQ Worker instance
 */
function startWorker(options = {}) {
  if (workerInstance) {
    return workerInstance;
  }

  workerInstance = new Worker(
    'execution-queue',
    async (job) => {
      return processExecutionJob(job, options);
    },
    {
      connection: getRedisClient(),
      concurrency: options.concurrency || 5,
    },
  );

  workerInstance.on('completed', (job, result) => {
    console.log(`Worker completed job ${job.id} (execution ${result?.executionId}):`, result?.status);
  });

  workerInstance.on('failed', (job, err) => {
    console.error(`Worker failed job ${job?.id}:`, err.message);
  });

  console.log('Worker service started listening on "execution-queue"');
  return workerInstance;
}

/**
 * Stops the BullMQ worker gracefully.
 */
async function stopWorker() {
  if (workerInstance) {
    await workerInstance.close();
    workerInstance = null;
    console.log('Worker service stopped');
  }
}

module.exports = {
  startWorker,
  stopWorker,
};
