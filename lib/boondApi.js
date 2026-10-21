const axios = require('axios');

const DEFAULT_BASE_URL = process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api';
const MAX_PAGE_SIZE = 500;
const DEFAULT_MAX_PAGES = 200;

function getBoondAuthConfig(email, password, timeoutMs = 60000) {
  return {
    auth: { username: email, password },
    headers: {
      Accept: 'application/hal+json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    timeout: timeoutMs,
    validateStatus: (status) => status < 500,
  };
}

function extractCollectionItems(payload) {
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.data)) return payload.data.data;

  const embedded = payload?._embedded || payload?.data?._embedded;
  if (embedded && typeof embedded === 'object') {
    const collection = Object.values(embedded).find((value) => Array.isArray(value));
    if (collection) return collection;
  }
  return [];
}

function extractCollectionTotal(payload) {
  const candidates = [
    payload?.meta?.totals?.rows,
    payload?.data?.meta?.totals?.rows,
    payload?.meta?.total,
    payload?.total,
  ];
  for (const candidate of candidates) {
    const total = Number(candidate);
    if (Number.isFinite(total) && total >= 0) return total;
  }
  return null;
}

/**
 * Liste les entités réellement présentes dans Boond avant tout appel de détail.
 * Cela évite de sonder des plages numériques contenant des IDs supprimés ou jamais attribués.
 */
async function listBoondCollection(config, baseURL, endpoint, params = {}, options = {}) {
  const pageSize = Math.min(
    MAX_PAGE_SIZE,
    Math.max(1, Number(options.pageSize) || MAX_PAGE_SIZE)
  );
  const maxPages = Math.max(1, Number(options.maxPages) || DEFAULT_MAX_PAGES);
  const entitiesByKey = new Map();

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await axios.get(`${baseURL}${endpoint}`, {
      ...config,
      params: {
        ...(config.params || {}),
        ...params,
        page,
        maxResults: pageSize,
      },
    });

    if (response.status >= 400) {
      const error = new Error(`Boond ${response.status} pour ${endpoint}`);
      error.status = response.status;
      throw error;
    }

    const items = extractCollectionItems(response.data);
    for (const item of items) {
      if (item?.id == null) continue;
      entitiesByKey.set(`${item.type || 'entity'}:${String(item.id)}`, item);
    }

    const total = extractCollectionTotal(response.data);
    if (items.length === 0 || items.length < pageSize) break;
    if (total != null && entitiesByKey.size >= total) break;
    if (page === maxPages) {
      throw new Error(
        `Pagination Boond incomplète pour ${endpoint}: limite de ${maxPages} pages atteinte`
      );
    }
  }

  return [...entitiesByKey.values()];
}

async function listBoondCollectionIds(config, baseURL, endpoint, params = {}, options = {}) {
  const entities = await listBoondCollection(config, baseURL, endpoint, params, options);
  return entities
    .map((entity) => Number(entity.id))
    .filter((id) => Number.isSafeInteger(id) && id > 0);
}

module.exports = {
  DEFAULT_BASE_URL,
  getBoondAuthConfig,
  extractCollectionItems,
  extractCollectionTotal,
  listBoondCollection,
  listBoondCollectionIds,
};
