import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ArrowLeft, Briefcase, Building2, ChevronRight } from 'lucide-react'
import { useWorkspace } from '../../lib/useWorkspace'
import { callFn } from '../../lib/functions'
import { AUTOMATION_PROVIDERS, disconnect, linkAutomation, linkProject, listIntegrations, listLogs, PROVIDERS, saveConfig, startConnect, linkOffice, pingOffice, unlinkAutomation, unlinkOffice, unlinkProject, type Integration, type IntegrationLog, type Provider } from '../../services/integrations'
import { ErrorState } from '../../components/ui'
import Modal, { inputCls } from '../../components/Modal'
import AiSection from './AiSection'
import { useFixedPage } from '../../lib/useFixedPage'

const badge: Record<string, string> = { connected: 'bg-emerald-50 text-emerald-700', configured: 'bg-blue-50 text-blue-700', error: 'bg-red-50 text-red-700', disconnected: 'bg-slate-100 text-slate-500' }
const WS_OAUTH = ['google', 'github', 'google_drive', 'google_calendar', 'gmail']
const AUTOMATION: Provider = { key: 'automation', name: 'Automation backend (YouTube + Instagram)', desc: 'ONE Supabase project (one URL, one key) for YouTube and Instagram automation', mode: 'project' }
const WS_CONFIG = ['webhooks', 'custom_api']
type View = 'home' | 'workspace' | 'office'

// The API Manager page never scrolls, slides or zooms as a whole; only the lists inside it scroll.
function FixedPage({ children }: { children: React.ReactNode }) {
  const ref = useFixedPage<HTMLDivElement>()
  return <div ref={ref} className="flex min-w-0 flex-col gap-6 overflow-hidden">{children}</div>
}

export default function Integrations() {
  const { ws, error: wsError, can } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [view, setView] = useState<View>('home')
  const [rows, setRows] = useState<Integration[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [logs, setLogs] = useState<{ id: string; items: IntegrationLog[] } | null>(null)
  const [cfg, setCfg] = useState<Provider | null>(null)
  const [url, setUrl] = useState('')
  const [link, setLink] = useState<Provider | null>(null)
  const [pUrl, setPUrl] = useState('')
  const [pKey, setPKey] = useState('')
  const [test, setTest] = useState<Record<string, string>>({})
  const manage = can('integrations.manage')

  const load = useCallback(async () => {
    if (!ws) return
    try { setRows(await listIntegrations(ws.workspaceId)) } catch (e) { setError((e as Error).message) }
  }, [ws])
  useEffect(() => { load() }, [load])

  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={() => { setError(null); load() }} />
  if (!ws || !rows) return <p className="text-slate-500">Loading integrations…</p>
  const by = (k: string) => rows.find(r => r.provider === k)
  const run = async (key: string, fn: () => Promise<void>) => { setBusy(key); setError(null); try { await fn(); await load() } catch (e) { setError((e as Error).message) } setBusy(null) }
  const ping = async (project: string) => {
    setTest(t => ({ ...t, [project]: 'Testing…' }))
    if (project === 'office') { try { const r = await pingOffice(ws.workspaceId); setTest(t => ({ ...t, office: r.ok ? '✓ Office is reachable and accepts the SSO secret.' : '✗ Office is not reachable or rejected the secret.' })); load() } catch (e) { setTest(t => ({ ...t, office: '✗ ' + (e as Error).message })) } return }
    try { const r = await callFn<{ ok: boolean; tables: Record<string, string> }>('project-gateway', { workspaceId: ws.workspaceId, project, action: 'ping' }); const bad = Object.entries(r.tables).filter(([, v]) => v !== 'ok'); setTest(t => ({ ...t, [project]: r.ok ? '✓ Connection healthy, schema complete.' : `✗ Linked, but these tables failed: ${bad.map(([k, v]) => `${k} (${v})`).join('; ')}. Run the project's SQL.` })); load() }
    catch (e) { setTest(t => ({ ...t, [project]: '✗ ' + (e as Error).message })) }
  }

  const Card = ({ p }: { p: Provider }) => {
    const i = by(p.key)
    const status = p.mode === 'builtin' ? 'connected' : i?.status ?? 'disconnected'
    const on = status === 'connected' || status === 'configured'
    return (
      <div className="card flex flex-col p-5">
        <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{p.name}</p><p className="text-xs text-slate-400">{p.desc}</p></div><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${badge[status] ?? badge.disconnected}`}>{p.mode === 'builtin' ? 'Built-in' : status}</span></div>
        {i?.accountLabel && <p className="mt-3 text-sm text-slate-600">{i.accountLabel}</p>}
        {i?.lastSyncAt && <p className="text-xs text-slate-400">Last activity {new Date(i.lastSyncAt).toLocaleString()}</p>}
        {i?.lastError && <p className="mt-2 text-xs text-red-600">{i.lastError}</p>}
        {test[p.key] && <p className="mt-2 text-xs text-slate-600">{test[p.key]}</p>}
        {i && i.scopes.length > 0 && <details className="mt-2 text-xs text-slate-400"><summary className="cursor-pointer">Permissions ({i.scopes.length})</summary><ul className="mt-1 break-all">{i.scopes.map(s => <li key={s}>{s.replace('https://www.googleapis.com/auth/', '')}</li>)}</ul></details>}
        <div className="mt-4 flex flex-wrap gap-2">
          {p.mode === 'oauth' && manage && (on
            ? <button disabled={busy === p.key} onClick={() => confirm(`Disconnect ${p.name}?`) && run(p.key, () => disconnect(ws.workspaceId, p.key))} className="btn-ghost px-3 py-1.5">Disconnect</button>
            : <button disabled={busy === p.key} onClick={() => run(p.key, async () => { window.location.href = await startConnect(ws.workspaceId, p.key) })} className="btn-primary px-3 py-1.5">{busy === p.key ? 'Opening…' : 'Connect'}</button>)}
          {p.mode === 'project' && manage && (on
            ? <><button onClick={() => ping(p.key)} className="btn-ghost px-3 py-1.5">Test connection</button><button disabled={busy === p.key} onClick={() => confirm(`Unlink ${p.name}? Its stored key will be deleted.`) && run(p.key, async () => { await (p.key === 'office' ? unlinkOffice : unlinkProject)(ws.workspaceId, p.key) })} className="btn-ghost px-3 py-1.5">Unlink</button></>
            : <button onClick={() => { setLink(p); setPUrl(''); setPKey('') }} className="btn-primary px-3 py-1.5">{p.key === 'office' ? 'Link Office' : 'Link project'}</button>)}
          {p.mode === 'config' && manage && <button onClick={() => { setCfg(p); setUrl(i?.config?.url ?? '') }} className="btn-primary px-3 py-1.5">Configure</button>}
          {i && <button onClick={async () => setLogs(logs?.id === i.id ? null : { id: i.id, items: await listLogs(i.id).catch(() => []) })} className="px-3 py-1.5 text-sm text-slate-500 hover:text-slate-900">Logs</button>}
        </div>
        {i && logs?.id === i.id && <ul className="mt-3 space-y-1 border-t border-line pt-3 text-xs">{logs.items.length === 0 ? <li className="text-slate-400">No log entries.</li> : logs.items.map(l => <li key={l.id}><span className={l.level === 'warn' || l.level === 'error' ? 'text-amber-600' : 'text-slate-400'}>{new Date(l.at).toLocaleString()}</span> {l.message}</li>)}</ul>}
      </div>
    )
  }
  const AutomationCard = () => {
    const st = AUTOMATION_PROVIDERS.map(k => by(k)?.status === 'connected')
    const all = st.every(Boolean), some = st.some(Boolean)
    const first = by('youtube') ?? by('instagram')
    return (
      <div className="card flex flex-col p-5 sm:col-span-2 xl:col-span-3">
        <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{AUTOMATION.name}</p><p className="text-xs text-slate-400">{AUTOMATION.desc}</p></div>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${all ? badge.connected : some ? badge.error : badge.disconnected}`}>{all ? 'connected' : some ? 'partly linked' : 'disconnected'}</span></div>
        {first?.accountLabel && <p className="mt-3 text-sm text-slate-600">{first.accountLabel}</p>}
        {some && !all && <p className="mt-2 text-xs text-red-600">Only {AUTOMATION_PROVIDERS.filter((_, i) => st[i]).join(', ')} is linked. Unlink and link again with the shared project.</p>}
        {test.automation && <p className="mt-2 text-xs text-slate-600">{test.automation}</p>}
        {manage && (
          <div className="mt-4 flex flex-wrap gap-2">
            {some && <button onClick={async () => { setTest(t => ({ ...t, automation: 'Testing…' })); const out: string[] = []; for (const k of AUTOMATION_PROVIDERS) { try { const r = await callFn<{ ok: boolean; tables: Record<string, string> }>('project-gateway', { workspaceId: ws.workspaceId, project: k, action: 'ping' }); out.push(r.ok ? `✓ ${k} schema complete` : `✗ ${k}: ${Object.entries(r.tables).filter(([, v]) => v !== 'ok').map(([t, v]) => `${t} (${v})`).join('; ')}`) } catch (e) { out.push(`✗ ${k}: ${(e as Error).message}`) } } setTest(t => ({ ...t, automation: out.join(' · ') })); load() }} className="btn-ghost px-3 py-1.5">Test connection</button>}
            {some && <button disabled={busy === 'automation'} onClick={() => confirm('Unlink the shared Automation backend? Its stored key will be deleted.') && run('automation', () => unlinkAutomation(ws.workspaceId))} className="btn-ghost px-3 py-1.5">Unlink</button>}
            {!all && <button onClick={() => { setLink(AUTOMATION); setPUrl(''); setPKey('') }} className="btn-primary px-3 py-1.5">Link project</button>}
          </div>
        )}
      </div>
    )
  }
  const group = (keys: string[]) => PROVIDERS.filter(p => keys.includes(p.key))
  const banner = (
    <>
      {params.get('connected') && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">Connected {params.get('connected')}. <button className="underline" onClick={() => setParams({})}>Dismiss</button></p>}
      {params.get('error') && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">Connection failed: {params.get('error')}. <button className="underline" onClick={() => setParams({})}>Dismiss</button></p>}
      {!manage && <p className="text-sm text-slate-500">Only Admins can change integrations.</p>}
    </>
  )
  const back = (title: string) => <div className="flex items-center gap-3"><button onClick={() => setView('home')} aria-label="Back to integrations" className="grid h-9 w-9 place-items-center rounded-xl border border-line bg-white hover:bg-slate-50"><ArrowLeft size={16} /></button><h1 className="text-2xl font-semibold">{title}</h1></div>

  return (
    <FixedPage>
      {view === 'home' && (
        <>
          <div><h1 className="text-2xl font-semibold">Integrations</h1><p className="text-sm text-slate-500">Workspace and Office are separate systems with separate integrations.</p></div>
          {banner}
          <div className="grid gap-4 md:grid-cols-2">
            {([['workspace', 'Lexon Workspace', 'Google, GitHub, Google Drive, Calendar, Gmail, the Gemini assistant, Instagram and YouTube automation backends, webhooks.', Briefcase], ['office', 'Lexon Office', 'The separate Office environment: its backend plus AI models and APIs (free providers, custom APIs).', Building2]] as const).map(([k, t, d, Icon]) => (
              <button key={k} onClick={() => setView(k)} className="card card-hover group flex items-start gap-4 p-6 text-left">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-slate-900 text-white"><Icon size={22} /></span>
                <span className="min-w-0 flex-1"><span className="block text-lg font-semibold">{t}</span><span className="mt-1 block text-sm text-slate-500">{d}</span></span>
                <ChevronRight className="mt-1 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-700" />
              </button>
            ))}
          </div>
        </>
      )}

      {view === 'workspace' && (
        <>
          {back('Lexon Workspace integrations')}{banner}
          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain pr-1">
          <AiSection ws={ws.workspaceId} scope="workspace" onlyIds={['gemini']} title="Assistant (Google Gemini)" intro="Add a Gemini API key to power the Home assistant. It answers general questions and uses your workspace data. Free keys are available from Google AI Studio." />
          <section className="space-y-3"><h2 className="text-sm font-semibold text-slate-500">Accounts</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{group(WS_OAUTH).map(p => <Card key={p.key} p={p} />)}</div></section>
          <section className="space-y-3"><h2 className="text-sm font-semibold text-slate-500">Automation backend (one shared Supabase project)</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"><AutomationCard /></div></section>
          <section className="space-y-3"><h2 className="text-sm font-semibold text-slate-500">Webhooks and other APIs</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{group(['supabase', ...WS_CONFIG]).map(p => <Card key={p.key} p={p} />)}</div></section>
          </div>
        </>
      )}

      {view === 'office' && (
        <>
          {back('Lexon Office integrations')}{banner}
          <section className="shrink-0 space-y-3"><h2 className="text-sm font-semibold text-slate-500">Office server (no separate login: opens inside Workspace)</h2><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{group(['office']).map(p => <Card key={p.key} p={p} />)}</div></section>
          <AiSection fill ws={ws.workspaceId} scope="office" title="AI models and APIs" intro="Connect as many AI models and APIs as you like for the Office. Pick from the free-provider list or add your own custom API." />
        </>
      )}

      {link && (
        <Modal title={link.key === 'automation' ? 'Link the Automation backend' : link.key === 'office' ? 'Link Lexon Office' : `Link ${link.name}`} onClose={() => setLink(null)}>
          <form onSubmit={e => { e.preventDefault(); const p = link; setLink(null); run(p.key, async () => { if (p.key === 'automation') await linkAutomation(ws.workspaceId, pUrl, pKey); else if (p.key === 'office') await linkOffice(ws.workspaceId, pUrl, pKey); else await linkProject(ws.workspaceId, p.key, pUrl, pKey) }); setPKey('') }} className="space-y-4">
            {link.key === 'office' ? (<>
              <label className="block text-sm">Office server URL<input className={inputCls} placeholder="https://office.example.com" value={pUrl} onChange={e => setPUrl(e.target.value)} /></label>
              <label className="block text-sm">SSO secret<input className={inputCls} type="password" autoComplete="off" value={pKey} onChange={e => setPKey(e.target.value)} /></label>
              <p className="text-xs text-slate-400">The same long random value as OFFICE_SSO_SECRET on the Office server (24+ characters). It is stored encrypted in Vault and never shown again. Office has no password: people open it from Workspace after signing in here.</p>
            </>) : (<>
            <label className="block text-sm">Project URL<input className={inputCls} placeholder="https://xxxx.supabase.co" value={pUrl} onChange={e => setPUrl(e.target.value)} /></label>
            <label className="block text-sm">Service role key<input className={inputCls} type="password" autoComplete="off" value={pKey} onChange={e => setPKey(e.target.value)} /></label>
            <p className="text-xs text-slate-400">Found in that project: Settings, API. The key goes only to a server function and is stored encrypted in Vault, never in your browser. Run that project's SQL first.{link.key === 'automation' && ' This one project serves both YouTube and Instagram: its SQL must contain both schemas (run supabase/AUTOMATION_PREFLIGHT.sql there to check).'}</p>
            </>)}
            <div className="flex justify-end"><button className="btn-primary">Verify and link</button></div>
          </form>
        </Modal>
      )}
      {cfg && (
        <Modal title={`Configure ${cfg.name}`} onClose={() => setCfg(null)}>
          <form onSubmit={e => { e.preventDefault(); if (!/^https:\/\//.test(url)) return setError('Use an https:// URL.'); const p = cfg; setCfg(null); run(p.key, () => saveConfig(ws.workspaceId, ws.userId, p.key, { url })) }} className="space-y-4">
            <label className="block text-sm">Endpoint URL (https)<input className={inputCls} value={url} onChange={e => setUrl(e.target.value)} /></label>
            <p className="text-xs text-slate-400">Do not put secrets here. Secrets belong in encrypted server-side storage.</p>
            <div className="flex justify-end"><button className="btn-primary">Save</button></div>
          </form>
        </Modal>
      )}
    </FixedPage>
  )
}
