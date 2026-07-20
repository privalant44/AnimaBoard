/**
 * GET/POST /api/data/forecast-scenarios — catalogue global des scénarios prévisionnels
 */
const { createVercelHandler } = require('../../lib/errorHandler');
const {
  listForecastScenarios,
  upsertForecastScenario,
  deleteForecastScenario,
} = require('../../lib/forecastScenariosService');

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
  if (req.method === 'GET') {
    const data = await listForecastScenarios();
    return res.status(200).json({
      success: true,
      data,
      file: 'forecast-scenarios',
      count: data.length,
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const body = readJsonBody(req);

  if (body.delete && body.number) {
    await deleteForecastScenario(body.number);
    return res.status(200).json({ success: true, message: 'Scénario supprimé' });
  }

  if (!body.number) {
    return res.status(400).json({ success: false, error: 'number est requis' });
  }

  const saved = await upsertForecastScenario({
    number: body.number,
    title: body.title,
    description: body.description,
  });

  return res.status(200).json({
    success: true,
    message: 'Scénario enregistré',
    data: saved,
  });
}, { statusCode: 500, message: 'Erreur forecast-scenarios' });
