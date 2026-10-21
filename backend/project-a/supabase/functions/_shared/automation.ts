// Workspace -> Automation (separate Supabase project: YouTube + Instagram). Reached ONLY through central-api (or the legacy project-gateway wrapper).
// - Browser talks to this function with its Workspace JWT.
// - This function verifies the JWT + permission, then uses the linked project's service key (kept in Vault).
// - Only whitelisted tables, columns of operations and functions are reachable.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, HttpError, json, logIntegration, rateLimit, requireUser, withTimeout } from './common.ts'

interface Spec { perm: string; tables: string[]; writable: string[]; fns: string[] }
const PROJECTS: Record<string, Spec> = {
  youtube: { perm: 'automations.manage', tables: ['youtube_videos', 'youtube_channel_snapshots', 'youtube_ai_outputs', 'youtube_connection'], writable: [], fns: ['youtube-oauth', 'youtube-sync', 'youtube-ai'] },
  instagram: { perm: 'automations.manage', tables: ['ig_accounts', 'ig_automations', 'ig_keywords', 'ig_comment_replies', 'ig_events', 'ig_stats', 'ig_logs'], writable: [], fns: ['ig-api'] }
}
const COL = /^[a-z_][a-z0-9_]*$/

async function creds(admin: ReturnType<typeof adminClient>, workspaceId: string, project: string) {
  const { data: integ } = await admin.from('integrations').select('id,status,config').eq('workspace_id', workspaceId).eq('provider', project).maybeSingle()
  if (!integ || integ.status !== 'connected') throw new HttpError(400, `${project} project is not linked`)
  const { data } = await admin.rpc('get_integration_secret', { p_integration: integ.id })
  if (!data) throw new HttpError(400, `${project} project is not linked`)
  const c = JSON.parse(data as string) as { url: string; key: string }
  return { integ, ...c }
}

export async function automationAction(req: Request, b: Record<string, any>): Promise<Response> {
  const { workspaceId, project, action } = b as { workspaceId: string; project: string; action: string }
  const spec = PROJECTS[project]; if (!spec) throw new HttpError(400, 'Unknown project')

  // ---- link / unlink: owner-level permission ----
  if (action === 'link' || action === 'unlink') {
    const { user, admin } = await requireUser(req, workspaceId, 'integrations.manage')
    await rateLimit(admin, `link:${user.id}`, 10, 600)
    if (action === 'unlink') {
      const { data: integ } = await admin.from('integrations').select('id').eq('workspace_id', workspaceId).eq('provider', project).maybeSingle()
      if (integ) { await admin.rpc('delete_integration_secret', { p_integration: integ.id }); await admin.from('integrations').update({ status: 'disconnected', account_label: null, last_error: null }).eq('id', integ.id); await logIntegration(admin, integ.id, 'info', `Unlinked ${project}`, { by: user.id }) }
      return json({ ok: true })
    }
    const url = String(b.url ?? '').trim().replace(/\/$/, ''); const key = String(b.serviceKey ?? '').trim()
    if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url)) throw new HttpError(400, 'Project URL must look like https://<ref>.supabase.co')
    if (key.length < 40) throw new HttpError(400, 'Service role key looks invalid')
    const probe = await withTimeout(createClient(url, key, { auth: { persistSession: false } }).from(spec.tables[0]).select('*', { head: true, count: 'exact' }), 10000, 'The Automation project')
    if (probe.error) throw new HttpError(400, `Could not reach the project or the schema is not installed: ${probe.error.message}`)
    const { data: integ, error } = await admin.from('integrations').upsert({
      workspace_id: workspaceId, provider: project, status: 'connected', account_label: new URL(url).host, connected_by: user.id, connected_at: new Date().toISOString(), last_error: null
    }, { onConflict: 'workspace_id,provider' }).select('id').single()
    if (error) throw new HttpError(500, error.message)
    await admin.rpc('set_integration_secret', { p_integration: integ.id, p_secret: JSON.stringify({ url, key }) })
    await logIntegration(admin, integ.id, 'info', `Linked ${project} project`, { host: new URL(url).host, by: user.id })
    return json({ ok: true })
  }

  // ---- data / function access ----
  const { user, admin } = await requireUser(req, workspaceId, spec.perm)
  await rateLimit(admin, `gw:${user.id}`, 120, 60)
  const { integ, url, key } = await creds(admin, workspaceId, project)
  const remote = createClient(url, key, { auth: { persistSession: false } })

  if (action === 'select') {
    const table = String(b.table)
    if (!spec.tables.includes(table)) throw new HttpError(403, 'Table not allowed')
    let q = remote.from(table).select('*').limit(Math.min(Number(b.limit) || 100, 500))
    if (b.order && COL.test(String(b.order))) q = q.order(String(b.order), { ascending: !!b.ascending, nullsFirst: false })
    for (const [c, v] of Object.entries((b.eq ?? {}) as Record<string, string>)) if (COL.test(c)) q = q.eq(c, v)
    const { data, error } = await withTimeout(q, 10000, 'The Automation project')
    if (error) throw new HttpError(502, error.message)
    return json({ data })
  }
  if (action === 'upsert') {
    const table = String(b.table)
    if (!spec.writable.includes(table)) throw new HttpError(403, 'Table is read-only from Workspace')
    const rows = Array.isArray(b.rows) ? b.rows.slice(0, 100) : []
    const { error } = await remote.from(table).upsert(rows)
    if (error) throw new HttpError(502, error.message)
    return json({ ok: true })
  }
  if (action === 'invoke') {
    const fn = String(b.fn)
    if (!spec.fns.includes(fn)) throw new HttpError(403, 'Function not allowed')
    const r = await fetch(`${url}/functions/v1/${fn}`, { method: 'POST', headers: { Authorization: `Bearer ${key}`, apikey: key, 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(b.payload ?? {}), actor: user.id }), signal: AbortSignal.timeout(90000) }).catch((e) => { throw new HttpError(504, `Automation worker "${fn}" did not finish: ${(e as Error).message}. Workspace and Team are not affected.`) })
    const out = await r.json().catch(() => ({}))
    const pl = (b.payload ?? {}) as Record<string, unknown>
    const label = fn === 'ig-api' ? `Instagram ${String(((b.payload ?? {}) as any).action ?? '')}` : fn === 'youtube-sync' ? 'YouTube sync' : fn === 'youtube-ai' ? `AI Studio (${String(pl.kind ?? '')})` : fn === 'youtube-oauth' ? `Google account ${pl.action === 'disconnect' ? 'disconnect' : 'connect'}` : fn
    const quiet = (fn === 'youtube-oauth' && pl.action === 'start') || (fn === 'ig-api' && ['status', 'list', 'get', 'media', 'connect_url'].includes(String(pl.action)))
    if (!quiet) {
      await admin.from('automation_logs').insert({ workspace_id: workspaceId, source: project, level: r.ok ? 'info' : 'error', event: fn,
        message: r.ok ? `${label} completed${fn === 'youtube-sync' ? `: ${out.videos ?? 0} videos` : ''}` : `${label} failed: ${out.error ?? r.status}`, meta: { by: user.id } })
    }
    if (!r.ok) throw new HttpError(r.status === 401 ? 502 : r.status, out.error ?? `Remote function failed (${r.status})`)
    await admin.from('integrations').update({ last_sync_at: new Date().toISOString() }).eq('id', integ.id)
    return json(out)
  }

  // ---- connection test: verifies credentials and that every whitelisted table exists ----
  if (action === 'ping') {
    const results: Record<string, string> = {}
    for (const t of spec.tables) { const r = await withTimeout(remote.from(t).select('*', { head: true, count: 'exact' }), 10000, 'The Automation project').catch((e) => ({ error: { message: (e as Error).message } })); results[t] = r.error ? r.error.message : 'ok' }
    const bad = Object.entries(results).filter(([, v]) => v !== 'ok')
    await admin.from('integrations').update({ last_error: bad.length ? `Missing/blocked: ${bad.map(([k]) => k).join(', ')}` : null }).eq('id', integ.id)
    return json({ ok: bad.length === 0, tables: results })
  }

  // ---- pull new events from the project into Workspace activity (unified feed) ----
  if (action === 'pull_events') {
    const since = (integ.config as any)?.last_event_at ?? new Date(Date.now() - 7 * 86400000).toISOString()
    let rows: { level: string; event: string; message: string; at: string }[] = []
    if (project === 'instagram') {
      const r = await withTimeout(remote.from('ig_logs').select('level,event,message,created_at').gt('created_at', since).order('created_at').limit(100), 10000, 'The Automation project')
      if (r.error) throw new HttpError(502, r.error.message)
      rows = (r.data ?? []).map((x: any) => ({ level: x.level, event: x.event, message: x.message ?? x.event, at: x.created_at }))
    }
    if (rows.length) {
      await admin.from('automation_logs').insert(rows.map(x => ({ workspace_id: workspaceId, source: project, level: x.level, event: x.event, message: x.message, created_at: x.at })))
      await admin.from('integrations').update({ config: { ...(integ.config as object ?? {}), last_event_at: rows[rows.length - 1].at } }).eq('id', integ.id)
    }
    return json({ pulled: rows.length })
  }
  throw new HttpError(400, 'Unknown action')
}
