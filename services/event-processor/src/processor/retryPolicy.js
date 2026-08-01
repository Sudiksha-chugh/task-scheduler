/**
 * Calculates retry behavior based on Job configuration and execution retry count.
 *
 * @param {Object} job - Job document
 * @param {number} currentRetryCount - Current retry count after incrementing
 * @returns {{ shouldRetry: boolean, delayMs: number, nextStatus: string }}
 */
function calculateRetryBehavior(job = {}, currentRetryCount = 1) {
  const maxAttempts = job.retryMaxAttempts !== undefined ? job.retryMaxAttempts : 3;
  const strategy = job.retryStrategy || 'EXPONENTIAL_BACKOFF';

  if (strategy === 'NONE' || currentRetryCount >= maxAttempts) {
    return {
      shouldRetry: false,
      delayMs: 0,
      nextStatus: 'DEAD',
    };
  }

  let delayMs = 1000;

  switch (strategy) {
    case 'EXPONENTIAL_BACKOFF':
      delayMs = Math.pow(2, Math.max(0, currentRetryCount - 1)) * 1000;
      break;
    case 'LINEAR':
      delayMs = currentRetryCount * 1000;
      break;
    case 'FIXED':
      delayMs = 1000;
      break;
    default:
      delayMs = 1000;
      break;
  }

  return {
    shouldRetry: true,
    delayMs,
    nextStatus: 'PENDING',
  };
}

module.exports = {
  calculateRetryBehavior,
};
