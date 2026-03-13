const { createClient } = require('@supabase/supabase-js');

let supabase = null;

function getSupabase() {
  if (supabase) return supabase;

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    return null;
  }

  supabase = createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false
    }
  });

  return supabase;
}

module.exports = { getSupabase };

