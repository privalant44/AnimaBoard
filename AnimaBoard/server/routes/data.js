/**
 * Routes /api/data - Données depuis KV (Redis) ou BoondManager en direct.
 * Plus aucun fichier JSON : tout est en KV ou API BoondManager.
 */
const express = require('express');
const router = express.Router();
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const boondManagerService = require('../services/boondManagerService');

// Helper: réponse standard avec data
function okData(res, data, fileLabel = null, count = null) {
  const payload = { success: true, data };
  if (fileLabel) payload.file = fileLabel;
  if (count !== null) payload.count = count;
  return res.json(payload);
}

// --- Projects (live BoondManager)
router.get('/projects', async (req, res) => {
  try {
    const data = await boondManagerService.getProjects();
    const list = (data && data.data) ? data.data : (Array.isArray(data) ? data : []);
    return okData(res, list, 'projects', list.length);
  } catch (error) {
    const fromKv = await kvStorage.get(KV_KEYS.PROJECTS, null);
    if (fromKv && Array.isArray(fromKv)) return okData(res, fromKv, 'projects', fromKv.length);
    console.error('❌ Erreur /api/data/projects:', error.message);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Resources (live BoondManager, fallback KV)
async function handleResources(req, res) {
  try {
    const resources = await boondManagerService.getResources();
    const list = Array.isArray(resources) ? resources : (resources?.data || []);
    return okData(res, list, 'resources', list.length);
  } catch (error) {
    const fromKv = await kvStorage.get(KV_KEYS.RESOURCES, null);
    if (fromKv && Array.isArray(fromKv)) return okData(res, fromKv, 'resources', fromKv.length);
    return res.status(404).json({ success: false, error: 'Ressources non disponibles. Lancez la synchronisation depuis Paramètres.', file: 'resources' });
  }
}
router.get('/resources', handleResources);
router.get('/resources.json', handleResources);

// --- Deliveries (KV uniquement, rempli par sync/deliveries)
router.get('/deliveries.json', async (req, res) => {
  try {
    const stored = await kvStorage.get(KV_KEYS.DELIVERIES, null);
    if (!stored) {
      return res.status(404).json({
        success: false,
        error: 'Aucune donnée prestations. Lancez la synchronisation "Prestations" depuis Paramètres.',
        file: 'deliveries'
      });
    }
    const data = stored.data || stored;
    const list = Array.isArray(data) ? data : (data.data || []);
    return okData(res, stored.metadata ? { metadata: stored.metadata, data: list } : list, 'deliveries', list.length);
  } catch (error) {
    console.error('❌ Erreur /api/data/deliveries.json:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Forecast report (KV)
router.get('/forecast-report', async (req, res) => {
  try {
    const data = await kvStorage.get(KV_KEYS.FORECAST_REPORT, null);
    if (!data) {
      return res.status(404).json({ success: false, error: 'Rapport forecast non disponible. Générez-le depuis Paramètres.', file: 'forecast-report' });
    }
    return okData(res, data, 'forecast-report', Array.isArray(data) ? data.length : 0);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Forecast times (KV)
router.get('/forecast-times.json', async (req, res) => {
  try {
    const stored = await kvStorage.get(KV_KEYS.FORECAST_TIMES, null);
    const data = stored || { metadata: { createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString() }, data: {} };
    return res.json({ success: true, file: 'forecast-times', data });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/forecast-times', async (req, res) => {
  try {
    const { deliveryId, month, hours } = req.body;
    if (!deliveryId || !month || hours === undefined) {
      return res.status(400).json({ success: false, error: 'deliveryId, month et hours sont requis' });
    }
    const stored = await kvStorage.get(KV_KEYS.FORECAST_TIMES, { metadata: {}, data: {} });
    const data = stored.data || {};
    if (!data[deliveryId]) data[deliveryId] = {};
    if (!data[deliveryId].forecast) data[deliveryId].forecast = {};
    data[deliveryId].forecast[month] = parseFloat(hours) || 0;
    stored.metadata = stored.metadata || {};
    stored.metadata.lastUpdated = new Date().toISOString();
    stored.data = data;
    await kvStorage.set(KV_KEYS.FORECAST_TIMES, stored);
    return res.json({ success: true, message: 'Temps prévisionnel sauvegardé', data: data[deliveryId] });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Temps missions (KV)
router.get('/temps_missions.json', async (req, res) => {
  try {
    const stored = await kvStorage.get(KV_KEYS.TEMPS_MISSIONS, null);
    if (!stored) {
      return res.status(404).json({ success: false, error: 'Données temps_missions non disponibles. Lancez l\'extraction depuis Paramètres.', file: 'temps_missions' });
    }
    const data = stored.data || stored;
    const count = Array.isArray(data) ? data.length : (data.data ? data.data.length : 0);
    return okData(res, data, 'temps_missions', count);
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Timesheets data (KV)
router.get('/timesheets_data.json', async (req, res) => {
  try {
    const stored = await kvStorage.get(KV_KEYS.TIMESHEETS_DATA, null);
    if (!stored) {
      return res.status(404).json({
        success: false,
        error: 'Données timesheets non disponibles. Lancez la synchronisation "Timesheets" depuis Paramètres.',
        file: 'timesheets_data'
      });
    }
    const data = stored.data || stored;
    const count = Array.isArray(data) ? data.length : (data.data ? data.data.length : 0);
    return res.setHeader('Content-Type', 'application/json').json({ success: true, file: 'timesheets_data', data: stored.data || stored, count });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Timesheets aggregate (KV)
router.get('/timesheets_aggregate.json', async (req, res) => {
  try {
    const stored = await kvStorage.get(KV_KEYS.TIMESHEETS_AGGREGATE, null);
    if (!stored) {
      return res.status(404).json({
        success: false,
        error: 'Agrégat timesheets non disponible. Lancez la synchronisation "Timesheets" depuis Paramètres.',
        file: 'timesheets_aggregate'
      });
    }
    const data = stored.data || stored;
    const count = Array.isArray(data) ? data.length : (data.data ? data.data.length : 0);
    return res.setHeader('Content-Type', 'application/json').json({ success: true, file: 'timesheets_aggregate', data: stored, count });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Resources metadata (KV)
router.get('/resources-metadata', async (req, res) => {
  try {
    const data = await kvStorage.get(KV_KEYS.RESOURCES_METADATA, {});
    return res.json({ success: true, data: data || {} });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

router.post('/resources-metadata', async (req, res) => {
  try {
    await kvStorage.set(KV_KEYS.RESOURCES_METADATA, req.body);
    return res.json({ success: true, message: 'Métadonnées sauvegardées avec succès' });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
