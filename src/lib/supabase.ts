import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * Whether the Supabase env vars are present. The app gates on this before
 * mounting anything that touches the client, so we never throw at module-load
 * time — a missing config used to crash the whole bundle into a blank screen.
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

// Only constructed when configured. Guarded by `isSupabaseConfigured` at the
// app root, so consumers can rely on a real client being present.
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(url, anonKey)
  : (null as unknown as SupabaseClient)
