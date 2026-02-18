import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseAdminKey = process.env.SUPABASE_ADMIN_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseAdminKey) {
  throw new Error(`Missing required Supabase environment variables`);
}

const supabase: SupabaseClient = createClient(supabaseUrl, supabaseAnonKey);
const supabaseAdmin: SupabaseClient = createClient(supabaseUrl, supabaseAdminKey);

export { supabase, supabaseAdmin };
