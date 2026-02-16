const boondManagerService = require('../../../server/services/boondManagerService');
const { createVercelHandler } = require('../../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  const service = new boondManagerService();
  const resources = await service.getResources();
  
  res.setHeader('Content-Type', 'application/json');
  res.json(resources);
}, {
  statusCode: 500,
  message: 'Erreur lors de la récupération des ressources depuis BoondManager'
});
