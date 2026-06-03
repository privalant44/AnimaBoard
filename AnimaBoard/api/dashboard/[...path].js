/**
 * Dashboard routes for Vercel (catch-all, 1 serverless function).
 *
 * GET  /api/dashboard/home-monthly-recap
 * GET  /api/dashboard/income-statement
 * POST /api/dashboard/income-statement/sync
 * POST /api/dashboard/income-statement/init
 */
const path = require('path');

try {
  require(path.join(__dirname, '..', '..', 'lib', 'secretEnv'));
} catch (e) {}

const dashboardService = require(path.join(__dirname, '..', '..', 'server', 'services', 'dashboardService'));
const { createVercelHandler } = require(path.join(__dirname, '..', '..', 'lib', 'errorHandler'));

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.status(status).json(body);
}

function getRoutePath(req) {
  const raw = req.query.path;
  if (Array.isArray(raw)) return raw.filter(Boolean).join('/');
  if (typeof raw === 'string' && raw.trim()) return raw.trim();

  const url = String(req.url || '');
  const match = url.match(/\/api\/dashboard\/([^?]+)/);
  return match ? decodeURIComponent(match[1]) : '';
}

async function readJsonBody(req) {
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
  const route = getRoutePath(req);

  if (route === 'home-monthly-recap' && req.method === 'GET') {
    const year = req.query.year != null ? req.query.year : undefined;
    const data = await dashboardService.getHomeMonthlyRecap(year);
    return sendJson(res, 200, data);
  }

  if (route === 'income-statement' && req.method === 'GET') {
    const year = req.query.year != null ? req.query.year : undefined;
    const data = await dashboardService.getPennylaneIncomeStatement(year);
    return sendJson(res, 200, data);
  }

  if (route === 'income-statement/sync' && req.method === 'POST') {
    const data = await dashboardService.syncPennylaneIncomeStatement();
    return sendJson(res, 200, data);
  }

  if (route === 'income-statement/init' && req.method === 'POST') {
    const body = await readJsonBody(req);
    const years = Array.isArray(body.years) && body.years.length > 0 ? body.years : [2025, 2026];
    const result = await dashboardService.syncPennylaneIncomeStatementYears(years);
    return sendJson(res, 200, { ok: true, years: result });
  }

  return sendJson(res, 404, {
    success: false,
    error: `Route dashboard inconnue: ${route || '(vide)'}`,
  });
}, { statusCode: 500, message: 'Erreur dashboard' });
