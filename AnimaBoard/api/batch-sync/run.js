const { createVercelHandler } = require('../../lib/errorHandler');
const { runDailyBatch } = require('../../lib/dailyBatchSync');

function ensureSecretEnv() {
  try {
    require('../../lib/secretEnv');
  } catch (e) {
    // Optionnel en local.
  }
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  ensureSecretEnv();

  const triggeredBy = req.auth?.email || req.auth?.preferredUsername || req.auth?.name || null;

  try {
    const result = await runDailyBatch({ triggerSource: 'manual', triggeredBy });
    return res.status(200).json(result);
  } catch (error) {
    if (error.batchResult) {
      return res.status(500).json(error.batchResult);
    }
    throw error;
  }
}, { statusCode: 500, message: 'Erreur lors du lancement du batch quotidien' });
