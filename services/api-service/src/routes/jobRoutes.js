const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  listJobs,
  createJob,
  getJobById,
  updateJob,
  triggerJob,
} = require('../controllers/jobController');

const router = express.Router();

router.use(requireAuth);

router.get('/', listJobs);
router.get('/:jobId', getJobById);
router.put('/:jobId', updateJob);

module.exports = router;
