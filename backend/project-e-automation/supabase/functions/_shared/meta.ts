// Meta Graph API wrapper (Instagram API with Instagram Login). Port of metaService.ts.
// Meta changes this surface and gates messaging behind App Review: re-check https://developers.facebook.com/docs/instagram-platform
import { env, opt } from './e.ts'
const ver = () => opt('META_GRAPH_VERSION') || 'v21.0'
const GRAPH = () => `https://graph.instagram.com/${ver()}`
const fail = async (what: string, r: Response) => { throw new Error(`${what} failed: ${r.status} ${(await r.text()).slice(0, 300)}`) }

export const authorizeUrl = (state: string) => 'https://www.instagram.com/oauth/authorize?' + new URLSearchParams({
  client_id: env('META_APP_ID'), redirect_uri: env('META_REDIRECT_URI'), response_type: 'code', state,
  scope: ['instagram_business_basic', 'instagram_business_manage_messages', 'instagram_business_manage_comments'].join(',')
})
export async function exchangeCode(code: string): Promise<{ access_token: string; user_id: string }> {
  const r = await fetch('https://api.instagram.com/oauth/access_token', { method: 'POST', body: new URLSearchParams({ client_id: env('META_APP_ID'), client_secret: env('META_APP_SECRET'), grant_type: 'authorization_code', redirect_uri: env('META_REDIRECT_URI'), code }) })
  if (!r.ok) await fail('Token exchange', r); return r.json()
}
export async function longLived(short: string): Promise<{ access_token: string; expires_in: number }> {
  const r = await fetch(`${GRAPH()}/access_token?` + new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: env('META_APP_SECRET'), access_token: short }))
  if (!r.ok) await fail('Long-lived token exchange', r); return r.json()
}
export async function refresh(token: string): Promise<{ access_token: string; expires_in: number }> {
  const r = await fetch(`${GRAPH()}/refresh_access_token?` + new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token }))
  if (!r.ok) await fail('Token refresh', r); return r.json()
}
export async function profile(token: string): Promise<{ user_id: string; username: string; profile_picture_url?: string }> {
  const r = await fetch(`${GRAPH()}/me?` + new URLSearchParams({ fields: 'user_id,username,profile_picture_url,name', access_token: token }))
  if (!r.ok) await fail('Profile fetch', r); return r.json()
}
export async function recentMedia(token: string, limit = 25): Promise<{ data: any[] }> {
  const r = await fetch(`${GRAPH()}/me/media?` + new URLSearchParams({ fields: 'id,caption,media_type,media_url,thumbnail_url,permalink,timestamp', limit: String(limit), access_token: token }))
  if (!r.ok) await fail('Media fetch', r); return r.json()
}
export async function replyToComment(token: string, commentId: string, message: string) {
  const r = await fetch(`${GRAPH()}/${commentId}/replies`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ message, access_token: token }) })
  if (!r.ok) await fail('Comment reply', r); return r.json()
}
export async function sendDm(token: string, recipientId: string, text: string, cta?: { label: string; url: string }) {
  const message = cta ? { attachment: { type: 'template', payload: { template_type: 'button', text, buttons: [{ type: 'web_url', url: cta.url, title: cta.label }] } } } : { text }
  const r = await fetch(`${GRAPH()}/me/messages`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ recipient: { id: recipientId }, message }) })
  if (!r.ok) await fail('DM send', r); return r.json()
}
