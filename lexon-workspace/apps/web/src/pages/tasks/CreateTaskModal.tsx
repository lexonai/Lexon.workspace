import { useEffect, useState } from 'react'
import Modal, { inputCls } from '../../components/Modal'
import { listMembers, type Member } from '../../services/team'
import { listProjects, type Project } from '../../services/projects'
import { createTask } from '../../services/tasks'

export default function CreateTaskModal({ workspaceId, userId, defaultProject, onClose, onCreated }:
  { workspaceId: string; userId: string; defaultProject?: string; onClose: () => void; onCreated: () => void }) {
  const [members, setMembers] = useState<Member[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [f, setF] = useState({ title: '', description: '', projectId: defaultProject ?? '', due: '', priority: 'medium' })
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    listMembers(workspaceId).then(m => setMembers(m.filter(x => x.active))).catch(e => setError(e.message))
    listProjects(workspaceId).then(setProjects).catch(e => setError(e.message))
  }, [workspaceId])
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })
  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.title.trim()) return setError('Task name is required.')
    setBusy(true); setError(null)
    try { await createTask(workspaceId, userId, { ...f, assignees: picked }); onCreated() }
    catch (err) { setError((err as Error).message); setBusy(false) }
  }

  return (
    <Modal title="Create task" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">Task name<input className={inputCls} value={f.title} onChange={set('title')} /></label>
        <label className="block text-sm">Description<textarea rows={3} className={inputCls} value={f.description} onChange={set('description')} /></label>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm">Project
            <select className={inputCls} value={f.projectId} onChange={set('projectId')}>
              <option value="">No project</option>{projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
          <label className="text-sm">Due date<input type="date" className={inputCls} value={f.due} onChange={set('due')} /></label>
          <label className="text-sm">Priority
            <select className={inputCls} value={f.priority} onChange={set('priority')}>
              {['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p[0].toUpperCase() + p.slice(1)}</option>)}
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="text-sm">Assign members</legend>
          <div className="mt-2 grid max-h-44 gap-1 overflow-y-auto sm:grid-cols-2">
            {members.map(m => (
              <label key={m.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm">
                <input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} /> {m.name}
              </label>
            ))}
          </div>
        </fieldset>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? 'Creating…' : 'Create task'}</button>
        </div>
      </form>
    </Modal>
  )
}
