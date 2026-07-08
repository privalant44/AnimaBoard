/**
 * GET /api/data/forecast-bootstrap
 * Endpoint bootstrap unique pour la vue Forecast/Report en environnement Vercel.
 */
const path = require('path');
try {
  require(path.join(__dirname, '..', '..', 'lib', 'secretEnv'));
} catch (e) {}

const { createVercelHandler } = require('../../lib/errorHandler');
const { getForecastBootstrapData } = require('../../lib/forecastBootstrapService');

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  try {
    const data = await getForecastBootstrapData({
      reqQuery: req.query,
      includeSupabaseTimesheetsFallback: false,
    });

    return res.status(200).json({
      success: true,
      data,
    });
  } catch (error) {
    if (error?.status === 404) {
      return res.status(404).json({ success: false, error: error.message });
    }
    throw error;
  }
}, { statusCode: 500, message: 'Erreur forecast-bootstrap' });
