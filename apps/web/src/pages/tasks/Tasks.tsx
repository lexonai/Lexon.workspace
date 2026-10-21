import { useCallback, useEffect, useState } from 'react'
import { Plus } from 'lucide-react'
import { useWorkspace } from '../../lib/useWorkspace'
import { deleteTask, listTasks, updateTask, type Task } from '../../services/tasks'
import { ErrorState } from '../../components/ui'
import TaskTable from './TaskTable'
import CreateTaskModal from './CreateTaskModal'

export default function Tasks() {
  const { ws, error: wsError, can, isAdmin } = useWorkspace()
  const [tasks, setTasks] = useState<Task[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [view, setView] = useState<'all' | 'mine'>('all')
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!ws) return
    setError(null)
    try { setTasks(await listTasks(ws.workspaceId)) } catch (e) { setError((e as Error).message) }
  }, [ws])
  useEffect(() => { load() }, [load])

  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={load} />
  if (!tasks || !ws) return <p className="text-slate-500">Loading tasks…</p>

  const mine = tasks.filter(t => t.assignees.some(a => a.id === ws.userId))
  const shown = isAdmin && view === 'all' ? tasks : mine
  const act = async (fn: () => Promise<void>) => { try { await fn(); load() } catch (e) { setError((e as Error).message) } }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Tasks</h1>
        <div className="flex items-center gap-3">
          <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Task view">
            <button role="tab" aria-selected={view === 'mine' || !isAdmin} onClick={() => setView('mine')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'mine' || !isAdmin ? 'bg-white shadow-card' : 'text-slate-500'}`}>My Tasks <span className="text-xs text-slate-400">{mine.length}</span></button>
            {isAdmin && <button role="tab" aria-selected={view === 'all'} onClick={() => setView('all')} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${view === 'all' ? 'bg-white shadow-card' : 'text-slate-500'}`}>All Tasks <span className="text-xs text-slate-400">{tasks.length}</span></button>}
          </div>
          {can('tasks.create') && <button onClick={() => setCreating(true)} className="btn-primary"><Plus size={16} /> Create task</button>}
        </div>
      </div>
      <TaskTable tasks={shown} myId={ws.userId} canEditAll={can('tasks.edit')}
        onChange={(id, patch) => act(() => updateTask(id, patch))} onDelete={id => act(() => deleteTask(id))} />
      {creating && <CreateTaskModal workspaceId={ws.workspaceId} userId={ws.userId} onClose={() => setCreating(false)} onCreated={() => { setCreating(false); load() }} />}
    </div>
  )
}
