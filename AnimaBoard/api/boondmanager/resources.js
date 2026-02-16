/**
 * GET /api/boondmanager/resources - Liste des ressources BoondManager
 * Toujours renvoyer du JSON pour éviter les crashes (FUNCTION_INVOCATION_FAILED).
 */
const path = require('path');

function loadSecretEnv() {
  try {
    require(path.join(__dirname, '..', '..', '..', 'lib', 'secretEnv.js'));
  } catch (e) {
    console.warn('secretEnv load (optional):', e.message);
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  try {
    loadSecretEnv();
    const servicePath = path.join(__dirname, '..', '..', '..', 'server', 'services', 'boondManagerService.js');
    const boondManagerService = require(servicePath);
    const resources = await boondManagerService.getResources();
    const list = Array.isArray(resources) ? resources : (resources?.data || []);
    return res.status(200).json({ success: true, data: list, total: list.length });
  } catch (err) {
    console.error('api/boondmanager/resources error:', err);
    const message = err.message || 'Erreur lors de la récupération des ressources depuis BoondManager';
    const detail = err.response?.data ? JSON.stringify(err.response.data).slice(0, 500) : undefined;
    return res.status(500).json({
      success: false,
      error: message,
      errorDetail: detail || message
    });
  }
};
