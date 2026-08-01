const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  listExecutions,
  getExecutionById,
  retryExecution,
} = require('../controllers/executionController');

const router = express.Router();

router.use(requireAuth);

router.get('/', listExecutions);
router.get('/:id', getExecutionById);
router.post('/:id/retry', retryExecution);

module.exports = router;
