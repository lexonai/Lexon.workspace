import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'
import { useAuth } from '../../auth/AuthProvider'

export default function MfaChallenge({ onDone }: { onDone: () => void }) {
  const { signOut } = useAuth()
  const [factorId, setFactorId] = useState<string | null>(null)
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    supabase.auth.mfa.listFactors().then(({ data, error }) => {
      if (error) return setError(error.message)
      setFactorId(data?.totp?.[0]?.id ?? null)
    })
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!factorId) return
    setBusy(true); setError(null)
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() })
    if (error) { setError('Invalid code. Try again.'); setBusy(false); return }
    onDone()
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4 p-8 text-center">
        <h1 className="text-xl font-semibold">{BRAND.name}</h1>
        <p className="text-sm text-slate-500">Enter the 6-digit code from your authenticator app.</p>
        <input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-lg border border-line py-3 text-center text-2xl tracking-[0.4em]" aria-label="6-digit code" />
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <button disabled={busy || code.length !== 6 || !factorId} className="w-full rounded-lg bg-brand py-2.5 font-medium text-white disabled:opacity-50">{busy ? 'Verifying…' : 'Verify'}</button>
        <button type="button" onClick={() => signOut('local')} className="text-sm text-slate-500">Sign out</button>
      </form>
    </div>
  )
}
