/**
 * Accès aux tables Supabase pour les données métier (ressources, prestations, etc.).
 * Utilisé par kvStorage pour toutes les clés métier (TABLE_KEYS).
 */

const { getSupabase } = require('./supabaseClient');
const { KV_KEYS } = require('./constants');

const TABLE_KEYS = new Set([
  KV_KEYS.RESOURCES,
  KV_KEYS.DELIVERIES,
  KV_KEYS.PROJECTS,
  KV_KEYS.TIMESHEETS_DATA,
  KV_KEYS.TIMESHEETS_AGGREGATE,
  KV_KEYS.FORECAST_TIMES,
  KV_KEYS.FORECAST_REPORT,
  KV_KEYS.RESOURCES_METADATA,
  KV_KEYS.ABSENCE_MONTHLY
]);

function isTableKey(key) {
  return TABLE_KEYS.has(key);
}

async function getTable(key, defaultValue = null) {
  const supabase = getSupabase();
  if (!supabase) return defaultValue;

  try {
    switch (key) {
      case KV_KEYS.RESOURCES: {
        const { data: rows, error } = await supabase.from('resources').select('*').order('id');
        if (error) throw error;
        if (!rows || rows.length === 0) return defaultValue;
        return rows.map((r) => ({
          id: r.id,
          nom: r.nom,
          prenom: r.prenom,
          typeOf: r.type_of,
          state: r.state,
          isVisible: r.is_visible,
          contracts: r.contracts || [],
          raw: r.raw || {}
        }));
      }
      case KV_KEYS.DELIVERIES: {
        // Lire depuis la table 'deliveries' - sélection des colonnes nécessaires uniquement
        const { data: rows, error } = await supabase
          .from('deliveries')
          .select('id, reference, title, tjm, average_daily_cost, start_date, end_date, project_id, resource_id, state, ordered_days, synced_at')
          .order('id');
        if (error) throw error;
        if (!rows || rows.length === 0) return defaultValue;
        
        // Transformer en format attendu par l'application
        const data = rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          title: r.title,
          tjm: r.tjm,
          averageDailyCost: r.average_daily_cost,
          startDate: r.start_date,
          endDate: r.end_date,
          projectId: r.project_id,
          resourceId: r.resource_id,
          state: r.state,
          orderedDays: r.ordered_days
        }));
        return { metadata: { lastSync: rows[0]?.synced_at }, data };
      }
      case KV_KEYS.PROJECTS: {
        // Lire depuis la table normalisée 'projects'
        const { data: rows, error } = await supabase
          .from('projects')
          .select('*')
          .order('id');
        if (error) throw error;
        if (!rows || rows.length === 0) return defaultValue;
        
        // Pour chaque projet, récupérer ses prestations depuis la table 'deliveries'
        const projectIds = rows.map(r => r.id);
        const { data: deliveriesRows } = await supabase
          .from('deliveries')
          .select('*')
          .in('project_id', projectIds);
        
        // Grouper les prestations par projet
        const deliveriesByProject = {};
        (deliveriesRows || []).forEach(d => {
          if (!deliveriesByProject[d.project_id]) {
            deliveriesByProject[d.project_id] = [];
          }
          deliveriesByProject[d.project_id].push({
            id: d.id,
            reference: d.reference,
            title: d.title,
            tjm: d.tjm,
            startDate: d.start_date,
            endDate: d.end_date
          });
        });
        
        return rows.map((r) => ({
          id: r.id,
          reference: r.reference,
          name: r.name,
          state: r.state,
          startDate: r.start_date,
          endDate: r.end_date,
          clientName: r.client_name,
          project: r.raw || {},
          deliveries: deliveriesByProject[r.id] || []
        }));
      }
      case KV_KEYS.TIMESHEETS_DATA: {
        const { data: row, error } = await supabase.from('timesheets_data').select('data, metadata').eq('id', 1).maybeSingle();
        if (error) throw error;
        if (!row) return defaultValue;
        return { metadata: row.metadata || {}, data: row.data || {} };
      }
      case KV_KEYS.TIMESHEETS_AGGREGATE: {
        const { data: meta } = await supabase.from('app_metadata').select('value').eq('key', 'timesheets_aggregate').maybeSingle();
        const metadata = (meta && meta.value) ? meta.value : { generatedAt: null, source: 'DB', period: {}, totalRecords: 0 };

        // Agréger dynamiquement depuis timesheets_detail
        const { data: rows, error } = await supabase
          .from('timesheets_detail')
          .select('resource_id, resource_name, delivery_id, month, total_days_prod, total_hours');
        if (error) throw error;
        if (!rows || rows.length === 0) return defaultValue;

        const byKey = {};
        rows.forEach((r) => {
          // delivery_id=0 = ligne de synthèse mensuelle (pour TACE), hors agrégat prestation.
          if (Number(r.delivery_id) === 0) return;
          const key = `${r.resource_id || ''}__${r.delivery_id || ''}__${r.month || ''}`;
          if (!byKey[key]) {
            byKey[key] = {
              resourceId: r.resource_id,
              resourceName: r.resource_name,
              deliveryId: r.delivery_id,
              month: r.month,
              totalDays: 0,
              totalHours: 0,
            };
          }
          byKey[key].totalDays += Number(r.total_days_prod) || 0;
          byKey[key].totalHours += Number(r.total_hours) || 0;
        });

        const data = Object.values(byKey);
        return { metadata: { ...metadata, totalRecords: data.length }, data };
      }
      case KV_KEYS.FORECAST_TIMES: {
        const { data: rows, error } = await supabase.from('forecast_times').select('delivery_id, month, value');
        if (error) throw error;
        const data = {};
        (rows || []).forEach((r) => {
          if (!data[r.delivery_id]) data[r.delivery_id] = { forecast: {} };
          data[r.delivery_id].forecast[r.month] = Number(r.value) || 0;
        });
        return { metadata: { createdAt: new Date().toISOString(), lastUpdated: new Date().toISOString() }, data };
      }
      case KV_KEYS.FORECAST_REPORT: {
        const { data: rows, error } = await supabase.from('forecast_report').select('nom, prenom, reference, titre, date_debut, date_fin, tjm').order('id');
        if (error) throw error;
        if (!rows || rows.length === 0) return defaultValue;
        return rows.map((r) => ({
          nom: r.nom,
          prenom: r.prenom,
          reference: r.reference,
          titre: r.titre,
          dateDebut: r.date_debut,
          dateFin: r.date_fin,
          tjm: r.tjm
        }));
      }
      case KV_KEYS.RESOURCES_METADATA: {
        const { data: row, error } = await supabase.from('resources_metadata').select('value').eq('key', 'resources_metadata').maybeSingle();
        if (error) throw error;
        return row && row.value ? row.value : (defaultValue !== null ? defaultValue : {});
      }
      case KV_KEYS.ABSENCE_MONTHLY: {
        const { data: rows, error } = await supabase
          .from('absence')
          .select('resource_id, month, days, synced_at')
          .order('resource_id', { ascending: true })
          .order('month', { ascending: true });
        if (error) throw error;
        const list = (rows || []).map((r) => ({
          resourceId: Number(r.resource_id),
          month: r.month,
          days: Number(r.days) || 0
        }));
        return {
          metadata: { count: list.length, source: 'DB' },
          data: list
        };
      }
      default:
        return defaultValue;
    }
  } catch (err) {
    console.error(`❌ db.getTable(${key}):`, err.message || err);
    return defaultValue;
  }
}

async function setTable(key, value) {
  const supabase = getSupabase();
  if (!supabase) {
    console.error(`❌ db.setTable(${key}): Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)`);
    return;
  }

  try {
    switch (key) {
      case KV_KEYS.RESOURCES: {
        const list = Array.isArray(value) ? value : [];
        if (list.length === 0) return;
        const rows = list.map((r) => ({
          id: r.id,
          nom: r.nom || r.lastName || r.LastName || '',
          prenom: r.prenom || r.firstName || r.FirstName || '',
          type_of: r.typeOf ?? r.type ?? null,
          state: r.state ?? r.State ?? null,
          is_visible: r.isVisible !== false && r.isVisible !== 0 && r.isVisible !== '0',
          contracts: r.contracts || [],
          raw: r.raw || {}
        }));
        // Upsert uniquement les colonnes Boond (nom, prenom, type_of, state, is_visible, contracts, raw)
        // sans toucher d'éventuelles colonnes locales (temps, statut interne, commentaires, etc.).
        const { error } = await supabase.from('resources').upsert(rows, { onConflict: 'id' });
        if (error) throw error;
        break;
      }
      case KV_KEYS.DELIVERIES: {
        const list = (value && value.data) ? value.data : (Array.isArray(value) ? value : []);
        if (list.length === 0) return;
        
        const rows = list.map((d) => ({
          id: Number(d.id),
          reference: d.reference || null,
          title: d.title || '',
          tjm: d.tjm != null ? Number(d.tjm) : null,
          average_daily_cost:
            d.averageDailyCost != null
              ? Number(d.averageDailyCost)
              : d.average_daily_cost != null
                ? Number(d.average_daily_cost)
                : null,
          start_date: d.startDate || null,
          end_date: d.endDate || null,
          project_id: d.projectId ? Number(d.projectId) : null,
          resource_id: d.resourceId ? Number(d.resourceId) : null,
          resource_first_name: d.resourceFirstName || null,
          resource_last_name: d.resourceLastName || null,
          state: d.state ?? null,
          ordered_days: d.orderedDays != null ? Number(d.orderedDays) : null,
          raw: d.raw || {},
          synced_at: new Date().toISOString()
        }));
        
        // Upsert toutes les prestations
        const chunkSize = 500;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const { error } = await supabase.from('deliveries').upsert(chunk, { onConflict: 'id' });
          if (error) throw error;
        }
        break;
      }
      case KV_KEYS.PROJECTS: {
        const list = Array.isArray(value) ? value : [];
        if (list.length === 0) return;
        
        // Extraire les projets
        const projectRows = list.map((p) => {
          const proj = p.project || p;
          const attrs = proj.attributes || proj;
          return {
            id: Number(p.id || proj.id),
            reference: attrs.reference || null,
            name: attrs.name || attrs.title || null,
            state: attrs.state ?? null,
            start_date: attrs.startDate || null,
            end_date: attrs.endDate || null,
            client_name: attrs.companyName || null,
            raw: proj,
            synced_at: new Date().toISOString()
          };
        });
        
        // Upsert les projets
        const { error: projError } = await supabase.from('projects').upsert(projectRows, { onConflict: 'id' });
        if (projError) throw projError;
        
        // Extraire et sauvegarder les prestations associées aux projets
        const deliveryRows = [];
        for (const p of list) {
          const projectId = Number(p.id);
          const deliveries = p.deliveries || [];
          for (const d of deliveries) {
            const attrs = d.attributes || d;
            const resource = d._embedded?.resource || {};
            const resourceAttrs = resource.attributes || resource;
            deliveryRows.push({
              id: Number(d.id || attrs.id),
              reference: attrs.reference || null,
              title: attrs.title || '',
              tjm: attrs.unitPriceExcludingTax != null ? Number(attrs.unitPriceExcludingTax) : null,
              start_date: attrs.startDate || null,
              end_date: attrs.endDate || null,
              project_id: projectId,
              resource_id: resource.id ? Number(resource.id) : null,
              resource_first_name: resourceAttrs.firstName || null,
              resource_last_name: resourceAttrs.lastName || null,
              state: attrs.state ?? null,
              raw: d,
              synced_at: new Date().toISOString()
            });
          }
        }
        
        // Upsert les prestations par lots
        if (deliveryRows.length > 0) {
          const chunkSize = 500;
          for (let i = 0; i < deliveryRows.length; i += chunkSize) {
            const chunk = deliveryRows.slice(i, i + chunkSize);
            const { error } = await supabase.from('deliveries').upsert(chunk, { onConflict: 'id' });
            if (error) throw error;
          }
        }
        break;
      }
      case KV_KEYS.TIMESHEETS_DATA: {
        const data = (value && value.data) ? value.data : {};
        const metadata = (value && value.metadata) ? value.metadata : {};
        await supabase.from('timesheets_data').upsert({ id: 1, data, metadata, synced_at: new Date().toISOString() }, { onConflict: 'id' });
        break;
      }
      case KV_KEYS.TIMESHEETS_AGGREGATE: {
        const meta = (value && value.metadata) ? value.metadata : {};
        await supabase.from('app_metadata').upsert(
          { key: 'timesheets_aggregate', value: meta, updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        break;
      }
      case KV_KEYS.FORECAST_TIMES: {
        const data = (value && value.data) ? value.data : {};
        const toInsert = [];
        Object.keys(data).forEach((deliveryId) => {
          const entry = data[deliveryId];
          const forecast = entry && entry.forecast ? entry.forecast : {};
          Object.keys(forecast).forEach((month) => {
            toInsert.push({ delivery_id: Number(deliveryId), month, value: Number(forecast[month]) || 0 });
          });
        });
        await supabase.rpc('clear_forecast_times');
        if (toInsert.length > 0) {
          await supabase.from('forecast_times').upsert(toInsert, { onConflict: 'delivery_id,month' });
        }
        break;
      }
      case KV_KEYS.FORECAST_REPORT: {
        const list = Array.isArray(value) ? value : [];
        await supabase.from('forecast_report').delete().neq('id', 0);
        if (list.length > 0) {
          const rows = list.map((r) => ({
            nom: r.nom,
            prenom: r.prenom,
            reference: r.reference,
            titre: r.titre,
            date_debut: r.dateDebut || null,
            date_fin: r.dateFin || null,
            tjm: r.tjm != null ? Number(r.tjm) : null
          }));
          await supabase.from('forecast_report').insert(rows);
        }
        break;
      }
      case KV_KEYS.RESOURCES_METADATA: {
        const val = value && typeof value === 'object' ? value : {};
        await supabase.from('resources_metadata').upsert({ key: 'resources_metadata', value: val, updated_at: new Date().toISOString() }, { onConflict: 'key' });
        break;
      }
      case KV_KEYS.ABSENCE_MONTHLY: {
        const list =
          value && value.data && Array.isArray(value.data)
            ? value.data
            : Array.isArray(value)
              ? value
              : [];
        const { error: delErr } = await supabase.from('absence').delete().gte('days', 0);
        if (delErr) throw delErr;
        if (list.length === 0) break;
        const now = new Date().toISOString();
        const rows = list.map((r) => ({
          resource_id: Number(r.resourceId),
          month: String(r.month),
          days: Number(r.days) || 0,
          synced_at: now
        }));
        const chunkSize = 500;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const chunk = rows.slice(i, i + chunkSize);
          const { error } = await supabase.from('absence').insert(chunk);
          if (error) throw error;
        }
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error(`❌ db.setTable(${key}):`, err.message || err);
    throw err;
  }
}

async function delTable(key) {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    switch (key) {
      case KV_KEYS.RESOURCES:
        await supabase.from('resources').delete().neq('id', 0);
        break;
      case KV_KEYS.DELIVERIES:
        await supabase.from('deliveries').delete().neq('id', '');
        break;
      case KV_KEYS.PROJECTS:
        await supabase.from('projects').delete().neq('id', '');
        break;
      case KV_KEYS.TIMESHEETS_DATA:
        await supabase.from('timesheets_data').update({ data: {}, metadata: {}, synced_at: new Date().toISOString() }).eq('id', 1);
        break;
      case KV_KEYS.TIMESHEETS_AGGREGATE:
        await supabase.from('app_metadata').delete().eq('key', 'timesheets_aggregate');
        await supabase.from('timesheets_aggregate').delete().neq('id', 0);
        break;
      case KV_KEYS.FORECAST_TIMES:
        await supabase.rpc('clear_forecast_times');
        break;
      case KV_KEYS.FORECAST_REPORT:
        await supabase.from('forecast_report').delete().neq('id', 0);
        break;
      case KV_KEYS.RESOURCES_METADATA:
        await supabase.from('resources_metadata').delete().eq('key', 'resources_metadata');
        break;
      case KV_KEYS.ABSENCE_MONTHLY:
        await supabase.from('absence').delete().gte('days', 0);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error(`❌ db.delTable(${key}):`, err.message || err);
  }
}

module.exports = {
  isTableKey,
  getTable,
  setTable,
  delTable
};
