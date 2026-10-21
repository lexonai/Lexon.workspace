import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { listMembers } from './team'
import type { SeriesPoint } from '../types'

const DAY = 86400000
export interface AnalyticsData {
  days: string[]
  kpis: { total: number; done: number; pending: number; overdue: number; rate: number; members: number; projects: number }
  completed: number[]; created: number[]; activity: number[]
  spark: { completed: number[]; created: number[]; activity: number[] }
  byStatus: { label: string; value: number; color: string }[]
  byPriority: { label: string; value: number; color: string }[]
  projectsByStatus: { label: string; value: number; color: string }[]
  weekday: SeriesPoint[]
  topMembers: { label: string; value: number }[]
  files: { count: number; bytes: number }
}
const labelOf = (d: Date) => d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
const bucket = (since: Date, days: number, dates: string[]) => {
  const out = Array(days).fill(0)
  for (const iso of dates) { const i = Math.floor((new Date(iso).getTime() - since.getTime()) / DAY); if (i >= 0 && i < days) out[i]++ }
  return out as number[]
}

export async function getAnalytics(ws: string, days: number): Promise<AnalyticsData> {
  const since = new Date(Date.now() - (days - 1) * DAY); since.setHours(0, 0, 0, 0)
  const labels = Array.from({ length: days }, (_, i) => labelOf(new Date(since.getTime() + i * DAY)))
  if (DEMO) {
    const z = Array(days).fill(0)
    return { days: labels, kpis: { total: 0, done: 0, pending: 0, overdue: 0, rate: 0, members: 0, projects: 0 }, completed: z, created: z, activity: z, spark: { completed: z, created: z, activity: z }, byStatus: [], byPriority: [], projectsByStatus: [], weekday: [], topMembers: [], files: { count: 0, bytes: 0 } }
  }
  const [tasks, projects, activity, files, members] = await Promise.all([
    supabase.from('tasks').select('status,priority,created_at,updated_at,due_at').eq('workspace_id', ws).limit(5000),
    supabase.from('projects').select('status').eq('workspace_id', ws),
    supabase.from('activity_logs').select('actor_id,created_at').eq('workspace_id', ws).gte('created_at', since.toISOString()).limit(5000),
    supabase.from('files').select('size_bytes').eq('workspace_id', ws).eq('source', 'upload'),
    listMembers(ws)
  ])
  const failed = [tasks, projects, activity, files].find(r => r.error)
  if (failed?.error) throw new Error(failed.error.message)

  const t = tasks.data ?? [], now = Date.now()
  const done = t.filter(x => x.status === 'done')
  const team = members.filter(m => m.active && m.role === 'member')      // Admins are not counted as team members
  const teamIds = new Set(team.map(m => m.id))
  const completed = bucket(since, days, done.map(x => x.updated_at))
  const created = bucket(since, days, t.map(x => x.created_at))
  const act = bucket(since, days, (activity.data ?? []).map(a => a.created_at))
  const counts = new Map<string, number>()
  for (const a of activity.data ?? []) if (a.actor_id && teamIds.has(a.actor_id)) counts.set(a.actor_id, (counts.get(a.actor_id) ?? 0) + 1)
  const wd = Array(7).fill(0); for (const a of activity.data ?? []) wd[new Date(a.created_at).getDay()]++
  const cnt = (arr: any[], k: string, v: string) => arr.filter(x => x[k] === v).length
  const ps = projects.data ?? []

  return {
    days: labels,
    kpis: { total: t.length, done: done.length, pending: t.length - done.length, overdue: t.filter(x => x.status !== 'done' && x.due_at && new Date(x.due_at).getTime() < now).length, rate: t.length ? Math.round((done.length / t.length) * 100) : 0, members: team.length, projects: ps.length },
    completed, created, activity: act, spark: { completed: completed.slice(-14), created: created.slice(-14), activity: act.slice(-14) },
    byStatus: [{ label: 'To Do', value: cnt(t, 'status', 'todo'), color: '#94a3b8' }, { label: 'In Progress', value: cnt(t, 'status', 'in_progress'), color: '#2563eb' }, { label: 'Review', value: cnt(t, 'status', 'review'), color: '#8b5cf6' }, { label: 'Done', value: cnt(t, 'status', 'done'), color: '#10b981' }],
    byPriority: [{ label: 'Low', value: cnt(t, 'priority', 'low'), color: '#38bdf8' }, { label: 'Medium', value: cnt(t, 'priority', 'medium'), color: '#f59e0b' }, { label: 'High', value: cnt(t, 'priority', 'high'), color: '#f97316' }, { label: 'Urgent', value: cnt(t, 'priority', 'urgent'), color: '#ef4444' }],
    projectsByStatus: [{ label: 'Active', value: cnt(ps, 'status', 'active'), color: '#10b981' }, { label: 'Inactive', value: cnt(ps, 'status', 'inactive'), color: '#94a3b8' }, { label: 'Coming Soon', value: cnt(ps, 'status', 'coming_soon'), color: '#8b5cf6' }],
    weekday: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((label, i) => ({ label, value: wd[i] })),
    topMembers: [...counts.entries()].map(([id, value]) => ({ label: team.find(m => m.id === id)?.name ?? 'Unknown', value })).sort((a, b) => b.value - a.value).slice(0, 6),
    files: { count: (files.data ?? []).length, bytes: (files.data ?? []).reduce((s, f) => s + Number(f.size_bytes ?? 0), 0) }
  }
}
