const OutboxEvent = require('../models/OutboxEvent');

/**
 * Creates and writes an OutboxEvent document, optionally inside a Mongo
 * session/transaction so it lands atomically alongside whatever domain
 * write (Execution, NodeExecution, etc.) triggered it.
 *
 * @param {Object} eventData
 * @param {string} eventData.aggregateType
 * @param {string|import('mongoose').Types.ObjectId} eventData.aggregateId
 * @param {string} eventData.eventType
 * @param {Object} eventData.payload
 * @param {import('mongoose').ClientSession} [sessionOrOptions]
 * @returns {Promise<import('../models/OutboxEvent')>}
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

module.exports = { createOutboxEvent };
