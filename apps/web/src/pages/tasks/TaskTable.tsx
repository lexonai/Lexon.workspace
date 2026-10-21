import { Trash2 } from 'lucide-react'
import { Avatar, EmptyState } from '../../components/ui'
import type { Task, TaskStatus } from '../../services/tasks'

const GROUPS: { key: TaskStatus; label: string; tone: string }[] = [
  { key: 'todo', label: 'To Do', tone: 'bg-sky-50' }, { key: 'in_progress', label: 'In Progress', tone: 'bg-amber-50' },
  { key: 'review', label: 'Review', tone: 'bg-violet-50' }, { key: 'done', label: 'Done', tone: 'bg-emerald-50' }
]
const prio: Record<string, string> = { low: 'bg-blue-50 text-blue-600', medium: 'bg-amber-50 text-amber-600', high: 'bg-rose-50 text-rose-600', urgent: 'bg-red-100 text-red-700' }
const sel = 'rounded-md border border-line bg-white px-1.5 py-1 text-xs'

interface Props {
  tasks: Task[]; myId: string; canEditAll: boolean
  onChange: (id: string, patch: { status?: TaskStatus; progress?: number }) => void
  onDelete: (id: string) => void
}

export default function TaskTable({ tasks, myId, canEditAll, onChange, onDelete }: Props) {
  if (tasks.length === 0) return <div className="card"><EmptyState text="No tasks yet." /></div>
  return (
    <div className="space-y-5">
      {GROUPS.map(g => {
        const list = tasks.filter(t => t.status === g.key)
        if (list.length === 0) return null
        return (
          <section key={g.key} className="card overflow-hidden">
            <h3 className={`${g.tone} px-4 py-2 text-sm font-semibold`}>{g.label} <span className="ml-1 text-xs font-normal text-slate-500">{list.length}</span></h3>
            <ul className="divide-y divide-line">
              {list.map(t => {
                const mine = t.assignees.some(a => a.id === myId)
                const editable = canEditAll || mine
                const overdue = t.due && t.status !== 'done' && new Date(t.due) < new Date()
                return (
                  <li key={t.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-[180px] flex-1">
                      <p className="text-sm font-medium">{t.title}</p>
                      <p className="text-xs text-slate-400">{t.projectName ?? 'No project'}</p>
                    </div>
                    <div className="flex -space-x-2">{t.assignees.slice(0, 4).map(a => <span key={a.id} title={a.name} className="rounded-full ring-2 ring-white"><Avatar name={a.name} src={a.avatar} size={26} /></span>)}</div>
                    <span className={`text-xs ${overdue ? 'text-red-600' : 'text-slate-500'}`}>{t.due ? new Date(t.due).toLocaleDateString('en', { month: 'short', day: 'numeric' }) : 'No date'}</span>
                    <select disabled={!editable} value={t.progress} aria-label="Progress" className={sel}
                      onChange={e => { const p = Number(e.target.value); onChange(t.id, p === 100 ? { progress: 100, status: 'done' } : { progress: p }) }}>
                      {[0, 25, 50, 75, 100].map(v => <option key={v} value={v}>{v}%</option>)}
                    </select>
                    <select disabled={!editable} value={t.status} aria-label="Status" className={sel}
                      onChange={e => { const s = e.target.value as TaskStatus; onChange(t.id, s === 'done' ? { status: s } : { status: s, progress: Math.min(t.progress, 99) }) }}>
                      {GROUPS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
                    </select>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium capitalize ${prio[t.priority] ?? prio.medium}`}>{t.priority}</span>
                    {canEditAll && <button aria-label="Delete task" onClick={() => confirm(`Delete "${t.title}"?`) && onDelete(t.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>}
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
