// Thin re-export -- the real schema now lives in the shared workspace
// package so worker-service / scheduler-service / event-processor can
// require it directly instead of reaching across service boundaries.
module.exports = require('@jobflow/shared/models/Job');
