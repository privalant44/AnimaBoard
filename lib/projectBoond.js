const axios = require('axios');
const { parseBoondDateTime } = require('./boondDates');
const { PROJECTS_START_ID, PROJECTS_END_ID } = require('./constants');
const { DEFAULT_BASE_URL, getBoondAuthConfig } = require('./boondApi');

function parseProjectRecord(projectData, included = []) {
  const attrs = projectData.attributes || {};
  const company = included.find((item) => item.type === 'company');
  const companyName = company?.attributes?.name || attrs.companyName || null;

  return {
    id: projectData.id,
    reference: attrs.reference || null,
    name: attrs.name || attrs.title || attrs.reference || null,
    state: attrs.state ?? null,
    startDate: attrs.startDate || null,
    endDate: attrs.endDate || null,
    clientName: companyName,
    creationDate: parseBoondDateTime(attrs.creationDate),
    updateDate: parseBoondDateTime(attrs.updateDate),
    raw: projectData,
  };
}

function parseProjectApiPayload(responseData) {
  if (!responseData?.data || responseData.data.type !== 'project') {
    return { project: null };
  }

  return {
    project: parseProjectRecord(responseData.data, responseData.included || []),
  };
}

function getCreationYear(creationDateIso) {
  if (!creationDateIso) return null;
  const y = new Date(creationDateIso).getUTCFullYear();
  return Number.isNaN(y) ? null : y;
}

function isCreationInYear(creationDateIso, year) {
  return getCreationYear(creationDateIso) === year;
}

async function fetchProject(config, baseURL, id) {
  const response = await axios.get(`${baseURL}/projects/${id}`, config);
  if (response.status === 404) {
    return { status: 404, project: null };
  }
  if (response.status >= 400) {
    const err = new Error(`Boond ${response.status} pour project ${id}`);
    err.status = response.status;
    throw err;
  }
  const parsed = parseProjectApiPayload(response.data);
  return { status: 200, ...parsed };
}

module.exports = {
  DEFAULT_BASE_URL,
  PROJECTS_START_ID,
  PROJECTS_END_ID,
  getBoondAuthConfig,
  parseProjectRecord,
  parseProjectApiPayload,
  getCreationYear,
  isCreationInYear,
  fetchProject,
};
