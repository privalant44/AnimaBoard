const path = require('path');
const kvStorage = require('./lib/kvStorage');
const { KV_KEYS } = require('./lib/constants');

class ForecastReport {
  async loadData() {
    try {
      const projects = await kvStorage.get(KV_KEYS.PROJECTS, []);
      const resources = await kvStorage.get(KV_KEYS.RESOURCES, []);
      if (!Array.isArray(projects)) throw new Error('Projects non disponible (lancez la sync depuis Paramètres).');
      if (!Array.isArray(resources)) throw new Error('Ressources non disponible (lancez la sync depuis Paramètres).');
      return { projects, resources };
    } catch (error) {
      console.error('❌ Erreur lors du chargement des données:', error);
      throw error;
    }
  }

  generateReport(startDate = null, endDate = null) {
    return this.loadData().then(({ projects, resources }) => {
      console.log('\n📊 GÉNÉRATION DU RAPPORT FORECAST\n');
      console.log('=' .repeat(80));

      // Créer un mapping des ressources par ID
      const resourcesMap = {};
      resources.forEach(resource => {
        resourcesMap[resource.id] = resource;
      });

      // Créer un mapping des projets par ID de ressource
      const projectsByResource = {};
      
      projects.forEach(projectData => {
        const project = projectData.project || {};
        const deliveries = projectData.deliveries || [];
        const projectAttr = project.attributes || {};
        
        // Extraire les IDs des ressources associées au projet
        const resourceIds = [];
        
        // 1. Chercher dans relationships.mainManager (chemin principal)
        if (project.relationships?.mainManager?.data?.id) {
          resourceIds.push(project.relationships.mainManager.data.id);
        }
        
        // 2. Essayer d'autres chemins pour trouver les ressources associées
        if (project.attributes?.resources && Array.isArray(project.attributes.resources)) {
          resourceIds.push(...project.attributes.resources.map(r => r.id || r));
        } else if (project.resources && Array.isArray(project.resources)) {
          resourceIds.push(...project.resources.map(r => r.id || r));
        } else if (project.attributes?.resourceId) {
          resourceIds.push(project.attributes.resourceId);
        } else if (project.resourceId) {
          resourceIds.push(project.resourceId);
        }

        // 3. Si pas de ressource trouvée, essayer de chercher dans les deliveries
        if (resourceIds.length === 0 && deliveries.length > 0) {
          deliveries.forEach(delivery => {
            const deliveryAttr = delivery.attributes || {};
            if (deliveryAttr.resourceId) {
              resourceIds.push(deliveryAttr.resourceId);
            }
          });
        }

        // Pour chaque ressource associée, ajouter les prestations
        resourceIds.forEach(resourceId => {
          if (!projectsByResource[resourceId]) {
            projectsByResource[resourceId] = [];
          }

          // Si des prestations existent, les utiliser
          if (deliveries.length > 0) {
            deliveries.forEach(delivery => {
              const attr = delivery.attributes || {};
              const reference = attr.reference || 'N/A';
              const title = attr.title || 'Sans titre';
              const startDateDelivery = attr.startDate || '';
              const endDateDelivery = attr.endDate || '';
              const tjm = attr.unitPriceExcludingTax || attr.unitPrice || null;

              // Filtrer par période si spécifiée
              if (startDate && endDate) {
                const start = new Date(startDate);
                const end = new Date(endDate);
                const projStart = startDateDelivery ? new Date(startDateDelivery) : null;
                const projEnd = endDateDelivery ? new Date(endDateDelivery) : null;

                if (projStart && projEnd) {
                  const overlaps = (projStart <= end && projEnd >= start);
                  if (!overlaps) {
                    return; // Prestation en dehors de la période
                  }
                }
              }

              projectsByResource[resourceId].push({
                reference,
                title,
                startDate: startDateDelivery,
                endDate: endDateDelivery,
                tjm: tjm ? Number(tjm) : null
              });
            });
          } else {
            // Si pas de prestations, utiliser les informations du projet comme "prestation"
            const projectReference = projectAttr.reference || project.id || 'N/A';
            const projectTitle = projectAttr.title || projectAttr.reference || 'Sans titre';
            const projectStartDate = projectAttr.startDate || '';
            const projectEndDate = projectAttr.endDate || '';
            
            // Récupérer le TJM depuis la ressource ou ses contrats
            let tjm = null;
            const resource = resourcesMap[resourceId];
            
            if (resource) {
              // 1. Essayer depuis les contrats actifs de la ressource
              if (resource.contracts && Array.isArray(resource.contracts) && resource.contracts.length > 0) {
                const now = new Date();
                // Chercher un contrat actif (qui chevauche la période du projet si disponible)
                const activeContract = resource.contracts.find((contract) => {
                  const contractAttr = contract.attributes || contract;
                  const contractStart = contractAttr.startDate ? new Date(contractAttr.startDate) : null;
                  const contractEnd = contractAttr.endDate ? new Date(contractAttr.endDate) : null;
                  
                  // Vérifier si le contrat est actif
                  if (contractStart && contractEnd) {
                    return contractStart <= now && contractEnd >= now;
                  }
                  return false;
                });
                
                if (activeContract) {
                  const contractAttr = activeContract.attributes || activeContract;
                  tjm = contractAttr.averageDailyPriceExcludingTax || 
                        contractAttr.unitPriceExcludingTax ||
                        contractAttr.dailyRate ||
                        null;
                }
              }
              
              // 2. Si pas de contrat actif, essayer depuis les attributs de la ressource
              if ((tjm === null || tjm === 0) && resource.raw && resource.raw.attributes) {
                tjm = resource.raw.attributes.averageDailyPriceExcludingTax || 
                      resource.raw.attributes.averageDailyPrice || 
                      resource.raw.attributes.dailyRate ||
                      null;
              }
              
              // Convertir en nombre si c'est une chaîne
              if (tjm !== null && tjm !== undefined) {
                tjm = Number(tjm);
                // Si c'est 0, considérer comme null
                if (tjm === 0) {
                  tjm = null;
                }
              }
            }

            // Filtrer par période si spécifiée
            let shouldInclude = true;
            if (startDate && endDate && projectStartDate && projectEndDate) {
              const start = new Date(startDate);
              const end = new Date(endDate);
              const projStart = new Date(projectStartDate);
              const projEnd = new Date(projectEndDate);

              const overlaps = (projStart <= end && projEnd >= start);
              if (!overlaps) {
                shouldInclude = false; // Projet en dehors de la période
              }
            }

            if (shouldInclude) {
              projectsByResource[resourceId].push({
                reference: projectReference,
                title: projectTitle,
                startDate: projectStartDate,
                endDate: projectEndDate,
                tjm: tjm
              });
            }
          }
        });
      });

      // Afficher le rapport
      const reportData = [];
      
      Object.keys(projectsByResource).forEach(resourceId => {
        const resource = resourcesMap[resourceId];
        if (!resource) return;

        const deliveries = projectsByResource[resourceId];
        if (deliveries.length === 0) return;

        deliveries.forEach(delivery => {
          reportData.push({
            nom: resource.nom,
            prenom: resource.prenom,
            reference: delivery.reference,
            titre: delivery.title,
            dateDebut: delivery.startDate,
            dateFin: delivery.endDate,
            tjm: delivery.tjm
          });
        });
      });

      // Afficher le tableau
      console.log('\n📋 TABLEAU FORECAST\n');
      console.log('─'.repeat(120));
      console.log(
        'Nom'.padEnd(20) +
        'Prénom'.padEnd(20) +
        'Référence'.padEnd(15) +
        'Titre'.padEnd(30) +
        'Date début'.padEnd(12) +
        'Date fin'.padEnd(12) +
        'TJM'.padEnd(10)
      );
      console.log('─'.repeat(120));

      reportData.forEach(row => {
        const dateDebut = row.dateDebut ? new Date(row.dateDebut).toLocaleDateString('fr-FR') : 'N/A';
        const dateFin = row.dateFin ? new Date(row.dateFin).toLocaleDateString('fr-FR') : 'N/A';
        const tjm = row.tjm ? `${row.tjm} €` : 'N/A';

        console.log(
          (row.nom || 'N/A').padEnd(20) +
          (row.prenom || 'N/A').padEnd(20) +
          (row.reference || 'N/A').padEnd(15) +
          (row.titre || 'N/A').substring(0, 28).padEnd(30) +
          dateDebut.padEnd(12) +
          dateFin.padEnd(12) +
          tjm.padEnd(10)
        );
      });

      console.log('─'.repeat(120));
      console.log(`\n📊 Total: ${reportData.length} prestations affichées\n`);

      return reportData;
    });
  }

  async generateJSONReport(startDate = null, endDate = null) {
    const reportData = await this.generateReport(startDate, endDate);
    await kvStorage.set(KV_KEYS.FORECAST_REPORT, reportData);
    console.log(`✅ Rapport forecast enregistré en KV.\n`);
    return reportData;
  }
}

// Exécuter le rapport si le script est appelé directement
if (require.main === module) {
  const report = new ForecastReport();
  
  // Récupérer les dates depuis les arguments de ligne de commande
  const args = process.argv.slice(2);
  const startDate = args[0] || null;
  const endDate = args[1] || null;

  if (startDate && endDate) {
    console.log(`📅 Période: ${startDate} à ${endDate}\n`);
  }

  report.generateJSONReport(startDate, endDate).catch(error => {
    console.error('❌ Erreur lors de la génération du rapport:', error);
    process.exit(1);
  });
}

module.exports = ForecastReport;
