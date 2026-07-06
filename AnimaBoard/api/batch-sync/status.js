const { createVercelHandler } = require('../../lib/errorHandler');
const { getLastBatchStatus } = require('../../lib/dailyBatchSync');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const status = await getLastBatchStatus();
  return res.status(200).json({ success: true, ...status });
}, { statusCode: 500, message: 'Erreur lors de la lecture du statut batch' });
