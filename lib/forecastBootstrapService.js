/**
 * Source unique pour /forecast-bootstrap.
 *
 * La route Express (dev) fait aussi un fallback "historique" via Supabase
 * (remplit les cellules absentes depuis timesheets_detail).
 * La route Vercel (prod) garde un comportement plus léger (KV uniquement),
 * car elle ne fait pas cet appel SQL supplémentaire.
 */
const kvStorage = require('./kvStorage');
const { KV_KEYS } = require('./constants');
const { getSupabase } = require('./supabaseClient');
const { getHolidayRowsForYearRange } = require('./frenchHolidays');
const { toHolidayYmdString } = require('./holidayDate');
const { getResourcesLocalPayload } = require('./dictionarySync');
const { listPlannedDeliveriesByResource } = require('./plannedDeliveriesService');
const { listForecastScenarios } = require('./forecastScenariosService');

function parseYearsFromQuery(reqQuery) {
  const nowY = new Date().getFullYear();
  const fromYear = Math.max(2000, parseInt(String(reqQuery.from ?? nowY - 1), 10) || nowY - 1);
  const years = Math.min(15, Math.max(1, parseInt(String(reqQuery.years ?? '12'), 10) || 12));
  const endYear = fromYear + years - 1;
  return { startYear: fromYear, endYear };
}

async function getForecastBootstrapData({
  reqQuery = {},
  includeSupabaseTimesheetsFallback = false,
} = {}) {
  const deliveriesStored = await kvStorage.get(KV_KEYS.DELIVERIES, null);
  if (!deliveriesStored) {
    const err = new Error(
      'Aucune donnée prestations. Lancez la synchronisation "Prestations" depuis Paramètres.'
    );
    err.status = 404;
    throw err;
  }

  const deliveriesData = deliveriesStored.data || deliveriesStored;
  const deliveries = Array.isArray(deliveriesData) ? deliveriesData : deliveriesData.data || [];

  const { resources: resourcesLocal, dictionaryOptions } = await getResourcesLocalPayload();

  const forecastStored = await kvStorage.get(KV_KEYS.FORECAST_TIMES, null);
  const forecastRaw = forecastStored?.data || {};
  const forecastByDeliveryId = {};
  Object.keys(forecastRaw).forEach((deliveryId) => {
    forecastByDeliveryId[String(deliveryId)] = forecastRaw[deliveryId]?.forecast || {};
  });

  const orderedDaysByDeliveryId = {};
  deliveries.forEach((d) => {
    const od = d?.orderedDays;
    if (od !== null && od !== undefined && !Number.isNaN(Number(od))) {
      orderedDaysByDeliveryId[String(d.id)] = Number(od);
    }
  });

  const absenceStored = await kvStorage.get(KV_KEYS.ABSENCE_MONTHLY, null);
  const absenceRows = Array.isArray(absenceStored?.data)
    ? absenceStored.data
    : Array.isArray(absenceStored)
      ? absenceStored
      : [];

  const absenceByResource = {};
  absenceRows.forEach((row) => {
    const rid = String(row.resourceId ?? '');
    const mo = String(row.month ?? '');
    if (!rid || !mo) return;
    if (!absenceByResource[rid]) absenceByResource[rid] = {};
    absenceByResource[rid][mo] = (absenceByResource[rid][mo] || 0) + (Number(row.days) || 0);
  });

  const { startYear, endYear } = parseYearsFromQuery(reqQuery);

  // Jours fériés
  let holidayRows = [];
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from('french_public_holiday')
      .select('holiday_date, label, year')
      .gte('year', startYear)
      .lte('year', endYear)
      .order('holiday_date', { ascending: true });

    if (!error && Array.isArray(data) && data.length > 0) {
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

  // Timesheets aggregate depuis KV
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
      hours: hours > 0 ? hours : days * 7,
    };
  });

  // Fallback historique : remplir les cellules absentes depuis Supabase (utile en dev).
  if (includeSupabaseTimesheetsFallback && supabase) {
    const { startYear: sy, endYear: ey } = { startYear, endYear };
    const { data: tsRows, error: tsError } = await supabase
      .from('timesheets_detail')
      .select('resource_id,delivery_id,month,total_days_prod')
      .gte('month', `${sy}-01`)
      .lte('month', `${ey}-12`)
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

        // Ne remplit que les cellules absentes pour éviter de doubler l’agrégat KV existant.
        if (!timesheetsAggregate[resourceId][deliveryId][month]) {
          timesheetsAggregate[resourceId][deliveryId][month] = {
            days,
            hours: days * 7,
          };
        }
      });
    }
  }

  let plannedDeliveriesByResource = {};
  try {
    plannedDeliveriesByResource = await listPlannedDeliveriesByResource();
  } catch (e) {
    console.warn('⚠️ planned_deliveries:', e.message || e);
  }

  let forecastScenarios = [];
  try {
    forecastScenarios = await listForecastScenarios();
  } catch (e) {
    console.warn('⚠️ forecast_scenarios:', e.message || e);
  }

  return {
    deliveries,
    resourcesLocal,
    dictionaryOptions,
    forecastByDeliveryId,
    orderedDaysByDeliveryId,
    absenceByResource,
    plannedDeliveriesByResource,
    forecastScenarios,
    holidays: holidayRows,
    timesheetsAggregate,
  };
}

module.exports = { getForecastBootstrapData };

