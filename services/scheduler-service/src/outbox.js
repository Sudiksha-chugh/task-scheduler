function getOutbox(options = {}) {
  if (options.outbox) {
    return options.outbox;
  }
  return { createOutboxEvent: require('@jobflow/shared/outbox').createOutboxEvent };
}

module.exports = { getOutbox };
