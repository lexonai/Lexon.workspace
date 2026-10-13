import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { FolderKanban, CheckCircle2, Users, MessageCircle, Plus, Upload, UserPlus, Sparkles } from 'lucide-react'
import { useAuth } from '../../auth/AuthProvider'
import { getHomeData, getWorkspaceId } from '../../services/home'
import { DEMO } from '../../lib/env'
import { Avatar, Card, EmptyState, ErrorState, PresenceDot } from '../../components/ui'
import { AreaChart } from '../../components/charts'
import AssistantPanel from '../../components/AssistantPanel'
import type { HomeData } from '../../types'

const statusStyle: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-600', inactive: 'bg-slate-100 text-slate-500', coming_soon: 'bg-violet-50 text-violet-600'
}
const label = (s: string) => s.replace('_', ' ').replace(/^\w/, c => c.toUpperCase())
const ago = (iso: string) => {
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000))
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`
}

export default function Home() {
  const { userId } = useAuth()
  const [data, setData] = useState<HomeData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [aName, setAName] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!userId) return
    setError(null); setData(null)
    try {
      const ws = DEMO ? 'demo' : await getWorkspaceId(userId)
      if (!ws) throw new Error('Your account is not linked to a workspace yet.')
      setData(await getHomeData(userId, ws))
    } catch (e) { setError((e as Error).message) }
  }, [userId])
  useEffect(() => { load() }, [load])

  if (error) return <ErrorState message={error} onRetry={load} />
  if (!data) return <p className="text-slate-500">Loading workspace…</p>

  const kpis = [
    { label: 'Total Projects', value: data.kpis.projects, icon: FolderKanban, tone: 'bg-blue-50 text-blue-600' },
    { label: 'Tasks Completed', value: data.kpis.tasksDone, icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-600' },
    { label: 'Team Members', value: data.kpis.members, icon: Users, tone: 'bg-violet-50 text-violet-600' },
    { label: 'Unread Notifications', value: data.kpis.unread, icon: MessageCircle, tone: 'bg-rose-50 text-rose-600' }
  ]
  const actions = [
    { label: 'Create New Project', icon: Plus, to: '/projects' },
    { label: 'Add Task', icon: CheckCircle2, to: '/tasks' },
    { label: 'Upload File', icon: Upload, to: '/files' },
    { label: 'Invite Team Member', icon: UserPlus, to: '/team' }
  ]

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 18 ? 'afternoon' : 'evening'}, {data.userName}</h1>
          <p className="text-sm text-slate-500">Here’s what’s happening in your workspace today.</p>
        </div>

        {!!data.warnings?.length && (
          <p role="status" className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800">Some sections could not be loaded and are shown empty. {data.warnings.join(' · ')}</p>
        )}

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {kpis.map(k => (
            <div key={k.label} className="card p-5">
              <span className={`grid h-10 w-10 place-items-center rounded-xl ${k.tone}`}><k.icon size={20} /></span>
              <p className="mt-3 text-sm text-slate-500">{k.label}</p>
              <p className="text-3xl font-semibold text-slate-900">{k.value}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card title="Tasks completed" action={<span className="text-xs text-slate-400">Last 7 days</span>}>
            <AreaChart data={data.progress} />
          </Card>
          <Card title="Upcoming Tasks" action={<Link to="/tasks" className="text-xs text-brand">View all</Link>}>
            {data.tasks.length === 0 ? <EmptyState text="No open tasks. Create one to get started." /> : (
              <ul className="divide-y divide-line">
                {data.tasks.map(t => (
                  <li key={t.id} className="py-2.5">
                    <p className="text-sm font-medium">{t.title}</p>
                    <p className="text-xs text-slate-400">{t.project ?? 'No project'}{t.due ? ` • ${new Date(t.due).toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : ''}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <Card title="Active Projects" action={<Link to="/projects" className="text-xs text-brand">View all</Link>}>
            {data.projects.length === 0 ? <EmptyState text="No projects yet." /> : (
              <ul className="space-y-4">
                {data.projects.map(p => (
                  <li key={p.id} className="flex items-center gap-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-slate-400">{p.type ?? 'Project'}</p>
                    </div>
                    <span className={`rounded-md px-2 py-0.5 text-xs font-medium ${statusStyle[p.status] ?? statusStyle.inactive}`}>{label(p.status)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Team" action={<Link to="/team" className="text-xs text-brand">View all</Link>}>
            {data.team.length === 0 ? <EmptyState text="No team members yet." /> : (
              <ul className="space-y-3">
                {data.team.map(m => (
                  <li key={m.id} className="flex items-center gap-3">
                    <Avatar name={m.name} src={m.avatar} />
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{m.name}</p><p className="truncate text-xs text-slate-400">{m.title ?? 'Member'}</p></div>
                    <PresenceDot status={m.presence} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <aside className="space-y-6">
        <div className="card bg-gradient-to-br from-blue-50 to-white p-5">
          <Sparkles className="text-brand" />
          <h2 className="mt-2 font-semibold">{aName ?? data.assistantName}</h2>
          <p className="mt-1 text-sm text-slate-500">Chat, ask questions or get suggestions. It knows your workspace and speaks your language.</p>
          <button onClick={() => setAssistantOpen(true)} className="mt-4 block w-full rounded-xl bg-brand py-2.5 text-center text-sm font-medium text-white">Open Assistant</button>
        </div>
        <Card title="Quick Actions">
          <ul className="space-y-1">
            {actions.map(a => (
              <li key={a.label}><Link to={a.to} className="flex items-center gap-3 rounded-lg p-2 text-sm hover:bg-slate-50"><span className="grid h-8 w-8 place-items-center rounded-lg bg-brand-soft text-brand"><a.icon size={16} /></span>{a.label}</Link></li>
            ))}
          </ul>
        </Card>
        <Card title="Recent Activity">
          {data.activity.length === 0 ? <EmptyState text="Activity will show up here." /> : (
            <ul className="space-y-3">
              {data.activity.map(a => (
                <li key={a.id} className="text-sm"><p className="font-medium">{label(a.action)}{a.title ? `: ${a.title}` : ''}</p><p className="text-xs text-slate-400">{ago(a.at)}</p></li>
              ))}
            </ul>
          )}
        </Card>
      </aside>
      {assistantOpen && <AssistantPanel name={aName ?? data.assistantName} onRename={setAName} onClose={() => setAssistantOpen(false)} />}
    </div>
  )
}
