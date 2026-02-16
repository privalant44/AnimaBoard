/**
 * Gestionnaire d'erreur standardisé pour les API routes
 */

/**
 * Crée une réponse d'erreur standardisée
 * @param {Error} error - L'erreur à formater
 * @param {Object} options - Options supplémentaires
 * @returns {Object} Réponse d'erreur formatée
 */
function formatError(error, options = {}) {
  const {
    statusCode = 500,
    message = null,
    includeStack = process.env.NODE_ENV === 'development',
    includeDetails = process.env.NODE_ENV === 'development'
  } = options;

  const response = {
    success: false,
    error: message || error.message || 'Une erreur est survenue',
    ...(includeDetails && error.response && {
      details: {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      }
    }),
    ...(includeStack && error.stack && { stack: error.stack })
  };

  return { statusCode, response };
}

/**
 * Middleware de gestion d'erreur pour les routes API
 * @param {Function} handler - Fonction async à exécuter
 * @param {Object} options - Options de gestion d'erreur
 * @returns {Function} Middleware Express
 */
function asyncHandler(handler, options = {}) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      const { statusCode, response } = formatError(error, options);
      
      console.error(`❌ Erreur dans ${req.method} ${req.path}:`, error);
      
      res.status(statusCode).json(response);
    }
  };
}

/**
 * Crée un handler pour les routes serverless Vercel
 * @param {Function} handler - Fonction async à exécuter
 * @param {Object} options - Options de gestion d'erreur
 * @returns {Function} Handler Vercel
 */
function createVercelHandler(handler, options = {}) {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      const { statusCode, response } = formatError(error, options);
      
      console.error(`❌ Erreur dans ${req.method} ${req.path}:`, error);
      
      res.status(statusCode).json(response);
    }
  };
}

module.exports = {
  formatError,
  asyncHandler,
  createVercelHandler
};
