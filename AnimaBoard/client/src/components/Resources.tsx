import React, { useState, useEffect, useMemo, useRef } from 'react';
import './Resources.css';
import { apiUrl } from '../api';
import { DATA_REFRESH_EVENT } from '../dataRefresh';

interface Resource {
  id: number;
  nom: string;
  prenom: string;
  type: string; // Valeur du dictionnaire (typeOfLabel)
  statut?: string; // Valeur du dictionnaire (stateLabel)
  tempsTravail?: string; // Temps de travail pour contrats temps partiel
  statutFeu?: 'vert' | 'orange' | 'rouge' | ''; // Statut feu (vert/orange/rouge)
  commentaires?: string; // Commentaires liés au statut
}

interface ResourcesProps {
  onBack: () => void;
}

type SortField = 'nom' | 'prenom' | 'type' | 'statut' | null;
type SortDirection = 'asc' | 'desc';

const Resources: React.FC<ResourcesProps> = ({ onBack }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [resources, setResources] = useState<Resource[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // État pour les métadonnées des ressources (temps, statut feu, commentaires)
  const [resourcesMetadata, setResourcesMetadata] = useState<{
    [resourceId: number]: {
      tempsTravail?: string;
      statutFeu?: 'vert' | 'orange' | 'rouge' | '';
      commentaires?: string;
    };
  }>({});
  
  // Charger les filtres depuis localStorage au démarrage
  const loadFiltersFromStorage = () => {
    try {
      const savedTypeFilter = localStorage.getItem('resources_typeFilter');
      const savedStatutFilter = localStorage.getItem('resources_statutFilter');
      const savedFiltersExpanded = localStorage.getItem('resources_filtersExpanded');
      const savedTypeSectionExpanded = localStorage.getItem('resources_typeSectionExpanded');
      const savedStatutSectionExpanded = localStorage.getItem('resources_statutSectionExpanded');
      
      return {
        typeFilter: savedTypeFilter ? JSON.parse(savedTypeFilter) : [],
        statutFilter: savedStatutFilter ? JSON.parse(savedStatutFilter) : [],
        filtersExpanded: savedFiltersExpanded ? JSON.parse(savedFiltersExpanded) : true,
        typeSectionExpanded: savedTypeSectionExpanded ? JSON.parse(savedTypeSectionExpanded) : true,
        statutSectionExpanded: savedStatutSectionExpanded ? JSON.parse(savedStatutSectionExpanded) : true
      };
    } catch (error) {
      console.error('Erreur lors du chargement des filtres depuis localStorage:', error);
      return {
        typeFilter: [],
        statutFilter: [],
        filtersExpanded: true,
        typeSectionExpanded: true,
        statutSectionExpanded: true
      };
    }
  };

  const savedFilters = loadFiltersFromStorage();
  const [typeFilter, setTypeFilter] = useState<string[]>(savedFilters.typeFilter);
  const [statutFilter, setStatutFilter] = useState<string[]>(savedFilters.statutFilter);
  const [filtersExpanded] = useState<boolean>(savedFilters.filtersExpanded);
  const [typeDropdownOpen, setTypeDropdownOpen] = useState<boolean>(false);
  const [statutDropdownOpen, setStatutDropdownOpen] = useState<boolean>(false);
  const itemsPerPage = 10;

  // Sauvegarder les filtres dans localStorage à chaque changement
  useEffect(() => {
    try {
      localStorage.setItem('resources_typeFilter', JSON.stringify(typeFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre type:', error);
    }
  }, [typeFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('resources_statutFilter', JSON.stringify(statutFilter));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde du filtre statut:', error);
    }
  }, [statutFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('resources_filtersExpanded', JSON.stringify(filtersExpanded));
    } catch (error) {
      console.error('Erreur lors de la sauvegarde de l\'état filtersExpanded:', error);
    }
  }, [filtersExpanded]);

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

  // Charger les métadonnées des ressources
  const loadResourcesMetadata = async () => {
    try {
      const response = await fetch(apiUrl('/api/data/resources-metadata'));
      if (response.ok) {
        const result = await response.json();
        if (result.success && result.data) {
          // Convertir les clés string en number pour correspondre aux IDs
          const metadata: { [key: number]: any } = {};
          Object.keys(result.data).forEach(key => {
            metadata[Number(key)] = result.data[key];
          });
          setResourcesMetadata(metadata);
        }
      }
    } catch (error) {
      console.warn('⚠️  Impossible de charger les métadonnées des ressources:', error);
    }
  };

  // Sauvegarder les métadonnées des ressources
  const saveResourcesMetadata = async (metadata: typeof resourcesMetadata) => {
    try {
      const response = await fetch(apiUrl('/api/data/resources-metadata'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(metadata)
      });
      if (!response.ok) {
        throw new Error('Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('❌ Erreur lors de la sauvegarde des métadonnées:', error);
    }
  };

  // Mettre à jour les métadonnées d'une ressource
  const updateResourceMetadata = (resourceId: number, field: 'tempsTravail' | 'statutFeu' | 'commentaires', value: string) => {
    const updated = {
      ...resourcesMetadata,
      [resourceId]: {
        ...resourcesMetadata[resourceId],
        [field]: value
      }
    };
    setResourcesMetadata(updated);
    // Sauvegarder automatiquement
    saveResourcesMetadata(updated);
  };

  useEffect(() => {
    fetchResources();
    loadResourcesMetadata();
  }, []);

  const fetchResources = async () => {
    try {
      setLoading(true);
      setError(null);

      // Lire uniquement depuis la base locale (table resources), sans appel direct à l'API Boond.
      const response = await fetch(apiUrl('/api/data/resources-local'));
      const contentType = response.headers.get('content-type') || '';
      const raw = await response.text();
      if (!contentType.includes('application/json')) {
        throw new Error(
          `Réponse invalide (${response.status}) : l’API a renvoyé du HTML au lieu de JSON. Vérifiez que le serveur tourne (npm run dev) ou que les routes /api sont déployées.`
        );
      }
      const data = JSON.parse(raw);

      if (!response.ok || !data.success) {
        throw new Error(data.error || data.message || 'Erreur lors de la récupération des ressources');
      }

      const resourcesData = Array.isArray(data.data) ? data.data : [];

      if (resourcesData.length === 0) {
        setResources([]);
        return;
      }

      // Mapper les enregistrements enrichis vers le format Resource attendu par la vue.
      const mappedResources: Resource[] = resourcesData.map((r: any) => ({
        id: Number(r.id),
        nom: r.nom || '',
        prenom: r.prenom || '',
        // Afficher uniquement les libellés issus du dictionnaire (ou N/A)
        type: r.typeLabel || 'N/A',
        statut: r.stateLabel || undefined,
        // Les champs tempsTravail / statutFeu / commentaires restent gérés par resourcesMetadata pour l’instant
      }));

      setResources(mappedResources);
    } catch (err) {
      let errorMessage = 'Une erreur est survenue';
      if (err instanceof Error) {
        errorMessage = err.message;
      } else if (typeof err === 'string') {
        errorMessage = err;
      }
      setError(errorMessage);
      console.error('❌ Error fetching resources:', err);
      setResources([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchResourcesRef = useRef(fetchResources);
  const loadResourcesMetadataRef = useRef(loadResourcesMetadata);
  fetchResourcesRef.current = fetchResources;
  loadResourcesMetadataRef.current = loadResourcesMetadata;

  useEffect(() => {
    const onRefresh = () => {
      void fetchResourcesRef.current();
      void loadResourcesMetadataRef.current();
    };
    window.addEventListener(DATA_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(DATA_REFRESH_EVENT, onRefresh);
  }, []);

  // Obtenir la liste unique des types pour le filtre
  const uniqueTypes = Array.from(new Set(resources.map(r => r.type).filter(t => t && t !== 'N/A'))).sort();
  
  // Obtenir la liste unique des statuts pour le filtre
  const uniqueStatuts = Array.from(new Set(resources.map(r => r.statut).filter((s): s is string => s !== undefined && s !== null && s !== 'N/A'))).sort();

  // Nettoyer les filtres persistés (localStorage) : retirer les valeurs obsolètes (ex. anciens codes
  // mémorisés quand le dictionnaire était vide) et dédoublonner, sinon le compteur compte code + libellé.
  useEffect(() => {
    if (resources.length === 0) return;
    const validTypes = new Set(resources.map(r => r.type).filter(t => t && t !== 'N/A'));
    const validStatuts = new Set(
      resources.map(r => r.statut).filter((s): s is string => s !== undefined && s !== null && s !== 'N/A')
    );
    setTypeFilter(prev => {
      const cleaned = Array.from(new Set(prev.filter(t => validTypes.has(t))));
      return cleaned.length === prev.length ? prev : cleaned;
    });
    setStatutFilter(prev => {
      const cleaned = Array.from(new Set(prev.filter(s => validStatuts.has(s))));
      return cleaned.length === prev.length ? prev : cleaned;
    });
  }, [resources]);

  // Filtrer et trier les ressources
  const filteredAndSortedResources = useMemo(() => {
    let filtered = resources;

    // Appliquer le filtre par type (multi-sélection)
    if (typeFilter.length > 0) {
      filtered = filtered.filter(r => typeFilter.includes(r.type));
    }

    // Appliquer le filtre par statut (multi-sélection)
    if (statutFilter.length > 0) {
      filtered = filtered.filter(r => {
        const resourceStatut = r.statut || '';
        return statutFilter.includes(resourceStatut);
      });
    }

    // Appliquer le tri
    if (sortField) {
      filtered = [...filtered].sort((a, b) => {
        let aValue = a[sortField] || '';
        let bValue = b[sortField] || '';
        
        // Gérer les valeurs null/undefined pour le statut
        if (sortField === 'statut') {
          aValue = aValue || 'N/A';
          bValue = bValue || 'N/A';
        }
        
        // Convertir en chaîne pour la comparaison
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
        
        if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
        if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [resources, typeFilter, statutFilter, sortField, sortDirection]);

  // Calcul de la pagination
  const totalPages = Math.ceil(filteredAndSortedResources.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const currentResources = filteredAndSortedResources.slice(startIndex, endIndex);

  // Réinitialiser la page quand le filtre change
  useEffect(() => {
    setCurrentPage(1);
  }, [typeFilter, statutFilter, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      // Inverser la direction si on clique sur le même champ
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // Nouveau champ, trier par ordre croissant
      setSortField(field);
      setSortDirection('asc');
    }
  };

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

  if (loading) {
    return (
      <div className="resources-page">
        <div className="resources-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          <h2>Liste des Ressources</h2>
        </div>
        <div className="resources-container">
          <div className="loading-state">
            <div className="loading-spinner"></div>
            <p>Chargement des ressources...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="resources-page">
        <div className="resources-header">
          <button className="back-button" onClick={onBack}>
            ← Retour
          </button>
          <h2>Liste des Ressources</h2>
        </div>
        <div className="resources-container">
          <div className="error-state">
            <p className="error-message">❌ {error}</p>
            <button className="retry-button" onClick={fetchResources}>
              Réessayer
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="resources-page">
      <div className="resources-header">
        <button className="back-button" onClick={onBack}>
          ← Retour
        </button>
        <h2>Liste des Ressources</h2>
      </div>
      <div className="resources-container">
        {resources.length === 0 ? (
          <div className="empty-state">
            <p className="empty-message">Aucune ressource trouvée</p>
            <p className="empty-details">Vérifiez la connexion à l'API BoondManager ou consultez les logs du serveur.</p>
          </div>
        ) : (
          <>
            {/* Contrôles de filtre et tri */}
            <div className="resources-controls">
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

            <div className="table-wrapper">
              <table className="resources-table">
                <thead>
                  <tr>
                    <th 
                      className="sortable"
                      onClick={() => handleSort('nom')}
                    >
                      Nom
                      {sortField === 'nom' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className="sortable"
                      onClick={() => handleSort('prenom')}
                    >
                      Prénom
                      {sortField === 'prenom' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className="sortable"
                      onClick={() => handleSort('type')}
                    >
                      Type
                      {sortField === 'type' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th 
                      className="sortable"
                      onClick={() => handleSort('statut')}
                    >
                      Statut
                      {sortField === 'statut' && (
                        <span className="sort-indicator">
                          {sortDirection === 'asc' ? ' ↑' : ' ↓'}
                        </span>
                      )}
                    </th>
                    <th>Tps</th>
                    <th>St</th>
                    <th>Commentaires</th>
                  </tr>
                </thead>
                <tbody>
                  {currentResources.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="no-results">
                        Aucune ressource ne correspond aux filtres sélectionnés
                      </td>
                    </tr>
                  ) : (
                    currentResources.map((resource) => {
                      const metadata = resourcesMetadata[resource.id] || {};
                      return (
                        <tr key={resource.id}>
                          <td>{resource.nom || 'N/A'}</td>
                          <td>{resource.prenom || 'N/A'}</td>
                          <td>
                            <span className={`type-badge ${resource.type}`}>
                              {resource.type}
                            </span>
                          </td>
                          <td>
                            {resource.statut ? (
                              <span className={`type-badge ${resource.statut}`}>
                                {resource.statut}
                              </span>
                            ) : (
                              <span className="type-badge">N/A</span>
                            )}
                          </td>
                          <td>
                            <input
                              type="text"
                              className="resource-input-temps"
                              value={metadata.tempsTravail !== undefined && metadata.tempsTravail !== null ? metadata.tempsTravail : '100%'}
                              onChange={(e) => updateResourceMetadata(resource.id, 'tempsTravail', e.target.value)}
                              placeholder="100%"
                            />
                          </td>
                          <td>
                            <select
                              className={`resource-select-statut ${metadata.statutFeu || ''}`}
                              value={metadata.statutFeu || ''}
                              onChange={(e) => updateResourceMetadata(resource.id, 'statutFeu', e.target.value as 'vert' | 'orange' | 'rouge' | '')}
                            >
                              <option value="">-</option>
                              <option value="vert">🟢</option>
                              <option value="orange">🟠</option>
                              <option value="rouge">🔴</option>
                            </select>
                          </td>
                          <td>
                            <textarea
                              className="resource-textarea-commentaires"
                              value={metadata.commentaires || ''}
                              onChange={(e) => updateResourceMetadata(resource.id, 'commentaires', e.target.value)}
                              placeholder="Commentaires..."
                              maxLength={6000}
                              rows={3}
                            />
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* Pagination */}
        <div className="pagination-container">
          <div className="pagination-info">
            <span>
              Affichage de {filteredAndSortedResources.length > 0 ? startIndex + 1 : 0} à {Math.min(endIndex, filteredAndSortedResources.length)} sur {filteredAndSortedResources.length} ressource{filteredAndSortedResources.length > 1 ? 's' : ''}
              {(typeFilter.length > 0 || statutFilter.length > 0) && ` (filtrées sur ${resources.length} total)`}
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

        <div className="resources-summary">
          <p>Total : <strong>{filteredAndSortedResources.length}</strong> ressource{filteredAndSortedResources.length > 1 ? 's' : ''}
          {(typeFilter.length > 0 || statutFilter.length > 0) && ` (${resources.length} au total)`}
          </p>
        </div>
      </div>
    </div>
  );
};

export default Resources;
