import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { useWorkspace } from '../../lib/useWorkspace'
import { disconnectGoogle, generate, listOutputs, loadYoutube, startGoogle, syncYoutube, type AiOutput, type Video } from '../../services/youtube'
import { Card, EmptyState, ErrorState } from '../../components/ui'
import HBars from '../../components/HBars'
import BarChart from '../../components/BarChart'
import Modal from '../../components/Modal'

type Tab = 'overview' | 'videos' | 'ai'
type Loaded = Awaited<ReturnType<typeof loadYoutube>>
const num = (v: Video, k: string) => (typeof v.metrics[k] === 'number' ? v.metrics[k] : null)
const fmt = (n: number | null, d = 0) => (n === null ? '—' : n.toLocaleString('en', { maximumFractionDigits: d }))
const avg = (xs: (number | null)[]) => { const a = xs.filter((x): x is number => x !== null); return a.length ? a.reduce((s, x) => s + x, 0) / a.length : null }
const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0)

const KINDS = [
  ['ideas', 'Video ideas'], ['hooks', 'Hooks'], ['titles', 'Titles'], ['scripts', 'Script'], ['thumbnail_concepts', 'Thumbnail concepts'],
  ['seo', 'SEO (title, description, tags)'], ['upload_timing', 'Upload timing'], ['shorts_ideas', 'Shorts ideas'], ['content_plan', '4-week content plan'],
  ['growth', 'Growth recommendations'], ['research', 'Content research (web)'], ['competitors', 'Competitor research (web)']
] as const

export default function YouTube() {
  const { ws, error: wsError, can } = useWorkspace()
  const [d, setD] = useState<Loaded | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!ws || !can('automations.manage')) return
    try { setD(await loadYoutube(ws.workspaceId)) } catch (e) { setError((e as Error).message) }
  }, [ws, can])
  useEffect(() => { load() }, [load])

  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={() => { setError(null); load() }} />
  if (ws && !can('automations.manage')) return <div className="card p-8 text-center text-slate-500">You do not have access to Automations.</div>
  if (!ws || !d) return <p className="text-slate-500">Loading YouTube data…</p>

  const connected = d.connection?.status === 'connected'
  const sync = async () => {
    setSyncing(true); setError(null); setMsg(null)
    try { const r = await syncYoutube(ws.workspaceId); setMsg(`Synced ${r.videos} videos.${r.notes.length ? ' Notes: ' + r.notes.join(' | ') : ''}`); await load() }
    catch (e) { setError((e as Error).message) }
    setSyncing(false)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Link to="/automations" className="text-sm text-slate-500 hover:text-brand">← Automations</Link><h1 className="text-2xl font-semibold">YouTube Automation</h1>
          {d.snapshot && <p className="text-sm text-slate-500">{d.snapshot.channelTitle} · synced {d.connection?.lastSync ? new Date(d.connection.lastSync).toLocaleString() : '—'}</p>}</div>
        {!d.linked
          ? <Link to="/integrations" className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Link YouTube project</Link>
          : connected
            ? <div className="flex gap-2"><button disabled={syncing} onClick={sync} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60"><RefreshCw size={16} className={syncing ? 'animate-spin' : ''} /> {syncing ? 'Syncing…' : 'Sync now'}</button>
                <button onClick={async () => { if (confirm('Disconnect the Google account?')) { try { await disconnectGoogle(ws.workspaceId); await load() } catch (e) { setError((e as Error).message) } } }} className="rounded-lg border border-line px-4 py-2 text-sm">Disconnect</button></div>
            : <button onClick={async () => { try { window.location.href = await startGoogle(ws.workspaceId) } catch (e) { setError((e as Error).message) } }} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Connect Google account</button>}
      </div>
      {msg && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{msg}</p>}
      {!connected && <div className="card p-6 text-sm text-slate-500">{d.linked ? 'Connect your Google account, then press “Sync now”.' : 'First link the YouTube project (its own Supabase backend) in Integrations, then connect your Google account.'} All numbers here come from the YouTube Data and Analytics APIs; nothing is simulated.</div>}

      <div className="flex gap-1 border-b border-line" role="tablist">
        {(['overview', 'videos', 'ai'] as Tab[]).map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${tab === t ? 'border-brand text-brand' : 'border-transparent text-slate-500'}`}>{t === 'ai' ? 'AI Studio' : t[0].toUpperCase() + t.slice(1)}</button>)}
      </div>
      {tab === 'overview' && <Overview d={d} />}
      {tab === 'videos' && <Videos videos={d.videos} />}
      {tab === 'ai' && <AiStudio ws={ws.workspaceId} hasData={d.videos.length > 0} />}
    </div>
  )
}

function Overview({ d }: { d: Loaded }) {
  const v = d.videos
  const stats = useMemo(() => {
    const views = sum(v.map(x => num(x, 'views')))
    const eng = sum(v.map(x => (num(x, 'likes') ?? 0) + (num(x, 'comments') ?? 0)))
    const group = (s: boolean) => { const g = v.filter(x => x.isShort === s); return { count: g.length, views: sum(g.map(x => num(x, 'views'))), avg: avg(g.map(x => num(x, 'views'))) } }
    return {
      views, engagement: views ? (eng / views) * 100 : null,
      watchHours: v.some(x => num(x, 'estimatedMinutesWatched') !== null) ? sum(v.map(x => num(x, 'estimatedMinutesWatched'))) / 60 : null,
      ctr: avg(v.map(x => num(x, 'videoThumbnailImpressionsClickRate'))), retention: avg(v.map(x => num(x, 'averageViewPercentage'))),
      shorts: group(true), long: group(false)
    }
  }, [v])
  if (v.length === 0) return <div className="card"><EmptyState text="No synced data yet. Connect YouTube and press Sync now." /></div>
  const top = [...v].sort((a, b) => (num(b, 'views') ?? 0) - (num(a, 'views') ?? 0)).slice(0, 8)
  const recent = [...v].filter(x => x.publishedAt).sort((a, b) => a.publishedAt!.localeCompare(b.publishedAt!)).slice(-20)
  const kpis = [
    ['Subscribers', fmt(d.snapshot?.subscribers ?? null)], ['Channel views', fmt(d.snapshot?.totalViews ?? null)], ['Videos synced', fmt(v.length)],
    ['Watch time (h)', fmt(stats.watchHours, 0)], ['Avg CTR', stats.ctr === null ? '—' : `${fmt(stats.ctr, 1)}%`], ['Avg retention', stats.retention === null ? '—' : `${fmt(stats.retention, 0)}%`],
    ['Engagement', stats.engagement === null ? '—' : `${fmt(stats.engagement, 1)}%`]
  ]
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{kpis.map(([l, val]) => <div key={l} className="card p-5"><p className="text-sm text-slate-500">{l}</p><p className="text-2xl font-semibold">{val}</p></div>)}</div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Views of recent videos (oldest → newest)"><BarChart data={recent.map(x => ({ label: new Date(x.publishedAt!).toLocaleDateString('en', { month: 'short', day: 'numeric' }), value: num(x, 'views') ?? 0 }))} /></Card>
        <Card title="Top videos by views"><HBars items={top.map(x => ({ label: x.title.slice(0, 48), value: num(x, 'views') ?? 0 }))} /></Card>
        <Card title="Shorts vs long-form"><div className="grid grid-cols-2 gap-4 text-sm">
          {([['Shorts', stats.shorts], ['Long-form', stats.long]] as const).map(([n, s]) => <div key={n} className="rounded-xl bg-slate-50 p-4"><p className="font-medium">{n}</p><p className="text-slate-500">{s.count} videos</p><p>{fmt(s.views)} views</p><p className="text-slate-500">avg {fmt(s.avg)} / video</p></div>)}
        </div><p className="mt-3 text-xs text-slate-400">Shorts are detected as videos of 60 seconds or less.</p></Card>
      </div>
      {stats.ctr === null && <p className="text-xs text-slate-400">CTR is shown only when YouTube Analytics returns thumbnail click-through data for your channel; see the sync log in Integrations.</p>}
    </div>
  )
}

function Videos({ videos }: { videos: Video[] }) {
  const [filter, setFilter] = useState<'all' | 'short' | 'long'>('all')
  const [sort, setSort] = useState<'views' | 'date' | 'ctr' | 'retention'>('date')
  const [picked, setPicked] = useState<string[]>([])
  const [compare, setCompare] = useState(false)
  const key = { views: 'views', ctr: 'videoThumbnailImpressionsClickRate', retention: 'averageViewPercentage' } as const
  const list = videos.filter(v => filter === 'all' || (filter === 'short') === v.isShort)
    .sort((a, b) => sort === 'date' ? (b.publishedAt ?? '').localeCompare(a.publishedAt ?? '') : (num(b, key[sort]) ?? -1) - (num(a, key[sort]) ?? -1))
  const chosen = videos.filter(v => picked.includes(v.id))
  if (videos.length === 0) return <div className="card"><EmptyState text="No videos synced yet." /></div>
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <select value={filter} onChange={e => setFilter(e.target.value as any)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm" aria-label="Filter"><option value="all">All</option><option value="short">Shorts</option><option value="long">Long-form</option></select>
        <select value={sort} onChange={e => setSort(e.target.value as any)} className="rounded-lg border border-line bg-white px-3 py-2 text-sm" aria-label="Sort"><option value="date">Newest</option><option value="views">Views</option><option value="ctr">CTR</option><option value="retention">Retention</option></select>
        <button disabled={picked.length < 2} onClick={() => setCompare(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-40">Compare ({picked.length}/3)</button>
      </div>
      <div className="card overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-xs text-slate-400"><th className="p-3" /><th className="p-3">Video</th><th className="p-3">Views</th><th className="p-3">CTR</th><th className="p-3">Retention</th><th className="p-3">Watch (h)</th><th className="p-3">Likes</th><th className="p-3">Comments</th></tr></thead>
          <tbody className="divide-y divide-line">
            {list.map(v => (
              <tr key={v.id}>
                <td className="p-3"><input type="checkbox" aria-label={`Select ${v.title}`} checked={picked.includes(v.id)} disabled={!picked.includes(v.id) && picked.length >= 3} onChange={() => setPicked(p => p.includes(v.id) ? p.filter(x => x !== v.id) : [...p, v.id])} /></td>
                <td className="p-3"><span className="flex items-center gap-3">{v.thumb && <img src={v.thumb} alt="" className="h-9 w-16 rounded object-cover" />}<span><span className="line-clamp-1 font-medium">{v.title}</span><span className="text-xs text-slate-400">{v.isShort ? 'Short' : 'Long'} · {v.publishedAt ? new Date(v.publishedAt).toLocaleDateString() : ''}</span></span></span></td>
                <td className="p-3">{fmt(num(v, 'views'))}</td><td className="p-3">{num(v, 'videoThumbnailImpressionsClickRate') === null ? '—' : `${fmt(num(v, 'videoThumbnailImpressionsClickRate'), 1)}%`}</td>
                <td className="p-3">{num(v, 'averageViewPercentage') === null ? '—' : `${fmt(num(v, 'averageViewPercentage'), 0)}%`}</td>
                <td className="p-3">{num(v, 'estimatedMinutesWatched') === null ? '—' : fmt((num(v, 'estimatedMinutesWatched') ?? 0) / 60, 1)}</td><td className="p-3">{fmt(num(v, 'likes'))}</td><td className="p-3">{fmt(num(v, 'comments'))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {compare && (
        <Modal title="Compare videos" onClose={() => setCompare(false)} wide>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <thead><tr><th className="p-2 text-left text-xs text-slate-400">Metric</th>{chosen.map(v => <th key={v.id} className="p-2 text-left align-top font-medium">{v.title.slice(0, 40)}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {([['Views', 'views'], ['CTR %', 'videoThumbnailImpressionsClickRate'], ['Avg view %', 'averageViewPercentage'], ['Avg view (s)', 'averageViewDuration'], ['Watch min', 'estimatedMinutesWatched'], ['Likes', 'likes'], ['Comments', 'comments'], ['Shares', 'shares'], ['Subs gained', 'subscribersGained']] as const).map(([l, k]) => (
                <tr key={k}><td className="p-2 text-slate-500">{l}</td>{chosen.map(v => <td key={v.id} className="p-2">{fmt(num(v, k), 1)}</td>)}</tr>
              ))}
              <tr><td className="p-2 text-slate-500">Type</td>{chosen.map(v => <td key={v.id} className="p-2">{v.isShort ? 'Short' : 'Long'} · {Math.round(v.durationS / 60)} min</td>)}</tr>
            </tbody></table></div>
        </Modal>
      )}
    </div>
  )
}

function AiStudio({ ws, hasData }: { ws: string; hasData: boolean }) {
  const [kind, setKind] = useState<string>('ideas')
  const [input, setInput] = useState('')
  const [out, setOut] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hist, setHist] = useState<AiOutput[]>([])
  const loadHist = useCallback(() => { listOutputs(ws).then(setHist).catch(() => {}) }, [ws])
  useEffect(loadHist, [loadHist])
  const run = async () => {
    setBusy(true); setError(null); setOut(null)
    try { setOut((await generate(ws, kind, input)).output); loadHist() } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card title="AI Studio">
        {!hasData && <p className="mb-3 rounded-lg bg-amber-50 p-3 text-xs text-amber-700">Sync your channel first. Channel-based suggestions need your data (web research works without it).</p>}
        <div className="space-y-3">
          <select value={kind} onChange={e => setKind(e.target.value)} className="w-full rounded-lg border border-line bg-white px-3 py-2 text-sm" aria-label="What to generate">{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          <textarea rows={3} value={input} onChange={e => setInput(e.target.value)} placeholder="Topic or notes (optional for plans and growth)…" className="w-full rounded-lg border border-line px-3 py-2 text-sm" />
          <button disabled={busy} onClick={run} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? 'Generating…' : 'Generate'}</button>
          {kind === 'thumbnail_concepts' && <p className="text-xs text-slate-400">This produces written concepts. Image generation needs an image-API key and is not enabled.</p>}
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          {out && <pre className="whitespace-pre-wrap rounded-xl bg-slate-50 p-4 font-sans text-sm">{out}</pre>}
        </div>
      </Card>
      <Card title="History">
        {hist.length === 0 ? <EmptyState text="Nothing generated yet." /> : <ul className="space-y-2 text-sm">{hist.map(h => <li key={h.id}><button onClick={() => setOut(h.output)} className="w-full rounded-lg p-2 text-left hover:bg-slate-50"><span className="block font-medium">{KINDS.find(k => k[0] === h.kind)?.[1] ?? h.kind}</span><span className="text-xs text-slate-400">{new Date(h.at).toLocaleString()}</span></button></li>)}</ul>}
      </Card>
    </div>
  )
}
