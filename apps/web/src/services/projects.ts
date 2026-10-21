import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'

export type ProjectStatus = 'active' | 'inactive' | 'coming_soon'
export interface Project {
  id: string; name: string; type: string | null; url: string | null; repository: string | null
  description: string | null; status: ProjectStatus; createdAt: string
}
export const STATUS_LABEL: Record<ProjectStatus, string> = { active: 'Active', inactive: 'Inactive', coming_soon: 'Coming Soon' }
export const STATUS_STYLE: Record<ProjectStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700 ring-emerald-200', inactive: 'bg-slate-100 text-slate-600 ring-slate-200', coming_soon: 'bg-violet-50 text-violet-700 ring-violet-200'
}
export const MAX_WORDS = 5000
export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0)

const COLS = 'id,name,type,url,repository,description,status,created_at'
const map = (p: any): Project => ({ id: p.id, name: p.name, type: p.type, url: p.url, repository: p.repository, description: p.description, status: p.status, createdAt: p.created_at })
const demo: Project[] = [
  { id: 'p1', name: 'Lexon Motion', type: 'Desktop App', url: 'lexonmotion.app', repository: null, description: 'Screen-recording motion tool.', status: 'active', createdAt: new Date().toISOString() },
  { id: 'p2', name: 'YouTube Agent', type: 'Agent', url: null, repository: null, description: null, status: 'coming_soon', createdAt: new Date().toISOString() }
]

export async function listProjects(ws: string): Promise<Project[]> {
  if (DEMO) return demo
  const { data, error } = await supabase.from('projects').select(COLS).eq('workspace_id', ws).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return (data ?? []).map(map)
}
export async function getProject(id: string): Promise<Project> {
  if (DEMO) return demo.find(p => p.id === id) ?? demo[0]
  const { data, error } = await supabase.from('projects').select(COLS).eq('id', id).single()
  if (error) throw new Error(error.message)
  return map(data)
}
export interface ProjectInput { name: string; type: string; url: string; repository: string; description: string; status: ProjectStatus }
function validate(i: ProjectInput) {
  if (!i.name.trim()) throw new Error('Project name is required.')
  if (wordCount(i.description) > MAX_WORDS) throw new Error(`Description is limited to ${MAX_WORDS} words.`)
}
const row = (i: ProjectInput) => ({ name: i.name.trim(), type: i.type.trim() || null, url: i.url.trim() || null, repository: i.repository.trim() || null, description: i.description.trim() || null, status: i.status })

export async function createProject(ws: string, userId: string, i: ProjectInput) {
  validate(i); if (DEMO) return
  const { error } = await supabase.from('projects').insert({ workspace_id: ws, created_by: userId, ...row(i) })
  if (error) throw new Error(error.message)
}
export async function updateProject(id: string, i: ProjectInput) {
  validate(i); if (DEMO) return
  const { error } = await supabase.from('projects').update(row(i)).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function setProjectStatus(id: string, status: ProjectStatus) {
  if (DEMO) return
  const { error } = await supabase.from('projects').update({ status }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteProject(id: string) {
  if (DEMO) return
  const { error } = await supabase.from('projects').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
// A domain without a scheme is accepted; only http(s) links are ever opened.
export function toHref(v: string | null): string | null {
  if (!v) return null
  const t = v.trim(); if (!t) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`
  try { const u = new URL(withScheme); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null } catch { return null }
}
