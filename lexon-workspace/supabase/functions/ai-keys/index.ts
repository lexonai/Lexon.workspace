// Stores AI/API keys in Vault (never in tables or the browser). Two scopes: workspace (assistant) and office.
import { assertPublicHttps, env, handle, HttpError, json, logIntegration, rateLimit, requireUser } from '../_shared/common.ts'

const KINDS = ['openai', 'gemini', 'anthropic', 'custom']
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)

Deno.serve((req) => handle(req, async () => {
  const b = await req.json()
  const { workspaceId, action } = b as { workspaceId: string; action: string }
  const scope = b.scope === 'office' ? 'office' : 'workspace'
  const { user, admin } = await requireUser(req, workspaceId, 'integrations.manage')
  await rateLimit(admin, `aikeys:${user.id}`, 40, 600)

  const providerFor = (id: string) => `ai_${scope}_${slug(id)}`
  const find = async (provider: string) => (await admin.from('integrations').select('id,config').eq('workspace_id', workspaceId).eq('provider', provider).maybeSingle()).data

  if (action === 'save') {
    const label = String(b.label ?? '').trim()
    const kind = String(b.kind ?? 'openai')
    const catalogId = String(b.catalogId ?? slug(label))
    const model = String(b.model ?? '').trim().slice(0, 100)
    const baseUrl = String(b.baseUrl ?? '').trim()
    const headerName = String(b.headerName ?? '').trim()
    const apiKey = String(b.apiKey ?? '').trim()
    if (!label || label.length > 60) throw new HttpError(400, 'Name is required (max 60 characters)')
    if (!KINDS.includes(kind)) throw new HttpError(400, 'Unknown API type')
    if (!b.noKey && (apiKey.length < 8 || apiKey.length > 600)) throw new HttpError(400, 'API key looks invalid')
    if (kind !== 'gemini' && kind !== 'anthropic' && !baseUrl) throw new HttpError(400, 'Endpoint / base URL is required')
    if (baseUrl) assertPublicHttps(baseUrl.replace('{account_id}', 'x'))
    if (headerName && !/^[A-Za-z0-9-]{1,40}$/.test(headerName)) throw new HttpError(400, 'Invalid header name')
    if (scope === 'workspace' && catalogId !== 'gemini' && kind === 'gemini') throw new HttpError(400, 'Use the Gemini card for Gemini keys')
    const provider = providerFor(catalogId)
    const { data: integ, error } = await admin.from('integrations').upsert({
      workspace_id: workspaceId, provider, status: 'connected', account_label: label, connected_by: user.id, connected_at: new Date().toISOString(), last_error: null,
      config: { scope, label, kind, baseUrl, model, headerName, catalogId, noKey: !!b.noKey }
    }, { onConflict: 'workspace_id,provider' }).select('id').single()
    if (error) throw new HttpError(500, error.message)
    await admin.rpc('set_integration_secret', { p_integration: integ.id, p_secret: JSON.stringify({ apiKey }) })
    await logIntegration(admin, integ.id, 'info', `Saved ${label} (${scope})`, { by: user.id })
    return json({ ok: true })
  }

  if (action === 'remove') {
    const provider = String(b.provider ?? '')
    if (!provider.startsWith(`ai_${scope}_`)) throw new HttpError(400, 'Invalid provider')
    const i = await find(provider)
    if (i) { await admin.rpc('delete_integration_secret', { p_integration: i.id }); await admin.from('integrations').delete().eq('id', i.id) }
    return json({ ok: true })
  }

  if (action === 'test') {
    const provider = String(b.provider ?? '')
    if (!provider.startsWith(`ai_${scope}_`)) throw new HttpError(400, 'Invalid provider')
    const i = await find(provider); if (!i) throw new HttpError(404, 'Not found')
    const c = i.config as any
    const { data: sec } = await admin.rpc('get_integration_secret', { p_integration: i.id })
    const key = sec ? JSON.parse(sec as string).apiKey as string : ''
    let url = '', headers: Record<string, string> = {}
    if (c.kind === 'gemini') { url = 'https://generativelanguage.googleapis.com/v1beta/models?pageSize=1'; headers = { 'x-goog-api-key': key } }
    else if (c.kind === 'anthropic') { url = 'https://api.anthropic.com/v1/models?limit=1'; headers = { 'x-api-key': key, 'anthropic-version': '2023-06-01' } }
    else if (c.kind === 'openai') { url = `${String(c.baseUrl).replace(/\/$/, '')}/models`; headers = c.headerName ? { [c.headerName]: key } : { Authorization: `Bearer ${key}` } }
    else return json({ ok: true, detail: 'Custom APIs are not tested automatically.' })
    assertPublicHttps(url)
    const r = await fetch(url, { headers, signal: AbortSignal.timeout(10000) }).catch((e) => { throw new HttpError(502, `Could not reach the API: ${e.message}`) })
    await admin.from('integrations').update({ last_error: r.ok ? null : `Test failed (${r.status})` }).eq('id', i.id)
    return json({ ok: r.ok, detail: r.ok ? 'Key accepted.' : `The provider answered ${r.status}. Check the key, endpoint and plan.` })
  }
  throw new HttpError(400, 'Unknown action')
}))
