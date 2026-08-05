// Thin re-export -- createOutboxEvent now lives in the shared workspace
// package. publisher.js (started separately from services/api-service/index.js)
// stays local to api-service since it's the only process that runs it.
module.exports = { createOutboxEvent: require('@jobflow/shared/outbox').createOutboxEvent };
