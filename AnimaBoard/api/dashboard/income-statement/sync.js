/**
 * POST /api/dashboard/income-statement/sync
 * Route dédiée (évite les rewrites multi-segments sur Vercel Hobby).
 */
const path = require('path');

try {
  require(path.join(__dirname, '..', '..', '..', 'lib', 'secretEnv'));
} catch (e) {}

const dashboardService = require(path.join(__dirname, '..', '..', '..', 'server', 'services', 'dashboardService'));
const { createVercelHandler } = require(path.join(__dirname, '..', '..', '..', 'lib', 'errorHandler'));

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  const data = await dashboardService.syncPennylaneIncomeStatement();
  res.setHeader('Content-Type', 'application/json');
  return res.status(200).json(data);
});
