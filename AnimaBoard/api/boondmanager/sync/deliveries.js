/**
 * POST /api/boondmanager/sync/deliveries - Extraction des prestations vers KV
 */
const { createVercelHandler } = require('../../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  const extractDeliveries = require('../../../extract_deliveries');
  const result = await extractDeliveries();
  const count = result?.data?.length || 0;
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json({
    success: true,
    message: `Extraction réussie: ${count} prestations extraites`,
    count,
    metadata: result?.metadata
  });
}, { statusCode: 500, message: 'Erreur lors de l\'extraction des prestations' });
