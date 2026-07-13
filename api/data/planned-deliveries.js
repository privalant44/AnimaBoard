/**
 * POST /api/data/planned-deliveries — créer / mettre à jour / supprimer un scénario prévisionnel
 */
const { createVercelHandler } = require('../../lib/errorHandler');
const { handlePlannedDeliveryPost } = require('../../lib/plannedDeliveriesService');

function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string' && req.body.trim()) {
    try {
      return JSON.parse(req.body);
    } catch (e) {
      return {};
    }
  }
  return {};
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const body = readJsonBody(req);
  const result = await handlePlannedDeliveryPost(body);

  return res.status(200).json({
    success: true,
    ...result,
  });
}, { statusCode: 500, message: 'Erreur planned-deliveries' });
