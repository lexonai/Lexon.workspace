import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { effectivePresence } from '../lib/presence'
import type { Presence } from '../types'
import type { Role } from '../lib/useWorkspace'
import { callFn } from '../lib/functions'

export interface Member {
  id: string; name: string; title: string | null; department: string | null
  rating: number | null; presence: Presence; avatar: string | null
  role: Role; active: boolean; skills: string[]; about: string | null
}
export interface PrivateInfo { phone: string | null; email: string | null; address: string | null; emergency_contact: string | null; notes: string | null }
export interface MemberDetail extends Member {
  lastSeen: string | null
  tasks: { id: string; title: string; status: string; progress: number; due: string | null }[]
  projects: { id: string; name: string }[]
  private: PrivateInfo | null
}
export interface AttendanceRow { id: string; clockIn: string; clockOut: string | null }
export interface ActivityItem { id: string; action: string; title: string | null; at: string }

const demoMembers: Member[] = [
  { id: 'd1', name: 'Vijay Kumar', title: 'Motion Grapher', department: 'Motion Graphics', rating: 5, presence: 'online', avatar: null, role: 'member', active: true, skills: ['After Effects', 'Animation'], about: 'Demo member.' },
  { id: 'd2', name: 'Rahul Sharma', title: 'UI Designer', department: 'Design', rating: 4, presence: 'away', avatar: null, role: 'member', active: true, skills: ['Figma'], about: null }
]

function map(row: any): Member {
  const p = row.profiles
  return {
    id: p.id, name: p.full_name || 'Unnamed', title: p.job_title, department: p.department,
    rating: p.rating === null ? null : Number(p.rating), presence: effectivePresence(p.presence, p.last_seen),
    avatar: p.avatar_url, role: row.role, active: row.active, skills: p.skills ?? [], about: p.about
  }
}
const PROFILE_COLS = 'id,full_name,job_title,department,rating,presence,avatar_url,skills,about,last_seen'

export async function listMembers(ws: string): Promise<Member[]> {
  if (DEMO) return demoMembers
  const { data, error } = await supabase.from('workspace_members')
    .select(`role,active,profiles(${PROFILE_COLS})`).eq('workspace_id', ws).order('created_at')
  if (error) throw new Error(error.message)
  return (data ?? []).filter((r: any) => r.profiles).map(map)
}

export async function getMember(ws: string, id: string): Promise<MemberDetail> {
  if (DEMO) {
    const m = demoMembers.find(x => x.id === id) ?? demoMembers[0]
    return { ...m, lastSeen: null, tasks: [], projects: [], private: null }
  }
  const [mem, tasks, projects, priv] = await Promise.all([
    supabase.from('workspace_members').select(`role,active,profiles(${PROFILE_COLS})`).eq('workspace_id', ws).eq('user_id', id).single(),
    supabase.from('task_assignees').select('tasks(id,title,status,progress,due_at)').eq('user_id', id),
    supabase.from('project_members').select('projects(id,name)').eq('user_id', id),
    supabase.from('profile_private').select('phone,email,address,emergency_contact,notes').eq('profile_id', id).maybeSingle()
  ])
  const failed = [mem, tasks, projects, priv].find(r => r.error)
  if (failed?.error) throw new Error(failed.error.message)
  const row: any = mem.data
  return {
    ...map(row), lastSeen: row.profiles.last_seen,
    tasks: (tasks.data ?? []).map((r: any) => r.tasks).filter(Boolean)
      .map((t: any) => ({ id: t.id, title: t.title, status: t.status, progress: t.progress, due: t.due_at })),
    projects: (projects.data ?? []).map((r: any) => r.projects).filter(Boolean),
    private: priv.data ?? null // RLS returns nothing unless self or has team.view_private
  }
}

export interface InviteInput { email: string; fullName: string; phone: string; jobTitle: string; department: string }
export interface InviteOptions { codeMode: 'random' | 'custom'; code?: string; ttlMinutes: number; maxAttempts: number; sendEmail: boolean }
export interface InviteResult { ok: boolean; code: string; teamUrl: string | null; expiresAt: string; maxAttempts: number; codeMode: 'random' | 'custom'; emailSent: boolean; note: string }
export type InviteStatus = 'joined' | 'pending' | 'expired' | 'locked' | 'revoked' | 'not_registered'
export interface InviteRow { email: string; fullName: string | null; phone: string | null; invitedAt: string; status: InviteStatus; lastSignIn: string | null; expiresAt: string | null; attempts: number; maxAttempts: number | null; codeMode: string | null }

// Add Member -> details -> code -> email-bound invitation. The code is returned ONCE; the database keeps only a hash.
export async function inviteMember(ws: string, i: InviteInput, o: InviteOptions): Promise<InviteResult> {
  if (DEMO) return { ok: true, code: 'DEMO-1234', teamUrl: null, expiresAt: new Date(Date.now() + 86400000).toISOString(), maxAttempts: 5, codeMode: 'random', emailSent: false, note: 'Demo mode' }
  return callFn<InviteResult>('invite-member', { workspaceId: ws, action: 'create', email: i.email, fullName: i.fullName, phone: i.phone, jobTitle: i.jobTitle, department: i.department, ...o })
}
export async function revokeInvite(ws: string, email: string) { await callFn('invite-member', { workspaceId: ws, action: 'revoke', email }) }
export async function listInvites(ws: string): Promise<InviteRow[]> {
  if (DEMO) return []
  const { data, error } = await supabase.rpc('list_invites', { ws })
  if (error) throw new Error(error.message.includes('schema cache') ? 'Database function missing. Run the latest SQL (migration 0012 / the Upgrade SQL).' : error.message)
  return (data ?? []).map((r: any) => ({ email: r.email, fullName: r.full_name, phone: r.phone, invitedAt: r.invited_at, status: r.status, lastSignIn: r.last_sign_in_at, expiresAt: r.expires_at, attempts: r.attempts ?? 0, maxAttempts: r.max_attempts, codeMode: r.code_mode }))
}

// ---- per-member access (Admin only; enforced by set_user_permission() in the database) ----
export async function getUserPermissions(ws: string, userId: string): Promise<string[]> {
  if (DEMO) return []
  const { data, error } = await supabase.from('user_permissions').select('permission').eq('workspace_id', ws).eq('user_id', userId)
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => r.permission)
}
export async function setUserPermission(ws: string, userId: string, perm: string, granted: boolean) {
  const { error } = await supabase.rpc('set_user_permission', { ws, target: userId, perm, granted })
  if (error) throw new Error(error.message)
}

// ---- personal links (shown inside the Team app) ----
export interface MemberLink { id: string; label: string; url: string }
export async function listMemberLinks(userId: string): Promise<MemberLink[]> {
  if (DEMO) return []
  const { data, error } = await supabase.from('member_links').select('id,label,url').eq('user_id', userId).order('created_at')
  if (error) throw new Error(error.message)
  return data ?? []
}
export async function addMemberLink(ws: string, userId: string, label: string, url: string) {
  const { error } = await supabase.from('member_links').insert({ workspace_id: ws, user_id: userId, label: label.trim(), url: url.trim() })
  if (error) throw new Error(error.message.includes('member_links_url_check') ? 'Links must start with https://' : error.message)
}
export async function removeMemberLink(id: string) {
  const { error } = await supabase.from('member_links').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function setMemberActive(ws: string, id: string, active: boolean) {
  if (DEMO) return
  const { error } = await supabase.from('workspace_members').update({ active }).eq('workspace_id', ws).eq('user_id', id)
  if (error) throw new Error(error.message)
}

export interface MemberEdit {
  fullName: string; jobTitle: string; department: string; skills: string; about: string
  rating: number | null; private: PrivateInfo
}
export async function updateMember(id: string, e: MemberEdit, can: { edit: boolean; rate: boolean; private: boolean }) {
  if (DEMO) return
  const patch: Record<string, unknown> = {}
  if (can.edit) Object.assign(patch, {
    full_name: e.fullName.trim(), job_title: e.jobTitle.trim() || null, department: e.department.trim() || null,
    skills: e.skills.split(',').map(s => s.trim()).filter(Boolean), about: e.about.trim() || null
  })
  if (can.rate) patch.rating = e.rating
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('profiles').update(patch).eq('id', id)
    if (error) throw new Error(error.message)
  }
  if (can.private) {
    const { error } = await supabase.from('profile_private').upsert({ profile_id: id, ...e.private, updated_at: new Date().toISOString() })
    if (error) throw new Error(error.message)
  }
}

const IMG = ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
export async function uploadAvatar(id: string, file: File) {
  if (!IMG.includes(file.type)) throw new Error('Use a PNG, JPG, GIF or WebP image.')
  if (file.size > 2 * 1024 * 1024) throw new Error('Image must be under 2 MB.')
  const ext = file.type.split('/')[1]
  const path = `${id}/avatar-${Date.now()}.${ext}`
  const up = await supabase.storage.from('avatars').upload(path, file, { contentType: file.type })
  if (up.error) throw new Error(up.error.message)
  const url = supabase.storage.from('avatars').getPublicUrl(path).data.publicUrl
  const { error } = await supabase.from('profiles').update({ avatar_url: url }).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function listAttendance(userId: string): Promise<AttendanceRow[]> {
  if (DEMO) return []
  const { data, error } = await supabase.from('attendance').select('id,clock_in,clock_out').eq('user_id', userId).order('clock_in', { ascending: false }).limit(30)
  if (error) throw new Error(error.message)
  return (data ?? []).map(r => ({ id: r.id, clockIn: r.clock_in, clockOut: r.clock_out }))
}
export async function clockIn(userId: string) {
  const { error } = await supabase.from('attendance').insert({ user_id: userId })
  if (error) throw new Error(error.message)
}
export async function clockOut(userId: string, rowId: string) {
  const { error } = await supabase.from('attendance').update({ clock_out: new Date().toISOString() }).eq('id', rowId).eq('user_id', userId)
  if (error) throw new Error(error.message)
}

export async function listMemberActivity(ws: string, userId: string): Promise<ActivityItem[]> {
  if (DEMO) return []
  const { data, error } = await supabase.from('activity_logs').select('id,action,meta,created_at')
    .eq('workspace_id', ws).eq('actor_id', userId).order('created_at', { ascending: false }).limit(25)
  if (error) throw new Error(error.message)
  return (data ?? []).map((a: any) => ({ id: a.id, action: a.action, title: a.meta?.title ?? null, at: a.created_at }))
}
