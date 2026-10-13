// SERVER ONLY (route handlers / server actions). Never import from client components.
import { createClient } from '@supabase/supabase-js'
export const adminClient = () => createClient(process.env.NEXT_PUBLIC_OFFICE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth:{ persistSession:false } })
