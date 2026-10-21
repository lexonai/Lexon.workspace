import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { DEMO } from './env'
import { useAuth } from '../auth/AuthProvider'

export type Role = 'owner' | 'admin' | 'member'
export interface WorkspaceCtx { workspaceId: string; role: Role; userId: string; perms: Set<string> }

// Resolves workspace, role and permissions. The UI hides things; the database (RLS) enforces them.
export function useWorkspace() {
  const { userId } = useAuth()
  const [ws, setWs] = useState<WorkspaceCtx | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    if (DEMO) { setWs({ workspaceId: 'demo', role: 'owner', userId: 'demo', perms: new Set() }); return }
    (async () => {
      const { data, error } = await supabase.from('workspace_members').select('workspace_id,role').eq('user_id', userId).eq('active', true).limit(1).maybeSingle()
      if (error) return setError(error.message)
      if (!data) return setError('Your account is not linked to a workspace yet.')
      // Effective permissions are computed by the database (role + grants given by an Admin). The UI only hides buttons;
      // every action is checked again by RLS / Edge Functions.
      const perms = await supabase.rpc('my_permissions', { ws: data.workspace_id })
      if (perms.error) return setError(perms.error.message)
      setWs({ workspaceId: data.workspace_id, role: data.role as Role, userId, perms: new Set((perms.data as string[] | null) ?? []) })
    })()
  }, [userId])

  const isAdmin = !!ws && (ws.role === 'owner' || ws.role === 'admin')
  const can = useCallback((perm: string) => !!ws && (ws.role === 'owner' || ws.role === 'admin' || ws.perms.has(perm)), [ws])
  return { ws, error, can, isAdmin }
}
