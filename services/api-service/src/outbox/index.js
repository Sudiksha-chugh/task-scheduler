const OutboxEvent = require('../models/OutboxEvent');

/**
 * Creates and writes an OutboxEvent document inside a Mongo session/transaction.
 *
 * @param {Object} eventData
 * @param {string} eventData.aggregateType - Type of aggregate (e.g. 'Execution', 'Job')
 * @param {string|import('mongoose').Types.ObjectId} eventData.aggregateId - ID of aggregate
 * @param {string} eventData.eventType - Name of the event (e.g. 'EXECUTION_CREATED')
 * @param {Object} eventData.payload - Event payload details
 * @param {import('mongoose').ClientSession} [session] - Optional Mongoose session for transactions
 * @returns {Promise<import('../models/OutboxEvent')>} Created OutboxEvent document
 */
async function createOutboxEvent(eventData, sessionOrOptions) {
  const { aggregateType, aggregateId, eventType, payload } = eventData || {};

  if (!aggregateType || !aggregateId || !eventType || !payload) {
    throw new Error(
      'aggregateType, aggregateId, eventType, and payload are required to create an OutboxEvent',
    );
  }

  const session =
    sessionOrOptions && sessionOrOptions.session
      ? sessionOrOptions.session
      : sessionOrOptions;

  const options = session ? { session } : {};

  const [outboxEvent] = await OutboxEvent.create(
    [
      {
        aggregateType,
        aggregateId,
        eventType,
        payload,
        published: false,
      },
    ],
    options,
  );

  return outboxEvent;
}

module.exports = {
  createOutboxEvent,
};
