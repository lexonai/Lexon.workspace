import { useCallback, useEffect, useState } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from './AuthProvider'
import { DEMO } from '../lib/env'
import { supabase } from '../lib/supabase'
import MfaChallenge from '../pages/auth/MfaChallenge'

type State = 'checking' | 'ok' | 'mfa' | 'error' | 'denied'

export default function RequireAuth() {
  const { userId, loading, signOut } = useAuth()
  const [state, setState] = useState<State>(DEMO ? 'ok' : 'checking')

  const check = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel()
    if (error || !data) return setState('error') // fail closed
    if (data.nextLevel === 'aal2' && data.currentLevel !== 'aal2') return setState('mfa')
    // A valid session is not enough: the account must still be an ACTIVE member (deactivated people are locked out here
    // and, independently, by every database policy).
    if (DEMO || !userId) return setState('ok')
    const m = await supabase.from('workspace_members').select('workspace_id').eq('user_id', userId).eq('active', true).limit(1).maybeSingle()
    if (m.error) return setState('error')
    setState(m.data ? 'ok' : 'denied')
  }, [userId])
  useEffect(() => { if (!DEMO && userId) { setState('checking'); check() } }, [userId, check])

  if (loading) return <div className="p-10 text-slate-500">Loading…</div>
  if (!userId && !DEMO) return <Navigate to="/login" replace />
  if (state === 'checking') return <div className="p-10 text-slate-500">Checking security…</div>
  if (state === 'error') return <div className="p-10 text-red-600" role="alert">Could not verify your session. <button className="underline" onClick={check}>Retry</button></div>
  if (state === 'denied') return <div className="grid min-h-screen place-items-center p-6"><div className="card max-w-sm p-6 text-center" role="alert"><p className="font-semibold">Access removed</p><p className="mt-1 text-sm text-slate-500">This account is not an active member. Ask the workspace owner for access.</p><button className="btn-primary mt-4" onClick={() => signOut()}>Sign out</button></div></div>
  if (state === 'mfa') return <MfaChallenge onDone={() => { setState('checking'); check() }} />
  return <Outlet />
}
