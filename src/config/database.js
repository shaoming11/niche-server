const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseAdminKey = process.env.SUPABASE_ADMIN_KEY;

if (!supabaseUrl || !supabaseAnonKey || !supabaseAdminKey) {
  throw new Error('Missing required Supabase environment variables');
}

// Public client - respects RLS policies
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client - bypasses RLS, use for server-side operations
const supabaseAdmin = createClient(supabaseUrl, supabaseAdminKey);

module.exports = { supabase, supabaseAdmin };
