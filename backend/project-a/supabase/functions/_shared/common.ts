// Shared helpers for Edge Functions (Deno).
import { createClient, type SupabaseClient, type User } from 'https://esm.sh/@supabase/supabase-js@2'

// ALLOWED_ORIGINS = comma separated list (Workspace URL, Team URL, desktop lexon://app). Never '*'.
const allowed = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(s => s.trim()).filter(Boolean)
let currentOrigin = ''
export const cors: Record<string, string> = {
  get 'Access-Control-Allow-Origin'() { return allowed.includes(currentOrigin) ? currentOrigin : (allowed[0] ?? 'null') },
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
  'Vary': 'Origin'
} as unknown as Record<string, string>
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg) } }
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

export const env = (k: string) => { const v = Deno.env.get(k); if (!v) throw new HttpError(500, `Missing server secret: ${k}`); return v }

export function adminClient(): SupabaseClient {
  return createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'))
}

// Verifies the caller's JWT and that they hold `permission` in the workspace. Never trusts the browser.
export async function requireUser(req: Request, workspaceId: string, permission: string): Promise<{ user: User; admin: SupabaseClient }> {
  const auth = req.headers.get('Authorization') ?? ''
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) throw new HttpError(401, 'Not signed in')
  const { data: ok, error: e2 } = await userClient.rpc('has_permission', { ws: workspaceId, perm: permission })
  if (e2 || !ok) throw new HttpError(403, 'You do not have permission for this action')
  return { user: data.user, admin: adminClient() }
}

export async function handle(req: Request, fn: () => Promise<Response>): Promise<Response> {
  currentOrigin = req.headers.get('Origin') ?? ''
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try { return await fn() } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error(e)
    return json({ error: 'Internal error' }, 500)
  }
}

// Google access token from the refresh token stored in Vault.
export async function googleAccessToken(admin: SupabaseClient, integrationId: string): Promise<string> {
  const { data, error } = await admin.rpc('get_integration_secret', { p_integration: integrationId })
  if (error || !data) throw new HttpError(400, 'Integration is not connected')
  const tok = JSON.parse(data as string)
  if (tok.access_token && tok.expires_at && tok.expires_at > Date.now() + 60000) return tok.access_token
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: tok.refresh_token, grant_type: 'refresh_token' })
  })
  const j = await res.json()
  if (!res.ok) {
    await admin.from('integrations').update({ status: 'error', last_error: j.error_description ?? j.error ?? 'Token refresh failed' }).eq('id', integrationId)
    throw new HttpError(400, 'Google token refresh failed. Reconnect the integration.')
  }
  const next = { ...tok, access_token: j.access_token, expires_at: Date.now() + (j.expires_in ?? 3600) * 1000 }
  await admin.rpc('set_integration_secret', { p_integration: integrationId, p_secret: JSON.stringify(next) })
  return j.access_token
}

export async function logIntegration(admin: SupabaseClient, integrationId: string, level: string, message: string, meta: Record<string, unknown> = {}) {
  await admin.from('integration_logs').insert({ integration_id: integrationId, level, message, meta })
}

// Fixed-window rate limit stored in Postgres. Throws 429 when exceeded.
export async function rateLimit(admin: SupabaseClient, key: string, max: number, windowSeconds: number) {
  const { data, error } = await admin.rpc('rate_limit_hit', { p_key: key, p_max: max, p_window_seconds: windowSeconds })
  if (error) throw new HttpError(500, 'Rate limiter unavailable')
  if (!data) throw new HttpError(429, 'Too many requests. Slow down and try again shortly.')
}

// Any active workspace member (used by the assistant). RLS-bound client is returned so queries respect the user's access.
export async function requireMember(req: Request, workspaceId: string): Promise<{ user: User; userClient: SupabaseClient; admin: SupabaseClient }> {
  const auth = req.headers.get('Authorization') ?? ''
  const userClient = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: auth } } })
  const { data, error } = await userClient.auth.getUser()
  if (error || !data.user) throw new HttpError(401, 'Not signed in')
  const { data: ok } = await userClient.rpc('is_member', { ws: workspaceId })
  if (!ok) throw new HttpError(403, 'Not a member of this workspace')
  return { user: data.user, userClient, admin: adminClient() }
}

// Blocks private/internal hosts so user-supplied API endpoints cannot be used to reach internal services.
export function assertPublicHttps(raw: string): URL {
  let u: URL
  try { u = new URL(raw) } catch { throw new HttpError(400, 'Invalid URL') }
  const h = u.hostname.toLowerCase()
  const priv = h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === '::1' || h.startsWith('[')
  if (u.protocol !== 'https:' || priv) throw new HttpError(400, 'Endpoint must be a public https:// URL')
  return u
}

// ---- v5 additions ----
export const clientIp = (req: Request) => (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || 'unknown'

// Rejects when the promise does not settle in time. Used so a slow/dead Automation or Office backend can never hang Workspace.
export function withTimeout<T>(p: PromiseLike<T>, ms: number, what: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new HttpError(504, `${what} did not answer in time. Workspace and Team are not affected.`)), ms)
    Promise.resolve(p).then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })
}

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
export { escapeHtml }

// Optional transactional email through Resend (https://resend.com). Returns false when not configured or when sending fails.
export async function sendMail(to: string, subject: string, html: string, text: string): Promise<{ ok: boolean; note?: string }> {
  const key = Deno.env.get('RESEND_API_KEY'); const from = Deno.env.get('MAIL_FROM')
  if (!key || !from) return { ok: false, note: 'Email is not configured (RESEND_API_KEY / MAIL_FROM). Share the link and code yourself.' }
  try {
    const r = await fetch('https://api.resend.com/emails', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [to], subject, html, text }), signal: AbortSignal.timeout(10000) })
    if (!r.ok) return { ok: false, note: `Email provider answered ${r.status}.` }
    return { ok: true }
  } catch (e) { return { ok: false, note: `Email could not be sent: ${(e as Error).message}` } }
}

// Writes to the caller-visible security log (service role). Never throws.
export async function audit(admin: SupabaseClient, userId: string | null, event: string, req?: Request) {
  try { await admin.from('security_events').insert({ user_id: userId, event, user_agent: req?.headers.get('user-agent')?.slice(0, 200) ?? null }) } catch { /* bookkeeping only */ }
}
