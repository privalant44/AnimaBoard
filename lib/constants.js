/**
 * Constantes de configuration pour l'application
 */

module.exports = {
  // Cache
  CACHE_TTL: 5 * 60 * 1000, // 5 minutes en millisecondes

  // BoondManager API
  BOOND_API_URL: process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api',
  BOOND_DEFAULT_TIMEOUT: 30000, // 30 secondes
  BOOND_REQUEST_DELAY: 100, // 100ms entre les requêtes

  // Deliveries
  DELIVERIES_START_ID: 1,
  DELIVERIES_END_ID: 500,
  DELIVERIES_BATCH_SIZE: 50,

  // Projects
  PROJECTS_START_ID: 1,
  PROJECTS_END_ID: 150,

  // Timesheets (max élevé pour récupérer toutes les feuilles 2025-2026)
  TIMESHEETS_MAX_RESULTS: 5000,
  TIMESHEETS_MAX_FOR_VERCEL: 500,
  TIMESHEETS_VALIDATION_STATES: 'draft,submitted,waitingForValidation,validated,rejected',

  // Conversion heures/jours
  HOURS_PER_DAY: 7, // Standard français

  // Clés métier routées vers les tables Supabase (lib/db.js)
  KV_KEYS: {
    RESOURCES_METADATA: 'resources_metadata',
    FORECAST_TIMES: 'forecast_times',
    DELIVERIES: 'deliveries',
    TIMESHEETS_AGGREGATE: 'timesheets_aggregate',
    TIMESHEETS_DATA: 'timesheets_data',
    PROJECTS: 'projects',
    RESOURCES: 'resources',
    FORECAST_REPORT: 'forecast_report',
    /** Agrégat absences Boond : { metadata, data: [{ resourceId, month, days }] } */
    ABSENCE_MONTHLY: 'absence_monthly'
  }
};
