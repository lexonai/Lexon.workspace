import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { IDLE_MINUTES } from '../lib/config'
import { logEvent } from '../services/security'

export type SignOutScope = 'local' | 'others' | 'global'
interface AuthCtx { session: Session | null; userId: string | null; loading: boolean; signOut: (scope?: SignOutScope) => Promise<void> }
const Ctx = createContext<AuthCtx>({ session: null, userId: null, loading: true, signOut: async () => {} })
export const useAuth = () => useContext(Ctx)
const LOGGED = 'lw_login_logged'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(!DEMO)
  const sessionRef = useRef<Session | null>(null)
  sessionRef.current = session

  useEffect(() => {
    if (DEMO) return
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false) })
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s)
      if (event === 'SIGNED_IN' && s && !sessionStorage.getItem(LOGGED)) { sessionStorage.setItem(LOGGED, '1'); void logEvent(s.user.id, 'login') }
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const signOut = useCallback(async (scope: SignOutScope = 'local') => {
    const uid = sessionRef.current?.user.id
    if (uid) await logEvent(uid, scope === 'local' ? 'logout' : scope === 'others' ? 'logout_other_devices' : 'logout_all_devices')
    await supabase.auth.signOut({ scope }) // 'local' this device · 'others' all other devices · 'global' everywhere
    if (scope !== 'others') { sessionStorage.removeItem(LOGGED); setSession(null) }
  }, [])

  // Idle timeout
  useEffect(() => {
    if (DEMO || !session) return
    let t: ReturnType<typeof setTimeout>
    const reset = () => {
      clearTimeout(t)
      t = setTimeout(async () => {
        const uid = sessionRef.current?.user.id
        if (uid) await logEvent(uid, 'idle_logout')
        await signOut('local')
      }, IDLE_MINUTES * 60000)
    }
    const evs = ['mousemove', 'keydown', 'click', 'touchstart'] as const
    evs.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()
    return () => { clearTimeout(t); evs.forEach(e => window.removeEventListener(e, reset)) }
  }, [session, signOut])

  return (
    <Ctx.Provider value={{ session, userId: DEMO ? 'demo' : session?.user.id ?? null, loading, signOut }}>
      {children}
    </Ctx.Provider>
  )
}
