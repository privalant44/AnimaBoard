const express = require('express');
const { runDailyBatch, getBatchSyncLogs, getLastBatchStatus } = require('../../lib/dailyBatchSync');

const router = express.Router();

router.post('/run', async (req, res) => {
  try {
    const triggeredBy = req.auth?.email || req.auth?.preferredUsername || req.auth?.name || null;
    const result = await runDailyBatch({ triggerSource: 'manual', triggeredBy });
    return res.json(result);
  } catch (error) {
    if (error.batchResult) {
      return res.status(500).json(error.batchResult);
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/logs', async (req, res) => {
  try {
    const data = await getBatchSyncLogs({ month: req.query.month, date: req.query.date });
    return res.json({ success: true, ...data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/status', async (req, res) => {
  try {
    const status = await getLastBatchStatus();
    return res.json({ success: true, ...status });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
