import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import type { HomeData, Presence } from '../types'
import { effectivePresence } from '../lib/presence'

const DAY = 86400000

function demo(): HomeData {
  const vals = [3, 5, 4, 8, 7, 11, 14]
  return {
    userName: 'Demo', assistantName: 'Lexon Assistant',
    kpis: { projects: 12, tasksDone: 48, members: 24, unread: 5 },
    progress: vals.map((value, i) => ({
      label: new Date(Date.now() - (6 - i) * DAY).toLocaleDateString('en', { month: 'short', day: 'numeric' }),
      value
    })),
    projects: [
      { id: '1', name: 'Website Redesign', type: 'Product Design', progress: 78, status: 'active' },
      { id: '2', name: 'Mobile App Development', type: 'Development', progress: 62, status: 'active' },
      { id: '3', name: 'Marketing Campaign', type: 'Marketing', progress: 45, status: 'coming_soon' }
    ],
    tasks: [
      { id: '1', title: 'Finalize design system', project: 'Product Design', due: new Date().toISOString() },
      { id: '2', title: 'API integration testing', project: 'Development', due: new Date(Date.now() + DAY).toISOString() }
    ],
    team: [
      { id: '1', name: 'Sarah Wilson', title: 'Product Designer', presence: 'online', avatar: null },
      { id: '2', name: 'Mike Johnson', title: 'Frontend Developer', presence: 'away', avatar: null }
    ],
    activity: [{ id: '1', action: 'task_completed', at: new Date().toISOString() }]
  }
}

export async function getWorkspaceId(userId: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('workspace_members').select('workspace_id').eq('user_id', userId).eq('active', true).limit(1).maybeSingle()
  if (error) throw new Error(error.message)
  return data?.workspace_id ?? null
}

type Res<T = any> = { data: T | null; count?: number | null; error: { message: string } | null }

export async function getHomeData(userId: string, workspaceId: string): Promise<HomeData> {
  if (DEMO) return demo()
  const since = new Date(Date.now() - 6 * DAY)
  since.setHours(0, 0, 0, 0)
  const warnings: string[] = []

  // One failing section (a missing column from an un-run migration, a blocked table) must not blank the whole Home.
  const part = async <T extends Res>(name: string, q: PromiseLike<T>): Promise<T> => {
    try {
      const r = await q
      if (r.error) warnings.push(`${name}: ${r.error.message}`)
      return r
    } catch (e) { warnings.push(`${name}: ${(e as Error).message}`); return { data: null, count: null, error: { message: (e as Error).message } } as T }
  }
  const profile = async (): Promise<Res> => {
    const full = await supabase.from('profiles').select('full_name,assistant_name').eq('id', userId).maybeSingle()
    if (!full.error) return full
    // profiles.assistant_name comes from migration 0008: fall back instead of failing Home.
    const basic = await supabase.from('profiles').select('full_name').eq('id', userId).maybeSingle()
    if (!basic.error) warnings.push('Run migration 0008 (profiles.assistant_name is missing).')
    return basic
  }

  const [me, projCount, doneCount, memCount, unread, doneRecent, projects, tasks, team, activity] = await Promise.all([
    profile(),
    part('Projects', supabase.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).neq('status', 'archived')),
    part('Tasks', supabase.from('tasks').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('status', 'done')),
    part('Team', supabase.from('workspace_members').select('user_id', { count: 'exact', head: true }).eq('workspace_id', workspaceId).eq('active', true).eq('role', 'member')),
    part('Notifications', supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)),
    part('Task chart', supabase.from('tasks').select('updated_at').eq('workspace_id', workspaceId).eq('status', 'done').gte('updated_at', since.toISOString())),
    part('Active projects', supabase.from('projects').select('id,name,type,progress,status').eq('workspace_id', workspaceId).neq('status', 'archived').order('updated_at', { ascending: false }).limit(5)),
    part('Upcoming tasks', supabase.from('tasks').select('id,title,due_at,projects(name)').eq('workspace_id', workspaceId).neq('status', 'done').order('due_at', { ascending: true, nullsFirst: false }).limit(5)),
    part('Team list', supabase.from('workspace_members').select('profiles(id,full_name,job_title,presence,last_seen,avatar_url)').eq('workspace_id', workspaceId).eq('active', true).eq('role', 'member').limit(6)),
    part('Recent activity', supabase.from('activity_logs').select('id,action,meta,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(6))
  ])
  // Only if EVERYTHING failed is it a real outage (session, network, RLS on the whole schema): then show the error + Retry.
  const all = [me, projCount, doneCount, memCount, unread, doneRecent, projects, tasks, team, activity]
  if (all.every(r => r.error)) throw new Error(all[1].error?.message ?? 'Database is not reachable. Check your connection and that the SQL migrations have been run.')

  const buckets = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(since.getTime() + i * DAY)
    return { key: d.toDateString(), label: d.toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: 0 }
  })
  for (const t of (doneRecent.data as any[]) ?? []) {
    const b = buckets.find(x => x.key === new Date(t.updated_at).toDateString())
    if (b) b.value++
  }

  return {
    userName: (me.data?.full_name || '').split(' ')[0] || 'there',
    assistantName: (me.data as any)?.assistant_name || 'Lexon Assistant',
    kpis: { projects: projCount.count ?? 0, tasksDone: doneCount.count ?? 0, members: memCount.count ?? 0, unread: unread.count ?? 0 },
    progress: buckets.map(({ label, value }) => ({ label, value })),
    projects: ((projects.data as any[]) ?? []).map((p: any) => ({ id: p.id, name: p.name, type: p.type, progress: p.progress, status: p.status })),
    tasks: ((tasks.data as any[]) ?? []).map((t: any) => ({ id: t.id, title: t.title, project: t.projects?.name ?? null, due: t.due_at })),
    team: ((team.data as any[]) ?? []).map((m: any) => m.profiles).filter(Boolean).map((p: any) => ({
      id: p.id, name: p.full_name || 'Unnamed', title: p.job_title, presence: effectivePresence(p.presence as Presence, p.last_seen), avatar: p.avatar_url
    })),
    activity: ((activity.data as any[]) ?? []).map((a: any) => ({ id: a.id, action: a.action, title: a.meta?.title ?? null, at: a.created_at })),
    warnings
  }
}
