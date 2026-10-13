import { useCallback, useEffect, useState } from 'react'
import { useWorkspace } from '../../lib/useWorkspace'
import { getAnalytics, type AnalyticsData } from '../../services/analytics'
import { Card, EmptyState, ErrorState } from '../../components/ui'
import { AreaChart, DonutChart, GroupedBars, Sparkline } from '../../components/charts'
import BarChart from '../../components/BarChart'
import HBars from '../../components/HBars'

const mb = (n: number) => n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : `${(n / 1048576).toFixed(1)} MB`

export default function Analytics() {
  const { ws, error: wsError } = useWorkspace()
  const [days, setDays] = useState(30)
  const [d, setD] = useState<AnalyticsData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const load = useCallback(async () => {
    if (!ws) return
    setError(null); setD(null)
    try { setD(await getAnalytics(ws.workspaceId, days)) } catch (e) { setError((e as Error).message) }
  }, [ws, days])
  useEffect(() => { load() }, [load])
  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={load} />

  const pts = (v: number[]) => d!.days.map((label, i) => ({ label, value: v[i] ?? 0 }))
  const kpis = d && [
    { label: 'Total tasks', value: d.kpis.total, spark: d.spark.created, color: '#2563eb' },
    { label: 'Completed', value: d.kpis.done, spark: d.spark.completed, color: '#10b981' },
    { label: 'Pending', value: d.kpis.pending, spark: d.spark.created, color: '#f59e0b' },
    { label: 'Overdue', value: d.kpis.overdue, spark: [], color: '#ef4444', warn: d.kpis.overdue > 0 },
    { label: 'Completion rate', value: `${d.kpis.rate}%`, spark: d.spark.completed, color: '#8b5cf6' },
    { label: 'Team members', value: d.kpis.members, spark: [], color: '#06b6d4' }
  ]
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Analytics</h1><p className="text-sm text-slate-500">Live data from your workspace</p></div>
        <div className="flex gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Date range">{[7, 30, 90].map(n => <button key={n} role="tab" aria-selected={days === n} onClick={() => setDays(n)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${days === n ? 'bg-white shadow-card' : 'text-slate-500'}`}>{n} days</button>)}</div>
      </div>
      {!d || !kpis ? <p className="text-slate-500">Loading analytics…</p> : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {kpis.map(k => <div key={k.label} className="card flex flex-col justify-between p-4"><p className="text-xs text-slate-500">{k.label}</p><div className="mt-1 flex items-end justify-between gap-2"><p className={`text-2xl font-semibold ${'warn' in k && k.warn ? 'text-red-600' : ''}`}>{k.value}</p>{k.spark.length > 1 && <Sparkline values={k.spark} color={k.color} />}</div></div>)}
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Tasks completed"><AreaChart data={pts(d.completed)} color="#10b981" /></Card>
            <Card title="Created vs completed"><GroupedBars labels={d.days} series={[{ name: 'Created', color: '#2563eb', values: d.created }, { name: 'Completed', color: '#10b981', values: d.completed }]} /></Card>
            <Card title="Tasks by status"><DonutChart items={d.byStatus} centerLabel="Tasks" /></Card>
            <Card title="Tasks by priority"><DonutChart items={d.byPriority} centerLabel="Tasks" /></Card>
            <Card title="Workspace activity"><AreaChart data={pts(d.activity)} color="#8b5cf6" /></Card>
            <Card title="Activity by weekday"><BarChart data={d.weekday} color="#2563eb" /></Card>
            <Card title="Projects by status">{d.kpis.projects === 0 ? <EmptyState text="No projects yet." /> : <DonutChart items={d.projectsByStatus} centerLabel="Projects" />}</Card>
            <Card title="Most active team members">{d.topMembers.length === 0 ? <EmptyState text="No team activity in this period." /> : <HBars items={d.topMembers} color="bg-violet-500" />}</Card>
          </div>
          <Card title="Storage"><p className="text-sm text-slate-500">{d.files.count} files · {mb(d.files.bytes)} stored</p></Card>
        </>
      )}
    </div>
  )
}
