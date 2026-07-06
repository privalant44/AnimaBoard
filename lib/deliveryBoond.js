const axios = require('axios');
const { parseBoondDateTime } = require('./boondDates');
const { parseProjectRecord } = require('./projectBoond');
const { DELIVERIES_START_ID, DELIVERIES_END_ID } = require('./constants');
const { DEFAULT_BASE_URL, getBoondAuthConfig } = require('./boondApi');

function extractOrderedDays(attributes) {
  if (attributes.numberOfDaysInvoicedOrQuantity != null) {
    return parseFloat(attributes.numberOfDaysInvoicedOrQuantity);
  }
  if (attributes.orderedDays != null) return parseFloat(attributes.orderedDays);
  if (attributes.orderedQuantity != null) return parseFloat(attributes.orderedQuantity);
  if (attributes.quantity != null) return parseFloat(attributes.quantity);
  if (attributes.duration != null) return parseFloat(attributes.duration);
  return null;
}

function parseDeliveryApiPayload(responseData) {
  if (!responseData?.data || responseData.data.type !== 'delivery') {
    return { delivery: null, project: null };
  }

  const deliveryData = responseData.data;
  const attributes = deliveryData.attributes || {};
  const relationships = deliveryData.relationships || {};

  let resourceId = null;
  if (relationships.dependsOn?.data) {
    resourceId = relationships.dependsOn.data.id;
  }

  let projectId = null;
  let project = null;
  if (relationships.project?.data) {
    projectId = relationships.project.data.id;
    const included = responseData.included || [];
    const projectData = included.find(
      (item) => item.type === 'project' && String(item.id) === String(projectId)
    );
    if (projectData) {
      project = parseProjectRecord(projectData, included);
    }
  }

  const orderedDays = extractOrderedDays(attributes);
  const delivery = {
    id: deliveryData.id,
    type: deliveryData.type,
    creationDate: parseBoondDateTime(attributes.creationDate),
    updateDate: parseBoondDateTime(attributes.updateDate),
    startDate: attributes.startDate || null,
    endDate: attributes.endDate || null,
    title: attributes.title || null,
    state: attributes.state !== undefined ? attributes.state : null,
    tjm:
      attributes.averageDailyPriceExcludingTax !== undefined
        ? attributes.averageDailyPriceExcludingTax
        : null,
    averageDailyCost:
      attributes.averageDailyCost != null
        ? attributes.averageDailyCost
        : attributes.averageDailyContractCost != null
          ? attributes.averageDailyContractCost
          : null,
    resourceId,
    projectId,
    orderedDays: orderedDays != null && !Number.isNaN(orderedDays) ? orderedDays : null,
  };

  return { delivery, project };
}

function getCreationYear(creationDateIso) {
  if (!creationDateIso) return null;
  const y = new Date(creationDateIso).getUTCFullYear();
  return Number.isNaN(y) ? null : y;
}

function isCreationInYear(creationDateIso, year) {
  return getCreationYear(creationDateIso) === year;
}

async function deliveryExists(config, baseURL, id) {
  const response = await axios.get(`${baseURL}/deliveries/${id}`, config);
  if (response.status !== 200) return false;
  return response.data?.data?.type === 'delivery';
}

async function findMaxDeliveryId(config, baseURL, options = {}) {
  const low = options.low ?? DELIVERIES_START_ID ?? 1;
  let high = options.high ?? DELIVERIES_END_ID ?? 500;
  const delayMs = options.delayMs ?? 100;

  if (options.high == null && (await deliveryExists(config, baseURL, high))) {
    let probe = high;
    while (await deliveryExists(config, baseURL, probe)) {
      high = probe;
      probe *= 2;
      if (probe > 500000) break;
      if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    }
  }

  let lo = low;
  let hi = high;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const ok = await deliveryExists(config, baseURL, mid);
    if (ok) lo = mid;
    else hi = mid - 1;
    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
  }

  return lo;
}

async function fetchDelivery(config, baseURL, id) {
  const response = await axios.get(`${baseURL}/deliveries/${id}`, config);
  if (response.status === 404) {
    return { status: 404, delivery: null, project: null };
  }
  if (response.status >= 400) {
    const err = new Error(`Boond ${response.status} pour delivery ${id}`);
    err.status = response.status;
    throw err;
  }
  const parsed = parseDeliveryApiPayload(response.data);
  return { status: 200, ...parsed };
}

module.exports = {
  DEFAULT_BASE_URL,
  DELIVERIES_START_ID,
  DELIVERIES_END_ID,
  getBoondAuthConfig,
  parseDeliveryApiPayload,
  getCreationYear,
  isCreationInYear,
  findMaxDeliveryId,
  fetchDelivery,
};
