require('dotenv').config();
require('../lib/secretEnv');

const { getSupabase } = require('../lib/supabaseClient');
const boondManagerService = require('../server/services/boondManagerService');

function chunkArray(arr, size) {
  const chunks = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function initDictionary() {
  const supabase = getSupabase();
  if (!supabase) {
    console.error('❌ Supabase non configuré (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).');
    process.exit(1);
  }

  try {
    console.log('📚 Récupération du dictionnaire Boond (typeOf, state)...');
    const typeOfMapping = await boondManagerService.getTypeOfMapping();
    const stateMapping = await boondManagerService.getStateMapping();

    const rows = [];

    // resources.type_of
    Object.entries(typeOfMapping || {}).forEach(([code, label]) => {
      if (label != null) {
        rows.push({
          table_name: 'resources',
          column_name: 'type_of',
          code: String(code),
          label: String(label),
        });
      }
    });

    // resources.state
    Object.entries(stateMapping || {}).forEach(([code, label]) => {
      if (label != null) {
        rows.push({
          table_name: 'resources',
          column_name: 'state',
          code: String(code),
          label: String(label),
        });
      }
    });

    console.log(`📊 ${rows.length} entrées à insérer dans public.dictionnaire...`);

    for (const chunk of chunkArray(rows, 100)) {
      const { error } = await supabase
        .from('dictionnaire')
        .upsert(chunk, { onConflict: ['table_name', 'column_name', 'code'] });
      if (error) {
        console.error('❌ Erreur lors de l\'upsert dans dictionnaire:', error.message || error);
        throw error;
      }
    }

    console.log('✅ Table dictionnaire initialisée depuis l’API Boond.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erreur init-dictionary:', err.message || err);
    process.exit(1);
  }
}

initDictionary();

