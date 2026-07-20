/**
 * Routes /api/data - Données depuis Supabase (lib/db.js via kvStorage) ou BoondManager en direct.
 */
const express = require('express');
const router = express.Router();
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const { toHolidayYmdString } = require('../../lib/holidayDate');
const { getSupabase } = require('../../lib/supabaseClient');
const { getHolidayRowsForYearRange } = require('../../lib/frenchHolidays');
const boondManagerService = require('../services/boondManagerService');
const { resetTimesheetsWindow } = require('../../lib/timesheetsReset');
const { getForecastBootstrapData } = require('../../lib/forecastBootstrapService');
const {
  handlePlannedDeliveryPost,
} = require('../../lib/plannedDeliveriesService');
const {
  listForecastScenarios,
  upsertForecastScenario,
  deleteForecastScenario,
} = require('../../lib/forecastScenariosService');

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

// --- Resources (live BoondManager, fallback KV) - utilisé par Forecast/Report
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

async function getResourcesLocalEnriched() {
  const { getResourcesLocalPayload } = require('../../lib/dictionarySync');
  const payload = await getResourcesLocalPayload();
  return payload.resources;
}

// --- Resources locales (lecture uniquement base, sans appel API) - pour la vue Ressources
router.get('/resources-local', async (req, res) => {
  try {
    const { getResourcesLocalPayload } = require('../../lib/dictionarySync');
    const { resources, dictionaryOptions } = await getResourcesLocalPayload();
    return res.json({
      success: true,
      data: resources,
      file: 'resources',
      count: resources.length,
      dictionaryOptions,
    });
  } catch (error) {
    console.error('❌ Erreur /api/data/resources-local:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

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

// --- Jours fériés France (table french_public_holiday, repli calcul lib/frenchHolidays.js)
router.get('/french-holidays.json', async (req, res) => {
  try {
    const nowY = new Date().getFullYear();
    const startYear = Math.max(2000, parseInt(String(req.query.from ?? nowY), 10) || nowY);
    const numYears = Math.min(15, Math.max(1, parseInt(String(req.query.years ?? '10'), 10) || 10));
    const endYear = startYear + numYears - 1;

    let holidays = [];
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('french_public_holiday')
        .select('holiday_date, label, year')
        .gte('year', startYear)
        .lte('year', endYear)
        .order('holiday_date', { ascending: true });
      if (error) {
        console.warn('⚠️ lecture french_public_holiday:', error.message);
      } else if (data && data.length > 0) {
        holidays = data
          .map((r) => ({
            holiday_date: toHolidayYmdString(r.holiday_date),
            label: r.label || '',
            year: r.year
          }))
          .filter((r) => r.holiday_date);
      }
    }

    if (holidays.length === 0) {
      holidays = getHolidayRowsForYearRange(startYear, endYear);
      holidays = holidays.map((r) => ({
        holiday_date: r.holiday_date,
        label: r.label,
        year: r.year
      }));
    }

    return res.json({
      success: true,
      file: 'french-holidays',
      data: { holidays, fromYear: startYear, toYear: endYear },
      count: holidays.length
    });
  } catch (error) {
    console.error('❌ Erreur /api/data/french-holidays.json:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Absences mensuelles par collaborateur (KV / table absence)
router.get('/absence-monthly.json', async (req, res) => {
  try {
    const stored = await kvStorage.get(KV_KEYS.ABSENCE_MONTHLY, null);
    if (!stored) {
      return res.status(404).json({
        success: false,
        error: 'Absences non disponibles. Lancez la synchronisation « Absences » depuis Paramètres.',
        file: 'absence-monthly'
      });
    }
    const list = stored.data || stored;
    const count = Array.isArray(list) ? list.length : 0;
    return res.setHeader('Content-Type', 'application/json').json({
      success: true,
      file: 'absence-monthly',
      data: stored,
      count
    });
  } catch (error) {
    console.error('❌ Erreur /api/data/absence-monthly.json:', error);
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

// --- Bootstrap Forecast (un seul appel pour limiter la latence côté client)
router.get('/forecast-bootstrap', async (req, res) => {
  try {
    const data = await getForecastBootstrapData({
      reqQuery: req.query,
      includeSupabaseTimesheetsFallback: true,
    });

    return res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('❌ Erreur /api/data/forecast-bootstrap:', error);
    if (error?.status === 404) {
      return res.status(404).json({ success: false, error: error.message });
    }
    return res.status(500).json({ success: false, error: error.message });
  }
});

// --- Prestations prévisionnelles manuelles (planned_scenario + planned_forecast)
router.post('/planned-deliveries', async (req, res) => {
  try {
    const result = await handlePlannedDeliveryPost(req.body || {});
    return res.json({ success: true, ...result });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('❌ Erreur /api/data/planned-deliveries:', error);
    return res.status(status).json({ success: false, error: error.message });
  }
});

// --- Catalogue scénarios prévisionnels (forecast_scenarios)
router.get('/forecast-scenarios', async (req, res) => {
  try {
    const data = await listForecastScenarios();
    return okData(res, data, 'forecast-scenarios', data.length);
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('❌ Erreur GET /api/data/forecast-scenarios:', error);
    return res.status(status).json({ success: false, error: error.message });
  }
});

router.post('/forecast-scenarios', async (req, res) => {
  try {
    const body = req.body || {};
    if (body.delete && body.number) {
      await deleteForecastScenario(body.number);
      return res.json({ success: true, message: 'Scénario supprimé' });
    }
    if (!body.number) {
      return res.status(400).json({ success: false, error: 'number est requis' });
    }
    const saved = await upsertForecastScenario({
      number: body.number,
      title: body.title,
      description: body.description,
    });
    return res.json({ success: true, message: 'Scénario enregistré', data: saved });
  } catch (error) {
    const status = error.status || 500;
    if (status >= 500) console.error('❌ Erreur POST /api/data/forecast-scenarios:', error);
    return res.status(status).json({ success: false, error: error.message });
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

// --- Réinitialiser les feuilles de temps (6 derniers mois pour éviter timeout)
router.post('/timesheets-reset', async (req, res) => {
  try {
    const { startMonth, endMonth, count, totalEntries } = await resetTimesheetsWindow({ monthsBack: 6 });
    return res.json({
      success: true,
      message: `Feuilles de temps réinitialisées et rechargées (${startMonth} à ${endMonth}) : ${count} feuilles, ${totalEntries} entrées.`
    });
  } catch (error) {
    console.error('❌ Erreur /api/data/timesheets-reset:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
