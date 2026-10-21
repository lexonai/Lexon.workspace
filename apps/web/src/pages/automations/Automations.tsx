import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, Instagram, RefreshCw, Youtube } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DEMO } from '../../lib/env'
import { callFn } from '../../lib/functions'
import { useWorkspace } from '../../lib/useWorkspace'
import { Card, EmptyState } from '../../components/ui'

interface Log { id: string; source: string | null; level: string; event: string; message: string | null; at: string }
type Src = 'all' | 'instagram' | 'youtube' | 'other'
const SRC: { key: Src; label: string }[] = [{ key: 'all', label: 'All' }, { key: 'instagram', label: 'Instagram' }, { key: 'youtube', label: 'YouTube' }, { key: 'other', label: 'Other' }]

export default function Automations() {
  const { ws, can } = useWorkspace()
  const [links, setLinks] = useState<Record<string, string>>({})
  const [logs, setLogs] = useState<Log[] | null>(null)
  const [src, setSrc] = useState<Src>('all')
  const [test, setTest] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const allowed = can('automations.manage')

  const load = useCallback(async () => {
    if (!ws || DEMO || !allowed) return
    try {
      const { data } = await supabase.rpc('project_link_status', { ws: ws.workspaceId })
      const m: Record<string, string> = {}; for (const r of (data ?? []) as { provider: string; status: string }[]) m[r.provider] = r.status
      setLinks(m)
      if (m.instagram === 'connected') await callFn('central-api', { service: 'automation', workspaceId: ws.workspaceId, project: 'instagram', action: 'pull_events' }).catch(() => {})
      const q = await supabase.from('automation_logs').select('id,source,level,event,message,created_at').eq('workspace_id', ws.workspaceId).order('created_at', { ascending: false }).limit(100)
      if (q.error) throw new Error(q.error.message)
      setLogs((q.data ?? []).map((l: any) => ({ id: l.id, source: l.source, level: l.level, event: l.event, message: l.message, at: l.created_at }))); setError(null)
    } catch (e) { setError((e as Error).message); setLogs([]) }
  }, [ws, allowed])
  useEffect(() => { load() }, [load])

  if (ws && !allowed) return <div className="card p-8 text-center text-slate-500">You do not have access to Automations.</div>
  const ping = async (project: string) => {
    if (!ws) return
    setTest(t => ({ ...t, [project]: 'Testing…' }))
    try { const r = await callFn<{ ok: boolean; tables: Record<string, string> }>('central-api', { service: 'automation', workspaceId: ws.workspaceId, project, action: 'ping' }); setTest(t => ({ ...t, [project]: r.ok ? '✓ Backend reachable and schema complete.' : `✗ Missing tables: ${Object.entries(r.tables).filter(([, v]) => v !== 'ok').map(([k]) => k).join(', ')}. Run the project's SQL.` })) }
    catch (e) { setTest(t => ({ ...t, [project]: '✗ ' + (e as Error).message })) }
  }
  const shown = (logs ?? []).filter(l => src === 'all' || (src === 'other' ? l.source !== 'instagram' && l.source !== 'youtube' : l.source === src))
  const statusPill = (s?: string) => <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${s === 'connected' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{s === 'connected' ? 'Backend linked' : 'Not linked'}</span>

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Automations</h1>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="card p-6">
          <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-pink-50 text-pink-600"><Instagram size={22} /></span>{statusPill(links.instagram)}</div>
          <h2 className="mt-3 font-semibold">Instagram Automation</h2>
          <p className="mt-1 text-sm text-slate-500">Comment and keyword detection, automated replies and DMs, analytics and logs. Connect your account, then build comment-to-DM automations.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {links.instagram === 'connected' ? <><Link to="/automations/instagram" className="btn-primary px-3 py-1.5">Open</Link><button onClick={() => ping('instagram')} className="btn-ghost px-3 py-1.5">Test connection</button></> : <Link to="/integrations" className="btn-primary px-3 py-1.5">Link backend</Link>}
          </div>
          {test.instagram && <p className="mt-2 text-xs text-slate-600">{test.instagram}</p>}
          {links.instagram !== 'connected' && <p className="mt-2 text-xs text-slate-400">Open Integrations, Lexon Workspace, and link the shared Automation backend.</p>}
        </div>
        <div className="card p-6">
          <div className="flex items-start justify-between"><span className="grid h-11 w-11 place-items-center rounded-xl bg-red-50 text-red-600"><Youtube size={22} /></span>{statusPill(links.youtube)}</div>
          <h2 className="mt-3 font-semibold">YouTube Automation</h2>
          <p className="mt-1 text-sm text-slate-500">Real channel analytics, video comparison, and an AI studio grounded in your own channel data.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to="/automations/youtube" className="btn-primary px-3 py-1.5">Open</Link>
            {links.youtube === 'connected' && <button onClick={() => ping('youtube')} className="btn-ghost px-3 py-1.5">Test connection</button>}
          </div>
          {test.youtube && <p className="mt-2 text-xs text-slate-600">{test.youtube}</p>}
          {links.youtube !== 'connected' && <p className="mt-2 text-xs text-slate-400">Link the shared Automation backend in Integrations first.</p>}
        </div>
      </div>

      <Card title="Execution history" action={<button onClick={load} className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-900"><RefreshCw size={13} /> Refresh</button>}>
        <div className="mb-4 flex gap-1 rounded-xl bg-slate-100 p-1 w-fit" role="tablist" aria-label="Automation source">{SRC.map(s => <button key={s.key} role="tab" aria-selected={src === s.key} onClick={() => setSrc(s.key)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${src === s.key ? 'bg-white shadow-card' : 'text-slate-500'}`}>{s.label}</button>)}</div>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {!logs ? <p className="text-sm text-slate-400">Loading…</p> : shown.length === 0 ? <EmptyState text="No executions yet. Run a sync or an automation and it will appear here." /> : (
          <ul className="divide-y divide-line">
            {shown.map(l => (
              <li key={l.id} className="flex items-start gap-3 py-3">
                {l.level === 'error' ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-red-500" /> : l.level === 'warn' ? <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-500" /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-emerald-500" />}
                <div className="min-w-0 flex-1"><p className="text-sm">{l.message ?? l.event}</p><p className="text-xs text-slate-400"><span className="capitalize">{l.source ?? 'automation'}</span> · {new Date(l.at).toLocaleString()}</p></div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-slate-400">History is kept for 7 days.</p>
      </Card>
    </div>
  )
}
