const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabase() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  if (
    process.env.NODE_ENV === 'development' &&
    /:(54321)(\/|$)/.test(url.replace('localhost', '127.0.0.1'))
  ) {
    console.warn(
      '⚠️  SUPABASE_URL pointe sur le port 54321. En local, si vous avez déplacé l’API dans supabase/config.toml ' +
        '(ex. 55221), mettez la même URL que « Project URL » dans `npx supabase status`, sinon les écritures échouent.'
    );
  }

  supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  return supabase;
}

module.exports = { getSupabase };

