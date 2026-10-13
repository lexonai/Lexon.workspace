import { createClient } from '@supabase/supabase-js'
import { env } from './env'

// Only the public anon key is used here. Security is enforced by RLS in the database.
export const supabase = createClient(env.url || 'http://localhost', env.key || 'anon', {
  auth: { persistSession: true, autoRefreshToken: true, flowType: 'pkce' }
})
