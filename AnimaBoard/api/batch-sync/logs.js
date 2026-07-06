const { createVercelHandler } = require('../../lib/errorHandler');
const { getBatchSyncLogs } = require('../../lib/dailyBatchSync');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const month = req.query.month;
  const date = req.query.date;
  const data = await getBatchSyncLogs({ month, date });
  return res.status(200).json({ success: true, ...data });
}, { statusCode: 500, message: 'Erreur lors de la lecture des journaux batch' });
