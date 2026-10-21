// PUBLIC door of the Lexon Team app (verify_jwt = false). Flow:  email -> authorization check -> code -> session.
//   action "start"  { email }        : never reveals whether the email is known. If the person is already an ACTIVE member, a
//                                      6-digit sign-in code is emailed by Supabase Auth. Always answers { ok: true }.
//   action "verify" { email, code }  : checks the one-time INVITATION CODE (bcrypt hash, expiry, attempt limit) in the database.
//                                      Success -> account is created/confirmed server-side and a one-time token_hash is returned;
//                                      the browser exchanges it for a session with supabase.auth.verifyOtp(). Failure -> { ok: false }
//                                      with the same message for every reason (wrong code, expired, locked, unknown email), so the
//                                      browser then tries the emailed sign-in code instead.
// Everything is rate limited per IP and per email. The browser never decides anything.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { adminClient, clientIp, env, handle, HttpError, json, rateLimit } from '../_shared/common.ts'

const GENERIC = 'Invalid or expired code'

Deno.serve((req) => handle(req, async () => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const b = await req.json().catch(() => ({})) as Record<string, unknown>
  const action = String(b.action ?? '')
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 254) throw new HttpError(400, 'Enter a valid email address')
  const admin = adminClient()
  await rateLimit(admin, `ta-ip:${clientIp(req)}`, 60, 900)

  if (action === 'start') {
    await rateLimit(admin, `ta-start:${email}`, 5, 900)
    const gate = await admin.rpc('team_gate', { p_email: email })
    if (gate.data === 'member') {
      // Supabase Auth emails the OTP. shouldCreateUser:false => it can never create an account.
      const anon = createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false } })
      await anon.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }).catch(() => {})
    }
    return json({ ok: true })
  }

  if (action === 'verify') {
    await rateLimit(admin, `ta-verify:${email}`, 15, 900)
    const code = String(b.code ?? '').slice(0, 64)
    if (code.replace(/[^A-Za-z0-9]/g, '').length < 6) return json({ ok: false, error: GENERIC })
    const v = await admin.rpc('invite_verify', { p_email: email, p_code: code })
    if (v.error) throw new HttpError(500, 'Could not check the code. Try again.')
    const row = (v.data as { result: string; o_invite: string; o_ws: string; o_name: string | null }[] | null)?.[0]
    if (!row || row.result !== 'ok') return json({ ok: false, error: GENERIC })

    // Correct code. Create (or reuse) the Auth user. The database trigger only allows allow-listed emails.
    const info = (await admin.rpc('auth_user_info', { p_email: email })).data?.[0] as { id: string } | undefined
    let uid = info?.id
    if (!uid) {
      const created = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: row.o_name ?? '' } })
      if (created.error || !created.data.user) {
        await admin.rpc('invite_reopen', { p_id: row.o_invite })
        throw new HttpError(500, 'Your account could not be created. Ask your admin to issue a new code.')
      }
      uid = created.data.user.id
    }
    await admin.rpc('invite_mark_user', { p_id: row.o_invite, p_user: uid })
    const mem = await admin.from('workspace_members').select('active').eq('workspace_id', row.o_ws).eq('user_id', uid).maybeSingle()
    if (!mem.data || !mem.data.active) return json({ ok: false, error: GENERIC })
    const link = await admin.auth.admin.generateLink({ type: 'magiclink', email })
    const token_hash = link.data?.properties?.hashed_token
    if (link.error || !token_hash) throw new HttpError(500, 'Could not start your session. Try again.')
    await admin.from('security_events').insert({ user_id: uid, event: 'team_invite_accepted' })
    return json({ ok: true, token_hash, email })
  }
  throw new HttpError(400, 'Unknown action')
}))
