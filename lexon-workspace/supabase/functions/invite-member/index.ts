// Invitation lifecycle: invite / resend / revoke. Invitations can only create Team Members.
// Always returns a one-time sign-in code + link so the admin can share it if email delivery is slow or blocked.
import { handle, HttpError, json, rateLimit, requireUser } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async () => {
  const b = await req.json()
  const { workspaceId } = b
  const action = String(b.action ?? 'invite')
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, 'Enter a valid email address')
  const { user, admin } = await requireUser(req, workspaceId, 'team.invite')
  await rateLimit(admin, `invite:${user.id}`, 30, 3600)
  const redirectTo = Deno.env.get('TEAM_APP_URL') ?? undefined
  const info = async () => (await admin.rpc('auth_user_info', { p_email: email })).data?.[0] as { id: string; last_sign_in_at: string | null } | undefined

  if (action === 'revoke') {
    const u = await info()
    if (u?.last_sign_in_at) throw new HttpError(400, 'This person already joined. Deactivate them from their profile instead.')
    await admin.from('authorized_emails').delete().eq('workspace_id', workspaceId).eq('email', email).eq('role', 'member')
    if (u) await admin.auth.admin.deleteUser(u.id)
    return json({ ok: true })
  }

  // invite / resend
  const { error: upErr } = await admin.from('authorized_emails').upsert({
    workspace_id: workspaceId, email, role: 'member', full_name: String(b.fullName ?? '').trim() || null,
    phone: String(b.phone ?? '').trim() || null, invited_by: user.id, invited_at: new Date().toISOString()
  }, { onConflict: 'workspace_id,email' })
  if (upErr) throw new HttpError(500, upErr.message)

  let existing = await info()
  if (existing?.last_sign_in_at && action === 'invite') {
    return json({ ok: true, emailSent: false, note: 'This person has already joined and can sign in to the Team app with an email code.' })
  }
  let emailSent = false; const notes: string[] = []
  if (!existing) {
    const { error } = await admin.auth.admin.inviteUserByEmail(email, { redirectTo, data: { full_name: String(b.fullName ?? '') } })
    if (error) notes.push(`Email could not be sent (${error.message}).`); else emailSent = true
    existing = await info()
    if (!existing) { // email failed before the account was created: create it silently via an invite link
      const r = await admin.auth.admin.generateLink({ type: 'invite', email, options: { redirectTo, data: { full_name: String(b.fullName ?? '') } } })
      if (r.error) throw new HttpError(500, r.error.message)
    }
  } else if (action === 'resend') {
    notes.push('A fresh code was generated.')
  }

  // One-time code + link the admin can hand over (works even when email is delayed or blocked).
  let code: string | null = null, link: string | null = null
  try {
    const g = await admin.auth.admin.generateLink({ type: 'magiclink', email, options: { redirectTo } })
    if (!g.error) { code = g.data.properties?.email_otp ?? null; link = g.data.properties?.action_link ?? null }
  } catch { /* optional */ }
  return json({ ok: true, emailSent, code, link, note: [emailSent ? 'Invitation email sent.' : '', ...notes].filter(Boolean).join(' ') || 'Invitation created.' })
}))
