import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** True once the Supabase env vars are configured (locally and/or on Netlify). */
export const supabaseEnabled = Boolean(url && anonKey);

/**
 * Shared Supabase client (anon key + RLS). Used for public reads on the
 * storefront and for the authenticated admin session. Null until configured —
 * callers fall back to the static sample menu so the site keeps working.
 */
export const supabase: SupabaseClient | null = supabaseEnabled
  ? createClient(url!, anonKey!)
  : null;
