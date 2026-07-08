/**
 * POST /api/data/planned-deliveries — créer / mettre à jour / supprimer un scénario prévisionnel
 */
const { createVercelHandler } = require('../../lib/errorHandler');
const {
  createPlannedDelivery,
  updatePlannedDelivery,
  deletePlannedDelivery,
} = require('../../lib/plannedDeliveriesService');

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

  if (body.delete && body.resourceId && body.scenario) {
    await deletePlannedDelivery({
      resourceId: body.resourceId,
      scenario: body.scenario,
    });
    return res.status(200).json({ success: true, message: 'Prestation prévisionnelle supprimée' });
  }

  if (body.resourceId && body.scenario) {
    const updated = await updatePlannedDelivery({
      resourceId: body.resourceId,
      scenario: body.scenario,
      tjm: body.tjm,
      description: body.description,
      month: body.month,
      days: body.days,
    });
    return res.status(200).json({
      success: true,
      message: 'Prestation prévisionnelle mise à jour',
      data: updated,
    });
  }

  if (!body.resourceId) {
    return res.status(400).json({ success: false, error: 'resourceId est requis' });
  }

  const created = await createPlannedDelivery({
    resourceId: body.resourceId,
    tjm: body.tjm,
    description: body.description,
  });

  return res.status(200).json({
    success: true,
    message: 'Prestation prévisionnelle créée',
    data: created,
  });
}, { statusCode: 500, message: 'Erreur planned-deliveries' });
