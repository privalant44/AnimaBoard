#!/usr/bin/env node
/**
 * Lance le serveur en mode production (comme en déploiement).
 * Utilise le build React dans client/build.
 */
process.env.NODE_ENV = 'production';
require('../server/index.js');
