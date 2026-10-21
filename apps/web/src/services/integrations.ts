import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { callFn } from '../lib/functions'

export interface Provider { key: string; name: string; desc: string; mode: 'oauth' | 'config' | 'builtin' | 'project' }
export const PROVIDERS: Provider[] = [
  { key: 'google', name: 'Google', desc: 'Google account identity', mode: 'oauth' },
  { key: 'github', name: 'GitHub', desc: 'Repositories and activity', mode: 'oauth' },
  { key: 'google_drive', name: 'Google Drive', desc: 'Files created by this app', mode: 'oauth' },
  { key: 'google_calendar', name: 'Google Calendar', desc: 'Read calendar events', mode: 'oauth' },
  { key: 'gmail', name: 'Gmail', desc: 'Read-only mail access', mode: 'oauth' },
  { key: 'supabase', name: 'Supabase', desc: 'Database, auth, storage and realtime of this workspace', mode: 'builtin' },
  { key: 'office', name: 'Lexon Office', desc: 'Office server (opens inside Workspace with single sign-on, no separate login)', mode: 'project' },
  { key: 'instagram', name: 'Instagram Automation', desc: 'Separate Supabase project for Lexon Automation', mode: 'project' },
  { key: 'youtube', name: 'YouTube Automation', desc: 'Separate Supabase project for YouTube analytics and AI', mode: 'project' },
  { key: 'webhooks', name: 'Webhooks', desc: 'Send workspace events to an HTTPS endpoint', mode: 'config' },
  { key: 'custom_api', name: 'Future APIs', desc: 'Any other API (stored as configuration, no secrets)', mode: 'config' }
]
export interface Integration {
  id: string; provider: string; status: string; scopes: string[]; accountLabel: string | null
  connectedAt: string | null; lastError: string | null; lastSyncAt: string | null; config: Record<string, any>
}
export interface IntegrationLog { id: string; level: string; message: string; at: string }

export async function listIntegrations(ws: string): Promise<Integration[]> {
  if (DEMO) return []
  const { data, error } = await supabase.from('integrations').select('id,provider,status,scopes,account_label,connected_at,last_error,last_sync_at,config').eq('workspace_id', ws)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({ id: r.id, provider: r.provider, status: r.status, scopes: r.scopes ?? [], accountLabel: r.account_label, connectedAt: r.connected_at, lastError: r.last_error, lastSyncAt: r.last_sync_at, config: r.config ?? {} }))
}
export async function listLogs(integrationId: string): Promise<IntegrationLog[]> {
  const { data, error } = await supabase.from('integration_logs').select('id,level,message,created_at').eq('integration_id', integrationId).order('created_at', { ascending: false }).limit(20)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({ id: r.id, level: r.level, message: r.message, at: r.created_at }))
}
export async function startConnect(workspaceId: string, provider: string): Promise<string> {
  return (await callFn<{ url: string }>('integrations-oauth', { action: 'start', workspaceId, provider })).url
}
export async function disconnect(workspaceId: string, provider: string) {
  await callFn('integrations-oauth', { action: 'disconnect', workspaceId, provider })
}
export async function saveConfig(ws: string, userId: string, provider: string, config: Record<string, string>) {
  const { error } = await supabase.from('integrations').upsert({ workspace_id: ws, provider, config, status: 'configured', connected_by: userId, connected_at: new Date().toISOString() }, { onConflict: 'workspace_id,provider' })
  if (error) throw new Error(error.message)
}

// Project links: the service key is sent once over TLS to the gateway function and stored in Vault. It is never kept in the browser.
export const linkProject = (workspaceId: string, project: string, url: string, serviceKey: string) => callFn('central-api', { service: 'automation', workspaceId, project, action: 'link', url, serviceKey })
export const unlinkProject = (workspaceId: string, project: string) => callFn('central-api', { service: 'automation', workspaceId, project, action: 'unlink' })

// YouTube + Instagram automation share ONE Supabase project (one URL, one service key, one database).
// The key is stored (encrypted in Vault) once per provider so every existing screen and the gateway keep working unchanged.
export const AUTOMATION_PROVIDERS = ['youtube', 'instagram'] as const
export async function linkAutomation(workspaceId: string, url: string, serviceKey: string) {
  const done: string[] = []
  try {
    for (const p of AUTOMATION_PROVIDERS) { await linkProject(workspaceId, p, url, serviceKey); done.push(p) }
  } catch (e) {
    // all-or-nothing: never leave only half of the shared backend linked
    for (const p of done) await unlinkProject(workspaceId, p).catch(() => {})
    throw e
  }
}
export async function unlinkAutomation(workspaceId: string) {
  for (const p of AUTOMATION_PROVIDERS) await unlinkProject(workspaceId, p)
}

// Lexon Office: URL of the Office server + SSO secret (same value as OFFICE_SSO_SECRET there). Stored in Vault by the office-sso function.
export const linkOffice = (workspaceId: string, url: string, secret: string) => callFn('central-api', { service: 'office', workspaceId, action: 'link', url, secret })
export const unlinkOffice = (workspaceId: string) => callFn('central-api', { service: 'office', workspaceId, action: 'unlink' })
export const pingOffice = (workspaceId: string) => callFn<{ ok: boolean }>('central-api', { service: 'office', workspaceId, action: 'status' })
