/**
 * POST /api/init-dictionary - Initialise la table dictionnaire depuis BoondManager
 */
const path = require('path');
try {
  require(path.join(__dirname, '..', 'lib', 'secretEnv'));
} catch (e) {}

const { getSupabase } = require(path.join(__dirname, '..', 'lib', 'supabaseClient'));
const boondManagerService = require(path.join(__dirname, '..', 'server', 'services', 'boondManagerService'));

function sendJson(res, status, body) {
  res.setHeader('Content-Type', 'application/json');
  res.statusCode = status;
  res.end(JSON.stringify(body));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return sendJson(res, 405, { success: false, error: 'Method Not Allowed' });
  }

  try {
    const supabase = getSupabase();
    if (!supabase) {
      return sendJson(res, 500, { success: false, error: 'Supabase non configuré' });
    }

    // Récupérer le dictionnaire depuis BoondManager
    console.log('📡 Récupération du dictionnaire BoondManager...');
    const dictionary = await boondManagerService.getDictionary();
    
    if (!dictionary || !dictionary.data) {
      return sendJson(res, 500, { success: false, error: 'Impossible de récupérer le dictionnaire BoondManager' });
    }

    const entries = [];

    // Extraire la structure du dictionnaire
    const fullDict = dictionary.data?.data || dictionary.data;
    console.log('📋 Clés dans fullDict:', Object.keys(fullDict || {}));
    console.log('📋 Clés dans fullDict.setting:', Object.keys(fullDict?.setting || {}));

    // Extraire les types de ressources (typeOf) depuis setting.typeOf.resource
    const typeOfList = fullDict?.setting?.typeOf?.resource || [];
    console.log(`📊 ${typeOfList.length} types trouvés dans setting.typeOf.resource`);
    
    typeOfList.forEach((item) => {
      if (item.id !== undefined && item.value) {
        entries.push({
          table_name: 'resources',
          column_name: 'type_of',
          code: String(item.id),
          label: item.value
        });
      }
    });

    // Extraire les états de ressources (state) depuis setting.state.resource
    const resourceStates = fullDict?.setting?.state?.resource || [];
    console.log(`📊 ${resourceStates.length} statuts trouvés dans setting.state.resource`);
    resourceStates.forEach((item) => {
      if (item.id !== undefined && item.value) {
        entries.push({
          table_name: 'resources',
          column_name: 'state',
          code: String(item.id),
          label: item.value
        });
      }
    });

    console.log(`📊 ${entries.length} entrées à insérer dans le dictionnaire`);

    if (entries.length === 0) {
      return sendJson(res, 200, { success: true, message: 'Aucune entrée trouvée dans le dictionnaire BoondManager', count: 0 });
    }

    // Insérer dans la table dictionnaire (upsert)
    const { data, error } = await supabase
      .from('dictionnaire')
      .upsert(entries, { onConflict: 'table_name,column_name,code' });

    if (error) {
      console.error('❌ Erreur insertion dictionnaire:', error);
      return sendJson(res, 500, { success: false, error: error.message });
    }

    return sendJson(res, 200, { 
      success: true, 
      message: `Dictionnaire initialisé avec ${entries.length} entrées`,
      count: entries.length,
      entries: entries
    });

  } catch (error) {
    console.error('❌ Erreur init-dictionary:', error);
    return sendJson(res, 500, { success: false, error: error.message });
  }
};
