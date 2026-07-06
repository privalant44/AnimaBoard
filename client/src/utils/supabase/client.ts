import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY;

let browserClient: SupabaseClient | null = null;

/**
 * Client Supabase pour le navigateur (CRA).
 * Définir dans `client/.env.development` / `.env.production` :
 * REACT_APP_SUPABASE_URL, REACT_APP_SUPABASE_ANON_KEY (clé anon / publishable du dashboard).
 */
export function createBrowserClient(): SupabaseClient {
  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      'Missing REACT_APP_SUPABASE_URL or REACT_APP_SUPABASE_ANON_KEY. Copy client/env.example to client/.env.development.'
    );
  }
  if (!browserClient) {
    browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}
