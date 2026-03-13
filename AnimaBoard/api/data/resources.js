const dataSyncService = require('../../lib/dataSyncService');
const { createVercelHandler } = require('../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  const resources = await dataSyncService.getResources();
  
  res.json({
    success: true,
    file: 'resources.json',
    data: resources,
    count: resources?.data?.length || 0
  });
}, {
  statusCode: 500,
  message: 'Erreur lors de la récupération des ressources'
});
