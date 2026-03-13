/**
 * Proxy explicite en dev : toutes les requêtes /api/* sont envoyées au serveur (port 3000).
 * Évite "La connexion a échoué" quand le client tourne sur le port 3001.
 */
const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/api',
    createProxyMiddleware({
      target: 'http://localhost:3000',
      changeOrigin: true,
      secure: false,
    })
  );
};
