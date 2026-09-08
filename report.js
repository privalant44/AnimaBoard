const kvStorage = require('./lib/kvStorage');
const { KV_KEYS } = require('./lib/constants');

function toResourceKey(id) {
  if (id === null || id === undefined || id === '') return null;
  return String(id);
}

function uniqueResourceKeys(ids) {
  const seen = new Set();
  const out = [];
  for (const id of ids) {
    const key = toResourceKey(id);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** Normalise une prestation (forme Boond attributes ou forme plate DB). */
function normalizeDelivery(delivery) {
  const attr = delivery.attributes || {};
  const reference = attr.reference || delivery.reference || 'N/A';
  const title = attr.title || delivery.title || 'Sans titre';
  const startDate = attr.startDate || delivery.startDate || '';
  const endDate = attr.endDate || delivery.endDate || '';
  const rawTjm =
    attr.unitPriceExcludingTax ??
    attr.unitPrice ??
    delivery.tjm ??
    null;
  const resourceId =
    attr.resourceId ??
    delivery.resourceId ??
    delivery.resource_id ??
    null;
  const id = delivery.id ?? null;

  return {
    id,
    reference,
    title,
    startDate,
    endDate,
    tjm: rawTjm !== null && rawTjm !== undefined && rawTjm !== '' ? Number(rawTjm) : null,
    resourceId: toResourceKey(resourceId)
  };
}

function overlapsPeriod(itemStart, itemEnd, periodStart, periodEnd) {
  if (!periodStart || !periodEnd || !itemStart || !itemEnd) return true;
  const start = new Date(periodStart);
  const end = new Date(periodEnd);
  const projStart = new Date(itemStart);
  const projEnd = new Date(itemEnd);
  return projStart <= end && projEnd >= start;
}

function resolveResourceTjm(resource) {
  if (!resource) return null;

  let tjm = null;
  if (resource.contracts && Array.isArray(resource.contracts) && resource.contracts.length > 0) {
    const now = new Date();
    const activeContract = resource.contracts.find((contract) => {
      const contractAttr = contract.attributes || contract;
      const contractStart = contractAttr.startDate ? new Date(contractAttr.startDate) : null;
      const contractEnd = contractAttr.endDate ? new Date(contractAttr.endDate) : null;
      if (contractStart && contractEnd) {
        return contractStart <= now && contractEnd >= now;
      }
      return false;
    });

    if (activeContract) {
      const contractAttr = activeContract.attributes || activeContract;
      tjm =
        contractAttr.averageDailyPriceExcludingTax ||
        contractAttr.unitPriceExcludingTax ||
        contractAttr.dailyRate ||
        null;
    }
  }

  if ((tjm === null || tjm === 0) && resource.raw && resource.raw.attributes) {
    tjm =
      resource.raw.attributes.averageDailyPriceExcludingTax ||
      resource.raw.attributes.averageDailyPrice ||
      resource.raw.attributes.dailyRate ||
      null;
  }

  if (tjm !== null && tjm !== undefined) {
    tjm = Number(tjm);
    if (tjm === 0) tjm = null;
  }
  return tjm;
}

/** Ressources associées au projet (hors prestations), dédupliquées. */
function getProjectFallbackResourceIds(project) {
  const ids = [];

  if (project.relationships?.mainManager?.data?.id) {
    ids.push(project.relationships.mainManager.data.id);
  }

  if (project.attributes?.resources && Array.isArray(project.attributes.resources)) {
    ids.push(...project.attributes.resources.map((r) => r.id || r));
  } else if (project.resources && Array.isArray(project.resources)) {
    ids.push(...project.resources.map((r) => r.id || r));
  } else if (project.attributes?.resourceId) {
    ids.push(project.attributes.resourceId);
  } else if (project.resourceId) {
    ids.push(project.resourceId);
  }

  return uniqueResourceKeys(ids);
}

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
      console.log('='.repeat(80));

      const resourcesMap = {};
      resources.forEach((resource) => {
        const key = toResourceKey(resource.id);
        if (key) resourcesMap[key] = resource;
      });

      // resourceId → map(dedupeKey → ligne prestation)
      const projectsByResource = {};

      const pushDelivery = (resourceId, delivery) => {
        const key = toResourceKey(resourceId);
        if (!key) return;
        if (!projectsByResource[key]) projectsByResource[key] = new Map();

        const dedupeKey =
          delivery.id != null
            ? `id:${delivery.id}`
            : `${delivery.reference}|${delivery.title}|${delivery.startDate}|${delivery.endDate}`;

        if (projectsByResource[key].has(dedupeKey)) return;
        projectsByResource[key].set(dedupeKey, {
          reference: delivery.reference,
          title: delivery.title,
          startDate: delivery.startDate,
          endDate: delivery.endDate,
          tjm: delivery.tjm != null && !Number.isNaN(delivery.tjm) ? delivery.tjm : null
        });
      };

      projects.forEach((projectData) => {
        const project = projectData.project || {};
        const deliveries = projectData.deliveries || [];
        const projectAttr = project.attributes || {};
        const fallbackResourceIds = getProjectFallbackResourceIds(project);

        if (deliveries.length > 0) {
          deliveries.forEach((rawDelivery) => {
            const delivery = normalizeDelivery(rawDelivery);

            if (startDate && endDate && !overlapsPeriod(delivery.startDate, delivery.endDate, startDate, endDate)) {
              return;
            }

            // 1 ligne = 1 prestation rattachée à SA ressource (pas à toutes les ressources du projet)
            if (delivery.resourceId) {
              pushDelivery(delivery.resourceId, delivery);
              return;
            }

            // Fallback : prestation sans resourceId → ressources projet (dédupliquées)
            if (fallbackResourceIds.length > 0) {
              fallbackResourceIds.forEach((resourceId) => pushDelivery(resourceId, delivery));
            }
          });
          return;
        }

        // Pas de prestations : une ligne projet par ressource fallback
        const projectDelivery = {
          id: project.id || projectData.id || null,
          reference: projectAttr.reference || project.id || projectData.id || 'N/A',
          title: projectAttr.title || projectAttr.reference || 'Sans titre',
          startDate: projectAttr.startDate || '',
          endDate: projectAttr.endDate || '',
          tjm: null
        };

        if (startDate && endDate && !overlapsPeriod(projectDelivery.startDate, projectDelivery.endDate, startDate, endDate)) {
          return;
        }

        fallbackResourceIds.forEach((resourceId) => {
          pushDelivery(resourceId, {
            ...projectDelivery,
            tjm: resolveResourceTjm(resourcesMap[resourceId])
          });
        });
      });

      const reportData = [];

      Object.keys(projectsByResource).forEach((resourceId) => {
        const resource = resourcesMap[resourceId];
        if (!resource) return;

        const deliveries = Array.from(projectsByResource[resourceId].values());
        if (deliveries.length === 0) return;

        deliveries.forEach((delivery) => {
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

      reportData.forEach((row) => {
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

if (require.main === module) {
  const report = new ForecastReport();

  const args = process.argv.slice(2);
  const startDate = args[0] || null;
  const endDate = args[1] || null;

  if (startDate && endDate) {
    console.log(`📅 Période: ${startDate} à ${endDate}\n`);
  }

  report.generateJSONReport(startDate, endDate).catch((error) => {
    console.error('❌ Erreur lors de la génération du rapport:', error);
    process.exit(1);
  });
}

module.exports = ForecastReport;
