import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL;
const supabaseKey =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_KEY ||
  import.meta.env.SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.SUPABASE_ANON_KEY ||
  import.meta.env.SUPABASE_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseKey);

export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

export function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add VITE_SUPABASE_URL and either VITE_SUPABASE_PUBLISHABLE_KEY, VITE_SUPABASE_ANON_KEY, or VITE_SUPABASE_KEY."
    );
  }

  return supabase;
}
