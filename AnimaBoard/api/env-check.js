/**
 * GET /api/env-check - Vérifie les variables d'environnement configurées
 */
const { createVercelHandler } = require('../lib/errorHandler');
const { isAuthEnabled } = require('../lib/microsoftAuth');
const { isLocalAuthConfigured } = require('../lib/localAuth');

module.exports = createVercelHandler(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  const checks = {
    AUTH_ENABLED: isAuthEnabled() ? '✅ Activé' : '⚪ Désactivé',
    LOCAL_AUTH: isLocalAuthConfigured() ? '✅ Configuré' : '⚪ Non configuré',
    SUPABASE_URL: process.env.SUPABASE_URL ? '✅ Configuré' : '❌ Manquant',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY
      ? '✅ Configuré (' + process.env.SUPABASE_SERVICE_ROLE_KEY.substring(0, 20) + '...)'
      : '❌ Manquant',
    BOOND_API_URL: process.env.BOOND_API_URL ? '✅ Configuré' : '❌ Manquant',
    BOOND_EMAIL: process.env.BOOND_EMAIL ? '✅ Configuré' : '❌ Manquant',
    BOOND_PASSWORD_ENC: process.env.BOOND_PASSWORD_ENC ? '✅ Configuré' : '❌ Manquant',
    NODE_ENV: process.env.NODE_ENV || 'non défini',
  };

  let supabaseStatus = '❌ Non testé';
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { error } = await supabase.from('resources').select('id').limit(1);
      if (error) {
        supabaseStatus = '❌ Erreur: ' + error.message;
      } else {
        supabaseStatus = '✅ Connecté (table resources accessible)';
      }
    } catch (e) {
      supabaseStatus = '❌ Exception: ' + e.message;
    }
  }

  res.status(200).json({
    success: true,
    timestamp: new Date().toISOString(),
    variables: checks,
    supabaseConnection: supabaseStatus,
  });
});
