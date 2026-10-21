// POST (service key, from Workspace gateway): {action:'start'} -> Google consent URL, {action:'disconnect'}.
// GET (PUBLIC, verify_jwt=false): Google redirects here with ?code&state; trust = HMAC-signed state.
import { db, delSecret, env, HttpError, json, opt, readState, requireService, run, setSecret, signState } from '../_shared/e.ts'

const SCOPES = ['https://www.googleapis.com/auth/youtube.readonly', 'https://www.googleapis.com/auth/yt-analytics.readonly']
const redirectUri = () => `${env('SUPABASE_URL')}/functions/v1/youtube-oauth`

Deno.serve((req) => run(async () => {
  if (req.method === 'GET') {
    const u = new URL(req.url)
    const back = (q: string) => Response.redirect(`${opt('WORKSPACE_URL') || env('WORKSPACE_URL')}/#/automations/youtube?${q}`, 302)
    const st = await readState(u.searchParams.get('state') ?? '')
    if (!st || st.k !== 'yt') return back('error=' + encodeURIComponent('Invalid or expired link. Press Connect again.'))
    if (u.searchParams.get('error') || !u.searchParams.get('code')) return back('error=' + encodeURIComponent(u.searchParams.get('error') ?? 'cancelled'))
    const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ code: u.searchParams.get('code')!, client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), redirect_uri: redirectUri(), grant_type: 'authorization_code' }) })
    const j = await r.json()
    if (!r.ok || !j.refresh_token) return back('error=' + encodeURIComponent(j.error_description ?? 'Google did not return a refresh token. Remove the app at myaccount.google.com/permissions and connect again.'))
    const c = db()
    await setSecret(c, 'google_refresh', j.refresh_token)
    let label: string | null = null, channelId: string | null = null
    const ch = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', { headers: { Authorization: `Bearer ${j.access_token}` } }).then(x => x.json()).catch(() => null)
    if (ch?.items?.[0]) { label = ch.items[0].snippet?.title ?? null; channelId = ch.items[0].id }
    await c.from('youtube_connection').upsert({ id: 1, status: 'connected', account_label: label, channel_id: channelId, scopes: String(j.scope ?? '').split(' '), connected_at: new Date().toISOString(), last_error: null })
    return back('connected=1')
  }
  requireService(req)
  const b = await req.json().catch(() => ({})) as { action?: string }
  if (b.action === 'start') {
    const state = await signState({ k: 'yt' })
    return json({ url: 'https://accounts.google.com/o/oauth2/v2/auth?' + new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), redirect_uri: redirectUri(), response_type: 'code', scope: SCOPES.join(' '), access_type: 'offline', prompt: 'consent', state }) })
  }
  if (b.action === 'disconnect') {
    const c = db(); await delSecret(c, 'google_refresh')
    await c.from('youtube_connection').upsert({ id: 1, status: 'disconnected', account_label: null, channel_id: null, scopes: [], last_error: null })
    return json({ ok: true })
  }
  throw new HttpError(400, 'Unknown action')
}))
