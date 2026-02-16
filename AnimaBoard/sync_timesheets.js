const axios = require('axios');
const path = require('path');
require('dotenv').config();
require('./lib/secretEnv');
const kvStorage = require('./lib/kvStorage');
const { KV_KEYS } = require('./lib/constants');

const baseURL = process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api';

let email = process.env.BOOND_EMAIL;
let password = process.env.BOOND_PASSWORD;

console.log('🚀 Synchronisation des feuilles de temps (timesheets)\n');
console.log('='.repeat(80));
if (!email || !password) {
  console.error('❌ Erreur: BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC) requis');
  process.exit(1);
}
console.log(`🔑 Authentification: Basic Auth avec ${email}\n`);

// Fonction pour faire un délai
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fonction pour faire une requête avec Basic Auth
async function makeRequest(endpoint, params = {}) {
  const config = {
    params,
    auth: {
      username: email,
      password: password
    },
    headers: {
      'Accept': 'application/hal+json'
    },
    timeout: 30000
  };

  const fullUrl = `${baseURL}${endpoint}`;
  console.log(`📡 Appel GET: ${fullUrl}`);
  if (Object.keys(params).length > 0) {
    console.log(`   Paramètres:`, JSON.stringify(params, null, 2));
  }

  try {
    const response = await axios.get(fullUrl, config);
    console.log(`✅ Réponse reçue (status: ${response.status})`);
    return response.data;
  } catch (error) {
    console.error(`❌ Erreur lors de l'appel à ${fullUrl}:`, error.message);
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Data:`, JSON.stringify(error.response.data, null, 2).substring(0, 500));
    }
    throw error;
  }
}

// Fonction pour récupérer la liste des feuilles de temps
async function getTimesheetsList(startMonth, endMonth, maxResults = 500, validationStates = 'waitingForValidation,validated') {
  console.log(`\n📋 ÉTAPE 1 : Récupération de la liste des feuilles de temps\n`);
  console.log(`📅 Période: ${startMonth} à ${endMonth}`);
  console.log(`📊 Max résultats: ${maxResults}`);
  console.log(`✅ États de validation: ${validationStates}\n`);

  const params = {
    startMonth,
    endMonth,
    maxResults,
    validationStates
  };

  const response = await makeRequest('/timesreports', params);

  // Extraire les feuilles de temps depuis _embedded.timeReports
  let timesheets = [];
  if (response._embedded && response._embedded.timeReports) {
    timesheets = response._embedded.timeReports;
  } else if (Array.isArray(response)) {
    timesheets = response;
  } else if (response.data && Array.isArray(response.data)) {
    timesheets = response.data;
  }

  console.log(`✅ ${timesheets.length} feuilles de temps trouvées\n`);

  return timesheets;
}

// Fonction pour récupérer le détail d'une feuille de temps
async function getTimesheetDetail(timesheetId, index, total) {
  console.log(`📥 Récupération du détail de la feuille ${timesheetId} (${index + 1}/${total})...`);

  const response = await makeRequest(`/timesreports/${timesheetId}`);

  // Debug : Afficher la structure de la réponse pour les 2 premières feuilles
  if (index < 2) {
    console.log(`   🔍 Structure complète de la réponse:`, JSON.stringify(response, null, 2));
  }

  // La structure semble être : { meta: {...}, data: { data: {...} }, included: [...] }
  const timesheetData = response.data?.data || response.data || response;
  const included = response.included || [];

  // Extraire les items depuis les différents types de temps
  let items = [];
  
  // Essayer d'abord _embedded.timeReportItems (structure HAL)
  if (response._embedded && response._embedded.timeReportItems) {
    items = response._embedded.timeReportItems;
    console.log(`   ✅ Items trouvés dans _embedded.timeReportItems`);
  } 
  // Sinon, essayer dans data.data.attributes (structure JSON:API)
  else if (timesheetData.attributes) {
    const attrs = timesheetData.attributes;
    
    // Les items peuvent être dans regularTimes, exceptionalTimes, ou plannedTime
    if (attrs.regularTimes && Array.isArray(attrs.regularTimes)) {
      items = items.concat(attrs.regularTimes);
      console.log(`   ✅ ${attrs.regularTimes.length} items trouvés dans regularTimes`);
    }
    if (attrs.exceptionalTimes && Array.isArray(attrs.exceptionalTimes)) {
      items = items.concat(attrs.exceptionalTimes);
      console.log(`   ✅ ${attrs.exceptionalTimes.length} items trouvés dans exceptionalTimes`);
    }
    if (attrs.plannedTime && Array.isArray(attrs.plannedTime)) {
      items = items.concat(attrs.plannedTime);
      console.log(`   ✅ ${attrs.plannedTime.length} items trouvés dans plannedTime`);
    }
    // Essayer aussi timeReportItems directement
    if (attrs.timeReportItems && Array.isArray(attrs.timeReportItems)) {
      items = items.concat(attrs.timeReportItems);
      console.log(`   ✅ ${attrs.timeReportItems.length} items trouvés dans timeReportItems`);
    }
  }
  // Essayer dans data._embedded
  else if (response.data && response.data._embedded && response.data._embedded.timeReportItems) {
    items = response.data._embedded.timeReportItems;
    console.log(`   ✅ Items trouvés dans data._embedded.timeReportItems`);
  }
  // Essayer dans _embedded directement
  else if (response._embedded && Array.isArray(response._embedded)) {
    items = response._embedded;
    console.log(`   ✅ Items trouvés dans _embedded (tableau)`);
  }
  // Essayer si la réponse est directement un tableau
  else if (Array.isArray(response)) {
    items = response;
    console.log(`   ✅ Items trouvés dans la réponse (tableau)`);
  }

  if (items.length === 0) {
    console.warn(`   ⚠️  Aucun item trouvé. Structure:`, Object.keys(response || {}));
    if (timesheetData && timesheetData.attributes) {
      console.warn(`   ⚠️  Clés dans attributes:`, Object.keys(timesheetData.attributes || {}));
    }
  }

  // Filtrer uniquement les items avec activityType "production"
  const productionItems = items.filter((item) => {
    const workUnitType = item.workUnitType || {};
    const activityType = workUnitType.activityType || '';
    return activityType === 'production';
  });

  const filteredCount = items.length - productionItems.length;
  if (filteredCount > 0) {
    console.log(`   🔍 ${filteredCount} items filtrés (non-production), ${productionItems.length} items production conservés`);
  }

  console.log(`   ✅ ${productionItems.length} items production trouvés pour la feuille ${timesheetId}`);

  return {
    timesheet: response,
    timesheetData: timesheetData,
    included: included,
    items: productionItems
  };
}

// Fonction pour extraire les informations de la ressource depuis une feuille de temps
function extractResourceInfo(timesheet, timesheetData, included) {
  // Essayer plusieurs chemins possibles
  let resource = null;
  let resourceId = null;

  // 1. Depuis _embedded (structure HAL)
  if (timesheet._embedded && timesheet._embedded.resource) {
    resource = timesheet._embedded.resource;
  }
  // 2. Depuis relationships (structure JSON:API)
  else if (timesheetData && timesheetData.relationships && timesheetData.relationships.resource) {
    resourceId = timesheetData.relationships.resource.data?.id || null;
    // Chercher dans included
    if (resourceId && included && Array.isArray(included)) {
      resource = included.find(item => (item.id || item.ID || item.Id) === resourceId);
    }
  }
  // 3. Depuis les attributs directs
  else if (timesheetData && timesheetData.attributes) {
    const attrs = timesheetData.attributes;
    resourceId = attrs.resourceId || attrs.resource?.id || null;
    if (resourceId && included && Array.isArray(included)) {
      resource = included.find(item => (item.id || item.ID || item.Id) === resourceId);
    }
  }
  // 4. Depuis resource directement
  else if (timesheet.resource) {
    resource = timesheet.resource;
  }

  if (resource) {
    const attributes = resource.attributes || resource;
    resourceId = resourceId || resource.id || resource.ID || resource.Id || attributes.id || null;
    const firstName = attributes.firstName || '';
    const lastName = attributes.lastName || '';
    const resourceName = `${firstName} ${lastName}`.trim() ||
                         attributes.name ||
                         attributes.fullName ||
                         attributes.title ||
                         'Ressource inconnue';
    
    return {
      resourceId: resourceId ? String(resourceId) : null,
      resourceName: resourceName || 'Ressource inconnue'
    };
  }

  // Si pas de ressource trouvée, essayer dans les attributs de la feuille
  const attributes = (timesheetData && timesheetData.attributes) || {};
  const resourceIdFromAttrs = attributes.resourceId || attributes.resource?.id || null;
  const resourceNameFromAttrs = attributes.resourceName || attributes.resource?.name || null;

  return {
    resourceId: resourceIdFromAttrs ? String(resourceIdFromAttrs) : null,
    resourceName: resourceNameFromAttrs || 'Ressource inconnue'
  };
}

// Fonction pour extraire le mois depuis une feuille de temps
function extractMonth(timesheet, timesheetData) {
  // Essayer plusieurs chemins possibles
  const month = (timesheetData && timesheetData.attributes && timesheetData.attributes.term) ||
                (timesheetData && timesheetData.attributes && timesheetData.attributes.month) ||
                (timesheetData && timesheetData.attributes && timesheetData.attributes.period) ||
                timesheet.attributes?.term ||
                timesheet.attributes?.month ||
                timesheet.attributes?.period ||
                timesheet.month ||
                timesheet.period ||
                timesheet.attributes?.startDate?.substring(0, 7) ||
                timesheet.startDate?.substring(0, 7) ||
                timesheet.attributes?.date?.substring(0, 7) ||
                timesheet.date?.substring(0, 7);

  return month || null;
}

// Fonction pour extraire les informations d'un item
function extractItemInfo(item, itemIndex = 0, included = [], timesheetData = null) {
  // Debug pour les 2 premiers items de la première feuille
  if (itemIndex < 2) {
    console.log(`      🔍 Structure item ${itemIndex}:`, JSON.stringify(item, null, 2).substring(0, 800));
  }

  // Extraire l'ID du projet - essayer plusieurs chemins
  let projectId = null;
  
  // 1. Depuis item.project directement (peut être null)
  if (item.project) {
    projectId = item.project.id || item.project.ID || item.project.Id || null;
  }
  // 2. Si project est null dans l'item, essayer de trouver via les orders de la feuille
  else if (timesheetData && timesheetData.relationships && timesheetData.relationships.orders) {
    const orders = timesheetData.relationships.orders.data || [];
    // Prendre le premier order (ou essayer de faire correspondre avec row/batch)
    if (orders.length > 0 && included) {
      const firstOrder = orders[0];
      const order = included.find(inc => inc.type === firstOrder.type && (inc.id || inc.ID || inc.Id) === firstOrder.id);
      if (order && order.relationships && order.relationships.project) {
        projectId = order.relationships.project.data?.id || null;
      }
    }
  }
  // 3. Depuis les projets de la feuille (prendre le premier si plusieurs)
  else if (timesheetData && timesheetData.relationships && timesheetData.relationships.projects) {
    const projects = timesheetData.relationships.projects.data || [];
    if (projects.length > 0) {
      projectId = projects[0].id || null;
    }
  }

  // Extraire l'ID de la prestation (delivery) - essayer plusieurs chemins
  let deliveryId = null;
  
  // 1. Depuis item.delivery directement (peut être null)
  if (item.delivery) {
    deliveryId = item.delivery.id || item.delivery.ID || item.delivery.Id || null;
  }
  // 2. Si delivery est null, essayer de trouver via les projets dans included
  else if (projectId && included) {
    const project = included.find(inc => inc.type === 'project' && (inc.id || inc.ID || inc.Id) === projectId);
    if (project && project.relationships && project.relationships.deliveries) {
      const deliveries = project.relationships.deliveries.data || [];
      // Prendre la première prestation du projet
      if (deliveries.length > 0) {
        deliveryId = deliveries[0].id || null;
      }
    }
  }

  // Extraire la durée (jours) - utiliser duration
  const days = item.duration !== null && item.duration !== undefined 
    ? parseFloat(item.duration) 
    : (item.days !== null && item.days !== undefined ? parseFloat(item.days) : null);

  // Extraire les heures saisis - essayer plusieurs chemins
  const hours = item.hours !== null && item.hours !== undefined 
    ? parseFloat(item.hours) 
    : (item.nbHours !== null && item.nbHours !== undefined ? parseFloat(item.nbHours) : null);

  // Extraire la valeur totale (utiliser duration/days en priorité)
  const value = days !== null ? days : (hours !== null ? hours : 0);

  // Extraire la date (jour) depuis l'item
  let date = null;
  if (item.startDate) {
    date = item.startDate;
  } else if (item.date) {
    date = item.date;
  }

  // S'assurer que tous les IDs sont des chaînes pour éviter les problèmes de sérialisation
  return {
    projectId: projectId ? String(projectId) : null,
    deliveryId: deliveryId ? String(deliveryId) : null,
    days: days !== null ? (typeof days === 'number' ? days : parseFloat(days)) : null,
    hours: hours !== null ? (typeof hours === 'number' ? hours : parseFloat(hours)) : null,
    value: typeof value === 'number' ? value : parseFloat(value) || 0,
    date: date
  };
}

// Fonction pour restructurer les données en format imbriqué : Ressource > Année > Mois > Jour
function restructureDataByResourceYearMonthDay(timesheetsData) {
  const structured = {};

  for (const timesheet of timesheetsData) {
    const resourceId = timesheet.resourceId ? String(timesheet.resourceId) : 'unknown';
    const resourceName = timesheet.resourceName || 'Ressource inconnue';
    const month = timesheet.month || '';
    
    if (!month) continue;
    
    // Extraire l'année et le mois depuis le format YYYY-MM
    const [year, monthNum] = month.split('-');
    if (!year || !monthNum) continue;
    
    // Initialiser la structure si nécessaire
    if (!structured[resourceId]) {
      structured[resourceId] = {
        resourceName: resourceName,
      };
    }
    if (!structured[resourceId][year]) {
      structured[resourceId][year] = {};
    }
    if (!structured[resourceId][year][monthNum]) {
      structured[resourceId][year][monthNum] = {};
    }
    
    // Grouper les items par jour
    for (const item of timesheet.items) {
      // Extraire le jour depuis l'item (chercher date, startDate ou utiliser le mois)
      let day = '00'; // Par défaut, jour inconnu
      
      if (item.date) {
        try {
          const date = new Date(item.date);
          if (!isNaN(date.getTime())) {
            day = String(date.getDate()).padStart(2, '0');
          }
        } catch (e) {
          // Ignorer les erreurs de parsing
        }
      } else if (item.startDate) {
        try {
          const date = new Date(item.startDate);
          if (!isNaN(date.getTime())) {
            day = String(date.getDate()).padStart(2, '0');
          }
        } catch (e) {
          // Ignorer les erreurs de parsing
        }
      }
      
      if (!structured[resourceId][year][monthNum][day]) {
        structured[resourceId][year][monthNum][day] = [];
      }
      
      // Chercher si une entrée existe déjà pour ce timesheet ce jour
      let timesheetEntry = structured[resourceId][year][monthNum][day].find(
        entry => entry.timesheetId === timesheet.timesheetId
      );
      
      if (!timesheetEntry) {
        timesheetEntry = {
          timesheetId: timesheet.timesheetId,
          items: []
        };
        structured[resourceId][year][monthNum][day].push(timesheetEntry);
      }
      
      timesheetEntry.items.push(item);
    }
  }
  
  return structured;
}

// Fonction pour créer un agrégat par ressource, mois et prestation
function createAggregate(timesheetsData) {
  // Utiliser une Map pour agréger les données
  const aggregateMap = new Map();
  
  // Parcourir tous les timesheets
  for (const timesheet of timesheetsData) {
    const resourceId = timesheet.resourceId ? String(timesheet.resourceId) : null;
    const resourceName = timesheet.resourceName || 'Ressource inconnue';
    const month = timesheet.month || null;
    
    // Parcourir tous les items de ce timesheet
    for (const item of timesheet.items) {
      const deliveryId = item.deliveryId ? String(item.deliveryId) : null;
      
      // Ignorer les items sans prestation
      if (!deliveryId) {
        continue;
      }
      
      // Créer une clé unique pour l'agrégation
      const key = `${resourceId || 'unknown'}_${month || 'unknown'}_${deliveryId}`;
      
      // Récupérer ou créer l'entrée agrégée
      if (!aggregateMap.has(key)) {
        aggregateMap.set(key, {
          resourceId: resourceId,
          resourceName: resourceName,
          month: month,
          deliveryId: deliveryId,
          totalDays: 0,
          totalHours: 0
        });
      }
      
      const aggregate = aggregateMap.get(key);
      
      // Ajouter les jours (si présents)
      if (item.days !== null && item.days !== undefined) {
        aggregate.totalDays += parseFloat(item.days) || 0;
      }
      
      // Ajouter les heures (si présentes)
      if (item.hours !== null && item.hours !== undefined) {
        aggregate.totalHours += parseFloat(item.hours) || 0;
      }
    }
  }
  
  // Convertir la Map en tableau et trier
  const aggregateArray = Array.from(aggregateMap.values());
  
  // Trier par ressource, puis par mois, puis par prestation
  aggregateArray.sort((a, b) => {
    if (a.resourceId !== b.resourceId) {
      return (a.resourceId || '').localeCompare(b.resourceId || '');
    }
    if (a.month !== b.month) {
      return (a.month || '').localeCompare(b.month || '');
    }
    return (a.deliveryId || '').localeCompare(b.deliveryId || '');
  });
  
  return aggregateArray;
}

// Fonction principale de synchronisation
async function syncTimesheets(startMonth = null, endMonth = null) {
  // Période par défaut : 2025 et 2026 (toutes les feuilles de temps sur ces deux années)
  const startMonthStr = startMonth || '2025-01';
  const endMonthStr = endMonth || '2026-12';

  console.log(`📅 Synchronisation des feuilles de temps`);
  console.log(`   Période: ${startMonthStr} à ${endMonthStr}\n`);

  try {
    // Étape 1 : Récupérer la liste des feuilles de temps
    const timesheetsList = await getTimesheetsList(startMonthStr, endMonthStr);

    if (timesheetsList.length === 0) {
      console.log('⚠️  Aucune feuille de temps trouvée pour la période spécifiée.');
      return {
        metadata: {
          syncedAt: new Date().toISOString(),
          period: {
            startMonth: startMonthStr,
            endMonth: endMonthStr
          },
          totalTimesheets: 0,
          totalEntries: 0
        },
        data: []
      };
    }

    // Étape 2 : Récupérer le détail de chaque feuille
    console.log(`\n📋 ÉTAPE 2 : Récupération du détail de chaque feuille de temps\n`);

    const timesheetsData = [];
    let totalItems = 0;

    for (let i = 0; i < timesheetsList.length; i++) {
      const timesheet = timesheetsList[i];
      const timesheetId = timesheet.id || timesheet.ID || timesheet.Id;

      if (!timesheetId) {
        console.warn(`⚠️  Feuille de temps sans ID, ignorée:`, JSON.stringify(timesheet, null, 2).substring(0, 200));
        continue;
      }

      // Délai de 100ms entre chaque appel (sauf le premier)
      if (i > 0) {
        await delay(100);
      }

      try {
        const detail = await getTimesheetDetail(timesheetId, i, timesheetsList.length);
        totalItems += detail.items.length;

        // Extraire les informations de la feuille
        const resourceInfo = extractResourceInfo(detail.timesheet, detail.timesheetData, detail.included);
        const month = extractMonth(detail.timesheet, detail.timesheetData);

        // Extraire les entrées (items) avec les IDs (déjà filtrés pour activityType "production" dans getTimesheetDetail)
        const items = detail.items.map((item, itemIndex) => {
          // Passer aussi included et timesheetData pour pouvoir chercher les relations
          const extractedItem = extractItemInfo(item, itemIndex, detail.included, detail.timesheetData);
          // S'assurer que la date originale est préservée
          if (!extractedItem.date && item.startDate) {
            extractedItem.date = item.startDate;
          } else if (!extractedItem.date && item.date) {
            extractedItem.date = item.date;
          }
          return extractedItem;
        });

        // Créer l'entrée pour cette feuille de temps (s'assurer que tous les IDs sont des chaînes)
        timesheetsData.push({
          timesheetId: String(timesheetId),
          resourceId: resourceInfo.resourceId ? String(resourceInfo.resourceId) : null,
          resourceName: resourceInfo.resourceName,
          month: month,
          items: items
        });

        console.log(`   ✅ Feuille ${timesheetId} traitée: ${items.length} items pour ${resourceInfo.resourceName} (${month || 'mois inconnu'})\n`);
        
        // Afficher un aperçu des items si disponibles
        if (items.length > 0) {
          const firstItem = items[0];
          console.log(`      Aperçu premier item: projectId=${firstItem.projectId}, deliveryId=${firstItem.deliveryId}, days=${firstItem.days}, hours=${firstItem.hours}, value=${firstItem.value}`);
        }
      } catch (error) {
        console.error(`   ❌ Erreur lors de la récupération du détail de la feuille ${timesheetId}:`, error.message);
        if (error.response && error.response.data) {
          console.error(`      Détails:`, JSON.stringify(error.response.data, null, 2).substring(0, 300));
        }
        // Continuer avec les autres feuilles
        continue;
      }
    }

    // Étape 3 : Structurer le JSON final en format imbriqué : Ressource > Année > Mois > Jour
    console.log(`\n📋 ÉTAPE 3 : Structuration des données en format imbriqué (Ressource > Année > Mois > Jour)\n`);

    // Restructurer les données
    const structuredData = restructureDataByResourceYearMonthDay(timesheetsData);
    
    const outputData = {
      metadata: {
        syncedAt: new Date().toISOString(),
        period: {
          startMonth: startMonthStr,
          endMonth: endMonthStr
        },
        totalTimesheets: timesheetsList.length,
        totalEntries: totalItems,
        endpoint: `${baseURL}/timesreports`,
        structure: "Ressource > Année > Mois > Jour"
      },
      data: structuredData
    };

    // Convertir en JSON pour vérifier la taille
    const jsonString = JSON.stringify(outputData, null, 2);
    const sizeInBytes = Buffer.byteLength(jsonString, 'utf8');
    const sizeInMB = sizeInBytes / (1024 * 1024);
    
    console.log(`📊 Taille du fichier JSON: ${sizeInMB.toFixed(2)} MB`);

    // Si le fichier dépasse 10 Mo, découper par année
    if (sizeInMB > 10) {
      console.log(`⚠️  Fichier > 10 MB (${sizeInMB.toFixed(2)} MB), découpage par année...`);
      
      // Extraire les années de la période
      const startYear = parseInt(startMonthStr.split('-')[0]);
      const endYear = parseInt(endMonthStr.split('-')[0]);
      
      // Sauvegarder un fichier par année
      for (let year = startYear; year <= endYear; year++) {
        const yearData = {
          metadata: {
            syncedAt: new Date().toISOString(),
            period: {
              startMonth: year === startYear ? startMonthStr : `${year}-01`,
              endMonth: year === endYear ? endMonthStr : `${year}-12`
            },
            totalTimesheets: 0,
            totalEntries: 0,
            endpoint: `${baseURL}/timesreports`,
            structure: "Ressource > Année > Mois > Jour",
            year: year
          },
          data: {}
        };
        
        // Filtrer les données pour cette année
        let yearTimesheets = 0;
        let yearEntries = 0;
        
        Object.keys(structuredData).forEach(resourceId => {
          const resource = structuredData[resourceId];
          if (resource[String(year)]) {
            yearData.data[resourceId] = {
              resourceName: resource.resourceName,
              [String(year)]: resource[String(year)]
            };
            
            // Compter les timesheets et entries pour cette année
            Object.keys(resource[String(year)]).forEach(month => {
              Object.keys(resource[String(year)][month]).forEach(day => {
                const dayEntries = resource[String(year)][month][day];
                dayEntries.forEach((entry) => {
                  yearTimesheets++;
                  yearEntries += entry.items.length;
                });
              });
            });
          }
        });
        
        yearData.metadata.totalTimesheets = yearTimesheets;
        yearData.metadata.totalEntries = yearEntries;
        
        console.log(`💾 Année ${year} incluse dans les données timesheets (KV)`);
      }
      await kvStorage.set(KV_KEYS.TIMESHEETS_DATA, outputData);
      console.log(`✅ Données timesheets sauvegardées en KV.`);
    } else {
      console.log(`💾 Sauvegarde timesheets en KV...`);
      await kvStorage.set(KV_KEYS.TIMESHEETS_DATA, outputData);
      console.log(`✅ Données timesheets sauvegardées en KV.`);
    }
    
    // Étape 4 : Créer l'agrégat par ressource, mois et prestation
    console.log(`\n📋 ÉTAPE 4 : Création de l'agrégat par ressource, mois et prestation\n`);
    
    const aggregateData = createAggregate(timesheetsData);
    const aggregateOutput = {
      metadata: {
        generatedAt: new Date().toISOString(),
        source: 'KV',
        period: { startMonth: startMonthStr, endMonth: endMonthStr },
        totalRecords: aggregateData.length
      },
      data: aggregateData
    };
    console.log(`💾 Sauvegarde de l'agrégat en KV...`);
    await kvStorage.set(KV_KEYS.TIMESHEETS_AGGREGATE, aggregateOutput);
    console.log(`✅ Agrégat sauvegardé en KV.`);
    
    console.log(`\n📊 Statistiques:`);
    console.log(`   - Feuilles de temps traitées: ${timesheetsList.length}`);
    console.log(`   - Items totales: ${totalItems}`);
    console.log(`   - Ressources uniques: ${new Set(timesheetsData.map(t => t.resourceId).filter(id => id)).size}`);
    console.log(`   - Lignes agrégées: ${aggregateData.length}`);
    
    // Données et agrégat stockés en KV
    console.log(`   - Stockage: KV (Redis)`);

    // Afficher un aperçu
    if (timesheetsData.length > 0) {
      console.log(`\n📋 Aperçu des 3 premières feuilles:`);
      timesheetsData.slice(0, 3).forEach((sheet, index) => {
        console.log(`\n   Feuille ${index + 1} (ID: ${sheet.timesheetId}):`);
        console.log(`     - Ressource: ${sheet.resourceName} (ID: ${sheet.resourceId || 'N/A'})`);
        console.log(`     - Mois: ${sheet.month || 'N/A'}`);
        console.log(`     - Nombre d'items: ${sheet.items.length}`);
        if (sheet.items.length > 0) {
          const firstItem = sheet.items[0];
          console.log(`     - Premier item: projectId=${firstItem.projectId}, deliveryId=${firstItem.deliveryId}, days=${firstItem.days}, hours=${firstItem.hours}, value=${firstItem.value}`);
        }
      });
    }
    
    // Afficher un aperçu de l'agrégat
    if (aggregateData.length > 0) {
      console.log(`\n📋 Aperçu de l'agrégat (3 premières lignes):`);
      aggregateData.slice(0, 3).forEach((agg, index) => {
        console.log(`\n   Ligne ${index + 1}:`);
        console.log(`     - Ressource: ${agg.resourceName} (ID: ${agg.resourceId || 'N/A'})`);
        console.log(`     - Mois: ${agg.month || 'N/A'}`);
        console.log(`     - Prestation ID: ${agg.deliveryId || 'N/A'}`);
        console.log(`     - Total jours: ${agg.totalDays.toFixed(2)}`);
        console.log(`     - Total heures: ${agg.totalHours.toFixed(2)}`);
      });
    }

    return outputData;

  } catch (error) {
    console.error(`\n❌ Erreur lors de la synchronisation:`, error.message);
    if (error.stack) {
      console.error(`   Stack:`, error.stack);
    }
    throw error;
  }
}

// Exporter la fonction pour pouvoir l'utiliser depuis d'autres modules
module.exports = syncTimesheets;

// Exécuter la synchronisation si le script est appelé directement
if (require.main === module) {
  // Récupérer les mois depuis les arguments de ligne de commande si fournis
  const args = process.argv.slice(2);
  let startMonth = null;
  let endMonth = null;

  if (args.length >= 1) {
    startMonth = args[0];
  }
  if (args.length >= 2) {
    endMonth = args[1];
  }

  syncTimesheets(startMonth, endMonth)
    .then(() => {
      console.log('\n✅ Synchronisation terminée avec succès !');
      process.exit(0);
    })
    .catch(error => {
      console.error('\n❌ Erreur fatale:', error.message);
      if (error.stack) {
        console.error('Stack:', error.stack);
      }
      process.exit(1);
    });
}
