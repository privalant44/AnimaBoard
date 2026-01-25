const axios = require('axios');

class BoondManagerService {
  constructor() {
    this.baseURL = process.env.BOOND_API_URL || 'https://ui.boondmanager.com/api';
    // BoondManager utilise l'email et le mot de passe pour l'authentification Basic Auth
    this.email = process.env.BOOND_EMAIL;
    this.password = process.env.BOOND_PASSWORD;
    
    // Support rétrocompatible avec les anciennes variables
    if (!this.email && process.env.BOOND_TOKEN_CLIENT) {
      this.email = process.env.BOOND_TOKEN_CLIENT;
    }
    if (!this.password && process.env.BOOND_CLEF_CLIENT) {
      this.password = process.env.BOOND_CLEF_CLIENT;
    }
    
    if (!this.email || !this.password) {
      console.warn('⚠️  BoondManager API credentials not configured');
    }
  }

  async makeRequest(endpoint, params = {}) {
    // Vérifier que les credentials sont configurés
    if (!this.email || !this.password) {
      throw new Error('BoondManager API credentials not configured (BOOND_EMAIL and BOOND_PASSWORD required)');
    }

    try {
      // BoondManager utilise Basic Auth avec email et mot de passe
      const config = {
        params,
        auth: {
          username: this.email,
          password: this.password
        },
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        // Ne pas utiliser de timeout trop court
        timeout: 30000,
        // Désactiver la validation SSL si nécessaire (non recommandé en production)
        validateStatus: function (status) {
          return status < 500; // Ne pas rejeter automatiquement les erreurs 4xx
        }
      };

      const fullUrl = `${this.baseURL}${endpoint}`;
      console.log(`📡 Calling BoondManager API: ${fullUrl}`);
      console.log(`🔑 Using credentials: email=${this.email}, password=***`);
      console.log(`📋 Request config:`, JSON.stringify({
        url: fullUrl,
        method: 'GET',
        auth: 'Basic Auth (email/password)',
        params: params
      }, null, 2));
      
      const response = await axios.get(fullUrl, config);
      console.log(`✅ BoondManager API response received (status: ${response.status})`);
      console.log(`📊 Response headers:`, JSON.stringify(response.headers, null, 2));
      console.log(`📊 Response data (full):`, JSON.stringify(response.data, null, 2));
      return response.data;
    } catch (error) {
      console.error(`❌ Error calling BoondManager API ${endpoint}:`, error.message);
      if (error.response) {
        console.error('Response status:', error.response.status);
        console.error('Response headers:', JSON.stringify(error.response.headers, null, 2));
        console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        
        // Si erreur 422 "no account found", essayer avec l'URL sans /api
        if (error.response.status === 422 && error.response.data?.errors?.[0]?.detail?.includes('no account found')) {
          console.warn('⚠️  Erreur 422 - no account found. L\'URL ou l\'authentification pourrait être incorrecte.');
          console.warn('💡 Vérifiez que l\'URL de base est correcte et que les credentials sont valides.');
        }
      }
      // Ne pas utiliser de données mockées - toujours propager l'erreur
      // pour voir la vraie réponse de l'API
      throw error;
    }
  }

  /**
   * Récupère les informations détaillées d'une ressource via l'endpoint Ressources/information
   */
  async getResourceInformation(resourceId) {
    const possibleEndpoints = [
      `/resources/${resourceId}/information`,
      `/resources/${resourceId}`,
      `/api/resources/${resourceId}/information`,
      `/api/resources/${resourceId}`,
      `/api/v2/resources/${resourceId}/information`,
      `/api/v2/resources/${resourceId}`
    ];

    for (const endpoint of possibleEndpoints) {
      try {
        const result = await this.makeRequest(endpoint);
        if (result && (result.data || result)) {
          return result.data || result;
        }
      } catch (error) {
        // Continuer avec le prochain endpoint
        continue;
      }
    }
    
    return null;
  }

  async getResources() {
    // Récupérer les mappings typeOf et state depuis le dictionnaire
    const typeOfMapping = await this.getTypeOfMapping();
    const stateMapping = await this.getStateMapping();
    
    // Essayer plusieurs endpoints possibles pour trouver celui qui fonctionne
    const possibleEndpoints = [
      '/resources'
    ];

    for (const endpoint of possibleEndpoints) {
      try {
        console.log(`📡 Tentative avec l'endpoint: ${endpoint}...`);
        const resourcesList = await this.makeRequest(endpoint);
        
        if (!resourcesList) {
          console.warn(`⚠️  Aucune réponse de l'API pour ${endpoint}`);
          continue;
        }

        // Vérifier si c'est une erreur
        if (resourcesList.errors || resourcesList.error) {
          console.warn(`⚠️  Erreur dans la réponse pour ${endpoint}:`, JSON.stringify(resourcesList.errors || resourcesList.error, null, 2));
          continue;
        }

        // Extraire la liste des ressources
        let resources = [];
        if (resourcesList.data && Array.isArray(resourcesList.data)) {
          resources = resourcesList.data;
        } else if (Array.isArray(resourcesList)) {
          resources = resourcesList;
        } else if (resourcesList.resources && Array.isArray(resourcesList.resources)) {
          resources = resourcesList.resources;
        } else if (resourcesList.persons && Array.isArray(resourcesList.persons)) {
          resources = resourcesList.persons;
        } else if (resourcesList.items && Array.isArray(resourcesList.items)) {
          resources = resourcesList.items;
        }

        // Normaliser les ressources : extraire les attributs si nécessaire
        // Structure BoondManager : { data: [{ id, type, attributes: { firstName, lastName, ... } }] }
        resources = resources.map(resource => {
          // Si la ressource a une structure avec 'attributes', extraire les attributs
          if (resource.attributes) {
            return {
              id: resource.id,
              ...resource.attributes,
              // Garder aussi les champs au niveau racine pour compatibilité
              firstName: resource.attributes.firstName || resource.firstName,
              lastName: resource.attributes.lastName || resource.lastName,
              typeOf: resource.attributes.typeOf || resource.typeOf
            };
          }
          return resource;
        });

        console.log(`📊 Structure de la réponse reçue pour ${endpoint}:`, JSON.stringify(resourcesList, null, 2).substring(0, 2000));
        console.log(`📊 Nombre de ressources extraites: ${resources.length}`);
        
        if (resources.length > 0) {
          // Afficher un exemple de ressource pour le débogage
          console.log(`📋 Exemple de ressource (première):`, JSON.stringify(resources[0], null, 2));
          console.log(`📋 Clés disponibles dans la première ressource:`, Object.keys(resources[0]));

          // Afficher dans la console pour chaque ressource : lastName, firstName, typeOf
          console.log('\n📋 ===== INFORMATIONS DES RESSOURCES =====');
          console.log(`📊 Nombre total de ressources récupérées: ${resources.length}`);
          console.log('==========================================\n');
          
          resources.forEach((resource, index) => {
            // Extraire depuis attributes si présent
            const lastName = resource.attributes?.lastName || resource.lastName || resource.LastName || 'N/A';
            const firstName = resource.attributes?.firstName || resource.firstName || resource.FirstName || 'N/A';
            const typeOf = resource.attributes?.typeOf || resource.typeOf || resource.TypeOf || resource.type || resource.Type || 'N/A';
            
            console.log(`\n🔹 Ressource #${index + 1}:`);
            console.log(`   Nom (lastName): ${lastName}`);
            console.log(`   Prénom (firstName): ${firstName}`);
            console.log(`   Type de ressource (typeOf): ${typeOf}`);
          });
          console.log('\n==========================================');
          console.log(`✅ Total: ${resources.length} ressources récupérées avec succès`);
          console.log('==========================================\n');

          // Vérifier que les mappings sont bien remplis avant de les utiliser
          const typeMappingSize = Object.keys(typeOfMapping).length;
          const stateMappingSize = Object.keys(stateMapping).length;
          if (typeMappingSize === 0) {
            console.warn('⚠️  Le typeOfMapping est vide, les labels ne pourront pas être affichés');
          } else {
            console.log(`✅ Utilisation du typeOfMapping avec ${typeMappingSize} entrées`);
          }
          if (stateMappingSize === 0) {
            console.warn('⚠️  Le stateMapping est vide, les statuts ne pourront pas être affichés');
          } else {
            console.log(`✅ Utilisation du stateMapping avec ${stateMappingSize} entrées`);
          }

          // Filtrer les ressources avec IsVisible = true
          const visibleResources = resources.filter((resource) => {
            const isVisible = resource.attributes?.isVisible ?? resource.isVisible ?? resource.IsVisible ?? true;
            return isVisible === true;
          });

          console.log(`📊 Nombre de ressources après filtrage IsVisible=true: ${visibleResources.length} sur ${resources.length}`);

          // Retourner les ressources avec les champs normalisés
          // Extraire depuis attributes si présent
          const resourcesNormalized = visibleResources.map((resource) => {
            // Extraire typeOf depuis différentes sources possibles
            let typeOfCode = resource.attributes?.typeOf ?? resource.typeOf ?? resource.TypeOf ?? resource.type ?? resource.Type;
            
            // Si typeOf n'est pas défini (undefined/null), utiliser 0 par défaut
            if (typeOfCode === undefined || typeOfCode === null) {
              typeOfCode = 0;
              console.log(`⚠️  typeOf non défini pour la ressource ${resource.id}, utilisation de 0 par défaut`);
            }
            
            // Chercher le label dans le mapping typeOf
            // Important : gérer le cas où typeOfCode = 0 (qui est falsy mais valide)
            let typeOfLabel = typeOfCode;
            
            // Vérifier que typeOfCode est défini (même si c'est 0)
            // typeOfCode peut être 0, donc on ne peut pas utiliser une vérification falsy simple
            const hasTypeOfCode = (typeOfCode !== undefined && typeOfCode !== null && typeOfCode !== '') || typeOfCode === 0;
            
            if (hasTypeOfCode && typeMappingSize > 0) {
              const codeAsNumber = Number(typeOfCode);
              const codeAsString = String(typeOfCode);
              
              // Chercher dans le mapping avec différentes clés
              // Utiliser 'in' operator pour vérifier l'existence même pour id=0
              if (codeAsNumber in typeOfMapping) {
                typeOfLabel = typeOfMapping[codeAsNumber];
                console.log(`✅ Mapping trouvé pour typeOf=${typeOfCode} (nombre) -> "${typeOfLabel}"`);
              } else if (codeAsString in typeOfMapping) {
                typeOfLabel = typeOfMapping[codeAsString];
                console.log(`✅ Mapping trouvé pour typeOf=${typeOfCode} (chaîne) -> "${typeOfLabel}"`);
              } else if (typeOfCode in typeOfMapping) {
                typeOfLabel = typeOfMapping[typeOfCode];
                console.log(`✅ Mapping trouvé pour typeOf=${typeOfCode} (direct) -> "${typeOfLabel}"`);
              } else {
                console.warn(`⚠️  Aucun mapping trouvé pour typeOf=${typeOfCode} (nombre=${codeAsNumber}, chaîne="${codeAsString}")`);
                console.log(`📋 Clés disponibles dans le mapping:`, Object.keys(typeOfMapping).slice(0, 10));
                console.log(`📋 Mapping contient 0:`, 0 in typeOfMapping, typeOfMapping[0]);
                console.log(`📋 Mapping contient "0":`, "0" in typeOfMapping, typeOfMapping["0"]);
                // Si aucun mapping trouvé, essayer avec 0 par défaut
                if (0 in typeOfMapping) {
                  typeOfLabel = typeOfMapping[0];
                  console.log(`✅ Utilisation du mapping par défaut (0) -> "${typeOfLabel}"`);
                }
              }
            } else if (typeMappingSize > 0) {
              // Si hasTypeOfCode est false mais qu'on a un mapping, essayer avec 0
              if (0 in typeOfMapping) {
                typeOfLabel = typeOfMapping[0];
                console.log(`✅ Utilisation du mapping par défaut (0) -> "${typeOfLabel}"`);
              }
            }

            // Extraire et mapper le statut (state)
            let stateCode = resource.attributes?.state ?? resource.state ?? resource.State;
            let stateLabel = stateCode;
            
            // Si state n'est pas défini, utiliser une valeur par défaut ou null
            if (stateCode === undefined || stateCode === null) {
              stateCode = null;
              stateLabel = null;
            } else if (stateMappingSize > 0) {
              const stateAsNumber = Number(stateCode);
              const stateAsString = String(stateCode);
              
              // Chercher dans le mapping state avec différentes clés
              if (stateAsNumber in stateMapping) {
                stateLabel = stateMapping[stateAsNumber];
                console.log(`✅ Mapping trouvé pour state=${stateCode} (nombre) -> "${stateLabel}"`);
              } else if (stateAsString in stateMapping) {
                stateLabel = stateMapping[stateAsString];
                console.log(`✅ Mapping trouvé pour state=${stateCode} (chaîne) -> "${stateLabel}"`);
              } else if (stateCode in stateMapping) {
                stateLabel = stateMapping[stateCode];
                console.log(`✅ Mapping trouvé pour state=${stateCode} (direct) -> "${stateLabel}"`);
              } else {
                console.warn(`⚠️  Aucun mapping trouvé pour state=${stateCode}`);
                stateLabel = stateCode; // Utiliser le code si aucun mapping trouvé
              }
            }
            
            return {
              ...resource,
              // Extraire depuis attributes si présent, sinon depuis la racine
              lastName: resource.attributes?.lastName || resource.lastName || resource.LastName || '',
              firstName: resource.attributes?.firstName || resource.firstName || resource.FirstName || '',
              typeOf: typeOfCode,
              typeOfLabel: typeOfLabel, // Ajouter le label correspondant au code
              state: stateCode,
              stateLabel: stateLabel // Ajouter le label du statut
            };
          });

          return {
            data: resourcesNormalized,
            total: resourcesNormalized.length
          };
        }
      } catch (error) {
        console.warn(`⚠️  Erreur avec l'endpoint ${endpoint}:`, error.message);
        // Continuer avec le prochain endpoint
        continue;
      }
    }
    
    // Si aucun endpoint ne fonctionne
    console.error('❌ Aucun endpoint ne fonctionne');
    throw new Error('Impossible de récupérer les ressources depuis l\'API BoondManager. Vérifiez les logs pour voir les erreurs détaillées.');
  }

  async getProjects() {
    return this.makeRequest('/api/v2/projects');
  }

  /**
   * Récupère les projets d'une ressource spécifique
   * @param {string|number} resourceId - ID de la ressource
   */
  async getResourceProjects(resourceId) {
    try {
      console.log(`📡 Récupération des projets pour la ressource ${resourceId}...`);
      const projects = await this.makeRequest(`/resources/${resourceId}/projects`);
      console.log(`✅ Projets récupérés pour la ressource ${resourceId}`);
      return projects;
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des projets pour la ressource ${resourceId}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère les contrats d'une ressource spécifique pour obtenir le TJM
   * @param {string|number} resourceId - ID de la ressource
   */
  async getResourceContracts(resourceId) {
    try {
      console.log(`📡 Récupération des contrats pour la ressource ${resourceId}...`);
      const contracts = await this.makeRequest(`/resources/${resourceId}/contracts`);
      console.log(`✅ Contrats récupérés pour la ressource ${resourceId}`);
      return contracts;
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des contrats pour la ressource ${resourceId}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère les prestations (deliveries) d'une ressource spécifique
   * @param {string|number} resourceId - ID de la ressource
   */
  async getResourceDeliveries(resourceId) {
    try {
      console.log(`📡 Récupération des prestations (deliveries) pour la ressource ${resourceId}...`);
      const deliveries = await this.makeRequest(`/resources/${resourceId}/deliveries`);
      console.log(`✅ Prestations récupérées pour la ressource ${resourceId}`);
      return deliveries;
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des prestations pour la ressource ${resourceId}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère les prestations (deliveriesInActivities) d'une ressource spécifique (ancien endpoint)
   * @param {string|number} resourceId - ID de la ressource
   */
  async getResourceDeliveriesInActivities(resourceId) {
    try {
      console.log(`📡 Récupération des prestations (deliveriesInActivities) pour la ressource ${resourceId}...`);
      const deliveries = await this.makeRequest(`/resources/${resourceId}/deliveriesinactivities`);
      console.log(`✅ Prestations récupérées pour la ressource ${resourceId}`);
      return deliveries;
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des prestations pour la ressource ${resourceId}:`, error.message);
      return null;
    }
  }

  /**
   * Récupère les prestations (deliveries) d'un projet spécifique
   * @param {string|number} projectId - ID du projet
   */
  async getProjectDeliveries(projectId) {
    try {
      console.log(`📡 Récupération des prestations (deliveries) pour le projet ${projectId}...`);
      const deliveries = await this.makeRequest(`/projects/${projectId}/deliveries`);
      console.log(`✅ Prestations récupérées pour le projet ${projectId}`);
      return deliveries;
    } catch (error) {
      console.error(`❌ Erreur lors de la récupération des prestations pour le projet ${projectId}:`, error.message);
      return null;
    }
  }

  async getServices() {
    return this.makeRequest('/api/v2/services');
  }

  async getTimeEntries(startDate, endDate) {
    const params = {};
    if (startDate) params.startDate = startDate;
    if (endDate) params.endDate = endDate;
    return this.makeRequest('/api/v2/time-entries', params);
  }

  /**
   * Récupère le dictionnaire de l'application BoondManager
   * Le dictionnaire contient les correspondances pour les codes (typeOf, etc.)
   */
  async getDictionary() {
    try {
      console.log('📚 Récupération du dictionnaire BoondManager...');
      const dictionary = await this.makeRequest('/application/dictionary');
      console.log('✅ Dictionnaire récupéré avec succès');
      return dictionary;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du dictionnaire:', error.message);
      return null;
    }
  }

  /**
   * Récupère le mapping state depuis le dictionnaire
   * Le tableau se trouve dans data.data.setting.state.resource
   * Retourne un objet { id: value } pour mapper les IDs aux libellés
   */
  async getStateMapping() {
    try {
      const dictionary = await this.getDictionary();
      if (!dictionary) {
        console.warn('⚠️  Dictionnaire non disponible');
        return {};
      }

      // Extraction sécurisée : essayer data.data ou data directement
      const dict = dictionary.data?.data || dictionary.data || dictionary;
      
      // Extraire resourceStates depuis setting.state.resource
      const resourceStates = dict?.setting?.state?.resource;
      
      if (!resourceStates) {
        console.error('⚠️  Structure du dictionnaire non reconnue pour state');
        console.error('📋 Contenu de dict.setting:', dict?.setting);
        console.error('📋 Clés disponibles dans dict.setting:', Object.keys(dict?.setting || {}));
        return {};
      }

      if (!Array.isArray(resourceStates)) {
        console.error('⚠️  setting.state.resource n\'est pas un tableau');
        console.error('📋 Type:', typeof resourceStates);
        console.error('📋 Valeur:', resourceStates);
        return {};
      }

      console.log(`📚 Tableau state.resource trouvé avec ${resourceStates.length} éléments`);

      // Créer le mapping : { id: value }
      const stateMapping = {};
      
      resourceStates.forEach(item => {
        // Vérifier explicitement que id n'est pas undefined/null (même si id=0 est valide)
        if (item.id !== undefined && item.id !== null && item.value !== undefined) {
          const id = item.id;
          const value = item.value;
          // Mapper avec l'ID comme nombre et comme chaîne pour supporter les deux formats
          stateMapping[id] = value;
          stateMapping[Number(id)] = value;
          stateMapping[String(id)] = value;
          console.log(`  ✅ Mapping state: ${id} -> "${value}"`);
        } else {
          console.warn(`⚠️  Élément sans id ou value:`, item);
        }
      });

      // Vérifier que le mapping est bien rempli
      const mappingSize = Object.keys(stateMapping).length;
      if (mappingSize === 0) {
        console.error('❌ Le stateMapping est vide !');
        return {};
      }

      console.log(`✅ Mapping state créé avec succès (${mappingSize} entrées)`);
      console.log(`📚 Mapping state:`, JSON.stringify(stateMapping, null, 2));
      
      return stateMapping;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du mapping state:', error.message);
      console.error('❌ Stack:', error.stack);
      return {};
    }
  }

  /**
   * Récupère le mapping typeOf depuis le dictionnaire
   * Le tableau se trouve dans setting.typeOf.resource
   * Retourne un objet { id: value } pour mapper les IDs aux libellés
   */
  async getTypeOfMapping() {
    try {
      const dictionary = await this.getDictionary();
      if (!dictionary) {
        console.warn('⚠️  Dictionnaire non disponible');
        return {};
      }

      // Extraction sécurisée : essayer data.data ou data directement
      const dict = dictionary.data?.data || dictionary.data || dictionary;
      
      // Extraire resourceTypes depuis setting.typeOf.resource
      const resourceTypes = dict?.setting?.typeOf?.resource;
      
      if (!resourceTypes) {
        console.error('⚠️  Structure du dictionnaire non reconnue');
        console.error('📋 Contenu de dict.setting:', dict?.setting);
        console.error('📋 Structure de dict:', JSON.stringify(dict, null, 2).substring(0, 2000));
        console.error('📋 Clés disponibles dans dict:', Object.keys(dict || {}));
        return {};
      }

      if (!Array.isArray(resourceTypes)) {
        console.error('⚠️  setting.typeOf.resource n\'est pas un tableau');
        console.error('📋 Type:', typeof resourceTypes);
        console.error('📋 Valeur:', resourceTypes);
        return {};
      }

      console.log(`📚 Tableau resource trouvé avec ${resourceTypes.length} éléments`);

      // Créer le mapping : { id: value }
      const typeMapping = {};
      
      resourceTypes.forEach(item => {
        // Vérifier explicitement que id n'est pas undefined/null (même si id=0 est valide)
        if (item.id !== undefined && item.id !== null && item.value !== undefined) {
          const id = item.id;
          const value = item.value;
          // Mapper avec l'ID comme nombre et comme chaîne pour supporter les deux formats
          // Important : utiliser l'ID directement comme clé pour gérer id=0 correctement
          typeMapping[id] = value;
          typeMapping[Number(id)] = value;
          typeMapping[String(id)] = value;
          console.log(`  ✅ Mapping: ${id} -> "${value}"`);
        } else {
          console.warn(`⚠️  Élément sans id ou value:`, item);
        }
      });

      // Vérifier que le mapping est bien rempli
      const mappingSize = Object.keys(typeMapping).length;
      if (mappingSize === 0) {
        console.error('❌ Le typeMapping est vide !');
        return {};
      }

      console.log(`✅ Mapping typeOf créé avec succès (${mappingSize} entrées)`);
      console.log(`📚 Mapping typeOf:`, JSON.stringify(typeMapping, null, 2));
      
      return typeMapping;
    } catch (error) {
      console.error('❌ Erreur lors de la récupération du mapping typeOf:', error.message);
      console.error('❌ Stack:', error.stack);
      return {};
    }
  }

  // Données mockées pour le développement
  getMockData(endpoint) {
    if (endpoint.includes('resources')) {
      return {
        data: [
          { id: 1, name: 'Jean Dupont', billable: true, hourlyRate: 80 },
          { id: 2, name: 'Marie Martin', billable: true, hourlyRate: 75 },
          { id: 3, name: 'Pierre Durand', billable: false, hourlyRate: 0 }
        ]
      };
    }
    if (endpoint.includes('projects')) {
      return {
        data: [
          { id: 1, name: 'Projet Alpha', client: 'Client A' },
          { id: 2, name: 'Projet Beta', client: 'Client B' }
        ]
      };
    }
    if (endpoint.includes('services')) {
      return {
        data: [
          { id: 1, name: 'Développement', projectId: 1 },
          { id: 2, name: 'Conseil', projectId: 2 }
        ]
      };
    }
    if (endpoint.includes('time-entries')) {
      return {
        data: [
          { id: 1, resourceId: 1, projectId: 1, serviceId: 1, hours: 8, date: '2024-01-15' },
          { id: 2, resourceId: 2, projectId: 2, serviceId: 2, hours: 6, date: '2024-01-15' }
        ]
      };
    }
    return { data: [] };
  }
}

module.exports = new BoondManagerService();
