// Shared helpers for the Automation project E (YouTube + Instagram). Deno / Supabase Edge Functions.
// E has no human users. Private functions are called ONLY by Workspace's project-gateway with E's service_role key.
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'

export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg) } }
export const env = (k: string) => { const v = Deno.env.get(k); if (!v) throw new HttpError(500, `Missing secret: ${k}`); return v }
export const opt = (k: string) => Deno.env.get(k) ?? ''
export const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json' } })
export const db = (): SupabaseClient => createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } })

// Private door: the caller must present E's service_role key (the gateway does). Constant-time compare.
export function requireService(req: Request) {
  const given = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  const want = env('SUPABASE_SERVICE_ROLE_KEY')
  if (given.length !== want.length) throw new HttpError(401, 'Unauthorized')
  let d = 0; for (let i = 0; i < want.length; i++) d |= given.charCodeAt(i) ^ want.charCodeAt(i)
  if (d !== 0) throw new HttpError(401, 'Unauthorized')
}
export async function run(fn: () => Promise<Response>): Promise<Response> {
  try { return await fn() } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status)
    console.error(e); return json({ error: 'Internal error' }, 500)
  }
}

// ---- Vault wrappers (see LEXON_CD_automation.sql) ----
export const setSecret = async (c: SupabaseClient, name: string, value: string) => { const { error } = await c.rpc('set_automation_secret', { p_name: name, p_secret: value }); if (error) throw new HttpError(500, error.message) }
export const getSecret = async (c: SupabaseClient, name: string): Promise<string | null> => { const { data, error } = await c.rpc('get_automation_secret', { p_name: name }); if (error) throw new HttpError(500, error.message); return (data as string | null) ?? null }
export const delSecret = async (c: SupabaseClient, name: string) => { await c.rpc('delete_automation_secret', { p_name: name }) }

// ---- HMAC-signed, expiring OAuth state (so the public callback can trust it without a session) ----
const enc = new TextEncoder()
const b64u = (b: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(b))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
async function hmac(secret: string, data: string) {
  const k = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return new Uint8Array(await crypto.subtle.sign('HMAC', k, enc.encode(data)))
}
export async function signState(payload: Record<string, unknown>, ttlMs = 10 * 60_000) {
  const body = b64u(enc.encode(JSON.stringify({ ...payload, exp: Date.now() + ttlMs, n: crypto.randomUUID() })))
  return `${body}.${b64u(await hmac(env('STATE_SECRET'), body))}`
}
export async function readState(state: string): Promise<Record<string, any> | null> {
  const [body, sig] = state.split('.'); if (!body || !sig) return null
  const want = b64u(await hmac(env('STATE_SECRET'), body))
  if (want.length !== sig.length) return null
  let d = 0; for (let i = 0; i < want.length; i++) d |= want.charCodeAt(i) ^ sig.charCodeAt(i)
  if (d !== 0) return null
  try { const p = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(body.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)))); return p.exp > Date.now() ? p : null } catch { return null }
}
export async function hmacHex(secret: string, data: string) { return [...(await hmac(secret, data))].map(x => x.toString(16).padStart(2, '0')).join('') }
export const log = (c: SupabaseClient, level: 'info' | 'warn' | 'error', event: string, message: string, meta: Record<string, unknown> = {}) =>
  c.from('ig_logs').insert({ level, event, message, meta }).then(() => {}, () => {})

// Records one worker execution in automation_runs. Never throws because of bookkeeping; rethrows the worker's own error.
export async function track<T>(c: SupabaseClient, fn: string, trigger: 'gateway' | 'webhook' | 'cron' | 'oauth', actor: string | null, work: () => Promise<T>): Promise<T> {
  let id: string | null = null
  try { const r = await c.rpc('automation_run_start', { p_fn: fn, p_trigger: trigger, p_actor: actor }); id = (r.data as string) ?? null } catch { /* bookkeeping only */ }
  try {
    const out = await work()
    if (id) { try { await c.rpc('automation_run_finish', { p_id: id, p_status: 'ok', p_error: null }) } catch { /* ignore */ } }
    return out
  } catch (e) {
    if (id) { try { await c.rpc('automation_run_finish', { p_id: id, p_status: 'error', p_error: String((e as Error).message ?? e) }) } catch { /* ignore */ } }
    throw e
  }
}
