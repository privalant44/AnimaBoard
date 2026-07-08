/**
 * Routes /api/settings — configuration applicative partagée
 */
const express = require('express');
const logoHandlers = require('../../api/settings');

const router = express.Router();

router.post('/logo', async (req, res, next) => {
  try {
    await logoHandlers.handlePost(req, res);
  } catch (error) {
    next(error);
  }
});

router.delete('/logo', async (req, res, next) => {
  try {
    await logoHandlers.handleDelete(req, res);
  } catch (error) {
    next(error);
  }
});

module.exports = router;
