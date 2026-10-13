import { useEffect, useState } from 'react'
import { useWorkspace } from '../../lib/useWorkspace'
import { listTasks, type Task } from '../../services/tasks'
import { listMemberActivity } from '../../services/team'
import { Card, EmptyState, ErrorState } from '../../components/ui'

interface Item { id: string; kind: 'assigned' | 'completed' | 'created' | 'other'; title: string; at: string }
const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
const tone = { assigned: 'bg-blue-50 text-blue-600', completed: 'bg-emerald-50 text-emerald-600', created: 'bg-violet-50 text-violet-600', other: 'bg-slate-100 text-slate-500' }

export default function Activity() {
  const { ws, error: wsError } = useWorkspace()
  const [items, setItems] = useState<Item[] | null>(null)
  const [pending, setPending] = useState<Task[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!ws) return
    ;(async () => {
      try {
        const [a, t] = await Promise.all([listMemberActivity(ws.workspaceId, ws.userId), listTasks(ws.workspaceId)])
        const list: Item[] = [
          ...a.map(x => ({ id: 'a' + x.id, kind: (x.action === 'task_completed' ? 'completed' : x.action === 'task_created' ? 'created' : 'other') as Item['kind'], title: `${label(x.action)}${x.title ? `: ${x.title}` : ''}`, at: x.at }))
        ].sort((p, q) => q.at.localeCompare(p.at))
        setItems(list)
        setPending(t.filter(x => x.status !== 'done' && x.assignees.some(s => s.id === ws.userId)))
      } catch (e) { setError((e as Error).message) }
    })()
  }, [ws])

  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={() => location.reload()} />
  if (!items) return <p className="text-slate-500">Loading activity…</p>
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Activity</h1>
      <Card title="Pending work">
        {pending.length === 0 ? <EmptyState text="Nothing pending." /> : <ul className="divide-y divide-line text-sm">{pending.map(t => <li key={t.id} className="flex items-center justify-between gap-3 py-2.5"><span className="min-w-0"><span className="block truncate font-medium">{t.title}</span><span className="text-xs text-slate-400">{t.projectName ?? 'No project'} · {label(t.status)}{t.due ? ` · due ${new Date(t.due).toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : ''}</span></span><span className="text-xs text-slate-500">{t.progress}%</span></li>)}</ul>}
      </Card>
      <div className="space-y-3">
        {items.length === 0 && <div className="card"><EmptyState text="No activity yet." /></div>}
        {items.map(i => (
          <div key={i.id} className="card flex items-start gap-3 p-4">
            <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${tone[i.kind]}`}>{i.kind === 'other' ? 'Update' : label(i.kind)}</span>
            <p className="flex-1 text-sm">{i.title}</p>
            <time className="shrink-0 text-xs text-slate-400" dateTime={i.at}>{new Date(i.at).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</time>
          </div>
        ))}
      </div>
    </div>
  )
}
