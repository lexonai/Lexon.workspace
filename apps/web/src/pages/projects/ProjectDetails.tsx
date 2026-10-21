import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ExternalLink, GitBranch, Globe, Pencil, Trash2 } from 'lucide-react'
import { useWorkspace } from '../../lib/useWorkspace'
import { deleteProject, getProject, setProjectStatus, STATUS_LABEL, toHref, updateProject, type Project, type ProjectStatus } from '../../services/projects'
import { Card, ErrorState } from '../../components/ui'
import { StatusBadge } from './Projects'
import ProjectForm from './ProjectForm'

export default function ProjectDetails() {
  const { id } = useParams()
  const nav = useNavigate()
  const { ws, error: wsError, can } = useWorkspace()
  const [p, setP] = useState<Project | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)

  const load = useCallback(async () => {
    if (!id) return
    setError(null)
    try { setP(await getProject(id)) } catch (e) { setError((e as Error).message) }
  }, [id])
  useEffect(() => { load() }, [load])

  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={load} />
  if (!p || !ws) return <p className="text-slate-500">Loading project…</p>
  const manage = can('projects.manage')
  const urlHref = toHref(p.url), repoHref = toHref(p.repository)
  const hasLinks = !!(p.url || p.repository)

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link to="/projects" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand"><ArrowLeft size={16} /> Projects</Link>
      <div className="card flex flex-wrap items-center gap-4 p-6">
        <div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-3"><h1 className="truncate text-2xl font-semibold">{p.name}</h1><StatusBadge status={p.status} /></div><p className="mt-1 text-sm text-slate-500">{p.type ?? 'Project'}</p></div>
        {manage && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={p.status} onChange={async e => { try { await setProjectStatus(p.id, e.target.value as ProjectStatus); load() } catch (er) { setError((er as Error).message) } }} className="rounded-xl border border-line bg-white px-3 py-2 text-sm" aria-label="Project status">
              {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
            </select>
            <button onClick={() => setEditing(true)} className="btn-ghost"><Pencil size={15} /> Edit</button>
            <button onClick={async () => { if (confirm(`Delete "${p.name}"? Tasks stay but lose their project link.`)) { try { await deleteProject(p.id); nav('/projects') } catch (e) { setError((e as Error).message) } } }} className="btn-ghost text-red-600" aria-label="Delete project"><Trash2 size={15} /></button>
          </div>
        )}
      </div>

      <Card title="Links">
        {!hasLinks ? <p className="text-sm text-slate-400">No URL, domain or repository added.</p> : (
          <ul className="divide-y divide-line">
            {p.url && <li className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-600"><Globe size={16} /></span><div className="min-w-0 flex-1"><p className="text-xs text-slate-400">URL / Domain</p><p className="truncate text-sm font-medium">{p.url}</p></div>{urlHref && <a href={urlHref} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5" aria-label="Open link"><ExternalLink size={14} /> Open</a>}</li>}
            {p.repository && <li className="flex items-center gap-3 py-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-slate-100 text-slate-700"><GitBranch size={16} /></span><div className="min-w-0 flex-1"><p className="text-xs text-slate-400">Repository</p><p className="truncate text-sm font-medium">{p.repository}</p></div>{repoHref && <a href={repoHref} target="_blank" rel="noopener noreferrer" className="btn-ghost px-3 py-1.5" aria-label="Open repository"><ExternalLink size={14} /> Open</a>}</li>}
          </ul>
        )}
      </Card>

      <Card title="Description">
        {p.description ? <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{p.description}</p> : <p className="text-sm text-slate-400">No description added.</p>}
      </Card>

      {editing && <ProjectForm title="Edit project" submitLabel="Save changes" initial={{ name: p.name, type: p.type ?? '', url: p.url ?? '', repository: p.repository ?? '', description: p.description ?? '', status: p.status }} onClose={() => setEditing(false)} onSubmit={async i => { await updateProject(p.id, i); setEditing(false); load() }} />}
    </div>
  )
}
