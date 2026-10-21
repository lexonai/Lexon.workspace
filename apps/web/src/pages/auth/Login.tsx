import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { BRAND } from '../../lib/brand'
import { useAuth } from '../../auth/AuthProvider'
import { desktop } from '../../lib/desktop'
import Logo from '../../components/Logo'

export default function Login() {
  const { userId } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  // Rejected Google accounts come back with an error in the URL (the database refuses unapproved emails).
  useEffect(() => {
    const raw = `${window.location.search}&${window.location.hash.replace(/^#\/?/, '')}`
    const m = /error_description=([^&]+)/.exec(raw)
    if (m) {
      const text = decodeURIComponent(m[1].replace(/\+/g, ' '))
      setError(/not authorized|saving new user|Database error/i.test(text) ? 'Access denied: this Google account is not approved for Lexon Workspace. Ask the workspace owner to approve your Gmail address.' : text)
      history.replaceState(null, '', window.location.pathname + '#/login')
    }
  }, [])
  if (userId) return <Navigate to="/" replace />

  const google = async () => {
    setBusy(true); setError(null)
    const d = desktop()
    // Desktop: open the system browser (Google blocks embedded browsers) and return through the lexon:// deep link.
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: d ? 'lexon://app/' : window.location.origin + window.location.pathname, skipBrowserRedirect: !!d }
    })
    if (error) { setError(error.message); setBusy(false); return }
    if (d && data?.url) { await d.openExternal(data.url); setBusy(false) }
  }

  // Email + password, verified by Supabase Auth. The same generic message is shown for a wrong password and an unknown
  // email, so nobody can probe which addresses are approved.
  const passwordLogin = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim().toLowerCase(), password })
    if (error) { setError(error.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Invalid email or password.'); setBusy(false); setPassword('') }
  }

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <div className="card w-full max-w-sm p-8 text-center">
        <div className="mx-auto mb-5 w-fit"><Logo size={56} /></div>
        <h1 className="text-xl font-semibold">{BRAND.name}</h1>
        <p className="mt-1 text-sm text-slate-500">Private workspace. Only approved accounts can sign in.</p>
        <button onClick={google} disabled={busy}
          className="btn-primary mt-6 w-full py-3 disabled:opacity-60">
          {busy ? 'Please wait…' : 'Continue with Google'}
        </button>
        <div className="my-5 flex items-center gap-3 text-xs text-slate-400"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
        <form onSubmit={passwordLogin} className="space-y-3 text-left">
          <input type="email" required autoComplete="username" value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" aria-label="Email" className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm" />
          <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Password (8+ characters)" aria-label="Password" className="w-full rounded-xl border border-line bg-white px-3 py-2.5 text-sm" />
          <button disabled={busy || !email || password.length < 8} className="btn-ghost w-full py-2.5 disabled:opacity-60">Sign in with password</button>
        </form>
        {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      </div>
    </div>
  )
}
