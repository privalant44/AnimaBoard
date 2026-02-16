const axios = require('axios');
const path = require('path');
require('dotenv').config();
require('./lib/secretEnv');
const kvStorage = require('./lib/kvStorage');
const { KV_KEYS } = require('./lib/constants');

class BoondManagerSync {
  constructor() {
    this.baseURL = process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api';
    this.email = process.env.BOOND_EMAIL;
    this.password = process.env.BOOND_PASSWORD;
    this.dataDir = path.join(__dirname, 'data');
  }

  async makeRequest(endpoint, method = 'GET', data = null) {
    if (!this.email || !this.password) {
      throw new Error('BoondManager: BOOND_EMAIL et BOOND_PASSWORD (ou BOOND_PASSWORD_ENC) requis');
    }
    const config = {
      auth: { username: this.email, password: this.password },
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, application/hal+json'
      },
      timeout: 30000,
      validateStatus: (status) => status < 500
    };

    const fullUrl = `${this.baseURL}${endpoint}`;
    console.log(`📡 Appel API: ${fullUrl} (${method}, Basic Auth)`);

    let response;
    try {
      if (method === 'POST') {
        response = await axios.post(fullUrl, data || {}, config);
      } else {
        response = await axios.get(fullUrl, config);
      }
    } catch (err) {
      const detail = err.response?.data?.errors?.[0]?.detail || err.response?.data?.message || err.response?.data ? JSON.stringify(err.response.data) : err.message;
      const msg = err.response?.status === 422
        ? `BoondManager 422: ${detail}. Vérifiez BOOND_API_URL et l’activation de l’auth (Basic Auth ou JWT) dans l’admin BoondManager.`
        : `BoondManager API: ${err.response?.status || ''} ${detail}`.trim();
      throw new Error(msg);
    }

    if (response.status >= 400) {
      const detail = response.data?.errors?.[0]?.detail || response.data?.message || (response.data ? JSON.stringify(response.data) : '');
      throw new Error(`BoondManager ${response.status}: ${detail}`);
    }
    return response.data;
  }

  async delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  async ensureDataDir() {
    // Plus de dossier data : tout est stocké en KV
  }

  async syncProjects() {
    console.log('\n📦 PHASE 1 : Synchronisation des projets et prestations...\n');
    
    try {
      // Récupérer tous les projets
      console.log('📡 Récupération de tous les projets...');
      const projectsResponse = await this.makeRequest('/projects');
      
      let projectsList = [];
      if (projectsResponse.data?._embedded?.projects && Array.isArray(projectsResponse.data._embedded.projects)) {
        projectsList = projectsResponse.data._embedded.projects;
      } else if (projectsResponse._embedded?.projects && Array.isArray(projectsResponse._embedded.projects)) {
        projectsList = projectsResponse._embedded.projects;
      } else if (projectsResponse.data && Array.isArray(projectsResponse.data)) {
        projectsList = projectsResponse.data;
      } else if (Array.isArray(projectsResponse)) {
        projectsList = projectsResponse;
      }

      console.log(`✅ ${projectsList.length} projets trouvés\n`);

      // Pour chaque projet, récupérer ses prestations
      const projectsWithDeliveries = [];
      
      for (let i = 0; i < projectsList.length; i++) {
        const project = projectsList[i];
        const projectId = project.id || project.ID || project.Id;
        
        // Délai de 200ms entre chaque requête
        if (i > 0) {
          await this.delay(200);
        }

        try {
          console.log(`📡 Récupération des prestations pour le projet ${projectId} (${i + 1}/${projectsList.length})...`);
          const deliveriesResponse = await this.makeRequest(`/projects/${projectId}/deliveries`);
          
          let deliveries = [];
          if (deliveriesResponse.data?._embedded?.deliveries && Array.isArray(deliveriesResponse.data._embedded.deliveries)) {
            deliveries = deliveriesResponse.data._embedded.deliveries;
          } else if (deliveriesResponse._embedded?.deliveries && Array.isArray(deliveriesResponse._embedded.deliveries)) {
            deliveries = deliveriesResponse._embedded.deliveries;
          } else if (deliveriesResponse.data && Array.isArray(deliveriesResponse.data)) {
            deliveries = deliveriesResponse.data;
          } else if (Array.isArray(deliveriesResponse)) {
            deliveries = deliveriesResponse;
          }

          projectsWithDeliveries.push({
            id: projectId,
            project: project,
            deliveries: deliveries
          });

          console.log(`   ✅ ${deliveries.length} prestations trouvées\n`);
        } catch (error) {
          console.error(`   ❌ Erreur pour le projet ${projectId}:`, error.message);
          projectsWithDeliveries.push({
            id: projectId,
            project: project,
            deliveries: []
          });
        }
      }

      await kvStorage.set(KV_KEYS.PROJECTS, projectsWithDeliveries);
      console.log(`✅ Données des projets enregistrées (KV)`);
      console.log(`📊 Total: ${projectsWithDeliveries.length} projets avec leurs prestations\n`);

      return projectsWithDeliveries;
    } catch (error) {
      console.error('❌ Erreur lors de la synchronisation des projets:', error);
      throw error;
    }
  }

  async syncResources() {
    console.log('\n👥 PHASE 2 : Synchronisation des ressources...\n');
    
    try {
      // Récupérer toutes les ressources
      console.log('📡 Récupération de toutes les ressources...');
      const resourcesResponse = await this.makeRequest('/resources');
      
      let resourcesList = [];
      if (resourcesResponse.data && Array.isArray(resourcesResponse.data)) {
        resourcesList = resourcesResponse.data;
      } else if (Array.isArray(resourcesResponse)) {
        resourcesList = resourcesResponse;
      }

      console.log(`✅ ${resourcesList.length} ressources trouvées\n`);

      // Extraire les informations nécessaires (nom, prénom, typeOf, state) et récupérer les contrats
      const resourcesData = [];
      
      for (let i = 0; i < resourcesList.length; i++) {
        const resource = resourcesList[i];
        const resourceId = resource.id || resource.ID || resource.Id;
        const attributes = resource.attributes || {};
        
        // Ajouter un délai de 200ms entre chaque ressource (sauf la première)
        if (i > 0) {
          await this.delay(200);
        }
        
        // Récupérer les contrats de la ressource pour obtenir le TJM
        let contracts = [];
        try {
          console.log(`📡 Récupération des contrats pour la ressource ${resourceId} (${i + 1}/${resourcesList.length})...`);
          const contractsResponse = await this.makeRequest(`/resources/${resourceId}/contracts`);
          
          let contractsList = [];
          if (contractsResponse.data?._embedded?.contracts && Array.isArray(contractsResponse.data._embedded.contracts)) {
            contractsList = contractsResponse.data._embedded.contracts;
          } else if (contractsResponse._embedded?.contracts && Array.isArray(contractsResponse._embedded.contracts)) {
            contractsList = contractsResponse._embedded.contracts;
          } else if (contractsResponse.data && Array.isArray(contractsResponse.data)) {
            contractsList = contractsResponse.data;
          } else if (Array.isArray(contractsResponse)) {
            contractsList = contractsResponse;
          }
          
          contracts = contractsList;
          console.log(`   ✅ ${contracts.length} contrats trouvés\n`);
        } catch (error) {
          console.warn(`   ⚠️  Erreur lors de la récupération des contrats pour la ressource ${resourceId}:`, error.message);
          contracts = [];
        }
        
        resourcesData.push({
          id: resourceId,
          nom: attributes.lastName || resource.lastName || '',
          prenom: attributes.firstName || resource.firstName || '',
          typeOf: attributes.typeOf || resource.typeOf || null,
          state: attributes.state || resource.state || null,
          isVisible: attributes.isVisible ?? resource.isVisible ?? resource.IsVisible ?? true,
          contracts: contracts,
          raw: resource // Garder les données brutes pour référence
        });
      }

      await kvStorage.set(KV_KEYS.RESOURCES, resourcesData);
      console.log(`✅ Données des ressources enregistrées (KV)`);
      console.log(`📊 Total: ${resourcesData.length} ressources\n`);

      return resourcesData;
    } catch (error) {
      console.error('❌ Erreur lors de la synchronisation des ressources:', error);
      throw error;
    }
  }

  async syncDeliveries() {
    console.log('\n📋 PHASE 3 : Synchronisation des prestations (deliveries)...\n');
    
    try {
      // Récupérer toutes les prestations via GET avec paramètres de requête
      // Utiliser l'URL ui.boondmanager.com pour les deliveries
      const fullUrl = 'https://ui.boondmanager.com/api/deliveries?maxResults=50';
      
      console.log('📡 Récupération de toutes les prestations via GET /deliveries...');
      console.log(`📡 URL: ${fullUrl}`);
      
      const config = {
        headers: {
          'X-Jwt-Client': 'NjE2ZTY5NmQ2MTZlNjU2Zjo5ZmIxYWNiMmMwZGViMDVlYWI1ZQ==',
          'Accept': 'application/hal+json'
        },
        timeout: 30000
      };
      
      console.log(`📡 Headers:`, JSON.stringify(config.headers, null, 2));
      
      const response = await axios.get(fullUrl, config);
      const deliveriesResponse = response.data;
      
      // Debug : Afficher la réponse complète
      console.log('\n📊 Réponse complète (response.data):');
      console.log(JSON.stringify(deliveriesResponse, null, 2));
      
      // Extraire les prestations depuis la structure HAL JSON : _embedded.deliveries
      let deliveriesList = [];
      if (deliveriesResponse._embedded?.deliveries && Array.isArray(deliveriesResponse._embedded.deliveries)) {
        deliveriesList = deliveriesResponse._embedded.deliveries;
        console.log(`\n✅ Données reçues : ${deliveriesResponse._embedded.deliveries.length} prestations`);
      } else if (deliveriesResponse.data?._embedded?.deliveries && Array.isArray(deliveriesResponse.data._embedded.deliveries)) {
        deliveriesList = deliveriesResponse.data._embedded.deliveries;
        console.log(`\n✅ Données reçues : ${deliveriesResponse.data._embedded.deliveries.length} prestations`);
      } else if (deliveriesResponse.data && Array.isArray(deliveriesResponse.data)) {
        deliveriesList = deliveriesResponse.data;
        console.log(`\n✅ Données reçues : ${deliveriesResponse.data.length} prestations`);
      } else if (Array.isArray(deliveriesResponse)) {
        deliveriesList = deliveriesResponse;
        console.log(`\n✅ Données reçues : ${deliveriesResponse.length} prestations`);
      } else {
        console.log(`\n⚠️  Structure de réponse non reconnue`);
        console.log(`📋 Clés disponibles:`, Object.keys(deliveriesResponse || {}));
      }

      console.log(`✅ ${deliveriesList.length} prestations trouvées\n`);

      // Extraire les informations nécessaires pour chaque prestation
      const deliveriesData = deliveriesList.map((delivery) => {
        const attributes = delivery.attributes || {};
        const embedded = delivery._embedded || {};
        const resource = embedded.resource || {};
        const resourceAttributes = resource.attributes || {};
        
        // Extraire le TJM et le convertir en nombre
        let tjm = attributes.unitPriceExcludingTax;
        if (tjm !== null && tjm !== undefined) {
          tjm = Number(tjm);
          if (isNaN(tjm) || tjm === 0) {
            tjm = null;
          }
        } else {
          tjm = null;
        }
        
        return {
          id: delivery.id || delivery.ID || delivery.Id,
          reference: attributes.reference || 'N/A',
          title: attributes.title || 'Sans titre',
          tjm: tjm,
          startDate: attributes.startDate || '',
          endDate: attributes.endDate || '',
          resourceFirstName: resourceAttributes.firstName || '',
          resourceLastName: resourceAttributes.lastName || '',
          raw: delivery // Garder les données brutes pour référence
        };
      });

      await kvStorage.set(KV_KEYS.DELIVERIES, { metadata: { lastSync: new Date().toISOString() }, data: deliveriesData });
      console.log(`✅ Données des prestations enregistrées (KV)`);
      console.log(`📊 Total: ${deliveriesData.length} prestations\n`);

      return deliveriesData;
    } catch (error) {
      console.error('❌ Erreur lors de la synchronisation des prestations:', error);
      throw error;
    }
  }

  async sync() {
    try {
      console.log('🚀 Démarrage de la synchronisation des ressources BoondManager...\n');
      console.log(`📁 Stockage: KV (Redis)\n`);
      await this.ensureDataDir();

      // Synchronisation des ressources uniquement
      const resources = await this.syncResources();

      console.log('\n✅ Synchronisation terminée avec succès !\n');
      console.log(`📊 Résumé:`);
      console.log(`   - ${resources.length} ressources synchronisées`);
      console.log(`\n📁 Données enregistrées en KV (Redis)\n`);

      return { resources };
    } catch (error) {
      console.error('\n❌ Erreur lors de la synchronisation:', error);
      throw error;
    }
  }
}

// Exécuter la synchronisation si le script est appelé directement
if (require.main === module) {
  const sync = new BoondManagerSync();
  sync.sync();
}

module.exports = BoondManagerSync;
