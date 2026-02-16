/**
 * POST /api/boondmanager/sync/time-reports - Extraction des temps saisis vers KV
 */
const { createVercelHandler } = require('../../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const { beginDate, endDate } = req.body || {};
  const extractTimeReports = require('../../../extract_time_reports');
  const result = await extractTimeReports(beginDate, endDate);
  const count = result?.data?.length || 0;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Extraction réussie: ${count} enregistrements de temps extraits`,
    count,
    metadata: result?.metadata
  });
}, { statusCode: 500, message: 'Erreur lors de l\'extraction des temps saisis' });
