const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  streamMonitoringEvents,
  getWorkerHeartbeats,
  getQueueDepths,
} = require('../controllers/monitoringController');

const router = express.Router();

router.use(requireAuth);

router.get('/stream', streamMonitoringEvents);
router.get('/workers', getWorkerHeartbeats);
router.get('/queues', getQueueDepths);

module.exports = router;
