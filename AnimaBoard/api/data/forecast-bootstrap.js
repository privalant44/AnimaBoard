/**
 * GET /api/data/forecast-bootstrap
 * Endpoint bootstrap unique pour la vue Forecast/Report en environnement Vercel.
 */
const kvStorage = require('../../lib/kvStorage');
const { KV_KEYS } = require('../../lib/constants');
const { getSupabase } = require('../../lib/supabaseClient');
const { getHolidayRowsForYearRange } = require('../../lib/frenchHolidays');
const { toHolidayYmdString } = require('../../lib/holidayDate');
const { createVercelHandler } = require('../../lib/errorHandler');

async function getResourcesLocalEnriched() {
  const stored = await kvStorage.get(KV_KEYS.RESOURCES, []);
  const baseList = Array.isArray(stored) ? stored : (stored?.data || []);

  const dictType = {};
  const dictState = {};
  const supabase = getSupabase();

  if (supabase) {
    const { data: dictRows, error } = await supabase
      .from('dictionnaire')
      .select('table_name, column_name, code, label')
      .eq('table_name', 'resources');

    if (!error && Array.isArray(dictRows)) {
      dictRows.forEach((row) => {
        if (row.column_name === 'type_of') {
          dictType[String(row.code)] = row.label;
        } else if (row.column_name === 'state') {
          dictState[String(row.code)] = row.label;
        }
      });
    }
  }

  return baseList.map((r) => {
    const typeCode = r.typeOf ?? r.type_of ?? null;
    const stateCode = r.state ?? null;
    const typeLabel = typeCode !== null && typeCode !== undefined
      ? (dictType[String(typeCode)] || String(typeCode))
      : 'N/A';
    const stateLabel = stateCode !== null && stateCode !== undefined
      ? (dictState[String(stateCode)] || String(stateCode))
      : undefined;

    return {
      ...r,
      typeLabel,
      stateLabel,
    };
  });
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

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
    const orderedDays = d?.orderedDays;
    if (orderedDays !== null && orderedDays !== undefined && !Number.isNaN(Number(orderedDays))) {
      orderedDaysByDeliveryId[String(d.id)] = Number(orderedDays);
    }
  });

  const absenceStored = await kvStorage.get(KV_KEYS.ABSENCE_MONTHLY, null);
  const absenceRows = Array.isArray(absenceStored?.data)
    ? absenceStored.data
    : (Array.isArray(absenceStored) ? absenceStored : []);
  const absenceByResource = {};
  absenceRows.forEach((row) => {
    const rid = String(row.resourceId ?? '');
    const month = String(row.month ?? '');
    if (!rid || !month) return;
    if (!absenceByResource[rid]) absenceByResource[rid] = {};
    absenceByResource[rid][month] = (absenceByResource[rid][month] || 0) + (Number(row.days) || 0);
  });

  const nowYear = new Date().getFullYear();
  const startYear = Math.max(2000, parseInt(String(req.query.from ?? nowYear - 1), 10) || (nowYear - 1));
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

  return res.status(200).json({
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
}, { statusCode: 500, message: 'Erreur forecast-bootstrap' });
