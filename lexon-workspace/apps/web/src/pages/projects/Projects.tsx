import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, FolderKanban, Plus, Search } from 'lucide-react'
import { useWorkspace } from '../../lib/useWorkspace'
import { createProject, listProjects, STATUS_LABEL, STATUS_STYLE, toHref, type Project, type ProjectStatus } from '../../services/projects'
import { EmptyState, ErrorState } from '../../components/ui'
import ProjectForm from './ProjectForm'

export const StatusBadge = ({ status }: { status: ProjectStatus }) => <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS_STYLE[status]}`}>{STATUS_LABEL[status]}</span>

export default function Projects() {
  const { ws, error: wsError, can } = useWorkspace()
  const [list, setList] = useState<Project[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [filter, setFilter] = useState<'all' | ProjectStatus>('all')
  const [q, setQ] = useState('')

  const load = useCallback(async () => {
    if (!ws) return
    setError(null)
    try { setList(await listProjects(ws.workspaceId)) } catch (e) { setError((e as Error).message) }
  }, [ws])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => (list ?? []).filter(p => (filter === 'all' || p.status === filter) && (!q.trim() || `${p.name} ${p.type ?? ''}`.toLowerCase().includes(q.trim().toLowerCase()))), [list, filter, q])
  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={load} />
  if (!list || !ws) return <p className="text-slate-500">Loading projects…</p>

  const counts = (s: ProjectStatus) => list.filter(p => p.status === s).length
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Projects</h1><p className="text-sm text-slate-500">{list.length} total · {counts('active')} active · {counts('coming_soon')} coming soon</p></div>
        {can('projects.manage') && <button onClick={() => setCreating(true)} className="btn-primary"><Plus size={16} /> New project</button>}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1">
          {(['all', 'active', 'inactive', 'coming_soon'] as const).map(s => <button key={s} onClick={() => setFilter(s)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${filter === s ? 'bg-white shadow-card' : 'text-slate-500 hover:text-slate-900'}`}>{s === 'all' ? 'All' : STATUS_LABEL[s]}</button>)}
        </div>
        <div className="relative min-w-[200px] flex-1 sm:max-w-xs"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search projects…" aria-label="Search projects" className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-sm" /></div>
      </div>

      {shown.length === 0 ? <div className="card"><EmptyState text={list.length ? 'No projects match your filters.' : 'No projects yet. Create your first project.'} /></div> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map(p => {
            const href = toHref(p.url)
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="card card-hover group flex flex-col p-5">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-slate-900 text-white"><FolderKanban size={19} /></span>
                  <div className="min-w-0 flex-1"><p className="truncate font-semibold">{p.name}</p><p className="truncate text-xs text-slate-400">{p.type ?? 'Project'}</p></div>
                  <StatusBadge status={p.status} />
                </div>
                <p className="mt-3 line-clamp-2 min-h-[2.5rem] text-sm text-slate-500">{p.description || 'No description yet.'}</p>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-400">{href ? <><ExternalLink size={13} /><span className="truncate">{p.url}</span></> : <span>No link added</span>}</div>
              </Link>
            )
          })}
        </div>
      )}
      {creating && <ProjectForm title="New project" submitLabel="Create project" onClose={() => setCreating(false)} onSubmit={async i => { await createProject(ws.workspaceId, ws.userId, i); setCreating(false); load() }} />}
    </div>
  )
}
