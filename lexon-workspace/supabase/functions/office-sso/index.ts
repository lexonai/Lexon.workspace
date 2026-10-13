// Single sign-on from Lexon Workspace into Lexon Office. Office has NO login or password of its own.
//   link   (integrations.manage): save the Office server URL + SSO secret (secret goes to Vault, never to the browser)
//   unlink (integrations.manage)
//   status (any active member): is Office linked and reachable?
//   token  (any active member): returns { url, token } - the browser opens Office with ?officeToken=<token>
import { handle, HttpError, json, logIntegration, rateLimit, requireMember } from '../_shared/common.ts'
type Admin = Awaited<ReturnType<typeof requireMember>>['admin']

const ROLE: Record<string, string> = { owner: 'owner', admin: 'admin', manager: 'admin', member: 'admin', agent: 'viewer' }

async function creds(admin: Admin, workspaceId: string) {
  const { data: integ } = await admin.from('integrations').select('id,status,config').eq('workspace_id', workspaceId).eq('provider', 'office').maybeSingle()
  if (!integ || integ.status !== 'connected') throw new HttpError(400, 'Lexon Office is not linked. An Admin links it in Integrations, Lexon Office.')
  const { data } = await admin.rpc('get_integration_secret', { p_integration: integ.id })
  if (!data) throw new HttpError(400, 'Lexon Office is not linked')
  return { integ, ...(JSON.parse(data as string) as { url: string; secret: string }) }
}
const ssoCall = (url: string, secret: string, username: string, role: string) =>
  fetch(`${url}/api/sso`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, username, role }), signal: AbortSignal.timeout(10000) })

Deno.serve((req) => handle(req, async () => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const b = await req.json().catch(() => ({})) as Record<string, any>
  const workspaceId = String(b.workspaceId ?? ''); if (!workspaceId) throw new HttpError(400, 'workspaceId required')
  const { user, userClient, admin } = await requireMember(req, workspaceId)
  const { data: mem } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle()
  const role = String(mem?.role ?? 'agent')

  if (b.action === 'link' || b.action === 'unlink') {
    const { data: ok } = await userClient.rpc('has_permission', { ws: workspaceId, perm: 'integrations.manage' })
    if (!ok) throw new HttpError(403, 'Only Admins can link Office')
    await rateLimit(admin, `office-link:${user.id}`, 10, 600)
    const { data: integ0 } = await admin.from('integrations').select('id').eq('workspace_id', workspaceId).eq('provider', 'office').maybeSingle()
    if (b.action === 'unlink') {
      if (integ0) { await admin.rpc('delete_integration_secret', { p_integration: integ0.id }); await admin.from('integrations').update({ status: 'disconnected', account_label: null, config: {}, last_error: null }).eq('id', integ0.id); await logIntegration(admin, integ0.id, 'info', 'Unlinked Office', { by: user.id }) }
      return json({ ok: true })
    }
    const url = String(b.url ?? '').trim().replace(/\/$/, ''); const secret = String(b.secret ?? '').trim()
    if (!/^https:\/\/[^\s/]+(\/[^\s]*)?$/.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/[^\s]*)?$/.test(url)) throw new HttpError(400, 'Office URL must start with https:// (http only for localhost)')
    if (secret.length < 24) throw new HttpError(400, 'SSO secret must be at least 24 characters (same value as OFFICE_SSO_SECRET on the Office server)')
    const probe = await ssoCall(url, secret, 'link-check', 'viewer').catch((e) => { throw new HttpError(400, `Could not reach Office at that URL: ${e.message}`) })
    if (probe.status === 401) throw new HttpError(400, 'Office rejected the SSO secret. It must equal OFFICE_SSO_SECRET on the Office server.')
    if (!probe.ok) throw new HttpError(400, `Office answered ${probe.status}. Check the URL.`)
    const { data: integ, error } = await admin.from('integrations').upsert({ workspace_id: workspaceId, provider: 'office', status: 'connected', account_label: new URL(url).host, config: { url }, connected_by: user.id, connected_at: new Date().toISOString(), last_error: null }, { onConflict: 'workspace_id,provider' }).select('id').single()
    if (error) throw new HttpError(500, error.message)
    await admin.rpc('set_integration_secret', { p_integration: integ.id, p_secret: JSON.stringify({ url, secret }) })
    await logIntegration(admin, integ.id, 'info', 'Linked Office', { host: new URL(url).host, by: user.id })
    return json({ ok: true })
  }

  const { integ, url, secret } = await creds(admin, workspaceId)
  if (b.action === 'status') {
    const r = await ssoCall(url, secret, 'status-check', 'viewer').catch(() => null)
    const ok = !!r && r.ok
    await admin.from('integrations').update({ last_error: ok ? null : 'Office is not reachable or rejected the secret' }).eq('id', integ.id)
    return json({ ok, url })
  }
  if (b.action === 'token') {
    await rateLimit(admin, `office-token:${user.id}`, 30, 60)
    const name = String(user.email ?? user.id).slice(0, 40)
    const r = await ssoCall(url, secret, name, ROLE[role] ?? 'viewer').catch((e) => { throw new HttpError(502, `Office is not reachable: ${e.message}`) })
    if (!r.ok) throw new HttpError(502, r.status === 401 ? 'Office rejected the SSO secret. Re-link Office.' : `Office answered ${r.status}`)
    const j = await r.json()
    return json({ url, token: j.token, role: j.role })
  }
  throw new HttpError(400, 'Unknown action')
}))
