/**
 * Routes /api/data - Données depuis Supabase (lib/db.js via kvStorage) ou BoondManager en direct.
 */
const express = require('express');
const router = express.Router();
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const { toHolidayYmdString } = require('../../lib/holidayDate');
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
  const { getResourcesLocalEnriched: enrich } = require('../../lib/dictionarySync');
  return enrich();
}

// --- Resources locales (lecture uniquement base, sans appel API) - pour la vue Ressources
router.get('/resources-local', async (req, res) => {
  try {
    const list = await getResourcesLocalEnriched();
    return okData(res, list, 'resources', list.length);
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
    const { getSupabase } = require('../../lib/supabaseClient');
    const {
      getHolidayRowsForYearRange
    } = require('../../lib/frenchHolidays');

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
    const deliveriesStored = await kvStorage.get(KV_KEYS.DELIVERIES, null);
    if (!deliveriesStored) {
      return res.status(404).json({
        success: false,
        error: 'Aucune donnée prestations. Lancez la synchronisation "Prestations" depuis Paramètres.',
      });
    }
    const deliveriesData = deliveriesStored.data || deliveriesStored;
    const deliveries = Array.isArray(deliveriesData) ? deliveriesData : (deliveriesData.data || []);

    const resourcesLocal = await getResourcesLocalEnriched();

    const forecastStored = await kvStorage.get(KV_KEYS.FORECAST_TIMES, null);
    const forecastRaw = forecastStored?.data || {};

    const forecastByDeliveryId = {};
    Object.keys(forecastRaw).forEach((deliveryId) => {
      forecastByDeliveryId[String(deliveryId)] = forecastRaw[deliveryId]?.forecast || {};
    });

    const orderedDaysByDeliveryId = {};
    deliveries.forEach((d) => {
      const od = d?.orderedDays;
      if (od !== null && od !== undefined && !isNaN(Number(od))) {
        orderedDaysByDeliveryId[String(d.id)] = Number(od);
      }
    });

    const absenceStored = await kvStorage.get(KV_KEYS.ABSENCE_MONTHLY, null);
    const absenceRows = Array.isArray(absenceStored?.data)
      ? absenceStored.data
      : (Array.isArray(absenceStored) ? absenceStored : []);
    const absenceByResource = {};
    absenceRows.forEach((row) => {
      const rid = String(row.resourceId ?? '');
      const mo = String(row.month ?? '');
      if (!rid || !mo) return;
      if (!absenceByResource[rid]) absenceByResource[rid] = {};
      absenceByResource[rid][mo] = (absenceByResource[rid][mo] || 0) + (Number(row.days) || 0);
    });

    const { getSupabase } = require('../../lib/supabaseClient');
    const { getHolidayRowsForYearRange } = require('../../lib/frenchHolidays');
    const nowY = new Date().getFullYear();
    const startYear = Math.max(2000, parseInt(String(req.query.from ?? nowY - 1), 10) || (nowY - 1));
    const numYears = Math.min(15, Math.max(1, parseInt(String(req.query.years ?? '12'), 10) || 12));
    const endYear = startYear + numYears - 1;
    let holidayRows = [];
    const supabase = getSupabase();
    if (supabase) {
      const { data, error } = await supabase
        .from('french_public_holiday')
        .select('holiday_date, label, year')
        .gte('year', startYear)
        .lte('year', endYear)
        .order('holiday_date', { ascending: true });
      if (!error && data && data.length > 0) {
        holidayRows = data
          .map((r) => ({
            holiday_date: toHolidayYmdString(r.holiday_date),
            label: r.label || '',
            year: r.year,
          }))
          .filter((r) => r.holiday_date);
      }
    }
    if (holidayRows.length === 0) {
      holidayRows = getHolidayRowsForYearRange(startYear, endYear).map((r) => ({
        holiday_date: r.holiday_date,
        label: r.label,
        year: r.year,
      }));
    }

    const timesheetsStored = await kvStorage.get(KV_KEYS.TIMESHEETS_AGGREGATE, null);
    const aggregateRows = timesheetsStored?.data || timesheetsStored || [];
    const timesheetsAggregate = {};
    (Array.isArray(aggregateRows) ? aggregateRows : []).forEach((item) => {
      const resourceId = String(item.resourceId || '');
      const deliveryId = String(item.deliveryId || '');
      const month = item.month || '';
      if (!resourceId || !deliveryId || !month) return;
      if (!timesheetsAggregate[resourceId]) timesheetsAggregate[resourceId] = {};
      if (!timesheetsAggregate[resourceId][deliveryId]) timesheetsAggregate[resourceId][deliveryId] = {};
      const days = parseFloat(item.totalDays) || 0;
      const hours = parseFloat(item.totalHours) || 0;
      timesheetsAggregate[resourceId][deliveryId][month] = {
        days,
        hours: hours > 0 ? hours : (days * 7),
      };
    });

    // Fallback historique: complète les mois absents depuis Supabase (utile pour N-1/N-2).
    if (supabase) {
      const { data: tsRows, error: tsError } = await supabase
        .from('timesheets_detail')
        .select('resource_id,delivery_id,month,total_days_prod')
        .gte('month', `${startYear}-01`)
        .lte('month', `${endYear}-12`)
        .neq('delivery_id', 0);
      if (!tsError && Array.isArray(tsRows)) {
        tsRows.forEach((row) => {
          const resourceId = String(row.resource_id || '');
          const deliveryId = String(row.delivery_id || '');
          const month = String(row.month || '');
          if (!resourceId || !deliveryId || !month) return;
          const days = Number(row.total_days_prod) || 0;
          if (days <= 0) return;

          if (!timesheetsAggregate[resourceId]) timesheetsAggregate[resourceId] = {};
          if (!timesheetsAggregate[resourceId][deliveryId]) timesheetsAggregate[resourceId][deliveryId] = {};

          // Ne remplit que les cellules absentes pour éviter de doubler l'agrégat KV existant.
          if (!timesheetsAggregate[resourceId][deliveryId][month]) {
            timesheetsAggregate[resourceId][deliveryId][month] = {
              days,
              hours: days * 7,
            };
          }
        });
      }
    }

    return res.json({
      success: true,
      data: {
        deliveries,
        resourcesLocal,
        forecastByDeliveryId,
        orderedDaysByDeliveryId,
        absenceByResource,
        holidays: holidayRows,
        timesheetsAggregate,
      },
    });
  } catch (error) {
    console.error('❌ Erreur /api/data/forecast-bootstrap:', error);
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

// --- Réinitialiser les feuilles de temps (6 derniers mois pour éviter timeout)
router.post('/timesheets-reset', async (req, res) => {
  try {
    await kvStorage.del(KV_KEYS.TIMESHEETS_DATA);
    await kvStorage.del(KV_KEYS.TIMESHEETS_AGGREGATE);
    
    // Limiter à 6 mois pour éviter timeout Vercel
    const now = new Date();
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const startMonth = `${sixMonthsAgo.getFullYear()}-${String(sixMonthsAgo.getMonth() + 1).padStart(2, '0')}`;
    const endMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const syncTimesheets = require('../../sync_timesheets');
    const result = await syncTimesheets(startMonth, endMonth);
    const count = result?.metadata?.totalTimesheets ?? 0;
    const totalEntries = result?.metadata?.totalEntries ?? 0;
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
