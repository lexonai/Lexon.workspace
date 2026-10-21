import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'

export interface SecurityEvent { id: string; event: string; userAgent: string | null; at: string }

export async function logEvent(userId: string, event: string) {
  if (DEMO) return
  try { await supabase.from('security_events').insert({ user_id: userId, event, user_agent: navigator.userAgent.slice(0, 200) }) } catch { /* never block auth on logging */ }
}
export async function listEvents(userId: string): Promise<SecurityEvent[]> {
  if (DEMO) return []
  const { data, error } = await supabase.from('security_events').select('id,event,user_agent,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(25)
  if (error) throw new Error(error.message)
  return (data ?? []).map((e: any) => ({ id: e.id, event: e.event, userAgent: e.user_agent, at: e.created_at }))
}
