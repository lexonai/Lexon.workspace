import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { useAuth } from '../auth/AuthProvider'
import { logEvent } from '../services/security'
import { MIN_PASSWORD, passwordProblem } from '../lib/password'
import { Card } from './ui'

// Lets a signed-in person set or change their password (Supabase Auth hashes and stores it; we never see it again).
export default function PasswordCard() {
  const { userId } = useAuth()
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const save = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg(null); setError(null)
    const problem = passwordProblem(pw)
    if (problem) return setError(problem)
    if (pw !== again) return setError('The two passwords do not match.')
    setBusy(true)
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(false)
    if (error) return setError(error.message)
    if (userId) await logEvent(userId, 'password_set')
    setPw(''); setAgain(''); setMsg('Password saved. You can now sign in with your email and this password, or with Google.')
  }

  return (
    <Card title="Password login">
      {DEMO ? <p className="text-sm text-slate-500">Not available in demo mode.</p> : (
        <form onSubmit={save} className="space-y-3">
          <p className="text-sm text-slate-500">Set a password of at least {MIN_PASSWORD} characters to sign in with email and password. Google sign-in keeps working.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">New password<input type="password" autoComplete="new-password" minLength={MIN_PASSWORD} maxLength={72} required value={pw} onChange={e => setPw(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" /></label>
            <label className="block text-sm">Repeat password<input type="password" autoComplete="new-password" required value={again} onChange={e => setAgain(e.target.value)} className="mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" /></label>
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {msg && <p role="status" className="text-sm text-emerald-600">{msg}</p>}
          <button disabled={busy} className="btn-primary disabled:opacity-60">{busy ? 'Saving…' : 'Save password'}</button>
        </form>
      )}
    </Card>
  )
}
