import { createClient } from '@supabase/supabase-js'
const url = process.env.NEXT_PUBLIC_OFFICE_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_OFFICE_SUPABASE_ANON_KEY
export const supabase = url && key ? createClient(url, key) : null // null => local simulation mode
export function subscribeOffice(onEvent:(p:any)=>void){
  if(!supabase) return ()=>{}
  const ch = supabase.channel('office:live',{config:{presence:{key:'owner'}}})
    .on('postgres_changes',{event:'*',schema:'public'},onEvent)
    .on('presence',{event:'sync'},()=>onEvent({presence:ch.presenceState()}))
    .subscribe()
  return ()=>{ supabase!.removeChannel(ch) }
}
