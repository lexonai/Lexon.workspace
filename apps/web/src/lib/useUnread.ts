import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DEMO } from './env'
import { useAuth } from '../auth/AuthProvider'

// Live unread-notification count for the header bell.
export function useUnread() {
  const { userId } = useAuth()
  const [count, setCount] = useState(0)
  const refresh = useCallback(async () => {
    if (!userId || DEMO) return
    const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', userId).is('read_at', null)
    setCount(count ?? 0)
  }, [userId])
  useEffect(() => {
    if (!userId || DEMO) return
    refresh()
    const ch = supabase.channel('unread').on('postgres_changes',
      { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => refresh()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, refresh])
  return count
}
