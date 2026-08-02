const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  listWorkflows,
  createWorkflow,
  updateWorkflow,
  triggerWorkflow,
} = require('../controllers/workflowController');

const router = express.Router({ mergeParams: true });

router.use(requireAuth);

router.get('/', listWorkflows);
router.post('/', createWorkflow);
router.put('/:workflowId', updateWorkflow);
router.post('/:workflowId/trigger', triggerWorkflow);

module.exports = router;
