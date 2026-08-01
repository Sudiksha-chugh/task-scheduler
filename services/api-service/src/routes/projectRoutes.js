const express = require('express');
const { requireAuth } = require('../middleware/auth');
const {
  listProjects,
  createProject,
  getProjectById,
} = require('../controllers/projectController');

const router = express.Router();

router.use(requireAuth);

router.get('/', listProjects);
router.post('/', createProject);
router.get('/:projectId', getProjectById);

module.exports = router;
