import { useEffect } from 'react'
import { supabase } from './supabase'
import { DEMO } from './env'
import { useAuth } from '../auth/AuthProvider'

// Real presence: heartbeat while the app is open.
export function usePresence() {
  const { userId } = useAuth()
  useEffect(() => {
    if (!userId || DEMO) return
    const set = async (presence: 'online' | 'away' | 'offline') => {
      await supabase.from('profiles').update({ presence, last_seen: new Date().toISOString() }).eq('id', userId)
    }
    const tick = () => { void set(document.hidden ? 'away' : 'online') }
    const off = () => { void set('offline') }
    tick()
    const t = setInterval(tick, 60000)
    document.addEventListener('visibilitychange', tick)
    window.addEventListener('pagehide', off)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); window.removeEventListener('pagehide', off) }
  }, [userId])
}
