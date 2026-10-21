import { Outlet } from 'react-router-dom'
import { useWorkspace } from '../lib/useWorkspace'

// UI guard only. The database (RLS) and Edge Functions enforce the same rule server-side.
export default function AdminOnly() {
  const { ws, isAdmin } = useWorkspace()
  if (!ws) return <p className="text-slate-500">Loading…</p>
  if (!isAdmin) return <div className="card mx-auto mt-10 max-w-md p-8 text-center"><p className="font-semibold">Admin access required</p><p className="mt-1 text-sm text-slate-500">This section is only available to workspace Admins.</p></div>
  return <Outlet />
}
