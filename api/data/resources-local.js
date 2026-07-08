/**
 * GET /api/data/resources-local - Ressources depuis la base de données (pas l'API)
 * Inclut les labels du dictionnaire pour type et state
 */
const path = require('path');
try {
  require(path.join(__dirname, '..', '..', 'lib', 'secretEnv'));
} catch (e) {}

const { getResourcesLocalPayload } = require(path.join(__dirname, '..', '..', 'lib', 'dictionarySync'));
const { createVercelHandler } = require(path.join(__dirname, '..', '..', 'lib', 'errorHandler'));

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

module.exports = createVercelHandler(async (req, res) => {
  if (req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  try {
    const { resources, dictionaryOptions } = await getResourcesLocalPayload();
    return sendJson(res, 200, {
      success: true,
      data: resources,
      file: 'resources',
      count: resources.length,
      dictionaryOptions,
    });
  } catch (error) {
    console.error('❌ Erreur /api/data/resources-local:', error);
    return sendJson(res, 500, { success: false, error: error.message });
  }
});
