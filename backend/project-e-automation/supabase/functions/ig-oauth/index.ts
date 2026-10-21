// PUBLIC (verify_jwt = false): the browser lands here after approving the app on Instagram.
// The signed `state` (created by ig-api when the owner pressed Connect) is the proof. Then we bounce back to Workspace.
import { db, env, log, opt, readState, setSecret } from '../_shared/e.ts'
import * as meta from '../_shared/meta.ts'

Deno.serve(async (req) => {
  const u = new URL(req.url)
  const back = (q: string) => Response.redirect(`${opt('WORKSPACE_URL') || env('WORKSPACE_URL')}/#/automations/instagram?${q}`, 302)
  try {
    const st = await readState(u.searchParams.get('state') ?? '')
    if (!st || st.k !== 'ig') return back('error=' + encodeURIComponent('Invalid or expired link. Press Connect again.'))
    if (u.searchParams.get('error')) return back('error=' + encodeURIComponent(u.searchParams.get('error_description') ?? 'Instagram connection was cancelled'))
    const code = u.searchParams.get('code'); if (!code) return back('error=missing_code')
    const short = await meta.exchangeCode(code.replace(/#_$/, ''))
    const long = await meta.longLived(short.access_token)
    const p = await meta.profile(long.access_token)
    const c = db()
    const { data, error } = await c.from('ig_accounts').upsert({
      instagram_user_id: String(p.user_id), username: p.username, profile_image_url: p.profile_picture_url ?? null,
      token_expires_at: new Date(Date.now() + long.expires_in * 1000).toISOString(), status: 'connected', last_error: null, updated_at: new Date().toISOString()
    }, { onConflict: 'instagram_user_id' }).select('id').single()
    if (error) throw new Error(error.message)
    await setSecret(c, `ig_token_${data.id}`, long.access_token)
    await log(c, 'info', 'connect', `Instagram @${p.username} connected`)
    return back('connected=1')
  } catch (e) {
    console.error(e); return back('error=' + encodeURIComponent((e as Error).message.slice(0, 200)))
  }
})
