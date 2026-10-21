import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { callFn } from '../lib/functions'

export type FeedKind = 'message' | 'file' | 'automation' | 'team' | 'agent' | 'assistant' | 'task' | 'call' | 'announcement' | 'other'
export interface FeedItem { id: string; kind: FeedKind; title: string; body: string | null; at: string; unread: boolean; href: string | null; source?: string; notificationId?: string }

const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
const ACT: Record<string, FeedKind> = {
  file_uploaded: 'file', automation_event: 'automation', agent_event: 'agent', assistant_used: 'assistant',
  member_added: 'team', task_created: 'task', task_completed: 'task', project_created: 'team', announcement_sent: 'team'
}
const ACT_TITLE: Record<string, string> = {
  file_uploaded: 'File uploaded', automation_event: 'Automation', agent_event: 'Agent activity', assistant_used: 'Assistant',
  member_added: 'New team member', task_created: 'Task created', task_completed: 'Task completed', project_created: 'Project created', announcement_sent: 'Announcement sent'
}
const seenKey = (uid: string) => `lw_feed_seen_${uid}`
export const lastSeen = (uid: string) => Number(localStorage.getItem(seenKey(uid)) || 0)
export const markSeen = (uid: string) => localStorage.setItem(seenKey(uid), String(Date.now()))

// Pull events from linked projects (Instagram / Office) into the unified feed. Throttled.
let lastPull = 0
export async function pullLinkedEvents(ws: string) {
  if (DEMO || Date.now() - lastPull < 60000) return
  lastPull = Date.now()
  try {
    const { data } = await supabase.rpc('project_link_status', { ws })
    for (const r of (data ?? []) as { provider: string; status: string }[]) {
      if (r.status === 'connected' && (r.provider === 'instagram' || r.provider === 'office')) {
        await callFn('central-api', { service: 'automation', workspaceId: ws, project: r.provider, action: 'pull_events' }).catch(() => {})
      }
    }
  } catch { /* feed still works from local data */ }
}

export async function loadFeed(userId: string, ws: string, admin: boolean): Promise<FeedItem[]> {
  if (DEMO) return []
  const since = new Date(Date.now() - 7 * 86400000).toISOString()
  const seen = lastSeen(userId)
  const [n, a] = await Promise.all([
    supabase.from('notifications').select('id,type,title,body,entity_type,entity_id,read_at,created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(60),
    admin
      ? supabase.from('activity_logs').select('id,actor_id,action,meta,created_at').eq('workspace_id', ws).gte('created_at', since).order('created_at', { ascending: false }).limit(80)
      : supabase.from('activity_logs').select('id,actor_id,action,meta,created_at').eq('workspace_id', ws).eq('actor_id', userId).gte('created_at', since).order('created_at', { ascending: false }).limit(30)
  ])
  if (n.error) throw new Error(n.error.message)
  if (a.error) throw new Error(a.error.message)

  const items: FeedItem[] = (n.data ?? []).map((x: any) => ({
    id: 'n' + x.id, notificationId: x.id, at: x.created_at, unread: !x.read_at, title: x.title, body: x.body,
    kind: x.type === 'message' ? 'message' : x.type === 'call' ? 'call' : x.type === 'announcement' ? 'announcement' : x.type === 'task_assigned' ? 'task' : 'other',
    href: x.type === 'message' && x.entity_id ? `/messages?c=${x.entity_id}` : x.entity_type === 'task' ? '/tasks' : null
  }))
  const names = new Map<string, string>()
  const ids = [...new Set((a.data ?? []).map((x: any) => x.actor_id).filter(Boolean))] as string[]
  if (ids.length) { const { data } = await supabase.from('profiles').select('id,full_name').in('id', ids); (data ?? []).forEach((p: any) => names.set(p.id, p.full_name || 'Someone')) }
  for (const x of (a.data ?? []) as any[]) {
    if (x.action === 'task_assigned') continue // already delivered as a personal notification
    const kind = ACT[x.action] ?? 'other'
    const who = x.actor_id ? names.get(x.actor_id) : null
    items.push({
      id: 'a' + x.id, kind, at: x.created_at, unread: new Date(x.created_at).getTime() > seen,
      title: x.action === 'automation_event' ? `${label(String(x.meta?.source ?? 'automation'))}: ${x.meta?.title ?? ''}` : `${ACT_TITLE[x.action] ?? label(x.action)}${x.meta?.title ? `: ${x.meta.title}` : ''}`,
      body: who ? `by ${who}` : null, href: kind === 'file' ? '/files' : kind === 'automation' ? '/automations' : kind === 'task' ? '/tasks' : kind === 'team' ? '/team' : null,
      source: x.meta?.source
    })
  }
  return items.sort((p, q) => q.at.localeCompare(p.at))
}

export async function markNotificationRead(id: string) { await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id) }
export async function markAllNotificationsRead(userId: string) { await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('user_id', userId).is('read_at', null) }
export async function sendAnnouncement(ws: string, title: string, body: string, audience: string, users: string[]) {
  const { data, error } = await supabase.rpc('broadcast_notification', { ws, p_title: title, p_body: body, p_audience: audience, p_users: audience === 'selected' ? users : null })
  if (error) throw new Error(error.message.includes('schema cache') ? 'The database function is not installed yet. Run the latest SQL migration (0008) and try again.' : error.message)
  return data as number
}
