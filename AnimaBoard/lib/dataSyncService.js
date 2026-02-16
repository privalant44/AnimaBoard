const axios = require('axios');
const boondManagerServiceInstance = require('../server/services/boondManagerService');
const constants = require('./constants');

// Cache en mémoire pour Vercel (sera perdu entre les invocations mais utile pour les requêtes multiples)
const cache = {
  resources: null,
  resourcesTimestamp: null,
  deliveries: null,
  deliveriesTimestamp: null,
  timesheets: null,
  timesheetsTimestamp: null,
  timesheetsAggregate: null,
  timesheetsAggregateTimestamp: null,
  forecastTimes: null,
  forecastTimesTimestamp: null
};

class DataSyncService {
  constructor() {
    this.boondService = boondManagerServiceInstance;
  }

  /**
   * Vérifie si une valeur est en cache et valide
   * @param {string} cacheKey - Clé du cache
   * @param {number} timestamp - Timestamp de la valeur
   * @returns {boolean}
   */
  _isCacheValid(cacheKey, timestamp) {
    if (!cache[cacheKey] || !timestamp) return false;
    const now = Date.now();
    return (now - timestamp) < constants.CACHE_TTL;
  }

  /**
   * Récupère les ressources depuis BoondManager avec cache
   * @returns {Promise<Object>} Les ressources
   */
  async getResources() {
    const now = Date.now();
    if (this._isCacheValid('resources', cache.resourcesTimestamp)) {
      return cache.resources;
    }

    try {
      const resources = await this.boondService.getResources();
      cache.resources = resources;
      cache.resourcesTimestamp = now;
      return resources;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des ressources:', error);
      throw error;
    }
  }

  /**
   * Récupère les credentials BoondManager
   * @returns {{email: string, password: string}}
   * @throws {Error} Si les credentials ne sont pas configurés
   */
  _getCredentials() {
    const email = process.env.BOOND_EMAIL || process.env.BOOND_TOKEN_CLIENT;
    const password = process.env.BOOND_PASSWORD || process.env.BOOND_CLEF_CLIENT;

    if (!email || !password) {
      throw new Error('BoondManager credentials not configured');
    }

    return { email, password };
  }

  /**
   * Crée la configuration axios pour les requêtes BoondManager
   * @param {Object} options - Options supplémentaires
   * @returns {Object} Configuration axios
   */
  _createAxiosConfig(options = {}) {
    const { email, password } = this._getCredentials();
    
    return {
      auth: { username: email, password },
      headers: {
        'Accept': 'application/hal+json',
        'X-Requested-With': 'XMLHttpRequest',
        ...options.headers
      },
      timeout: options.timeout || constants.BOOND_DEFAULT_TIMEOUT
    };
  }

  /**
   * Extrait les jours commandés depuis les attributs d'une prestation
   * @param {Object} attributes - Attributs de la prestation
   * @returns {number|null} Nombre de jours commandés
   */
  _extractOrderedDays(attributes) {
    const fields = [
      'numberOfDaysInvoicedOrQuantity',
      'orderedDays',
      'orderedQuantity',
      'quantity',
      'duration'
    ];

    for (const field of fields) {
      if (attributes[field] !== undefined && attributes[field] !== null) {
        const value = parseFloat(attributes[field]);
        if (!isNaN(value)) {
          return value;
        }
      }
    }

    return null;
  }

  /**
   * Récupère les prestations (deliveries) depuis BoondManager avec cache
   * @returns {Promise<Object>} Les prestations
   */
  async getDeliveries() {
    const now = Date.now();
    if (this._isCacheValid('deliveries', cache.deliveriesTimestamp)) {
      return cache.deliveries;
    }

    try {
      const config = this._createAxiosConfig();
      const allDeliveries = [];

      // Récupérer les prestations par batch
      for (let id = constants.DELIVERIES_START_ID; id <= constants.DELIVERIES_END_ID; id++) {
        try {
          const response = await axios.get(
            `${constants.BOOND_API_URL}/deliveries/${id}`,
            config
          );
          
          if (response.data?.data?.type === 'delivery') {
            const deliveryData = response.data.data;
            const attributes = deliveryData.attributes || {};
            const relationships = deliveryData.relationships || {};
            
            const resourceId = relationships.dependsOn?.data?.id || null;
            const orderedDays = this._extractOrderedDays(attributes);
            
            const filteredDelivery = {
              id: deliveryData.id,
              type: deliveryData.type,
              startDate: attributes.startDate || null,
              endDate: attributes.endDate || null,
              title: attributes.title || null,
              state: attributes.state !== undefined ? attributes.state : null,
              averageDailyPriceExcludingTax: attributes.averageDailyPriceExcludingTax ?? null,
              resource_id: resourceId,
              orderedDays: orderedDays
            };
            
            allDeliveries.push(filteredDelivery);
          }
          
          // Délai entre les requêtes pour éviter de surcharger l'API
          if (id % constants.DELIVERIES_BATCH_SIZE === 0) {
            await new Promise(resolve => setTimeout(resolve, constants.BOOND_REQUEST_DELAY));
          }
        } catch (error) {
          // Ignorer les 404 (IDs inexistants)
          if (error.response?.status !== 404) {
            console.error(`❌ Erreur pour delivery ${id}:`, error.message);
          }
        }
      }

      const result = {
        metadata: {
          extractedAt: new Date().toISOString(),
          totalRecords: allDeliveries.length
        },
        data: {
          data: allDeliveries
        }
      };

      cache.deliveries = result;
      cache.deliveriesTimestamp = now;
      return result;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des prestations:', error);
      throw error;
    }
  }

  /**
   * Convertit les heures en jours selon le standard français
   * @param {number} hours - Nombre d'heures
   * @returns {number} Nombre de jours
   */
  _hoursToDays(hours) {
    if (!hours || isNaN(hours)) return 0;
    return hours / constants.HOURS_PER_DAY;
  }

  /**
   * Convertit les jours en heures selon le standard français
   * @param {number} days - Nombre de jours
   * @returns {number} Nombre d'heures
   */
  _daysToHours(days) {
    if (!days || isNaN(days)) return 0;
    return days * constants.HOURS_PER_DAY;
  }

  /**
   * Extrait les données d'un item de timesheet
   * @param {Object} item - Item de timesheet
   * @returns {Object} Données extraites
   */
  _extractTimesheetItem(item) {
    const projectId = item.relationships?.dependsOn?.data?.id || null;
    const deliveryId = item.relationships?.delivery?.data?.id || null;
    
    // Prioriser les jours, sinon convertir les heures
    let days = item.attributes?.numberOfDays;
    let hours = item.attributes?.numberOfHours;
    
    if (days === null || days === undefined) {
      if (hours !== null && hours !== undefined) {
        days = this._hoursToDays(hours);
      } else {
        days = 0;
      }
    }
    
    if (hours === null || hours === undefined) {
      hours = this._daysToHours(days);
    }
    
    const value = item.attributes?.value || days || 0;
    
    return {
      projectId: projectId ? String(projectId) : null,
      deliveryId: deliveryId ? String(deliveryId) : null,
      days: parseFloat(days) || 0,
      hours: parseFloat(hours) || 0,
      value: parseFloat(value) || 0
    };
  }

  /**
   * Récupère les timesheets depuis BoondManager avec cache
   * @param {string|null} startMonth - Mois de début (format YYYY-MM)
   * @param {string|null} endMonth - Mois de fin (format YYYY-MM)
   * @returns {Promise<Object>} Les timesheets
   */
  async getTimesheets(startMonth = null, endMonth = null) {
    const now = Date.now();
    if (this._isCacheValid('timesheets', cache.timesheetsTimestamp)) {
      return cache.timesheets;
    }

    try {
      const currentYear = new Date().getFullYear();
      const startMonthStr = startMonth || `${currentYear - 1}-01`;
      const endMonthStr = endMonth || `${currentYear}-12`;

      const config = this._createAxiosConfig({
        headers: { 'Accept': 'application/hal+json' }
      });

      // Récupérer la liste des timesheets
      const timesheetsListResponse = await axios.get(
        `${constants.BOOND_API_URL}/timesreports`,
        {
          ...config,
          params: {
            startMonth: startMonthStr,
            endMonth: endMonthStr,
            maxResults: constants.TIMESHEETS_MAX_RESULTS,
            validationStates: constants.TIMESHEETS_VALIDATION_STATES
          }
        }
      );

      const timesheetsList = timesheetsListResponse.data._embedded?.timeReports || [];
      
      // Limiter pour Vercel (éviter les timeouts)
      const maxTimesheets = Math.min(
        timesheetsList.length,
        constants.TIMESHEETS_MAX_FOR_VERCEL
      );
      
      const timesheetsData = {};
      
      for (let i = 0; i < maxTimesheets; i++) {
        const timesheet = timesheetsList[i];
        try {
          const detailResponse = await axios.get(
            `${constants.BOOND_API_URL}/timesreports/${timesheet.id}`,
            config
          );
          
          const detail = detailResponse.data;
          const timesheetData = detail.data?.data || detail.data || detail;
          const included = detail.included || [];
          
          // Filtrer uniquement les items de production
          const productionItems = included.filter(item => 
            item.type === 'timeReportItem' && 
            (item.attributes?.activityType === 'production' || 
             item.attributes?.workUnitType?.activityType === 'production')
          );
          
          const resourceId = timesheetData.relationships?.dependsOn?.data?.id || 
                            timesheetData.attributes?.resourceId ||
                            timesheet.resourceId;
          const resourceName = timesheetData.attributes?.dependsOnName || '';
          const month = timesheetData.attributes?.month || 
                       timesheetData.attributes?.term ||
                       timesheet.month ||
                       timesheet.term;
          
          if (!timesheetsData[timesheet.id]) {
            timesheetsData[timesheet.id] = {
              timesheetId: String(timesheet.id),
              resourceId: resourceId ? String(resourceId) : null,
              resourceName: resourceName,
              month: month,
              items: []
            };
          }
          
          // Extraire les données de chaque item
          productionItems.forEach(item => {
            const extracted = this._extractTimesheetItem(item);
            timesheetsData[timesheet.id].items.push(extracted);
          });
          
          await new Promise(resolve => setTimeout(resolve, constants.BOOND_REQUEST_DELAY));
        } catch (error) {
          if (error.response?.status !== 404) {
            console.error(`❌ Erreur pour timesheet ${timesheet.id}:`, error.message);
          }
        }
      }

      const result = { data: timesheetsData };
      cache.timesheets = result;
      cache.timesheetsTimestamp = now;
      return result;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération des timesheets:', error);
      throw error;
    }
  }

  /**
   * Génère l'agrégat des timesheets par ressource, prestation et mois
   * @returns {Promise<Object>} L'agrégat des timesheets
   */
  async getTimesheetsAggregate() {
    const now = Date.now();
    if (this._isCacheValid('timesheetsAggregate', cache.timesheetsAggregateTimestamp)) {
      return cache.timesheetsAggregate;
    }

    try {
      const timesheetsData = await this.getTimesheets();
      const grouped = new Map();
      
      // Agréger les données
      Object.values(timesheetsData.data).forEach(timesheet => {
        if (!timesheet.resourceId || !timesheet.month) return;
        
        timesheet.items.forEach(item => {
          if (!item.deliveryId) return;
          
          const key = `${timesheet.resourceId}-${item.deliveryId}-${timesheet.month}`;
          
          if (!grouped.has(key)) {
            grouped.set(key, {
              resourceId: String(timesheet.resourceId),
              deliveryId: String(item.deliveryId),
              month: timesheet.month,
              totalDays: 0,
              totalHours: 0
            });
          }
          
          const aggregate = grouped.get(key);
          aggregate.totalDays += parseFloat(item.days) || 0;
          aggregate.totalHours += parseFloat(item.hours) || 0;
        });
      });
      
      const result = {
        data: Array.from(grouped.values())
      };
      
      cache.timesheetsAggregate = result;
      cache.timesheetsAggregateTimestamp = now;
      return result;
    } catch (error) {
      console.error('❌ Erreur lors de la génération de l\'agrégat:', error);
      throw error;
    }
  }

  /**
   * Récupère les temps prévisionnels (forecast-times)
   * Note: Les forecast-times sont principalement gérés côté client
   * @returns {Promise<Object>} Les temps prévisionnels
   */
  async getForecastTimes() {
    const now = Date.now();
    if (this._isCacheValid('forecastTimes', cache.forecastTimesTimestamp)) {
      return cache.forecastTimes;
    }

    // Retourner un objet vide par défaut
    // Les forecast-times sont gérés via l'API /api/data/forecast-times
    const result = { data: {} };
    cache.forecastTimes = result;
    cache.forecastTimesTimestamp = now;
    return result;
  }
}

module.exports = new DataSyncService();
