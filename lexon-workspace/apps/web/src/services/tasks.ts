import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'

export type TaskStatus = 'todo' | 'in_progress' | 'review' | 'done'
export interface Task {
  id: string; title: string; description: string | null; status: TaskStatus; priority: string; progress: number
  due: string | null; projectId: string | null; projectName: string | null
  assignees: { id: string; name: string; avatar: string | null }[]
}
const SELECT = 'id,title,description,status,priority,progress,due_at,project_id,projects(name),task_assignees(profiles(id,full_name,avatar_url))'
const map = (t: any): Task => ({
  id: t.id, title: t.title, description: t.description, status: t.status, priority: t.priority, progress: t.progress,
  due: t.due_at, projectId: t.project_id, projectName: t.projects?.name ?? null,
  assignees: (t.task_assignees ?? []).map((a: any) => a.profiles).filter(Boolean)
    .map((p: any) => ({ id: p.id, name: p.full_name || 'Unnamed', avatar: p.avatar_url }))
})

export async function listTasks(ws: string, projectId?: string): Promise<Task[]> {
  if (DEMO) return []
  let q = supabase.from('tasks').select(SELECT).eq('workspace_id', ws).order('due_at', { ascending: true, nullsFirst: false })
  if (projectId) q = q.eq('project_id', projectId)
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return (data ?? []).map(map)
}

export interface NewTask { title: string; description: string; projectId: string; assignees: string[]; due: string; priority: string }
export async function createTask(ws: string, userId: string, n: NewTask) {
  if (DEMO) return
  const { data, error } = await supabase.from('tasks').insert({
    workspace_id: ws, title: n.title.trim(), description: n.description.trim() || null, project_id: n.projectId || null,
    due_at: n.due ? new Date(n.due + 'T23:59:00').toISOString() : null, priority: n.priority, created_by: userId
  }).select('id').single()
  if (error) throw new Error(error.message)
  if (n.assignees.length) {
    const r = await supabase.from('task_assignees').insert(n.assignees.map(u => ({ task_id: data.id, user_id: u })))
    if (r.error) throw new Error(r.error.message) // assignees are notified by a database trigger
  }
}
export async function updateTask(id: string, patch: { status?: TaskStatus; progress?: number; priority?: string }) {
  if (DEMO) return
  const { error } = await supabase.from('tasks').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteTask(id: string) {
  if (DEMO) return
  const { error } = await supabase.from('tasks').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
