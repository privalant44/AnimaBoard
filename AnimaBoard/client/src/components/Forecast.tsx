import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './Forecast.css';

interface Project {
  id: string | number;
  reference: string;
  title: string;
  startDate: string;
  endDate: string;
  tjm: number | null;
  orderedDays?: number | null;
}

interface DeliveryTimes {
  [deliveryId: string]: {
    actual: { [month: string]: number }; // En jours
    forecast: { [month: string]: number }; // En jours
    orderedDays?: number; // Jours commandés depuis la prestation
  };
}

interface ResourceWithProjects {
  id: number;
  nom: string;
  prenom: string;
  type?: string;
  statut?: string;
  projects: Project[];
}

interface ForecastProps {
  onBack: () => void;
}

/** Évite "JSON.parse: unexpected character" quand l'API renvoie du HTML (erreur Vercel). */
async function safeParseJson(res: Response): Promise<any> {
  const text = await res.text();
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch (e) {
    const friendly = `Réponse invalide du serveur (${res.status}): JSON attendu. Vérifiez les logs Vercel.`;
    throw new Error(friendly);
  }
}

function normalizeApiError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/JSON\.parse|unexpected character|SyntaxError/i.test(msg)) {
    return 'Réponse invalide du serveur: l\'API n\'a pas renvoyé de JSON (erreur ou timeout Vercel). Vérifiez les logs du déploiement.';
  }
  return msg;
}

function safeParseLocalStorage<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try { return JSON.parse(raw) as T; } catch { return fallback; }
}

// Fonction pour charger les filtres depuis localStorage
const loadForecastFiltersFromStorage = () => {
  try {
    const savedStartDate = localStorage.getItem('forecast_startDate');
    const savedEndDate = localStorage.getItem('forecast_endDate');
    const savedTypeFilter = localStorage.getItem('forecast_typeFilter');
    const savedStatutFilter = localStorage.getItem('forecast_statutFilter');
    
    // Calculer les dates par défaut (mois en cours)
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const defaultStartDate = firstDay.toISOString().split('T')[0];
    const defaultEndDate = lastDay.toISOString().split('T')[0];
    
    return {
      startDate: savedStartDate || defaultStartDate,
      endDate: savedEndDate || defaultEndDate,
      typeFilter: safeParseLocalStorage(savedTypeFilter, []),
      statutFilter: safeParseLocalStorage(savedStatutFilter, [])
    };
  } catch (error) {
    console.error('Erreur lors du chargement des filtres depuis localStorage:', error);
    // Valeurs par défaut en cas d'erreur
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: firstDay.toISOString().split('T')[0],
      endDate: lastDay.toISOString().split('T')[0],
      typeFilter: [],
      statutFilter: []
    };
  }
};

const Forecast: React.FC<ForecastProps> = ({ onBack }) => {
  // Charger les filtres depuis localStorage au démarrage
  const savedFilters = loadForecastFiltersFromStorage();
  
  const [resources, setResources] = useState<ResourceWithProjects[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState<string>(savedFilters.startDate);
  const [endDate, setEndDate] = useState<string>(savedFilters.endDate);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  
  // États pour les filtres
  const [typeFilter, setTypeFilter] = useState<string[]>(savedFilters.typeFilter);
  const [statutFilter, setStatutFilter] = useState<string[]>(savedFilters.statutFilter);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<boolean>(false);
  const [statutDropdownOpen, setStatutDropdownOpen] = useState<boolean>(false);
  
  // États pour le pliage/dépliage des prestations
  const [expandedResources, setExpandedResources] = useState<Set<number>>(new Set());
  const [expandedDeliveries, setExpandedDeliveries] = useState<Set<string>>(new Set());
  
  // États pour les temps mensuels
  const [deliveryTimes, setDeliveryTimes] = useState<DeliveryTimes>({});
  const [loadingTimes, setLoadingTimes] = useState<Set<string | number>>(new Set());
  const [editingMonth, setEditingMonth] = useState<{ deliveryId: string | number; month: string } | null>(null);
  
  // État pour l'agrégat des timesheets
  const [timesheetsAggregate, setTimesheetsAggregate] = useState<{
    [resourceId: string]: {
      [deliveryId: string]: {
        [month: string]: { days: number; hours: number };
      };
    };
  }>({});

  // États pour toutes les options de filtres (depuis toutes les ressources)
  const [allTypeOptions, setAllTypeOptions] = useState<string[]>([]);
  const [allStatutOptions, setAllStatutOptions] = useState<string[]>([]);

  const fetchForecast = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Charger les prestations depuis deliveries.json
      console.log('📡 Chargement des prestations depuis deliveries.json...');
      const deliveriesResponse = await fetch('/api/data/deliveries.json');
      const deliveriesResponseData = await safeParseJson(deliveriesResponse);
      if (!deliveriesResponse.ok) {
        const msg = deliveriesResponseData?.error || 'Aucune donnée prestations. Lancez la synchronisation "Prestations" depuis Paramètres.';
        throw new Error(msg);
      }
      // La réponse de l'API est { success: true, data: { metadata: {...}, data: [...] } }
      // On doit extraire deliveriesResponseData.data.data (le tableau des prestations)
      const deliveriesData = deliveriesResponseData.data || deliveriesResponseData;
      // deliveriesData peut être soit { metadata: {...}, data: [...] } soit directement [...]
      const deliveries = (deliveriesData.data && Array.isArray(deliveriesData.data)) 
        ? deliveriesData.data 
        : (Array.isArray(deliveriesData) ? deliveriesData : []);
      console.log(`📊 ${deliveries.length} prestations chargées depuis deliveries.json`);

      // Charger TOUTES les ressources depuis resources-local (base de données)
      console.log('📡 Chargement des ressources depuis resources-local...');
      const resourcesResponse = await fetch('/api/data/resources-local');
      const resourcesData = await safeParseJson(resourcesResponse);
      if (!resourcesResponse.ok) {
        const msg = resourcesData?.error || 'Ressources non disponibles. Lancez la synchronisation "Ressources" depuis Paramètres.';
        throw new Error(msg);
      }
      const resourcesList = resourcesData.data || resourcesData || [];
      console.log(`📊 ${resourcesList.length} ressources chargées depuis resources-local`);

      // Extraire tous les types et statuts pour les options de filtres
      const typeSet = new Set<string>();
      const statutSet = new Set<string>();
      resourcesList.forEach((r: any) => {
        const type = r.typeLabel || '';
        const statut = r.stateLabel || '';
        if (type) typeSet.add(type);
        if (statut) statutSet.add(statut);
      });
      setAllTypeOptions(Array.from(typeSet).sort());
      setAllStatutOptions(Array.from(statutSet).sort());
      console.log(`📊 Options filtres: ${typeSet.size} types, ${statutSet.size} statuts`);

      // Récupérer les mappings typeOf et state depuis le dictionnaire
      console.log('📡 Récupération du dictionnaire pour mapper typeOf et state...');
      let typeOfMapping: { [key: string]: string } = {};
      let stateMapping: { [key: string]: string } = {};
      
      try {
        // Utiliser l'endpoint /api/boondmanager/dictionary/resources pour récupérer le mapping typeOf
        const dictionaryResponse = await fetch('/api/boondmanager/dictionary/resources');
        if (dictionaryResponse.ok) {
          const dictionaryData = await safeParseJson(dictionaryResponse);
          // Le mapping typeOf est directement dans typeMapping
          if (dictionaryData.typeMapping) {
            Object.keys(dictionaryData.typeMapping).forEach(key => {
              typeOfMapping[key] = dictionaryData.typeMapping[key];
              typeOfMapping[Number(key)] = dictionaryData.typeMapping[key];
              typeOfMapping[String(key)] = dictionaryData.typeMapping[key];
            });
          }
          console.log(`✅ ${Object.keys(typeOfMapping).length} types mappés`);
        }
        
        // Récupérer le mapping state depuis le dictionnaire complet
        const fullDictionaryResponse = await fetch('/api/boondmanager/dictionary');
        if (fullDictionaryResponse.ok) {
          const fullDictionaryData = await safeParseJson(fullDictionaryResponse);
          // Extraire le mapping state depuis data.data.setting.state.resource
          const dict = fullDictionaryData.data?.data || fullDictionaryData.data || fullDictionaryData;
          const resourceStates = dict?.setting?.state?.resource || [];
          console.log(`📊 ${resourceStates.length} statuts trouvés dans le dictionnaire`);
          console.log(`📋 Structure dict:`, Object.keys(dict || {}));
          console.log(`📋 Structure setting:`, Object.keys(dict?.setting || {}));
          console.log(`📋 Structure state:`, Object.keys(dict?.setting?.state || {}));
          
          if (resourceStates.length === 0) {
            console.warn('⚠️  Aucun statut trouvé dans le dictionnaire');
            console.warn('📋 dict.setting.state:', dict?.setting?.state);
          }
          
          resourceStates.forEach((item: any) => {
            if (item.id !== undefined && item.id !== null && item.value !== undefined) {
              const idStr = String(item.id);
              const idNum = Number(item.id);
              stateMapping[idStr] = item.value;
              stateMapping[idNum] = item.value;
              stateMapping[item.id] = item.value;
              console.log(`  ✅ Mapping state: ${item.id} (str=${idStr}, num=${idNum}) -> "${item.value}"`);
            } else {
              console.warn(`⚠️  Élément state invalide:`, item);
            }
          });
          console.log(`✅ ${Object.keys(stateMapping).length} statuts mappés`);
          console.log(`📋 Mapping state complet:`, stateMapping);
        } else {
          console.error(`❌ Erreur HTTP ${fullDictionaryResponse.status} lors de la récupération du dictionnaire`);
        }
      } catch (error) {
        console.warn('⚠️  Erreur lors de la récupération du dictionnaire:', error);
      }

      // Créer un map des ressources par ID pour accès rapide
      // Les typeLabel et stateLabel sont déjà résolus par /resources-local
      const resourcesMap: { [key: string]: { nom: string; prenom: string; type?: string; statut?: string } } = {};
      resourcesList.forEach((resource: any) => {
        const resourceId = String(resource.id || '');
        const firstName = resource.prenom || resource.firstName || '';
        const lastName = resource.nom || resource.lastName || '';
        
        // Utiliser typeLabel et stateLabel déjà résolus par le backend
        const type = resource.typeLabel || '';
        const statut = resource.stateLabel || '';
        
        if (resourceId) {
          resourcesMap[resourceId] = { nom: lastName, prenom: firstName, type, statut };
        }
      });

      // Grouper les prestations par ressource
      const deliveriesByResource: { [key: string]: Project[] } = {};

      deliveries.forEach((delivery: any) => {
        // Récupérer l'ID de la ressource (camelCase ou snake_case selon la source)
        const resourceId = String(delivery.resourceId || delivery.resource_id || '');
        if (!resourceId) {
          return;
        }

        // Filtrer par période si spécifiée
        if (startDate && endDate) {
          const start = new Date(startDate);
          const end = new Date(endDate);
          const deliveryStart = delivery.startDate ? new Date(delivery.startDate) : null;
          const deliveryEnd = delivery.endDate ? new Date(delivery.endDate) : null;

          // Vérifier si la prestation chevauche la période
          if (deliveryStart && deliveryEnd) {
            const overlaps = (deliveryStart <= end && deliveryEnd >= start);
            if (!overlaps) {
              return; // Prestation en dehors de la période
            }
          } else {
            return; // Pas de dates, on ignore
          }
        }

        // Créer l'objet Project avec les jours commandés
        const project: Project = {
          id: delivery.id,
          reference: delivery.id || 'N/A',
          title: delivery.title || 'Sans titre',
          startDate: delivery.startDate || '',
          endDate: delivery.endDate || '',
          tjm: delivery.tjm !== null && delivery.tjm !== undefined
            ? Number(delivery.tjm)
            : (delivery.averageDailyPriceExcludingTax !== null && delivery.averageDailyPriceExcludingTax !== undefined
              ? Number(delivery.averageDailyPriceExcludingTax)
              : null),
          orderedDays: delivery.orderedDays !== null && delivery.orderedDays !== undefined && !isNaN(Number(delivery.orderedDays))
            ? Number(delivery.orderedDays)
            : null
        };

        if (!deliveriesByResource[resourceId]) {
          deliveriesByResource[resourceId] = [];
        }
        deliveriesByResource[resourceId].push(project);
      });

      // Créer la liste des ressources avec leurs prestations
      const resourcesWithProjects: ResourceWithProjects[] = [];
      
      Object.keys(deliveriesByResource).forEach((resourceId) => {
        const resourceInfo = resourcesMap[resourceId] || { nom: 'N/A', prenom: 'N/A', type: '', statut: '' };
        // Trier les prestations par date de fin décroissante
        const sortedProjects = [...deliveriesByResource[resourceId]].sort((a, b) => {
          const dateA = a.endDate ? new Date(a.endDate).getTime() : 0;
          const dateB = b.endDate ? new Date(b.endDate).getTime() : 0;
          return dateB - dateA; // Décroissant
        });
        resourcesWithProjects.push({
          id: Number(resourceId),
          nom: resourceInfo.nom,
          prenom: resourceInfo.prenom,
          type: resourceInfo.type,
          statut: resourceInfo.statut,
          projects: sortedProjects
        });
      });

      // Trier par nom de famille puis prénom
      resourcesWithProjects.sort((a, b) => {
        if (a.nom !== b.nom) {
          return a.nom.localeCompare(b.nom);
        }
        return a.prenom.localeCompare(b.prenom);
      });

      console.log(`✅ ${resourcesWithProjects.length} ressources avec prestations trouvées`);
      // Vérifier que les libellés sont bien mappés
      const sampleResource = resourcesWithProjects[0];
      if (sampleResource) {
        console.log(`📋 Exemple de ressource mappée:`, {
          nom: sampleResource.nom,
          prenom: sampleResource.prenom,
          type: sampleResource.type,
          statut: sampleResource.statut
        });
      }
      setResources(resourcesWithProjects);
    } catch (err) {
      const errorMessage = normalizeApiError(err);
      setError(errorMessage);
      console.error('❌ Error fetching forecast:', err);
      setResources([]);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  // Charger l'agrégat des timesheets
  const loadTimesheetsAggregate = useCallback(async () => {
    try {
      console.log('📡 Chargement de l\'agrégat des timesheets...');
      const response = await fetch('/api/data/timesheets_aggregate.json');
      if (!response.ok) {
        console.warn('⚠️  Fichier timesheets_aggregate.json non trouvé. Les temps saisis ne seront pas affichés.');
        return;
      }
      const data = await safeParseJson(response);
      const aggregateData = data.data?.data || data.data || [];
      
      console.log(`📊 ${aggregateData.length} lignes agrégées chargées`);
      
      // Créer une structure indexée par resourceId, deliveryId et month
      const indexed: {
        [resourceId: string]: {
          [deliveryId: string]: {
            [month: string]: { days: number; hours: number };
          };
        };
      } = {};
      
      aggregateData.forEach((item: any) => {
        const resourceId = String(item.resourceId || '');
        const deliveryId = String(item.deliveryId || '');
        const month = item.month || '';
        
        if (!resourceId || !deliveryId || !month) {
          return;
        }
        
        if (!indexed[resourceId]) {
          indexed[resourceId] = {};
        }
        if (!indexed[resourceId][deliveryId]) {
          indexed[resourceId][deliveryId] = {};
        }
        
        // Convertir les jours en heures (1 jour = 7 heures par défaut, ou utiliser totalHours si disponible)
        const days = parseFloat(item.totalDays) || 0;
        const hours = parseFloat(item.totalHours) || 0;
        // Si on a des jours mais pas d'heures, convertir (1 jour = 7h)
        const totalHours = hours > 0 ? hours : (days * 7);
        
        indexed[resourceId][deliveryId][month] = {
          days,
          hours: totalHours
        };
      });
      
      setTimesheetsAggregate(indexed);
      console.log(`✅ Agrégat indexé avec succès`);
    } catch (error) {
      console.error('❌ Erreur lors du chargement de l\'agrégat des timesheets:', error);
    }
  }, []);

  // Sauvegarder les dates dans localStorage à chaque changement
  useEffect(() => {
    if (startDate) {
      try {
        localStorage.setItem('forecast_startDate', startDate);
      } catch (error) {
        console.error('Erreur lors de la sauvegarde de startDate:', error);
      }
    }
  }, [startDate]);

  useEffect(() => {
    if (endDate) {
      try {
        localStorage.setItem('forecast_endDate', endDate);
      } catch (error) {
        console.error('Erreur lors de la sauvegarde de endDate:', error);
      }
    }
  }, [endDate]);

  // Sauvegarder les filtres type et statut dans localStorage à chaque changement
  useEffect(() => {
    try {
      localStorage.setItem('forecast_typeFilter', JSON.stringify(typeFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre type:', error);
    }
  }, [typeFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('forecast_statutFilter', JSON.stringify(statutFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre statut:', error);
    }
  }, [statutFilter]);

  useEffect(() => {
    if (startDate && endDate) {
      fetchForecast();
    }
    // Charger l'agrégat au montage du composant
    loadTimesheetsAggregate();
  }, [startDate, endDate, fetchForecast, loadTimesheetsAggregate]);

  // Filtrer les ressources par type et statut
  const filteredResources = useMemo(() => {
    let filtered = resources;

    // Appliquer le filtre par type (multi-sélection)
    if (typeFilter.length > 0) {
      filtered = filtered.filter(r => {
        const resourceType = r.type || '';
        return typeFilter.includes(resourceType);
      });
    }

    // Appliquer le filtre par statut (multi-sélection)
    if (statutFilter.length > 0) {
      filtered = filtered.filter(r => {
        const resourceStatut = r.statut || '';
        return statutFilter.includes(resourceStatut);
      });
    }

    return filtered;
  }, [resources, typeFilter, statutFilter]);

  // Calcul de la pagination
  const totalPages = Math.ceil(filteredResources.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentResources = filteredResources.slice(startIndex, endIndex);

  // Réinitialiser la page quand le filtre change
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, statutFilter]);

  // Les options de filtres sont chargées depuis toutes les ressources de la base
  // (allTypeOptions et allStatutOptions sont mis à jour dans fetchForecast)

  // Fonction pour basculer l'état plié/déplié d'une ressource
  const toggleResourceExpanded = (resourceId: number) => {
    setExpandedResources(prev => {
      const newSet = new Set(prev);
      if (newSet.has(resourceId)) {
        newSet.delete(resourceId);
      } else {
        newSet.add(resourceId);
      }
      return newSet;
    });
  };

  // Fonction pour basculer l'état plié/déplié d'une prestation
  const toggleDeliveryExpanded = (deliveryId: string | number) => {
    setExpandedDeliveries(prev => {
      const newSet = new Set(prev);
      const deliveryIdStr = String(deliveryId);
      if (newSet.has(deliveryIdStr)) {
        newSet.delete(deliveryIdStr);
      } else {
        newSet.add(deliveryIdStr);
      }
      return newSet;
    });
  };

  // Fermer les dropdowns quand on clique ailleurs
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.filter-dropdown-container')) {
        setTypeDropdownOpen(false);
        setStatutDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const getPageNumbers = () => {
    const pages = [];
    const maxVisiblePages = 5;
    let startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2));
    let endPage = Math.min(totalPages, startPage + maxVisiblePages - 1);
    
    if (endPage - startPage < maxVisiblePages - 1) {
      startPage = Math.max(1, endPage - maxVisiblePages + 1);
    }
    
    for (let i = startPage; i <= endPage; i++) {
      pages.push(i);
    }
    return pages;
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return 'N/A';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
    } catch {
      return dateString;
    }
  };

  // Charger les temps pour une prestation
  const loadDeliveryTimes = useCallback(async (deliveryId: string | number, resourceId: number, projectStartDate: string, projectEndDate: string) => {
    if (loadingTimes.has(deliveryId)) return;
    
    setLoadingTimes(prev => new Set(prev).add(deliveryId));
    
    try {
      // Charger les temps prévisionnels depuis le fichier JSON
      const forecastTimesResponse = await fetch('/api/data/forecast-times.json');
      let forecastTimes: any = { data: {} };
      if (forecastTimesResponse.ok) {
        const forecastData = await safeParseJson(forecastTimesResponse);
        forecastTimes = forecastData.data || forecastData;
      }

      // Charger les temps saisis depuis l'agrégat des timesheets (en jours)
      let actualTimes: { [month: string]: number } = {};
      
      const resourceIdStr = String(resourceId);
      const deliveryIdStr = String(deliveryId);
      
      // Récupérer les temps depuis l'agrégat indexé
      // Essayer plusieurs variantes d'IDs pour la correspondance
      const resourceIdVariants = [resourceIdStr, String(Number(resourceId)), Number(resourceId).toString()];
      const deliveryIdVariants = [deliveryIdStr, String(Number(deliveryId)), Number(deliveryId).toString()];
      
      let foundData: { [month: string]: { days: number; hours: number } } | null = null;
      
      for (const resIdVar of resourceIdVariants) {
        if (timesheetsAggregate[resIdVar]) {
          for (const delIdVar of deliveryIdVariants) {
            if (timesheetsAggregate[resIdVar][delIdVar]) {
              foundData = timesheetsAggregate[resIdVar][delIdVar];
              break;
            }
          }
          if (foundData) break;
        }
      }
      
      if (foundData) {
        // Charger TOUS les mois, pas seulement ceux dans la période du projet
        // pour avoir le détail complet dans le tableau
        Object.keys(foundData).forEach((month) => {
          // Utiliser les jours directement (pas de conversion en heures)
          const timeData = foundData![month];
          actualTimes[month] = timeData.days || 0;
        });
        
        console.log(`✅ Temps saisis (jours) récupérés depuis l'agrégat pour la prestation ${deliveryId} (ressource ${resourceId}):`, actualTimes);
      } else {
        console.log(`⚠️  Aucun temps saisi trouvé dans l'agrégat pour la prestation ${deliveryId} (ressource ${resourceId})`);
        console.log(`   Ressources disponibles:`, Object.keys(timesheetsAggregate).slice(0, 10));
      }

      // Charger les jours commandés depuis les prestations (déjà chargé dans fetchForecast, on le récupère depuis les prestations)
      let orderedDays: number | null = null;
      try {
        const deliveriesResponse = await fetch('/api/data/deliveries.json');
        if (deliveriesResponse.ok) {
          const deliveriesData = await safeParseJson(deliveriesResponse);
          const deliveries = deliveriesData.data?.data || deliveriesData.data || [];
          const delivery = deliveries.find((d: any) => String(d.id) === String(deliveryId));
          if (delivery && delivery.orderedDays !== null && delivery.orderedDays !== undefined) {
            orderedDays = parseFloat(delivery.orderedDays);
          }
        }
      } catch (error) {
        console.warn(`⚠️  Impossible de charger les jours commandés pour la prestation ${deliveryId}:`, error);
      }

      // Mettre à jour l'état
      setDeliveryTimes(prev => ({
        ...prev,
        [String(deliveryId)]: {
          actual: actualTimes,
          forecast: forecastTimes.data?.[String(deliveryId)]?.forecast || {},
          orderedDays: orderedDays || undefined
        }
      }));
    } catch (error) {
      console.error(`❌ Erreur lors du chargement des temps pour la prestation ${deliveryId}:`, error);
    } finally {
      setLoadingTimes(prev => {
        const newSet = new Set(prev);
        newSet.delete(deliveryId);
        return newSet;
      });
    }
  }, [loadingTimes, timesheetsAggregate]);

  // Sauvegarder un temps prévisionnel (en jours)
  const saveForecastTime = useCallback(async (deliveryId: string | number, month: string, days: number) => {
    try {
      const response = await fetch('/api/data/forecast-times', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          deliveryId: String(deliveryId),
          month: month,
          hours: days // Le backend attend "hours" mais on envoie des jours
        })
      });

      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde');
      }

      // Mettre à jour l'état local
      setDeliveryTimes(prev => ({
        ...prev,
        [String(deliveryId)]: {
          ...prev[String(deliveryId)],
          forecast: {
            ...(prev[String(deliveryId)]?.forecast || {}),
            [month]: days
          }
        }
      }));

      setEditingMonth(null);
    } catch (error) {
      console.error(`❌ Erreur lors de la sauvegarde du temps prévisionnel:`, error);
      alert('Erreur lors de la sauvegarde. Veuillez réessayer.');
    }
  }, []);

  // Obtenir tous les mois de 2026
  const get2026Months = (): string[] => {
    const months: string[] = [];
    for (let month = 1; month <= 12; month++) {
      months.push(`2026-${String(month).padStart(2, '0')}`);
    }
    return months;
  };

  // Calculer le cumul 2025 pour une prestation
  const get2025Cumulative = (deliveryId: string | number, resourceId: number): number => {
    const resourceIdStr = String(resourceId);
    const deliveryIdStr = String(deliveryId);
    
    // Essayer plusieurs variantes d'IDs
    const resourceIdVariants = [resourceIdStr, String(Number(resourceId)), Number(resourceId).toString()];
    const deliveryIdVariants = [deliveryIdStr, String(Number(deliveryId)), Number(deliveryId).toString()];
    
    let foundData: { [month: string]: { days: number; hours: number } } | null = null;
    
    for (const resIdVar of resourceIdVariants) {
      if (timesheetsAggregate[resIdVar]) {
        for (const delIdVar of deliveryIdVariants) {
          if (timesheetsAggregate[resIdVar][delIdVar]) {
            foundData = timesheetsAggregate[resIdVar][delIdVar];
            break;
          }
        }
        if (foundData) break;
      }
    }
    
    if (!foundData) {
      return 0;
    }
    
    let total = 0;
    
    Object.keys(foundData).forEach((month) => {
      if (month.startsWith('2025-')) {
        const timeData = foundData![month];
        total += timeData.days || 0;
      }
    });
    
    return total;
  };

  // Calculer le CA d'une ressource pour une année donnée
  const getResourceCA = (resource: ResourceWithProjects, year: number): number => {
    const resourceIdStr = String(resource.id);
    let totalCA = 0;
    
    resource.projects.forEach((project) => {
      const deliveryIdStr = String(project.id);
      const tjm = project.tjm || 0;
      
      if (tjm <= 0) return;
      
      // Essayer plusieurs variantes d'IDs
      const resourceIdVariants = [resourceIdStr, String(Number(resource.id)), Number(resource.id).toString()];
      const deliveryIdVariants = [deliveryIdStr, String(Number(project.id)), Number(project.id).toString()];
      
      let foundData: { [month: string]: { days: number; hours: number } } | null = null;
      
      for (const resIdVar of resourceIdVariants) {
        if (timesheetsAggregate[resIdVar]) {
          for (const delIdVar of deliveryIdVariants) {
            if (timesheetsAggregate[resIdVar][delIdVar]) {
              foundData = timesheetsAggregate[resIdVar][delIdVar];
              break;
            }
          }
          if (foundData) break;
        }
      }
      
      if (foundData) {
        Object.keys(foundData).forEach((month) => {
          if (month.startsWith(`${year}-`)) {
            const timeData = foundData![month];
            const days = timeData.days || 0;
            totalCA += days * tjm;
          }
        });
      }
    });
    
    return totalCA;
  };

  // Formater le nom du mois
  const formatMonthName = (month: string): string => {
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return date.toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' });
  };

  if (loading) {
    return (
      <div className="forecast-page">
        <div className="forecast-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          <h2>Forecast</h2>
        </div>
        <div className="forecast-container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Chargement du forecast...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="forecast-page">
        <div className="forecast-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          <h2>Forecast</h2>
        </div>
        <div className="forecast-container">
          <div className="error-state">
            <p className="error-message">❌ {error}</p>
            <button className="retry-button" onClick={fetchForecast}>
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="forecast-page">
      <div className="forecast-header">
        <button className="back-button" onClick={onBack}>
          ← Retour
        </button>
        <h2>Forecast</h2>
      </div>
      <div className="forecast-container">
        {/* Filtres de période */}
        <div className="forecast-filters">
          <div className="date-filters-group">
            <div className="date-filter">
              <label htmlFor="start-date">Date de début :</label>
              <input
                type="date"
                id="start-date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="date-input"
              />
            </div>
            <div className="date-filter">
              <label htmlFor="end-date">Date de fin :</label>
              <input
                type="date"
                id="end-date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="date-input"
              />
            </div>
            <button className="refresh-button" onClick={fetchForecast}>
              Actualiser
            </button>
            
            {/* Filtres Type et Statut */}
            <div className="filters-container">
          {/* Filtre Type */}
          <div className="filter-dropdown-container">
            <button
              className="filter-button"
              onClick={() => {
                setTypeDropdownOpen(!typeDropdownOpen);
                setStatutDropdownOpen(false);
              }}
            >
              Type
              {typeFilter.length > 0 && (
                <span className="filter-badge">{typeFilter.length}</span>
              )}
              <span className="dropdown-arrow">{typeDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {typeDropdownOpen && (
              <div className="filter-dropdown">
                <div className="filter-dropdown-content">
                  {allTypeOptions.map((type) => (
                    <label key={type} className="filter-checkbox-label">
                      <input
                        type="checkbox"
                        checked={typeFilter.includes(type)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setTypeFilter([...typeFilter, type]);
                          } else {
                            setTypeFilter(typeFilter.filter(t => t !== type));
                          }
                        }}
                        className="filter-checkbox"
                      />
                      <span>{type}</span>
                    </label>
                  ))}
                </div>
                {typeFilter.length > 0 && (
                  <div className="filter-dropdown-footer">
                    <button
                      className="clear-filter-button-small"
                      onClick={() => setTypeFilter([])}
                    >
                      Effacer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Filtre Statut */}
          <div className="filter-dropdown-container">
            <button
              className="filter-button"
              onClick={() => {
                setStatutDropdownOpen(!statutDropdownOpen);
                setTypeDropdownOpen(false);
              }}
            >
              Statut
              {statutFilter.length > 0 && (
                <span className="filter-badge">{statutFilter.length}</span>
              )}
              <span className="dropdown-arrow">{statutDropdownOpen ? '▲' : '▼'}</span>
            </button>
            {statutDropdownOpen && (
              <div className="filter-dropdown">
                <div className="filter-dropdown-content">
                  {allStatutOptions.map((statut) => {
                    const statutValue: string = statut || '';
                    return (
                      <label key={statutValue} className="filter-checkbox-label">
                        <input
                          type="checkbox"
                          checked={statutFilter.includes(statutValue)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setStatutFilter([...statutFilter, statutValue]);
                            } else {
                              setStatutFilter(statutFilter.filter(s => s !== statutValue));
                            }
                          }}
                          className="filter-checkbox"
                        />
                        <span>{statutValue}</span>
                      </label>
                    );
                  })}
                </div>
                {statutFilter.length > 0 && (
                  <div className="filter-dropdown-footer">
                    <button
                      className="clear-filter-button-small"
                      onClick={() => setStatutFilter([])}
                    >
                      Effacer
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
            </div>
          </div>
        </div>

        {filteredResources.length === 0 ? (
          <div className="empty-state">
            <p className="empty-message">Aucune prestation trouvée</p>
            <p className="empty-details">Aucune ressource n'a de prestations dans la période sélectionnée ou ne correspond aux filtres.</p>
          </div>
        ) : (
          <>
            {currentResources.map((resource) => {
              const isExpanded = expandedResources.has(resource.id);
              return (
                <div key={resource.id} className="resource-card">
                  <div className="resource-header" onClick={() => toggleResourceExpanded(resource.id)}>
                    <h3 className="resource-name">{resource.prenom} {resource.nom}</h3>
                    <div className="resource-header-right">
                      <span className="resource-ca">
                        CA {new Date().getFullYear() - 1}: {getResourceCA(resource, new Date().getFullYear() - 1).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                      </span>
                      <span className="resource-ca">
                        CA {new Date().getFullYear()}: {getResourceCA(resource, new Date().getFullYear()).toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} €
                      </span>
                      <span className="projects-count">{resource.projects.length} prestation{resource.projects.length > 1 ? 's' : ''}</span>
                      <span className="expand-icon">{isExpanded ? '▼' : '▶'}</span>
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="projects-list">
                      {resource.projects.length === 0 ? (
                        <div className="no-projects">
                          <p className="no-projects-message">Aucune prestation trouvée pour cette ressource</p>
                          <p className="no-projects-details">Vérifiez que la ressource a des prestations dans la période sélectionnée ou consultez les logs du serveur.</p>
                        </div>
                      ) : (
                        <div className="projects-list-container">
                          {resource.projects.map((project, index) => {
                            const deliveryId = String(project.id);
                            const isDeliveryExpanded = expandedDeliveries.has(deliveryId);
                            const times = deliveryTimes[deliveryId] || { actual: {}, forecast: {} };
                            
                            // Charger les temps si pas encore chargés
                            if (!deliveryTimes[deliveryId] && !loadingTimes.has(project.id)) {
                              loadDeliveryTimes(project.id, resource.id, project.startDate, project.endDate);
                            }
                            
                            // Utiliser les jours commandés depuis le projet ou depuis times
                            const orderedDays = project.orderedDays !== null && project.orderedDays !== undefined 
                              ? project.orderedDays 
                              : (times.orderedDays !== null && times.orderedDays !== undefined ? times.orderedDays : null);
                            
                            // Calculer les jours consommés (tous les jours depuis timesheetsAggregate)
                            const resourceIdStr = String(resource.id);
                            const deliveryIdStr = String(project.id);
                            let consumedDays = 0;
                            
                            // Essayer plusieurs variantes d'IDs pour la correspondance
                            const resourceIdVariants = [resourceIdStr, String(Number(resource.id)), Number(resource.id).toString()];
                            const deliveryIdVariants = [deliveryIdStr, String(Number(project.id)), Number(project.id).toString()];
                            
                            let foundData: { [month: string]: { days: number; hours: number } } | null = null;
                            
                            for (const resIdVar of resourceIdVariants) {
                              if (timesheetsAggregate[resIdVar]) {
                                for (const delIdVar of deliveryIdVariants) {
                                  if (timesheetsAggregate[resIdVar][delIdVar]) {
                                    foundData = timesheetsAggregate[resIdVar][delIdVar];
                                    break;
                                  }
                                }
                                if (foundData) break;
                              }
                            }
                            
                            if (foundData) {
                              // Somme tous les jours, toutes années confondues
                              Object.keys(foundData).forEach((month) => {
                                const timeData = foundData![month];
                                consumedDays += timeData.days || 0;
                              });
                            } else {
                              // Log pour déboguer
                              console.log(`⚠️  Aucune donnée trouvée pour resourceId=${resourceIdStr} (${resource.id}), deliveryId=${deliveryIdStr} (${project.id})`);
                            }
                            
                            // Calculer le CA (jours consommés * TJM)
                            const ca = project.tjm !== null && project.tjm !== undefined && consumedDays > 0
                              ? consumedDays * project.tjm
                              : 0;
                            
                            return (
                              <div key={`${project.id}-${index}`} className="project-card">
                                <div 
                                  className="project-header" 
                                  onClick={() => toggleDeliveryExpanded(project.id)}
                                  style={{ cursor: 'pointer' }}
                                >
                                  <div className="project-header-content">
                                    <div className="project-title-section">
                                      <span className="expand-icon" style={{ fontSize: '0.7rem', color: '#2C5F5D', marginRight: '0.5rem' }}>
                                        {isDeliveryExpanded ? '▼' : '▶'}
                                      </span>
                                      <span className="project-title-inline">{project.title}</span>
                                    </div>
                                    <span className="project-ref-inline">Réf: {project.reference || project.id || 'N/A'}</span>
                                    <span className="project-dates-inline">
                                      {formatDate(project.startDate)} - {formatDate(project.endDate)}
                                    </span>
                                    {project.tjm !== null && project.tjm !== undefined ? (
                                      <span className="project-tjm-inline">
                                        TJM: {project.tjm.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                                      </span>
                                    ) : (
                                      <span className="project-tjm-inline"></span>
                                    )}
                                    <button className="project-button project-button-ordered" onClick={(e) => e.stopPropagation()}>
                                      Cde : {orderedDays !== null && orderedDays !== undefined ? `${orderedDays.toFixed(0)} j` : '-'}
                                    </button>
                                    <button className="project-button project-button-consumed" onClick={(e) => e.stopPropagation()}>
                                      Conso : {consumedDays.toFixed(1)} j
                                    </button>
                                    <button 
                                      className={`project-button project-button-delta ${
                                        orderedDays !== null && orderedDays !== undefined
                                          ? (orderedDays - consumedDays > 0 ? 'delta-positive' : orderedDays - consumedDays < 0 ? 'delta-negative' : '')
                                          : 'delta-na'
                                      }`}
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      Delta : {orderedDays !== null && orderedDays !== undefined 
                                        ? `${(orderedDays - consumedDays).toFixed(1)} j` 
                                        : '-'}
                                    </button>
                                    <button className="project-button project-button-ca" onClick={(e) => e.stopPropagation()}>
                                      CA : {ca > 0 ? ca.toLocaleString('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : '0'} €
                                    </button>
                                  </div>
                                </div>
                                {isDeliveryExpanded && (
                                <div className="project-months">
                                  <table className="forecast-table">
                                    <thead>
                                      <tr>
                                        <th className="table-row-label"></th>
                                        <th className="table-header">2025</th>
                                        {get2026Months().map((month) => (
                                          <th key={month} className="table-header">
                                            {formatMonthName(month)}
                                          </th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {/* Ligne Temps saisi */}
                                      <tr className="forecast-row">
                                        <td className="table-row-label">Temps saisi (jours)</td>
                                        <td className="table-cell actual-cell">
                                          {loadingTimes.has(project.id) ? (
                                            <span className="loading">...</span>
                                          ) : (
                                            <span className={get2025Cumulative(project.id, resource.id) > 0 ? 'has-hours' : 'no-hours'}>
                                              {get2025Cumulative(project.id, resource.id).toFixed(1)}j
                                            </span>
                                          )}
                                        </td>
                                        {get2026Months().map((month) => {
                                          const actualDays = times.actual[month] || 0;
                                          return (
                                            <td key={month} className="table-cell actual-cell">
                                              {loadingTimes.has(project.id) ? (
                                                <span className="loading">...</span>
                                              ) : (
                                                <span className={actualDays > 0 ? 'has-hours' : 'no-hours'}>
                                                  {actualDays.toFixed(1)}j
                                                </span>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                      {/* Ligne Temps prévisionnel */}
                                      <tr className="forecast-row">
                                        <td className="table-row-label">Temps prévisionnel (jours)</td>
                                        <td className="table-cell forecast-cell">
                                          <span className="no-forecast">-</span>
                                        </td>
                                        {get2026Months().map((month) => {
                                          const forecastDays = times.forecast[month] || 0;
                                          const isEditing = editingMonth?.deliveryId === project.id && editingMonth?.month === month;
                                          
                                          // Vérifier si le mois est au-delà de la date de fin
                                          const monthDate = new Date(month + '-01');
                                          const endDate = project.endDate ? new Date(project.endDate) : null;
                                          const isBeyondEndDate = endDate && monthDate > endDate;
                                          
                                          return (
                                            <td 
                                              key={month} 
                                              className={`table-cell forecast-cell ${isBeyondEndDate ? 'beyond-end-date' : ''}`}
                                            >
                                              {isEditing ? (
                                                <div className="forecast-edit">
                                                  <input
                                                    type="number"
                                                    step="0.5"
                                                    min="0"
                                                    defaultValue={forecastDays}
                                                    className={`forecast-input ${isBeyondEndDate ? 'beyond-end-date-input' : ''}`}
                                                    autoFocus
                                                    style={isBeyondEndDate ? { backgroundColor: '#F26B69', color: 'white' } : {}}
                                                    onBlur={(e) => {
                                                      const value = parseFloat(e.target.value) || 0;
                                                      saveForecastTime(project.id, month, value);
                                                    }}
                                                    onKeyDown={(e) => {
                                                      if (e.key === 'Enter') {
                                                        const value = parseFloat((e.target as HTMLInputElement).value) || 0;
                                                        saveForecastTime(project.id, month, value);
                                                      } else if (e.key === 'Escape') {
                                                        setEditingMonth(null);
                                                      }
                                                    }}
                                                  />
                                                  <button
                                                    className="forecast-save-btn"
                                                    onClick={(e) => {
                                                      const input = (e.target as HTMLElement).parentElement?.querySelector('input') as HTMLInputElement;
                                                      const value = parseFloat(input?.value) || 0;
                                                      saveForecastTime(project.id, month, value);
                                                    }}
                                                  >
                                                    ✓
                                                  </button>
                                                  <button
                                                    className="forecast-cancel-btn"
                                                    onClick={() => setEditingMonth(null)}
                                                  >
                                                    ✕
                                                  </button>
                                                </div>
                                              ) : (
                                                <div
                                                  className={`forecast-display ${forecastDays > 0 ? 'has-forecast' : 'no-forecast'} ${isBeyondEndDate ? 'beyond-end-date' : ''}`}
                                                  onClick={() => {
                                                    setEditingMonth({ deliveryId: project.id, month });
                                                  }}
                                                  title={isBeyondEndDate ? 'Mois au-delà de la date de fin - saisie possible' : 'Cliquez pour modifier'}
                                                >
                                                  {forecastDays > 0 ? `${forecastDays.toFixed(1)}j` : '-'}
                                                </div>
                                              )}
                                            </td>
                                          );
                                        })}
                                      </tr>
                                    </tbody>
                                  </table>
                                </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="pagination-container">
                <div className="pagination-info">
                  <span>
                    Affichage de {startIndex + 1} à {Math.min(endIndex, filteredResources.length)} sur {filteredResources.length} ressource{filteredResources.length > 1 ? 's' : ''}
                  </span>
                </div>
                
                <div className="pagination">
                  <button
                    className="pagination-button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    ‹ Précédent
                  </button>
                  
                  <div className="pagination-numbers">
                    {getPageNumbers().map((page) => (
                      <button
                        key={page}
                        className={`pagination-number ${currentPage === page ? 'active' : ''}`}
                        onClick={() => handlePageChange(page)}
                      >
                        {page}
                      </button>
                    ))}
                  </div>
                  
                  <button
                    className="pagination-button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    Suivant ›
                  </button>
                </div>
              </div>
            )}

            <div className="forecast-summary">
              <p>Total : <strong>{filteredResources.length}</strong> ressource{filteredResources.length > 1 ? 's' : ''} avec prestations</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default Forecast;
