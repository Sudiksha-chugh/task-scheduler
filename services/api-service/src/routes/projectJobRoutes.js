const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  listJobs,
  createJob,
  triggerJob,
} = require('../controllers/jobController');

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', listJobs);
router.post('/', createJob);
router.post('/:jobId/trigger', triggerJob);

module.exports = router;
