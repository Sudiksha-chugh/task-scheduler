const express = require('express');
const { requireAuth } = require('../middleware/auth');
const { createApiKey, listApiKeys, revokeApiKey } = require('../controllers/apiKeyController');

const router = express.Router();

router.use(requireAuth);

router.get('/', listApiKeys);
router.post('/', createApiKey);
router.delete('/:id', revokeApiKey);

module.exports = router;