import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DEMO } from '../../lib/env'
import { useWorkspace } from '../../lib/useWorkspace'
import { ErrorState } from '../../components/ui'

interface Agent { id: string; name: string; kind: string | null; status: string }

export default function Agents() {
  const { ws, error: wsError } = useWorkspace()
  const [agents, setAgents] = useState<Agent[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    if (!ws || DEMO) { if (DEMO) setAgents([]); return }
    supabase.from('agents').select('id,name,kind,status').eq('workspace_id', ws.workspaceId).order('created_at')
      .then(({ data, error }) => error ? setError(error.message) : setAgents(data ?? []))
  }, [ws])
  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={() => location.reload()} />
  if (!agents) return <p className="text-slate-500">Loading agents…</p>
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Agents</h1>
      {agents.length === 0 ? (
        <div className="card p-10 text-center"><p className="font-medium">No agents yet</p>
          <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">The Manager / Agent system will be added later. The database tables (agents, agent_events), permission (agents.manage) and Office feed are already prepared.</p></div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{agents.map(a => <div key={a.id} className="card p-5"><p className="font-medium">{a.name}</p><p className="text-xs text-slate-400">{a.kind ?? 'Agent'} · {a.status}</p></div>)}</div>
      )}
    </div>
  )
}
