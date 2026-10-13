// OAuth connect / callback / disconnect. Tokens go straight to Supabase Vault; the browser never sees them.
import { adminClient, env, handle, HttpError, json, logIntegration, requireUser } from '../_shared/common.ts'

const GOOGLE = { auth: 'https://accounts.google.com/o/oauth2/v2/auth', token: 'https://oauth2.googleapis.com/token' }
const P: Record<string, { kind: 'google' | 'github'; scopes: string[] }> = {
  google: { kind: 'google', scopes: ['openid', 'email', 'profile'] },
  google_drive: { kind: 'google', scopes: ['openid', 'email', 'https://www.googleapis.com/auth/drive.file'] },
  google_calendar: { kind: 'google', scopes: ['openid', 'email', 'https://www.googleapis.com/auth/calendar.readonly'] },
  gmail: { kind: 'google', scopes: ['openid', 'email', 'https://www.googleapis.com/auth/gmail.readonly'] },
  github: { kind: 'github', scopes: ['read:user', 'repo'] }
}
const redirectUri = () => `${env('SUPABASE_URL')}/functions/v1/integrations-oauth`

// --- signed state (CSRF protection) ---
const enc = new TextEncoder()
const b64url = (s: string) => s.replace(/[+/=]/g, c => ({ '+': '-', '/': '_', '=': '' }[c]!))
async function hmac(data: string) {
  const key = await crypto.subtle.importKey('raw', enc.encode(env('OAUTH_STATE_SECRET')), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data))))))
}
async function makeState(payload: Record<string, unknown>) {
  const body = b64url(btoa(JSON.stringify({ ...payload, exp: Date.now() + 10 * 60000 })))
  return `${body}.${await hmac(body)}`
}
async function readState(state: string) {
  const [body, sig] = state.split('.')
  if (!body || !sig || sig !== await hmac(body)) throw new HttpError(400, 'Invalid state')
  const p = JSON.parse(atob(body.replace(/-/g, '+').replace(/_/g, '/')))
  if (p.exp < Date.now()) throw new HttpError(400, 'Link expired. Try connecting again.')
  return p as { ws: string; provider: string; uid: string }
}

Deno.serve((req) => handle(req, async () => {
  const url = new URL(req.url)

  // ---- OAuth callback (browser redirect from provider) ----
  if (req.method === 'GET' && (url.searchParams.get('code') || url.searchParams.get('error'))) {
    const appUrl = env('APP_URL').replace(/\/$/, '')
    const back = (q: string) => Response.redirect(`${appUrl}/#/integrations?${q}`, 302)
    try {
      if (url.searchParams.get('error')) return back(`error=${encodeURIComponent(url.searchParams.get('error')!)}`)
      const st = await readState(url.searchParams.get('state') ?? '')
      const cfg = P[st.provider]; if (!cfg) throw new HttpError(400, 'Unknown provider')
      const admin = adminClient()
      let tokens: Record<string, unknown>, label = ''
      if (cfg.kind === 'google') {
        const r = await fetch(GOOGLE.token, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code: url.searchParams.get('code')!, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: redirectUri(), grant_type: 'authorization_code' }) })
        const j = await r.json(); if (!r.ok) throw new HttpError(400, j.error_description ?? 'Token exchange failed')
        if (!j.refresh_token) throw new HttpError(400, 'No refresh token returned. Remove the app from your Google account permissions and reconnect.')
        tokens = { refresh_token: j.refresh_token, access_token: j.access_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000, scope: j.scope }
        const u = await (await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${j.access_token}` } })).json()
        label = u.email ?? ''
      } else {
        const r = await fetch('https://github.com/login/oauth/access_token', { method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: env('GITHUB_CLIENT_ID'), client_secret: env('GITHUB_CLIENT_SECRET'), code: url.searchParams.get('code'), redirect_uri: redirectUri() }) })
        const j = await r.json(); if (!j.access_token) throw new HttpError(400, j.error_description ?? 'Token exchange failed')
        tokens = { access_token: j.access_token, scope: j.scope }
        const u = await (await fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${j.access_token}`, 'User-Agent': 'lexon-workspace' } })).json()
        label = u.login ?? ''
      }
      const { data: integ, error } = await admin.from('integrations').upsert({
        workspace_id: st.ws, provider: st.provider, status: 'connected', scopes: cfg.scopes, account_label: label,
        connected_by: st.uid, connected_at: new Date().toISOString(), last_error: null
      }, { onConflict: 'workspace_id,provider' }).select('id').single()
      if (error) throw new HttpError(500, error.message)
      await admin.rpc('set_integration_secret', { p_integration: integ.id, p_secret: JSON.stringify(tokens) })
      await logIntegration(admin, integ.id, 'info', `Connected ${st.provider}`, { account: label })
      return back(`connected=${st.provider}`)
    } catch (e) {
      return back(`error=${encodeURIComponent(e instanceof Error ? e.message : 'failed')}`)
    }
  }

  // ---- Authenticated actions from the app ----
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const { action, workspaceId, provider } = await req.json() as { action: string; workspaceId: string; provider: string }
  const { user, admin } = await requireUser(req, workspaceId, 'integrations.manage')
  const cfg = P[provider]; if (!cfg) throw new HttpError(400, 'Unsupported provider')

  if (action === 'start') {
    const state = await makeState({ ws: workspaceId, provider, uid: user.id })
    const q = cfg.kind === 'google'
      ? new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: redirectUri(), response_type: 'code', scope: cfg.scopes.join(' '), access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true', state })
      : new URLSearchParams({ client_id: env('GITHUB_CLIENT_ID'), redirect_uri: redirectUri(), scope: cfg.scopes.join(' '), state })
    return json({ url: `${cfg.kind === 'google' ? GOOGLE.auth : 'https://github.com/login/oauth/authorize'}?${q}` })
  }
  if (action === 'disconnect') {
    const { data: integ } = await admin.from('integrations').select('id').eq('workspace_id', workspaceId).eq('provider', provider).maybeSingle()
    if (!integ) return json({ ok: true })
    if (cfg.kind === 'google') {
      const { data: sec } = await admin.rpc('get_integration_secret', { p_integration: integ.id })
      try { const t = sec ? JSON.parse(sec as string) : null; if (t?.refresh_token) await fetch(`https://oauth2.googleapis.com/revoke?token=${t.refresh_token}`, { method: 'POST' }) } catch { /* best effort */ }
    }
    await admin.rpc('delete_integration_secret', { p_integration: integ.id })
    await admin.from('integrations').update({ status: 'disconnected', account_label: null, scopes: [], last_error: null }).eq('id', integ.id)
    await logIntegration(admin, integ.id, 'info', `Disconnected ${provider}`, { by: user.id })
    return json({ ok: true })
  }
  throw new HttpError(400, 'Unknown action')
}))
