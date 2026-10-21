// Lexon Office = its OWN backend (own server + own database). Workspace reaches it ONLY through this module (via central-api).
//   link   (integrations.manage): save the Office server URL + SSO secret (secret goes to Vault, never to the browser)
//   unlink (integrations.manage)
//   status (needs office.access)  : is Office linked and reachable?
//   token  (needs office.access)  : returns { url, token } - the browser opens Office with ?officeToken=<token>
// Office has NO sign-up, login or password. A person gets in only with: a valid Workspace session + active membership + office.access.
import { audit, HttpError, json, logIntegration, rateLimit, requireMember, withTimeout } from './common.ts'
type Admin = Awaited<ReturnType<typeof requireMember>>['admin']

async function creds(admin: Admin, workspaceId: string) {
  const { data: integ } = await admin.from('integrations').select('id,status,config').eq('workspace_id', workspaceId).eq('provider', 'office').maybeSingle()
  if (!integ || integ.status !== 'connected') throw new HttpError(400, 'Lexon Office is not linked. An Admin links it in Integrations, Lexon Office.')
  const { data } = await admin.rpc('get_integration_secret', { p_integration: integ.id })
  if (!data) throw new HttpError(400, 'Lexon Office is not linked')
  return { integ, ...(JSON.parse(data as string) as { url: string; secret: string }) }
}
const ssoCall = (url: string, secret: string, username: string, role: string) =>
  fetch(`${url}/api/sso`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ secret, username, role }), signal: AbortSignal.timeout(10000) })

export async function officeAction(req: Request, b: Record<string, any>): Promise<Response> {
  const workspaceId = String(b.workspaceId ?? ''); if (!workspaceId) throw new HttpError(400, 'workspaceId required')
  const { user, userClient, admin } = await requireMember(req, workspaceId)
  const { data: mem } = await admin.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).eq('active', true).maybeSingle()
  const role = String(mem?.role ?? '')
  const has = async (perm: string) => !!(await userClient.rpc('has_permission', { ws: workspaceId, perm })).data

  if (b.action === 'link' || b.action === 'unlink') {
    if (!(await has('integrations.manage'))) throw new HttpError(403, 'Only Admins can link Office')
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

  // status + token need the Office permission (Admins always have it; Team Members only when an Admin granted office.access)
  if (!(await has('office.access'))) throw new HttpError(403, 'You do not have access to Lexon Office. Ask an Admin to grant it.')
  const { integ, url, secret } = await creds(admin, workspaceId)
  if (b.action === 'status') {
    const r = await ssoCall(url, secret, 'status-check', 'viewer').catch(() => null)
    const ok = !!r && r.ok
    await admin.from('integrations').update({ last_error: ok ? null : 'Office is not reachable or rejected the secret' }).eq('id', integ.id)
    return json({ ok, url })
  }
  if (b.action === 'token') {
    await rateLimit(admin, `office-token:${user.id}`, 30, 60)
    // Office roles: owner/admin from the Workspace role; Team Members are read-only unless an Admin also granted office.edit.
    const officeRole = role === 'owner' ? 'owner' : role === 'admin' ? 'admin' : (await has('office.edit')) ? 'admin' : 'viewer'
    const name = String(user.email ?? user.id).slice(0, 40)
    const r = await withTimeout(ssoCall(url, secret, name, officeRole), 12000, 'Lexon Office').catch((e) => { if (e instanceof HttpError) throw e; throw new HttpError(502, `Office is not reachable: ${e.message}`) })
    if (!r.ok) throw new HttpError(502, r.status === 401 ? 'Office rejected the SSO secret. Re-link Office.' : `Office answered ${r.status}`)
    const j = await r.json()
    await audit(admin, user.id, 'office_sso', req)
    return json({ url, token: j.token, role: j.role })
  }
  throw new HttpError(400, 'Unknown action')
}
