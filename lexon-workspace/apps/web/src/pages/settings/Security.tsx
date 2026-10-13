import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DEMO } from '../../lib/env'
import { useAuth } from '../../auth/AuthProvider'
import { useWorkspace } from '../../lib/useWorkspace'
import { listEvents, logEvent, type SecurityEvent } from '../../services/security'
import { Card, EmptyState } from '../../components/ui'
import PasswordCard from '../../components/PasswordCard'

const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
interface Enroll { id: string; qr: string; secret: string }

export default function Security() {
  const { userId, signOut } = useAuth()
  const { isAdmin } = useWorkspace()
  const [retention, setRetention] = useState<number | null>(null)
  const [factorId, setFactorId] = useState<string | null>(null)
  const [enroll, setEnroll] = useState<Enroll | null>(null)
  const [code, setCode] = useState('')
  const [events, setEvents] = useState<SecurityEvent[] | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    if (!userId || DEMO) return setEvents([])
    const f = await supabase.auth.mfa.listFactors()
    if (f.error) return setError(f.error.message)
    setFactorId(f.data?.totp?.[0]?.id ?? null)
    try { setEvents(await listEvents(userId)) } catch (e) { setError((e as Error).message) }
  }, [userId])
  useEffect(() => { load() }, [load])
  useEffect(() => { if (isAdmin && !DEMO) supabase.from('retention_settings').select('security_days').eq('id', 1).maybeSingle().then(({ data }) => setRetention(data?.security_days ?? 30)) }, [isAdmin])

  const start = async () => {
    setBusy(true); setError(null); setMsg(null)
    try {
      const all = await supabase.auth.mfa.listFactors()
      for (const f of all.data?.all ?? []) if (f.status === 'unverified') await supabase.auth.mfa.unenroll({ factorId: f.id })
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: 'totp', friendlyName: `Lexon ${Date.now()}`, issuer: 'Lexon Workspace' })
      if (error || !data) throw new Error(error?.message ?? 'Could not start 2FA setup')
      setEnroll({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret })
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  const verify = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!enroll || !userId) return
    setBusy(true); setError(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() })
    if (error) { setError('Invalid code. Check your authenticator app and try again.'); setBusy(false); return }
    await logEvent(userId, 'mfa_enabled')
    setEnroll(null); setCode(''); setMsg('Two-factor authentication is on.'); setBusy(false); load()
  }
  const cancel = async () => { if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.id }); setEnroll(null); setCode('') }
  const disable = async () => {
    if (!factorId || !userId || !confirm('Turn off two-factor authentication?')) return
    setBusy(true); setError(null)
    const { error } = await supabase.auth.mfa.unenroll({ factorId })
    if (error) setError(error.message); else { await logEvent(userId, 'mfa_disabled'); setMsg('Two-factor authentication is off.'); load() }
    setBusy(false)
  }

  return (
    <div className="space-y-6">
      {(error || msg) && <p role={error ? 'alert' : 'status'} className={`text-sm ${error ? 'text-red-600' : 'text-emerald-600'}`}>{error ?? msg}</p>}

      <Card title="Two-factor authentication (authenticator app)">
        {DEMO ? <p className="text-sm text-slate-500">Not available in demo mode.</p> : enroll ? (
          <form onSubmit={verify} className="space-y-4">
            <p className="text-sm text-slate-500">Scan this QR code with Google Authenticator, Authy or similar, then enter the 6-digit code.</p>
            <img src={enroll.qr} alt="2FA QR code" className="h-44 w-44 rounded-lg border border-line bg-white p-2" />
            <p className="break-all text-xs text-slate-500">Can’t scan? Enter this key manually: <code className="select-all">{enroll.secret}</code></p>
            <input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} aria-label="6-digit code" className="w-40 rounded-lg border border-line px-3 py-2 text-center tracking-widest" />
            <div className="flex gap-2">
              <button disabled={busy || code.length !== 6} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Verify and enable</button>
              <button type="button" onClick={cancel} className="rounded-lg px-4 py-2 text-sm">Cancel</button>
            </div>
          </form>
        ) : factorId ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-emerald-600">Enabled. A code is required at every sign-in, and the database also refuses data without it.</p>
            <button onClick={disable} disabled={busy} className="rounded-lg border border-line px-4 py-2 text-sm">Turn off</button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">Add a second step to sign-in. Strongly recommended for Owner and Admin accounts.</p>
            <button onClick={start} disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Enable 2FA</button>
          </div>
        )}
      </Card>

      <PasswordCard />

      <Card title="Sessions">
        <div className="space-y-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-slate-500">Sign out other devices but stay signed in here.</span>
            <button onClick={async () => { await signOut('others'); setMsg('Other devices were signed out.'); load() }} className="rounded-lg border border-line px-4 py-2">Sign out other devices</button></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><span className="text-slate-500">Revoke every session, including this one.</span>
            <button onClick={() => confirm('Sign out everywhere?') && signOut('global')} className="rounded-lg border border-red-200 px-4 py-2 text-red-600">Sign out everywhere</button></div>
          <p className="text-xs text-slate-400">You are also signed out automatically after a period of inactivity.</p>
        </div>
      </Card>

      <Card title="Login history">
        {isAdmin && retention !== null && (
          <label className="mb-3 flex flex-wrap items-center gap-2 text-sm text-slate-500">Keep login history for
            <select value={retention} onChange={async e => { const d = Number(e.target.value); const { error } = await supabase.rpc('set_security_retention', { p_days: d }); if (error) setError(error.message); else { setRetention(d); setMsg(`Login history is now kept for ${d} days.`) } }} className="rounded-lg border border-line bg-white px-2 py-1 text-sm" aria-label="Login history retention">
              {[7, 14, 21, 30].map(d => <option key={d} value={d}>{d} days</option>)}</select>
            <span className="text-xs text-slate-400">older entries are deleted automatically</span></label>
        )}
        {events === null ? <p className="text-sm text-slate-400">Loading…</p> : events.length === 0 ? <EmptyState text="No events yet." /> : (
          <ul className="divide-y divide-line text-sm">
            {events.map(e => (
              <li key={e.id} className="flex justify-between gap-4 py-2.5">
                <span><span className="font-medium">{label(e.event)}</span><span className="ml-2 hidden text-xs text-slate-400 sm:inline">{e.userAgent?.slice(0, 60)}</span></span>
                <span className="shrink-0 text-xs text-slate-400">{new Date(e.at).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
