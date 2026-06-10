import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Non-null when the Supabase env vars are missing. The app checks this before
 * mounting anything that talks to Supabase, so a misconfigured deploy shows a
 * readable notice instead of throwing at module-load time (which white-screens
 * the whole app, since this module is imported before React renders).
 */
export const supabaseConfigError: string | null =
  !url || !anonKey
    ? 'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see .env.example), then redeploy.'
    : null

// Only construct the client when configured — createClient throws on empty
// values. Consumers must not touch `supabase` while `supabaseConfigError` is
// set; App gates the whole tree on it, so the cast is safe at runtime.
export const supabase: SupabaseClient = supabaseConfigError
  ? (null as unknown as SupabaseClient)
  : createClient(url!, anonKey!)
