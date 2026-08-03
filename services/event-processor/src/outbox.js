function getOutbox(options = {}) {
  if (options.outbox) {
    return options.outbox;
  }
  try {
    return require('../../api-service/src/outbox');
  } catch (err) {
    throw new Error(
      'Could not load api-service outbox module (createOutboxEvent unavailable). ' +
      'Check that services/api-service is present at the expected relative path.',
    );
  }
}

module.exports = { getOutbox };