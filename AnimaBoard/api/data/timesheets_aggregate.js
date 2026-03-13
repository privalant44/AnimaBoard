const dataSyncService = require('../../lib/dataSyncService');
const { createVercelHandler } = require('../../lib/errorHandler');

module.exports = createVercelHandler(async (req, res) => {
  const aggregate = await dataSyncService.getTimesheetsAggregate();
  
  // Convertir en format attendu par le frontend
  const formatted = {
    data: {
      data: aggregate.data
    }
  };
  
  res.setHeader('Content-Type', 'application/json');
  res.json({
    success: true,
    file: 'timesheets_aggregate.json',
    data: formatted
  });
}, {
  statusCode: 500,
  message: 'Erreur lors de la récupération de l\'agrégat des timesheets'
});
