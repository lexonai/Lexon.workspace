// Admin side of the invitation system:  Add Member -> Details -> Continue -> Generate/Custom code -> email-bound invitation.
//   action "create" (default) : { workspaceId, email, fullName, phone?, jobTitle?, department?, codeMode: 'random'|'custom', code?, ttlMinutes?, maxAttempts?, sendEmail? }
//        -> stores ONLY a bcrypt hash of the code, creates the email allow-list entry, optionally emails the Team link.
//        -> answers { ok, code, teamUrl, expiresAt, emailSent, note }.  The code is shown ONCE and can never be read again.
//   action "revoke"           : { workspaceId, email }  cancels a pending invitation and removes the allow-list entry.
// Needs permission team.invite (checked on the server from the caller's own JWT).
import { audit, escapeHtml, handle, HttpError, json, rateLimit, requireUser, sendMail } from '../_shared/common.ts'

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789' // no 0/O/1/I/L
function randomCode(): string {
  const out: string[] = []
  const buf = new Uint8Array(32)
  while (out.length < 8) {
    crypto.getRandomValues(buf)
    for (const x of buf) { if (x < 248 && out.length < 8) out.push(ALPHABET[x % ALPHABET.length]) } // 248 = 31*8 -> no modulo bias
  }
  return out.slice(0, 4).join('') + '-' + out.slice(4).join('')
}
const clamp = (n: unknown, lo: number, hi: number, d: number) => { const v = Number(n); return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : d }

Deno.serve((req) => handle(req, async () => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const b = await req.json().catch(() => ({})) as Record<string, any>
  const workspaceId = String(b.workspaceId ?? '')
  const action = String(b.action ?? 'create')
  const email = String(b.email ?? '').trim().toLowerCase()
  if (!workspaceId) throw new HttpError(400, 'workspaceId is required')
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Enter a valid email address')
  const { user, admin } = await requireUser(req, workspaceId, 'team.invite')
  await rateLimit(admin, `invite:${user.id}`, 30, 3600)

  if (action === 'revoke') {
    const { error } = await admin.rpc('invite_revoke', { p_ws: workspaceId, p_email: email, p_by: user.id })
    if (error) throw new HttpError(400, error.message)
    await audit(admin, user.id, 'invite_revoked', req)
    return json({ ok: true })
  }
  if (action !== 'create' && action !== 'resend') throw new HttpError(400, 'Unknown action')

  const mode = b.codeMode === 'custom' ? 'custom' : 'random'
  const code = mode === 'custom' ? String(b.code ?? '').trim() : randomCode()
  if (mode === 'custom' && !code) throw new HttpError(400, 'Type your custom code (6 to 32 letters or digits)')
  const ttl = clamp(b.ttlMinutes, 5, 10080, 1440)
  const attempts = clamp(b.maxAttempts, 3, 10, 5)
  const { error } = await admin.rpc('invite_create', {
    p_ws: workspaceId, p_email: email, p_name: String(b.fullName ?? '').trim().slice(0, 120), p_phone: String(b.phone ?? '').trim().slice(0, 40),
    p_title: String(b.jobTitle ?? '').trim().slice(0, 80), p_dept: String(b.department ?? '').trim().slice(0, 80),
    p_code: code, p_mode: mode, p_ttl_minutes: ttl, p_max_attempts: attempts, p_by: user.id
  })
  if (error) throw new HttpError(400, error.message)
  await audit(admin, user.id, 'invite_created', req)

  const teamUrl = (Deno.env.get('TEAM_APP_URL') ?? '').replace(/\/$/, '')
  const expiresAt = new Date(Date.now() + ttl * 60000).toISOString()
  let emailSent = false; let note = ''
  if (b.sendEmail !== false) {
    const name = escapeHtml(String(b.fullName ?? '').trim() || 'there')
    const withCode = Deno.env.get('EMAIL_INCLUDE_CODE') === 'true'
    const link = teamUrl ? `${teamUrl}/#/login?email=${encodeURIComponent(email)}` : ''
    const html = `<div style="font-family:Arial,sans-serif;max-width:480px"><h2>You are invited to Lexon Team</h2><p>Hi ${name},</p>
      <p>Open the Team app and sign in with this email address${withCode ? ` and the code <b style="font-size:18px;letter-spacing:2px">${escapeHtml(code)}</b>` : '. Your admin will give you the invitation code separately'}.</p>
      ${link ? `<p><a href="${escapeHtml(link)}" style="background:#2563eb;color:#fff;padding:10px 18px;border-radius:10px;text-decoration:none">Open Lexon Team</a></p>` : ''}
      <p style="color:#64748b;font-size:13px">The invitation works only for ${escapeHtml(email)} and expires on ${new Date(expiresAt).toUTCString()}.</p></div>`
    const text = `You are invited to Lexon Team.\nOpen ${link || 'the Team app'} and sign in with ${email}${withCode ? ` and the code ${code}` : '. Your admin will give you the invitation code separately'}.\nExpires: ${new Date(expiresAt).toUTCString()}`
    const m = await sendMail(email, 'You are invited to Lexon Team', html, text)
    emailSent = m.ok; note = m.note ?? ''
  }
  return json({ ok: true, code, teamUrl: teamUrl || null, expiresAt, maxAttempts: attempts, codeMode: mode, emailSent, note })
}))
