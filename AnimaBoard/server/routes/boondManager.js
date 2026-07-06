const express = require('express');
const router = express.Router();
const boondManagerService = require('../services/boondManagerService');

function extractOpportunitiesFromPayload(payload) {
  if (!payload) return [];
  return (
    (payload._embedded && Array.isArray(payload._embedded.opportunities) && payload._embedded.opportunities) ||
    (Array.isArray(payload.data) && payload.data) ||
    (Array.isArray(payload.opportunities) && payload.opportunities) ||
    (Array.isArray(payload.items) && payload.items) ||
    (Array.isArray(payload) && payload) ||
    []
  );
}

async function fetchBoondOpportunitiesPage(queryParams = {}, fixedEndpoint = null) {
  const endpoints = ['/opportunites', '/opportunities'];
  const candidates = fixedEndpoint ? [fixedEndpoint] : endpoints;
  let payload = null;
  let lastError = null;
  let usedEndpoint = null;

  for (const endpoint of candidates) {
    try {
      payload = await boondManagerService.makeRequest(endpoint, queryParams);
      if (payload) {
        usedEndpoint = endpoint;
        break;
      }
    } catch (err) {
      lastError = err;
    }
  }

  if (!payload && lastError) throw lastError;
  if (!payload) throw new Error('Aucune réponse BoondManager pour les opportunités.');
  return {
    endpoint: usedEndpoint,
    payload,
    list: extractOpportunitiesFromPayload(payload)
  };
}

function extractPaginationInfo(payload) {
  const p = payload?.meta?.pagination || {};
  const currentPage = Number(p.page ?? p.currentPage ?? p.current ?? 1);
  const totalPages = Number(p.pages ?? p.totalPages ?? p.pageCount ?? p.lastPage ?? p.maxPage ?? 0);
  const perPage = Number(p.max ?? p.perPage ?? p.limit ?? 0);

  return {
    currentPage: Number.isFinite(currentPage) && currentPage > 0 ? currentPage : 1,
    totalPages: Number.isFinite(totalPages) && totalPages > 0 ? totalPages : null,
    perPage: Number.isFinite(perPage) && perPage > 0 ? perPage : null
  };
}

function getOpportunityDedupKey(item) {
  if (!item || typeof item !== 'object') return '__invalid__';
  const attrs = item.attributes || {};
  const id = item.id ?? attrs.id ?? item.opportunityId ?? attrs.opportunityId;
  if (id !== undefined && id !== null && id !== '') return `id:${String(id)}`;

  const title = attrs.title ?? item.title ?? attrs.name ?? item.name ?? '';
  const created = attrs.creationDate ?? item.creationDate ?? attrs.createdAt ?? item.createdAt ?? '';
  const updated = attrs.updateDate ?? item.updateDate ?? attrs.updatedAt ?? item.updatedAt ?? '';
  const typeOf = attrs.typeOf ?? item.typeOf ?? attrs.type ?? item.type ?? '';
  return `fallback:${String(title)}|${String(created)}|${String(updated)}|${String(typeOf)}`;
}

async function fetchBoondOpportunities(queryParams = {}, options = {}) {
  const { paginate = false, maxPages = 200 } = options;
  const first = await fetchBoondOpportunitiesPage(queryParams);

  if (!paginate) {
    return {
      endpoint: first.endpoint,
      payload: first.payload,
      list: first.list,
      pagesFetched: 1
    };
  }

  const { totalPages, currentPage, perPage } = extractPaginationInfo(first.payload);
  const uniqueById = new Map();
  first.list.forEach((item) => {
    const key = getOpportunityDedupKey(item);
    if (!uniqueById.has(key)) uniqueById.set(key, item);
  });

  let pagesFetched = 1;
  let page = currentPage;
  let stagnantPages = 0;

  while (pagesFetched < maxPages) {
    if (totalPages && page >= totalPages) break;
    if (!totalPages && first.list.length === 0) break;

    const nextPage = page + 1;
    const pagedQuery = { ...queryParams, page: nextPage };
    const next = await fetchBoondOpportunitiesPage(pagedQuery, first.endpoint);
    const pageList = Array.isArray(next.list) ? next.list : [];
    if (pageList.length === 0) break;

    const before = uniqueById.size;
    pageList.forEach((item) => {
      const key = getOpportunityDedupKey(item);
      if (!uniqueById.has(key)) uniqueById.set(key, item);
    });

    const after = uniqueById.size;
    stagnantPages = after === before ? stagnantPages + 1 : 0;
    pagesFetched += 1;
    page = nextPage;

    // Protection anti-boucle: si les pages suivantes n'apportent rien, on arrête.
    if (stagnantPages >= 2) break;
    // Sans info "totalPages", si la page reçue n'est plus pleine, on suppose la fin.
    if (!totalPages && perPage && pageList.length < perPage) break;
  }

  return {
    endpoint: first.endpoint,
    payload: first.payload,
    list: Array.from(uniqueById.values()),
    pagesFetched
  };
}

function parseDateLike(value) {
  if (value === undefined || value === null || value === '') return null;

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const fromEpoch = (n) => {
    if (!Number.isFinite(n)) return null;
    // Boond peut renvoyer des epochs en secondes ou millisecondes.
    const ms = Math.abs(n) < 1e12 ? n * 1000 : n;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d;
  };

  if (typeof value === 'number') return fromEpoch(value);

  const raw = String(value).trim();
  if (!raw) return null;

  const boondMsMatch = raw.match(/^\/Date\(([-]?\d+)\)\/$/);
  if (boondMsMatch) {
    return fromEpoch(Number(boondMsMatch[1]));
  }

  if (/^[-]?\d+(\.\d+)?$/.test(raw)) {
    return fromEpoch(Number(raw));
  }

  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function toIsoOrNull(value) {
  const d = parseDateLike(value);
  return d ? d.toISOString() : null;
}

function normalizeOpportunityToBesoin(item) {
  if (!item || typeof item !== 'object') return null;

  const attrs = item.attributes || {};
  const rawId =
    item.id ??
    attrs.id ??
    item.opportunityId ??
    attrs.opportunityId ??
    null;

  const id = Number(rawId);
  if (!Number.isFinite(id)) return null;

  const title =
    attrs.title ??
    item.title ??
    attrs.name ??
    item.name ??
    attrs.label ??
    item.label ??
    '';

  const createdAt =
    attrs.creationDate ??
    item.creationDate ??
    attrs.createdAt ??
    item.createdAt ??
    attrs.created_at ??
    item.created_at ??
    null;

  const updatedAt =
    attrs.updateDate ??
    item.updateDate ??
    attrs.updatedAt ??
    item.updatedAt ??
    attrs.updated_at ??
    item.updated_at ??
    null;

  const typeOf =
    attrs.typeOf ??
    item.typeOf ??
    attrs.projectType ??
    item.projectType ??
    attrs.type ??
    item.type ??
    null;
  const state =
    attrs.state ??
    item.state ??
    attrs.status ??
    item.status ??
    null;

  return {
    id,
    titre: String(title || ''),
    date_creation: toIsoOrNull(createdAt),
    date_mise_a_jour: toIsoOrNull(updatedAt),
    type_of: typeOf !== undefined && typeOf !== null && typeOf !== '' ? String(typeOf) : null,
    state: state !== undefined && state !== null && state !== '' ? String(state) : null
  };
}

// Test de connexion à l'API
router.get('/test', async (req, res) => {
  try {
    console.log('🧪 Test de connexion API BoondManager demandé...');
    const hasCredentials = !!(process.env.BOOND_EMAIL && (process.env.BOOND_PASSWORD || process.env.BOOND_PASSWORD_ENC));
    const apiUrl = process.env.BOOND_API_URL;

    console.log('📋 Configuration:');
    console.log(`   - URL API: ${apiUrl}`);
    console.log(`   - Email: ${process.env.BOOND_EMAIL || 'Non configuré'}`);
    console.log(`   - Mot de passe: ${(process.env.BOOND_PASSWORD || process.env.BOOND_PASSWORD_ENC) ? 'Configuré' : 'Non configuré'}`);

    if (!hasCredentials) {
      return res.status(400).json({
        success: false,
        message: 'Les identifiants API ne sont pas configurés',
        error: 'BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC) requis',
        hasCredentials: false,
        apiUrl: apiUrl
      });
    }

    console.log('📡 Tentative de récupération des ressources...');
    const resources = await boondManagerService.getResources();
    
    console.log('✅ Test de connexion réussi');
    console.log(`📊 Nombre de ressources récupérées: ${resources?.total || resources?.data?.length || 0}`);
    console.log(`📊 Structure des données:`, JSON.stringify(resources, null, 2).substring(0, 1000));
    
    res.json({ 
      success: true, 
      message: 'Connexion BoondManager réussie',
      hasCredentials: true,
      apiUrl: apiUrl,
      data: resources,
      totalResources: resources?.total || resources?.data?.length || 0
    });
  } catch (error) {
    console.error('❌ Erreur lors du test de connexion:', error);
    console.error('❌ Error details:', {
      message: error.message,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        headers: error.response.headers,
        data: error.response.data
      } : 'No response',
      stack: error.stack
    });
    
    res.status(500).json({ 
      success: false,
      message: 'Erreur lors de la connexion à l\'API BoondManager',
      error: error.message,
      errorDetails: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      } : undefined,
      hasCredentials: !!(process.env.BOOND_EMAIL && (process.env.BOOND_PASSWORD || process.env.BOOND_PASSWORD_ENC)),
      apiUrl: process.env.BOOND_API_URL,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Récupérer les ressources
router.get('/resources', async (req, res) => {
  try {
    console.log('📥 Fetching resources from BoondManager...');
    const resources = await boondManagerService.getResources();
    console.log('✅ Resources fetched successfully');
    console.log('📊 Resources data structure:', JSON.stringify(resources, null, 2).substring(0, 500));
    console.log('📊 Number of resources:', resources?.data?.length || 0);
    
    // S'assurer que la réponse est toujours du JSON valide
    res.setHeader('Content-Type', 'application/json');
    res.json(resources);
  } catch (error) {
    console.error('❌ Error fetching resources:', error);
    console.error('❌ Error stack:', error.stack);
    
    // S'assurer que la réponse d'erreur est toujours du JSON valide
    res.setHeader('Content-Type', 'application/json');
    
    // Extraire le message d'erreur de manière sécurisée
    let errorMessage = 'Erreur lors de la récupération des ressources';
    let errorDetails = null;
    
    if (error.response) {
      // Erreur de réponse HTTP
      errorMessage = error.response.data?.error || error.response.data?.message || error.message;
      errorDetails = {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data
      };
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    res.status(error.response?.status || 500).json({ 
      error: errorMessage,
      details: process.env.NODE_ENV === 'development' ? errorDetails : undefined,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

  // Récupérer les projets
  router.get('/projects', async (req, res) => {
    try {
      const projects = await boondManagerService.getProjects();
      res.json(projects);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Récupérer les projets d'une ressource spécifique
  router.get('/resources/:resourceId/projects', async (req, res) => {
    try {
      const { resourceId } = req.params;
      console.log(`📥 Récupération des projets pour la ressource ${resourceId}...`);
      const projects = await boondManagerService.getResourceProjects(resourceId);
      
      if (!projects) {
        return res.status(404).json({ 
          error: `Aucun projet trouvé pour la ressource ${resourceId}`,
          data: []
        });
      }

      res.json(projects);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des projets pour la ressource ${req.params.resourceId}:`, error);
      res.status(500).json({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Récupérer les prestations (deliveries) d'une ressource spécifique
  router.get('/resources/:resourceId/deliveries', async (req, res) => {
    try {
      const { resourceId } = req.params;
      console.log(`📥 Récupération des prestations (deliveries) pour la ressource ${resourceId}...`);
      const deliveries = await boondManagerService.getResourceDeliveries(resourceId);
      
      if (!deliveries) {
        return res.status(404).json({ 
          error: `Aucune prestation trouvée pour la ressource ${resourceId}`,
          data: { _embedded: { deliveries: [] } }
        });
      }

      res.json(deliveries);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des prestations pour la ressource ${req.params.resourceId}:`, error);
      res.status(500).json({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Récupérer les prestations (deliveries) d'un projet spécifique
  router.get('/projects/:projectId/deliveries', async (req, res) => {
    try {
      const { projectId } = req.params;
      console.log(`📥 Récupération des prestations (deliveries) pour le projet ${projectId}...`);
      const deliveries = await boondManagerService.getProjectDeliveries(projectId);
      
      if (!deliveries) {
        return res.status(404).json({ 
          error: `Aucune prestation trouvée pour le projet ${projectId}`,
          data: { _embedded: { deliveries: [] } }
        });
      }

      res.json(deliveries);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des prestations pour le projet ${req.params.projectId}:`, error);
      res.status(500).json({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Récupérer les prestations (deliveriesInActivities) d'une ressource spécifique (ancien endpoint, gardé pour compatibilité)
  router.get('/resources/:resourceId/deliveriesinactivities', async (req, res) => {
    try {
      const { resourceId } = req.params;
      console.log(`📥 Récupération des prestations (deliveriesInActivities) pour la ressource ${resourceId}...`);
      const deliveries = await boondManagerService.getResourceDeliveriesInActivities(resourceId);
      
      if (!deliveries) {
        return res.status(404).json({ 
          error: `Aucune prestation trouvée pour la ressource ${resourceId}`,
          data: { _embedded: { deliveriesInActivities: [] } }
        });
      }

      res.json(deliveries);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des prestations pour la ressource ${req.params.resourceId}:`, error);
      res.status(500).json({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Récupérer les contrats d'une ressource spécifique
  router.get('/resources/:resourceId/contracts', async (req, res) => {
    try {
      const { resourceId } = req.params;
      console.log(`📥 Récupération des contrats pour la ressource ${resourceId}...`);
      const contracts = await boondManagerService.getResourceContracts(resourceId);
      
      if (!contracts) {
        return res.status(404).json({ 
          error: `Aucun contrat trouvé pour la ressource ${resourceId}`,
          data: []
        });
      }

      res.json(contracts);
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des contrats pour la ressource ${req.params.resourceId}:`, error);
      res.status(500).json({ 
        error: error.message,
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

// Récupérer les prestations
router.get('/services', async (req, res) => {
  try {
    const services = await boondManagerService.getServices();
    res.json(services);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les opportunités BoondManager
// Certaines instances exposent /opportunites (FR), d'autres /opportunities (EN).
router.get('/opportunites', async (req, res) => {
  try {
    const query = { ...(req.query || {}) };
    const allPagesFlag = String(query.allPages || '').toLowerCase();
    const paginate = allPagesFlag === '1' || allPagesFlag === 'true' || allPagesFlag === 'yes';
    delete query.allPages;
    const { list, payload, pagesFetched } = await fetchBoondOpportunities(query, { paginate });

    res.json({
      success: true,
      count: list.length,
      data: list,
      pagesFetched,
      raw: payload
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération des opportunités BoondManager:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Resynchroniser les besoins depuis les opportunités Boond (sans table snapshot).
router.post('/sync/besoins/snapshot', async (req, res) => {
  try {
    console.log('🔄 Synchronisation des besoins demandée...');
    const { getSupabase } = require('../../lib/supabaseClient');
    const supabase = getSupabase();
    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).'
      });
    }

    const recentMonthsRaw = req.query.recentMonths ?? req.body?.recentMonths;
    const recentMonths = Number.parseInt(String(recentMonthsRaw ?? ''), 10);
    const useRecentMode = Number.isFinite(recentMonths) && recentMonths > 0;

    const query = { ...(req.query || {}) };
    delete query.allPages;
    delete query.recentMonths;
    const { list: boondList, pagesFetched } = await fetchBoondOpportunities(query, { paginate: true });
    const normalized = boondList
      .map((item) => normalizeOpportunityToBesoin(item))
      .filter((row) => row !== null);

    const byId = new Map();
    normalized.forEach((row) => {
      byId.set(row.id, row);
    });
    const uniqueRows = Array.from(byId.values());
    let rowsToUpsert = uniqueRows;
    let cutoffIso = null;

    if (useRecentMode) {
      const now = new Date();
      const cutoffDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (recentMonths - 1), 1, 0, 0, 0, 0));
      cutoffIso = cutoffDate.toISOString();
      rowsToUpsert = uniqueRows.filter((row) => {
        const ref = row.date_mise_a_jour || row.date_creation;
        if (!ref) return false;
        const d = new Date(ref);
        return !Number.isNaN(d.getTime()) && d >= cutoffDate;
      });
    } else {
      const { error: deleteError } = await supabase.from('besoins').delete().not('id', 'is', null);
      if (deleteError) throw deleteError;
    }

    for (let i = 0; i < rowsToUpsert.length; i += 500) {
      const chunk = rowsToUpsert.slice(i, i + 500);
      const { error } = await supabase.from('besoins').upsert(chunk, { onConflict: 'id' });
      if (error) throw error;
    }

    res.json({
      success: true,
      message: useRecentMode
        ? `Synchronisation des besoins (sur ${recentMonths} derniers mois) terminée : ${rowsToUpsert.length} besoins synchronisés.`
        : `Synchronisation des besoins terminée : ${rowsToUpsert.length} besoins synchronisés.`,
      details: {
        syncedCount: rowsToUpsert.length,
        pagesFetched,
        mode: useRecentMode ? 'recent-months' : 'full',
        recentMonths: useRecentMode ? recentMonths : null,
        cutoffIso
      }
    });
  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation des besoins:', error);
    const hint =
      error?.code === '42P01'
        ? 'La table besoins est absente. Appliquez la migration Supabase correspondante.'
        : undefined;
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la synchronisation des besoins',
      error: error.message,
      hint,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Récupérer les saisies de temps
router.get('/time-entries', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const timeEntries = await boondManagerService.getTimeEntries(startDate, endDate);
    res.json(timeEntries);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Récupérer les temps saisis par prestation (delivery)
router.get('/deliveries/:deliveryId/time-entries', async (req, res) => {
  try {
    const { deliveryId } = req.params;
    const { startDate, endDate } = req.query;
    
    console.log(`📥 Récupération des temps saisis pour la prestation ${deliveryId}...`);
    console.log(`📅 Période: ${startDate || 'non spécifiée'} à ${endDate || 'non spécifiée'}`);
    
    // Essayer d'abord d'appeler directement l'endpoint spécifique pour cette delivery
    const possibleEndpoints = [
      `/deliveries/${deliveryId}/time-entries`,
      `/api/v2/deliveries/${deliveryId}/time-entries`,
      `/api/deliveries/${deliveryId}/time-entries`
    ];
    
    let timeEntries = null;
    let usedEndpoint = null;
    
    // Essayer les endpoints spécifiques
    for (const endpoint of possibleEndpoints) {
      try {
        console.log(`📡 Tentative avec l'endpoint: ${endpoint}...`);
        const response = await boondManagerService.makeRequest(endpoint, { startDate, endDate });
        if (response && (response.data || response._embedded || Array.isArray(response))) {
          timeEntries = response;
          usedEndpoint = endpoint;
          console.log(`✅ Temps saisis récupérés via ${endpoint}`);
          break;
        }
      } catch (error) {
        console.log(`⚠️  Endpoint ${endpoint} non disponible: ${error.message}`);
        continue;
      }
    }
    
    // Si aucun endpoint spécifique ne fonctionne, récupérer tous les time-entries et filtrer
    if (!timeEntries) {
      try {
        console.log(`📡 Récupération de tous les time-entries pour filtrer par deliveryId...`);
        const allTimeEntries = await boondManagerService.getTimeEntries(startDate, endDate);
        console.log(`📊 Structure de la réponse:`, JSON.stringify(allTimeEntries, null, 2).substring(0, 500));
        
        // Extraire les données selon différentes structures possibles
        let entriesData = [];
        if (Array.isArray(allTimeEntries)) {
          entriesData = allTimeEntries;
        } else if (allTimeEntries.data && Array.isArray(allTimeEntries.data)) {
          entriesData = allTimeEntries.data;
        } else if (allTimeEntries._embedded && allTimeEntries._embedded.timeEntries && Array.isArray(allTimeEntries._embedded.timeEntries)) {
          entriesData = allTimeEntries._embedded.timeEntries;
        } else if (allTimeEntries._embedded && Array.isArray(allTimeEntries._embedded)) {
          entriesData = allTimeEntries._embedded;
        }
        
        console.log(`📊 ${entriesData.length} time-entries récupérés au total`);
        
        // Filtrer par deliveryId - essayer plusieurs chemins possibles
        const filteredEntries = entriesData.filter((entry) => {
          // Essayer plusieurs chemins pour trouver le deliveryId
          const entryDeliveryId = 
            entry.relationships?.delivery?.data?.id ||
            entry.relationships?.dependsOn?.data?.id ||
            entry.deliveryId ||
            entry.delivery?.id ||
            entry.deliveryId ||
            entry.attributes?.deliveryId ||
            entry.attributes?.delivery?.id ||
            entry._links?.delivery?.href?.match(/\/(\d+)$/)?.[1];
          
          const matches = String(entryDeliveryId) === String(deliveryId);
          
          if (matches) {
            console.log(`✅ Time-entry ${entry.id || 'sans ID'} correspond à la delivery ${deliveryId}`);
          }
          
          return matches;
        });
        
        console.log(`📊 ${filteredEntries.length} time-entries filtrés pour la delivery ${deliveryId}`);
        
        if (filteredEntries.length === 0 && entriesData.length > 0) {
          console.log(`⚠️  Aucun time-entry trouvé pour la delivery ${deliveryId}. Exemple de structure:`, JSON.stringify(entriesData[0], null, 2).substring(0, 500));
        }
        
        timeEntries = { data: filteredEntries };
      } catch (error) {
        console.error(`❌ Erreur lors de la récupération des temps saisis:`, error);
        console.error(`Stack:`, error.stack);
        timeEntries = { data: [] };
      }
    }
    
    // Normaliser la réponse
    const entriesData = timeEntries.data || timeEntries._embedded?.timeEntries || (Array.isArray(timeEntries) ? timeEntries : []);
    
    console.log(`📊 ${entriesData.length} time-entries à traiter pour la delivery ${deliveryId}`);
    
    // Grouper par mois
    const monthlyHours = {};
    entriesData.forEach((entry) => {
      // Essayer plusieurs chemins pour trouver la date
      const date = entry.date || 
                   entry.attributes?.date || 
                   entry.attributes?.startDate ||
                   entry.startDate ||
                   entry.attributes?.day ||
                   entry.day;
      
      // Essayer plusieurs chemins pour trouver les heures
      const hours = entry.hours || 
                    entry.attributes?.hours || 
                    entry.attributes?.duration || 
                    entry.duration ||
                    entry.attributes?.quantity ||
                    entry.quantity ||
                    0;
      
      if (date) {
        const month = date.substring(0, 7); // YYYY-MM
        const hoursValue = parseFloat(hours) || 0;
        monthlyHours[month] = (monthlyHours[month] || 0) + hoursValue;
        console.log(`📅 ${month}: +${hoursValue}h (total: ${monthlyHours[month]}h)`);
      } else {
        console.warn(`⚠️  Time-entry sans date:`, JSON.stringify(entry, null, 2).substring(0, 200));
      }
    });
    
    console.log(`✅ Temps saisis groupés par mois:`, monthlyHours);
    
    res.json({
      success: true,
      deliveryId: deliveryId,
      timeEntries: entriesData,
      monthlyHours: monthlyHours,
      count: entriesData.length,
      endpoint: usedEndpoint || 'filtered'
    });
  } catch (error) {
    console.error(`❌ Erreur lors de la récupération des temps saisis pour la prestation ${req.params.deliveryId}:`, error);
    console.error(`Stack:`, error.stack);
    res.status(500).json({ 
      success: false,
      error: error.message,
      deliveryId: req.params.deliveryId,
      timeEntries: [],
      monthlyHours: {}
    });
  }
});

// Récupérer le dictionnaire resources
router.get('/dictionary/resources', async (req, res) => {
  try {
    console.log('📚 Récupération du dictionnaire resources...');
    const dictionary = await boondManagerService.getDictionary();
    
    if (!dictionary) {
      return res.status(500).json({ 
        error: 'Impossible de récupérer le dictionnaire',
        dictionary: null
      });
    }

    // Extraction sécurisée : essayer data.data ou data directement
    const dict = dictionary.data?.data || dictionary.data || dictionary;
    
    // Extraire resourceTypes depuis setting.typeOf.resource
    const resourceTypes = dict?.setting?.typeOf?.resource;

    if (!resourceTypes) {
      return res.status(404).json({ 
        error: 'Structure du dictionnaire non reconnue',
        dictionary: dictionary,
        dict: dict,
        setting: dict?.setting,
        availableKeys: Object.keys(dict || {}),
        structure: {
          hasData: !!dictionary.data,
          hasDataData: !!dictionary.data?.data,
          hasSetting: !!dict?.setting,
          hasTypeOf: !!dict?.setting?.typeOf,
          hasResource: !!dict?.setting?.typeOf?.resource
        },
        fullDictionary: JSON.stringify(dictionary, null, 2).substring(0, 5000)
      });
    }

    if (!Array.isArray(resourceTypes)) {
      return res.status(400).json({ 
        error: 'setting.typeOf.resource n\'est pas un tableau',
        type: typeof resourceTypes,
        value: resourceTypes
      });
    }

    // Créer le mapping typeOf : { id: value }
    const typeMapping = {};
    
    resourceTypes.forEach(item => {
      // Vérifier explicitement que id n'est pas undefined/null (même si id=0 est valide)
      if (item.id !== undefined && item.id !== null && item.value !== undefined) {
        typeMapping[item.id] = item.value;
        // Mapper aussi avec l'ID comme nombre et comme chaîne pour supporter les deux formats
        typeMapping[Number(item.id)] = item.value;
        typeMapping[String(item.id)] = item.value;
        console.log(`  ✅ Mapping: ${item.id} -> "${item.value}"`);
      } else {
        console.warn(`⚠️  Élément sans id ou value:`, item);
      }
    });

    // Vérifier que le mapping est bien rempli
    if (Object.keys(typeMapping).length === 0) {
      return res.status(400).json({ 
        error: 'Le typeMapping est vide',
        resourceTypes: resourceTypes
      });
    }

    // Créer un tableau pour l'affichage
    const typeOfTable = resourceTypes
      .filter(item => item.id !== undefined && item.value !== undefined)
      .map(item => ({
        code: item.id,
        codeString: String(item.id),
        label: item.value
      }))
      .sort((a, b) => a.code - b.code);

    res.json({
      success: true,
      resourceTypes: resourceTypes,
      typeMapping: typeMapping,
      typeOfTable: typeOfTable,
      path: 'setting.typeOf.resource',
      mappingSize: Object.keys(typeMapping).length
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du dictionnaire resources:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Récupérer le dictionnaire complet
router.get('/dictionary', async (req, res) => {
  try {
    console.log('📚 Récupération du dictionnaire complet...');
    const dictionary = await boondManagerService.getDictionary();
    
    if (!dictionary) {
      return res.status(500).json({ 
        error: 'Impossible de récupérer le dictionnaire',
        dictionary: null
      });
    }

    res.json({
      success: true,
      data: dictionary
    });
  } catch (error) {
    console.error('❌ Erreur lors de la récupération du dictionnaire:', error);
    res.status(500).json({ 
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Synchroniser le dictionnaire (libellés type_of / state des ressources et opportunités) dans la table `dictionnaire`.
// Indispensable après une réinitialisation de la base : les vues Ressources/Forecast en dépendent
// pour afficher les libellés au lieu des codes numériques.
router.post('/sync/dictionary', async (req, res) => {
  try {
    console.log('🔄 Synchronisation du dictionnaire demandée...');
    const { syncDictionaryFromBoond } = require('../../lib/dictionarySync');
    const result = await syncDictionaryFromBoond();

    console.log(
      `✅ Dictionnaire synchronisé: ${result.resourcesTypeOf} types ressources + ${result.resourcesState} statuts ressources + ${result.opportunitiesTypeOf} types opportunités + ${result.opportunitiesState} statuts opportunités`
    );

    res.json({
      success: true,
      message: `Dictionnaire synchronisé : ${result.resourcesTypeOf} types ressources, ${result.resourcesState} statuts ressources, ${result.opportunitiesTypeOf} types opportunités, ${result.opportunitiesState} statuts opportunités.`,
      count: result.count,
      details: {
        resources: {
          typeOf: result.resourcesTypeOf,
          state: result.resourcesState,
        },
        opportunities: {
          typeOf: result.opportunitiesTypeOf,
          state: result.opportunitiesState,
        },
      },
    });
  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation du dictionnaire:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la synchronisation du dictionnaire',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Synchroniser les ressources
router.post('/sync/resources', async (req, res) => {
  try {
    console.log('🔄 Synchronisation des ressources demandée...');
    const BoondManagerSync = require('../../sync');
    const sync = new BoondManagerSync();
    
    const result = await sync.syncResources();
    
    console.log(`✅ Synchronisation des ressources terminée: ${result.length} ressources`);
    
    res.json({
      success: true,
      message: `Synchronisation réussie: ${result.length} ressources synchronisées`,
      count: result.length
    });
  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation des ressources:', error);
    let errorMessage = error.message;
    if (error.response) {
      const status = error.response.status;
      const data = error.response.data;
      if (status === 422) {
        const detail = data?.errors?.[0]?.detail || data?.message || JSON.stringify(data);
        errorMessage = `BoondManager a refusé la requête (422). Détail: ${detail}\n\nÀ vérifier : 1) BOOND_API_URL = URL exacte de votre instance (ex. https://animaneo.boondmanager.com/api — pas ui.boondmanager.com si vous avez un sous-domaine). 2) Dans BoondManager : Administration > Intranet (ou Paramètres API) > activer « Authentification par identifiants » / Basic Auth. 3) Tester les mêmes identifiants dans le sandbox API BoondManager (menu Développeur / API) pour confirmer qu’ils fonctionnent.`;
      } else if (status === 401 || status === 403) {
        errorMessage = `Accès refusé par BoondManager (${status}). Vérifiez BOOND_EMAIL et BOOND_PASSWORD.`;
      }
    }
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la synchronisation des ressources',
      error: errorMessage,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Extraire les prestations (deliveries)
router.post('/sync/deliveries', async (req, res) => {
  try {
    console.log('🔄 Extraction des prestations demandée...');
    const extractDeliveries = require('../../extract_deliveries');
    
    const result = await extractDeliveries();
    
    const count = result?.data?.length || 0;
    console.log(`✅ Extraction des prestations terminée: ${count} prestations`);
    
    res.json({
      success: true,
      message: `Extraction réussie: ${count} prestations extraites`,
      count: count,
      metadata: result?.metadata
    });
  } catch (error) {
    console.error('❌ Erreur lors de l\'extraction des prestations:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'extraction des prestations',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Synchroniser les feuilles de temps (timesheets)
router.post('/sync/timesheets', async (req, res) => {
  try {
    console.log('🔄 Synchronisation des feuilles de temps demandée...');
    const { startMonth, endMonth } = req.body;
    
    const syncTimesheets = require('../../sync_timesheets');
    
    const result = await syncTimesheets(startMonth, endMonth);
    
    const count = result?.metadata?.totalTimesheets ?? (Array.isArray(result?.data) ? result.data.length : 0);
    const totalEntries = result?.metadata?.totalEntries || 0;
    console.log(`✅ Synchronisation des feuilles de temps terminée: ${count} feuilles, ${totalEntries} entrées`);
    
    res.json({
      success: true,
      message: `Synchronisation réussie: ${count} feuilles de temps synchronisées (${totalEntries} entrées, production + non-production)`,
      count: count,
      totalEntries: totalEntries,
      metadata: result?.metadata
    });
  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation des feuilles de temps:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la synchronisation des feuilles de temps',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// Synchroniser les absences Boond (agrégat par collaborateur et mois)
router.post('/sync/absences', async (req, res) => {
  try {
    console.log('🔄 Synchronisation des absences demandée...');
    let { beginDate, endDate } = req.body || {};
    if (!beginDate || !endDate) {
      const y = new Date().getFullYear();
      // Année précédente + en cours (aligné grille Forecast + absences multi-années)
      beginDate = beginDate || `${y - 1}-01-01`;
      endDate = endDate || `${y}-12-31`;
    }

    const { syncAbsences } = require('../../sync_absences');
    const result = await syncAbsences({ beginDate, endDate });

    const count = result?.data?.length || 0;
    const rawCount = result?.metadata?.rawRecordCount ?? 0;
    console.log(`✅ Synchronisation des absences terminée: ${rawCount} enreg. Boond → ${count} lignes agrégées`);

    res.json({
      success: true,
      message: `Synchronisation réussie: ${count} lignes (collaborateur × mois), ${rawCount} absences Boond`,
      count,
      rawRecordCount: rawCount,
      metadata: result?.metadata,
      beginDate,
      endDate
    });
  } catch (error) {
    console.error('❌ Erreur lors de la synchronisation des absences:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la synchronisation des absences',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

module.exports = router;
module.exports.fetchBoondOpportunities = fetchBoondOpportunities;
module.exports.normalizeOpportunityToBesoin = normalizeOpportunityToBesoin;
