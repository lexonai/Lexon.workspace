import { db, env, getSecret, HttpError, setSecret } from './e.ts'
// Google access token from the refresh token kept in Vault ('google_refresh').
export async function accessToken(): Promise<string> {
  const c = db()
  const refresh = await getSecret(c, 'google_refresh')
  if (!refresh) throw new HttpError(400, 'Google account is not connected')
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: env('GOOGLE_CLIENT_ID'), client_secret: env('GOOGLE_CLIENT_SECRET'), refresh_token: refresh, grant_type: 'refresh_token' }) })
  const j = await r.json()
  if (!r.ok) {
    await c.from('youtube_connection').upsert({ id: 1, status: 'error', last_error: j.error_description ?? j.error ?? 'Token refresh failed' })
    throw new HttpError(400, 'Google token refresh failed. Reconnect the Google account.')
  }
  return j.access_token as string
}
export { setSecret }
