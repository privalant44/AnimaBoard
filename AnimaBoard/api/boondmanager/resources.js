require('../../../lib/secretEnv');
const boondManagerService = require('../../../server/services/boondManagerService');
const { createVercelHandler } = require('../../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  const resources = await boondManagerService.getResources();
  const list = Array.isArray(resources) ? resources : (resources?.data || []);
  res.setHeader('Content-Type', 'application/json');
  res.json({ success: true, data: list, total: list.length });
}, {
  statusCode: 500,
  message: 'Erreur lors de la récupération des ressources depuis BoondManager'
});
