import { SUPABASE_ANON_KEY, SUPABASE_URL, APP_CONFIG } from "../config.js";

let client = null;

export async function getSupabase() {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error("Faltan las credenciales publicas de Supabase en js/config.js.");
  }
  if (client) return client;
  const module = await import("https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm");
  client = module.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true
    }
  });
  return client;
}
