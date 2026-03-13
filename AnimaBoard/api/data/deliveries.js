const dataSyncService = require('../../lib/dataSyncService');
const { createVercelHandler } = require('../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  const deliveries = await dataSyncService.getDeliveries();
  
  res.json({
    success: true,
    file: 'deliveries.json',
    data: deliveries,
    count: deliveries?.data?.data?.length || 0
  });
}, {
  statusCode: 500,
  message: 'Erreur lors de la récupération des prestations'
});
