import React, { useState, useEffect, useCallback, useMemo } from 'react';
import './Report.css';

interface Project {
  id: string | number;
  reference: string;
  title: string;
  startDate: string;
  endDate: string;
  tjm: number | null;
  orderedDays?: number | null;
}

interface ResourceWithProjects {
  id: number;
  nom: string;
  prenom: string;
  type?: string;
  statut?: string;
  projects: Project[];
}

interface ForecastData {
  [deliveryId: string]: {
    forecast: { [month: string]: number };
  };
}

interface ReportProps {
  onBack: () => void;
}

// Fonction pour charger les filtres depuis localStorage
const loadReportFiltersFromStorage = () => {
  try {
    const savedTypeFilter = localStorage.getItem('report_typeFilter');
    const savedStatutFilter = localStorage.getItem('report_statutFilter');
    
    return {
      typeFilter: savedTypeFilter ? JSON.parse(savedTypeFilter) : [],
      statutFilter: savedStatutFilter ? JSON.parse(savedStatutFilter) : []
    };
  } catch (error) {
    console.error('Erreur lors du chargement des filtres depuis localStorage:', error);
    return {
      typeFilter: [],
      statutFilter: []
    };
  }
};

const Report: React.FC<ReportProps> = ({ onBack }) => {
  // Charger les filtres depuis localStorage au démarrage
  const savedFilters = loadReportFiltersFromStorage();
  
  const [resources, setResources] = useState<ResourceWithProjects[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [forecastData, setForecastData] = useState<ForecastData>({});
  const [timesheetsAggregate, setTimesheetsAggregate] = useState<{
    [resourceId: string]: {
      [deliveryId: string]: {
        [month: string]: { days: number; hours: number };
      };
    };
  }>({});
  
  // États pour les filtres
  const [typeFilter, setTypeFilter] = useState<string[]>(savedFilters.typeFilter);
  const [statutFilter, setStatutFilter] = useState<string[]>(savedFilters.statutFilter);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<boolean>(false);
  const [statutDropdownOpen, setStatutDropdownOpen] = useState<boolean>(false);

  // Obtenir tous les mois de l'année en cours
  const getCurrentYearMonths = (): string[] => {
    const currentYear = new Date().getFullYear();
    const months: string[] = [];
    for (let month = 1; month <= 12; month++) {
      months.push(`${currentYear}-${String(month).padStart(2, '0')}`);
    }
    return months;
  };

  // Charger les données de forecast
  const loadForecastData = useCallback(async () => {
    try {
      const response = await fetch('/api/data/forecast-times.json');
      if (response.ok) {
        const result = await response.json();
        // La structure de l'API est { success: true, data: { metadata: {...}, data: { deliveryId: { forecast: { month: value } } } } }
        const forecastTimes = result.data?.data || {};
        console.log('📊 Données de forecast chargées:', Object.keys(forecastTimes).length, 'prestations');
        setForecastData(forecastTimes);
      } else {
        console.warn('⚠️  Erreur HTTP lors du chargement de forecast-times.json:', response.status);
      }
    } catch (error) {
      console.warn('⚠️  Impossible de charger les données de forecast:', error);
    }
  }, []);

  // Charger l'agrégat des timesheets pour les jours saisis
  const loadTimesheetsAggregate = useCallback(async () => {
    try {
      const response = await fetch('/api/data/timesheets_aggregate.json');
      if (response.ok) {
        const data = await response.json();
        const aggregateData = data.data?.data || data.data || [];
        
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
          
          const days = parseFloat(item.totalDays) || 0;
          const hours = parseFloat(item.totalHours) || 0;
          
          indexed[resourceId][deliveryId][month] = {
            days,
            hours: hours > 0 ? hours : (days * 7)
          };
        });
        
        console.log('📊 Agrégat timesheets chargé:', Object.keys(indexed).length, 'ressources');
        setTimesheetsAggregate(indexed);
      } else {
        console.warn('⚠️  Fichier timesheets_aggregate.json non trouvé.');
      }
    } catch (error) {
      console.warn('⚠️  Impossible de charger l\'agrégat des timesheets:', error);
    }
  }, []);

  // Charger les ressources et prestations
  const fetchResources = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Charger les prestations
      const deliveriesResponse = await fetch('/api/data/deliveries.json');
      if (!deliveriesResponse.ok) {
        throw new Error('Impossible de charger les prestations');
      }
      const deliveriesResponseData = await deliveriesResponse.json();
      const deliveriesData = deliveriesResponseData.data || deliveriesResponseData;
      const deliveries = (deliveriesData.data && Array.isArray(deliveriesData.data)) 
        ? deliveriesData.data 
        : (Array.isArray(deliveriesData) ? deliveriesData : []);

      // Charger les ressources
      const resourcesResponse = await fetch('/api/data/resources.json');
      if (!resourcesResponse.ok) {
        throw new Error('Impossible de charger les ressources');
      }
      const resourcesData = await resourcesResponse.json();
      const resourcesList = resourcesData.data || resourcesData || [];

      // Récupérer les mappings typeOf et state depuis le dictionnaire
      let typeOfMapping: { [key: string]: string } = {};
      let stateMapping: { [key: string]: string } = {};
      
      try {
        // Utiliser l'endpoint /api/boondmanager/dictionary/resources pour récupérer le mapping typeOf
        const dictionaryResponse = await fetch('/api/boondmanager/dictionary/resources');
        if (dictionaryResponse.ok) {
          const dictionaryData = await dictionaryResponse.json();
          if (dictionaryData.typeMapping) {
            Object.keys(dictionaryData.typeMapping).forEach(key => {
              typeOfMapping[key] = dictionaryData.typeMapping[key];
              typeOfMapping[Number(key)] = dictionaryData.typeMapping[key];
              typeOfMapping[String(key)] = dictionaryData.typeMapping[key];
            });
          }
        }
        
        // Récupérer le mapping state depuis le dictionnaire complet
        const fullDictionaryResponse = await fetch('/api/boondmanager/dictionary');
        if (fullDictionaryResponse.ok) {
          const fullDictionaryData = await fullDictionaryResponse.json();
          const dict = fullDictionaryData.data?.data || fullDictionaryData.data || fullDictionaryData;
          const resourceStates = dict?.setting?.state?.resource || [];
          
          resourceStates.forEach((item: any) => {
            if (item.id !== undefined && item.id !== null && item.value !== undefined) {
              const idStr = String(item.id);
              const idNum = Number(item.id);
              stateMapping[idStr] = item.value;
              stateMapping[idNum] = item.value;
              stateMapping[item.id] = item.value;
            }
          });
        }
      } catch (error) {
        console.warn('⚠️  Erreur lors de la récupération du dictionnaire:', error);
      }

      // Grouper les prestations par ressource
      const deliveriesByResource: { [key: string]: Project[] } = {};

      // Créer un map des ressources par ID pour accès rapide
      const resourcesMap: { [key: string]: { nom: string; prenom: string; type?: string; statut?: string } } = {};
      resourcesList.forEach((resource: any) => {
        const resourceId = String(resource.id || resource.ID || resource.Id || '');
        const firstName = resource.prenom || resource.attributes?.firstName || resource.firstName || resource.raw?.attributes?.firstName || '';
        const lastName = resource.nom || resource.attributes?.lastName || resource.lastName || resource.raw?.attributes?.lastName || '';
        
        // Récupérer le type et le statut depuis resources.json et mapper avec le dictionnaire
        const typeOfCode = resource.typeOf || resource.raw?.attributes?.typeOf;
        const stateCode = resource.state || resource.raw?.attributes?.state;
        
        // Mapper le type avec toutes les variantes possibles
        let type = '';
        if (typeOfCode !== undefined && typeOfCode !== null) {
          const codeStr = String(typeOfCode);
          const codeNum = Number(typeOfCode);
          type = typeOfMapping[codeStr] || typeOfMapping[codeNum] || typeOfMapping[typeOfCode] || codeStr;
        }
        
        // Mapper le statut avec toutes les variantes possibles
        let statut = '';
        if (stateCode !== undefined && stateCode !== null) {
          const codeStr = String(stateCode);
          const codeNum = Number(stateCode);
          statut = stateMapping[codeStr] || stateMapping[codeNum] || stateMapping[stateCode] || codeStr;
        }
        
        if (resourceId) {
          resourcesMap[resourceId] = { 
            nom: lastName, 
            prenom: firstName,
            type,
            statut
          };
        }
      });

      deliveries.forEach((delivery: any) => {
        if (delivery.type !== 'delivery') return;

        const resourceId = String(delivery.resource_id || '');
        if (!resourceId) return;

        const project: Project = {
          id: delivery.id,
          reference: delivery.id || 'N/A',
          title: delivery.title || 'Sans titre',
          startDate: delivery.startDate || '',
          endDate: delivery.endDate || '',
          tjm: delivery.averageDailyPriceExcludingTax !== null && delivery.averageDailyPriceExcludingTax !== undefined
            ? Number(delivery.averageDailyPriceExcludingTax)
            : null,
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
        resourcesWithProjects.push({
          id: Number(resourceId),
          nom: resourceInfo.nom,
          prenom: resourceInfo.prenom,
          type: resourceInfo.type,
          statut: resourceInfo.statut,
          projects: deliveriesByResource[resourceId]
        });
      });

      // Trier par nom de famille puis prénom
      resourcesWithProjects.sort((a, b) => {
        if (a.nom !== b.nom) {
          return a.nom.localeCompare(b.nom);
        }
        return a.prenom.localeCompare(b.prenom);
      });

      console.log('📊 Ressources chargées:', resourcesWithProjects.length);
      setResources(resourcesWithProjects);
    } catch (err) {
      console.error('❌ Erreur lors du chargement des données:', err);
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResources();
    loadForecastData();
    loadTimesheetsAggregate();
  }, [fetchResources, loadForecastData, loadTimesheetsAggregate]);

  // Sauvegarder les filtres dans localStorage
  useEffect(() => {
    try {
      localStorage.setItem('report_typeFilter', JSON.stringify(typeFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre type:', error);
    }
  }, [typeFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('report_statutFilter', JSON.stringify(statutFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre statut:', error);
    }
  }, [statutFilter]);

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

  // Obtenir la liste unique des types pour le filtre
  const uniqueTypes = Array.from(new Set(resources.map(r => r.type).filter((t): t is string => t !== undefined && t !== null && t !== ''))).sort();
  
  // Obtenir la liste unique des statuts pour le filtre
  const uniqueStatuts = Array.from(new Set(resources.map(r => r.statut).filter((s): s is string => s !== undefined && s !== null && s !== ''))).sort();

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

  // Calculer la valeur totale (saisis + prévisionnels) pour une ressource et un mois
  const getTotalValue = (resourceId: number, month: string): number => {
    const resource = resources.find(r => r.id === resourceId);
    if (!resource) return 0;

    const resourceIdStr = String(resourceId);
    let totalActual = 0; // Jours saisis
    let totalForecast = 0; // Jours prévisionnels

    resource.projects.forEach((project) => {
      const deliveryId = String(project.id);
      
      // Récupérer les jours saisis depuis timesheetsAggregate
      const resourceIdVariants = [resourceIdStr, String(Number(resourceId)), Number(resourceId).toString()];
      const deliveryIdVariants = [deliveryId, String(Number(project.id)), Number(project.id).toString()];
      
      let foundData: { [month: string]: { days: number; hours: number } } | null = null;
      
      for (const resIdVar of resourceIdVariants) {
        if (timesheetsAggregate[resIdVar]) {
          for (const delIdVar of deliveryIdVariants) {
            if (timesheetsAggregate[resIdVar][delIdVar] && timesheetsAggregate[resIdVar][delIdVar][month]) {
              foundData = timesheetsAggregate[resIdVar][delIdVar];
              break;
            }
          }
          if (foundData) break;
        }
      }
      
      if (foundData && foundData[month]) {
        totalActual += foundData[month].days || 0;
      }
      
      // Récupérer les jours prévisionnels depuis forecastData
      const deliveryForecast = forecastData[deliveryId];
      if (deliveryForecast && deliveryForecast.forecast) {
        const monthValue = deliveryForecast.forecast[month] || 0;
        totalForecast += monthValue;
      }
    });

    const total = totalActual + totalForecast;
    return total;
  };

  // Fonction pour convertir hex en RGB
  const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : { r: 0, g: 0, b: 0 };
  };

  // Fonction pour interpoler entre deux couleurs
  const interpolateColor = (color1: string, color2: string, ratio: number): string => {
    const rgb1 = hexToRgb(color1);
    const rgb2 = hexToRgb(color2);
    const r = Math.round(rgb1.r + (rgb2.r - rgb1.r) * ratio);
    const g = Math.round(rgb1.g + (rgb2.g - rgb1.g) * ratio);
    const b = Math.round(rgb1.b + (rgb2.b - rgb1.b) * ratio);
    return `rgb(${r}, ${g}, ${b})`;
  };

  // Fonction pour calculer la luminosité relative d'une couleur RGB (0-1)
  const getLuminance = (r: number, g: number, b: number): number => {
    // Formule de luminosité relative selon WCAG
    const [rs, gs, bs] = [r, g, b].map(val => {
      val = val / 255;
      return val <= 0.03928 ? val / 12.92 : Math.pow((val + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
  };

  // Fonction pour déterminer si une couleur est foncée (nécessite texte blanc)
  const isDarkColor = (color: string): boolean => {
    const rgb = hexToRgb(color);
    const luminance = getLuminance(rgb.r, rgb.g, rgb.b);
    return luminance < 0.5; // Seuil pour déterminer si c'est foncé
  };

  // Fonction pour obtenir la couleur selon le formatage conditionnel
  // C01411 : entre 0 et 4
  // EE423F : entre 5 et 9
  // FFBD2E : entre 10 et 13
  // 5ECFCB : entre 14 et 16
  // 267E7B : au delà de 16
  const getCellColor = (value: number): string => {
    if (value <= 0) {
      return '#C01411'; // Rouge foncé pour 0
    } else if (value <= 4) {
      // Dégradé entre C01411 et EE423F (0-4)
      const ratio = value / 4;
      return interpolateColor('#C01411', '#EE423F', ratio);
    } else if (value <= 9) {
      // Dégradé entre EE423F et FFBD2E (5-9)
      const ratio = (value - 5) / 5;
      return interpolateColor('#EE423F', '#FFBD2E', ratio);
    } else if (value <= 13) {
      // Dégradé entre FFBD2E et 5ECFCB (10-13)
      const ratio = (value - 10) / 4;
      return interpolateColor('#FFBD2E', '#5ECFCB', ratio);
    } else if (value <= 16) {
      // Dégradé entre 5ECFCB et 267E7B (14-16)
      const ratio = (value - 14) / 3;
      return interpolateColor('#5ECFCB', '#267E7B', ratio);
    } else {
      return '#267E7B'; // Vert foncé pour 16+
    }
  };

  // Formater le nom du mois
  const formatMonthName = (month: string): string => {
    const [year, monthNum] = month.split('-');
    const date = new Date(parseInt(year), parseInt(monthNum) - 1, 1);
    return date.toLocaleDateString('fr-FR', { month: 'short' });
  };

  const months = getCurrentYearMonths();

  if (loading) {
    return (
      <div className="report-page">
        <div className="report-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          <h2>Rapports</h2>
        </div>
        <div className="report-container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Chargement des données...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="report-page">
        <div className="report-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          <h2>Rapports</h2>
        </div>
        <div className="report-container">
          <div className="error-state">
            <p className="error-message">{error}</p>
            <button className="retry-button" onClick={() => fetchResources()}>
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="report-page">
      <div className="report-header">
        <button className="back-button" onClick={onBack}>
          ← Retour
        </button>
        <h2>Rapports</h2>
      </div>
      <div className="report-container">
        <div className="report-title">
          <h3>Synthèse Forecast - {new Date().getFullYear()}</h3>
          <p className="report-subtitle">Vue par ressource et par mois (jours saisis + prévisionnels)</p>
        </div>

        {/* Filtres Type et Statut */}
        <div className="report-filters">
          <div className="filters-container">
            <div className="filter-dropdown-container">
              <button
                className="filter-button"
                onClick={() => {
                  setTypeDropdownOpen(!typeDropdownOpen);
                  setStatutDropdownOpen(false);
                }}
              >
                <span>Type</span>
                {typeFilter.length > 0 && (
                  <span className="filter-badge">{typeFilter.length}</span>
                )}
                <span className="dropdown-arrow">{typeDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {typeDropdownOpen && (
                <div className="filter-dropdown">
                  <div className="filter-dropdown-content">
                    {uniqueTypes.map((type) => (
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

            <div className="filter-dropdown-container">
              <button
                className="filter-button"
                onClick={() => {
                  setStatutDropdownOpen(!statutDropdownOpen);
                  setTypeDropdownOpen(false);
                }}
              >
                <span>Statut</span>
                {statutFilter.length > 0 && (
                  <span className="filter-badge">{statutFilter.length}</span>
                )}
                <span className="dropdown-arrow">{statutDropdownOpen ? '▲' : '▼'}</span>
              </button>
              {statutDropdownOpen && (
                <div className="filter-dropdown">
                  <div className="filter-dropdown-content">
                    {uniqueStatuts.map((statut) => {
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
        
        <div className="report-table-container">
          <table className="report-table">
            <thead>
              <tr>
                <th className="report-table-header resource-column">Ressource</th>
                {months.map((month) => (
                  <th key={month} className="report-table-header month-column">
                    {formatMonthName(month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredResources.length === 0 ? (
                <tr>
                  <td colSpan={months.length + 1} className="report-table-cell" style={{ textAlign: 'center', padding: '2rem' }}>
                    Aucune ressource avec prestations trouvée
                  </td>
                </tr>
              ) : (
                filteredResources.map((resource) => (
                  <tr key={resource.id}>
                    <td className="report-table-cell resource-cell">
                      {resource.prenom} {resource.nom}
                    </td>
                    {months.map((month) => {
                      const value = getTotalValue(resource.id, month);
                      const color = getCellColor(value);
                      const isDark = isDarkColor(color);
                      return (
                        <td
                          key={month}
                          className="report-table-cell value-cell"
                          style={{ 
                            backgroundColor: color, 
                            color: isDark ? 'white' : 'black',
                            fontWeight: isDark ? 'bold' : 'normal'
                          }}
                        >
                          {value > 0 ? value.toFixed(1) : '0'}
                        </td>
                      );
                    })}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="report-legend">
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#C01411' }}></div>
            <span>0-4 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#EE423F' }}></div>
            <span>5-9 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#FFBD2E' }}></div>
            <span>10-13 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#5ECFCB' }}></div>
            <span>14-16 jours</span>
          </div>
          <div className="legend-item">
            <div className="legend-color" style={{ backgroundColor: '#267E7B' }}></div>
            <span>16+ jours</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Report;
