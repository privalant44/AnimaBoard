const { createVercelHandler } = require('../../lib/errorHandler');
const { runDailyBatch } = require('../../lib/dailyBatchSync');

function ensureSecretEnv() {
  try {
    require('../../lib/secretEnv');
  } catch (e) {
    // Optionnel en local ; sur Vercel les variables sont injectées.
  }
}

function assertCronAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  const auth = String(req.headers.authorization || '');
  return auth === `Bearer ${secret}`;
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  ensureSecretEnv();
  if (!assertCronAuthorized(req)) {
    return res.status(401).json({ success: false, error: 'Unauthorized cron call' });
  }

  try {
    const result = await runDailyBatch({ triggerSource: 'cron' });
    return res.status(200).json(result);
  } catch (error) {
    if (error.batchResult) {
      return res.status(500).json(error.batchResult);
    }
    throw error;
  }
}, { statusCode: 500, message: 'Erreur lors du batch daily-sync', skipAuth: true });
