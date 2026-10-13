import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink, Plus, Search, Trash2, Zap } from 'lucide-react'
import { AI_CATALOG, type ApiKind, type CatalogItem } from '../../lib/aiCatalog'
import { listAi, removeAi, saveAi, testAi, type AiConn, type AiScope } from '../../services/aiKeys'
import Modal, { inputCls } from '../../components/Modal'
import { Card, EmptyState } from '../../components/ui'

const FREE_STYLE = { 'Free tier': 'bg-emerald-50 text-emerald-700', 'Trial credits': 'bg-amber-50 text-amber-700', 'No key needed': 'bg-blue-50 text-blue-700' }
const KIND_LABEL: Record<ApiKind, string> = { openai: 'OpenAI-compatible', gemini: 'Google Gemini', anthropic: 'Anthropic', custom: 'Custom / other' }

interface Draft { catalogId: string; label: string; kind: ApiKind; baseUrl: string; model: string; headerName: string; apiKey: string; noKey: boolean; signup?: string; note?: string; custom: boolean }
const fromCatalog = (c: CatalogItem): Draft => ({ catalogId: c.id, label: c.name, kind: c.kind, baseUrl: c.baseUrl, model: c.model, headerName: c.headerName ?? '', apiKey: '', noKey: !!c.noKey, signup: c.signup, note: c.note, custom: false })
const blank: Draft = { catalogId: '', label: '', kind: 'openai', baseUrl: '', model: '', headerName: '', apiKey: '', noKey: false, custom: true }

// Reusable for the Office scope (many models) and, with a single Gemini item, the Workspace assistant.
// fill: the card stretches to the space its parent gives it and ONLY the key/model list inside scrolls.
export default function AiSection({ ws, scope, onlyIds, title, intro, fill }: { ws: string; scope: AiScope; onlyIds?: string[]; title: string; intro: string; fill?: boolean }) {
  const [conns, setConns] = useState<AiConn[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [q, setQ] = useState('')
  const [type, setType] = useState('all')
  const [msg, setMsg] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => { try { setConns(await listAi(ws, scope)); setError(null) } catch (e) { setError((e as Error).message) } }, [ws, scope])
  useEffect(() => { load() }, [load])

  const catalog = useMemo(() => AI_CATALOG.filter(c => (!onlyIds || onlyIds.includes(c.id)) && (type === 'all' || c.type === type) && (!q.trim() || `${c.name} ${c.type}`.toLowerCase().includes(q.trim().toLowerCase()))), [onlyIds, q, type])
  const connected = (c: CatalogItem) => conns?.find(x => x.catalogId === c.id)
  const custom = (conns ?? []).filter(c => !AI_CATALOG.some(x => x.id === c.catalogId))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); if (!draft) return
    if (draft.baseUrl.includes('{')) return setError('Replace the {placeholder} in the endpoint with your own value.')
    if (draft.custom && draft.kind !== 'gemini' && draft.kind !== 'anthropic' && !/^https:\/\//.test(draft.baseUrl)) return setError('Endpoint must start with https://')
    setBusy(true); setError(null)
    try { await saveAi(ws, { scope, catalogId: draft.custom ? '' : draft.catalogId, label: draft.label, kind: draft.kind, baseUrl: draft.baseUrl, model: draft.model, headerName: draft.headerName, apiKey: draft.apiKey, noKey: draft.noKey }); setDraft(null); await load() }
    catch (err) { setError((err as Error).message) }
    setBusy(false)
  }
  const set = (k: keyof Draft) => (e: { target: { value: string } }) => draft && setDraft({ ...draft, [k]: e.target.value } as Draft)
  const test = async (p: string) => { setMsg(m => ({ ...m, [p]: 'Testing…' })); try { const r = await testAi(ws, scope, p); setMsg(m => ({ ...m, [p]: (r.ok ? '✓ ' : '✗ ') + r.detail })); load() } catch (e) { setMsg(m => ({ ...m, [p]: '✗ ' + (e as Error).message })) } }
  const remove = async (c: AiConn) => { if (!confirm(`Remove ${c.label}? Its key will be deleted.`)) return; try { await removeAi(ws, scope, c.provider); await load() } catch (e) { setError((e as Error).message) } }

  return (
    <Card className={fill ? 'flex min-h-0 flex-1 flex-col' : ''} title={title} action={!onlyIds && <button onClick={() => setDraft({ ...blank })} className="btn-primary px-3 py-1.5 text-xs"><Plus size={14} /> Custom API</button>}>
      <p className="mb-4 shrink-0 text-sm text-slate-500">{intro}</p>
      {error && !draft && <p role="alert" className="mb-3 shrink-0 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className={fill ? 'min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1' : ''}>

      {(conns?.length ?? 0) > 0 && (
        <div className="mb-5 space-y-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Connected ({conns!.length})</p>
          {conns!.map(c => (
            <div key={c.provider} className="rounded-xl border border-line p-3">
              <div className="flex flex-wrap items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Zap size={16} /></span>
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{c.label}</p><p className="truncate text-xs text-slate-400">{KIND_LABEL[c.kind]}{c.model ? ` · ${c.model}` : ''}</p></div>
                <button onClick={() => test(c.provider)} className="btn-ghost px-3 py-1.5 text-xs">Test</button>
                <button onClick={() => remove(c)} className="btn-ghost px-3 py-1.5 text-xs text-red-600" aria-label={`Remove ${c.label}`}><Trash2 size={13} /></button></div>
              {(msg[c.provider] || c.lastError) && <p className="mt-2 text-xs text-slate-500">{msg[c.provider] ?? c.lastError}</p>}
            </div>
          ))}
        </div>
      )}

      {!onlyIds && (
        <div className={`mb-3 flex flex-wrap items-center gap-2 ${fill ? 'sticky top-0 z-10 bg-white pb-2 pt-1' : ''}`}>
          <div className="relative min-w-[200px] flex-1"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder={`Search ${AI_CATALOG.length} providers…`} aria-label="Search providers" className="w-full rounded-xl border border-line py-2 pl-9 pr-3 text-sm" /></div>
          <select value={type} onChange={e => setType(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm" aria-label="Type"><option value="all">All types</option><option>Chat / LLM</option><option>Embeddings</option><option>Image</option><option>Voice / Speech</option></select>
        </div>
      )}
      {!onlyIds && <p className="mb-3 text-xs text-slate-400">{AI_CATALOG.length} providers with free tiers, trial credits or no-key access. Offers change; check each provider's page for current limits.</p>}

      <div className="grid gap-3 sm:grid-cols-2">
        {catalog.map(c => { const on = connected(c); return (
          <div key={c.id} className="flex flex-col rounded-xl border border-line p-4">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate text-sm font-semibold">{c.name}</p><p className="text-xs text-slate-400">{c.type}</p></div><span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${FREE_STYLE[c.free]}`}>{c.free}</span></div>
            {c.note && <p className="mt-2 text-xs text-slate-500">{c.note}</p>}
            <div className="mt-3 flex items-center gap-2">
              <button onClick={() => setDraft(fromCatalog(c))} className={on ? 'btn-ghost px-3 py-1.5 text-xs' : 'btn-primary px-3 py-1.5 text-xs'}>{on ? 'Update key' : c.noKey ? 'Add' : 'Add API key'}</button>
              <a href={c.signup} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-brand hover:underline">Get a key <ExternalLink size={11} /></a>
              {on && <span className="ml-auto text-xs font-medium text-emerald-600">Connected</span>}
            </div>
          </div>) })}
      </div>
      {catalog.length === 0 && <EmptyState text="No providers match your search." />}
      {custom.length > 0 && <p className="mt-3 text-xs text-slate-400">{custom.length} custom API{custom.length === 1 ? '' : 's'} listed above.</p>}
      </div>

      {draft && (
        <Modal title={draft.custom ? 'Add a custom API' : `Connect ${draft.label}`} onClose={() => setDraft(null)} wide>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">Name<input required className={inputCls} value={draft.label} onChange={set('label')} placeholder="My model API" disabled={!draft.custom} /></label>
              <label className="block text-sm">API type
                <select className={inputCls} value={draft.kind} onChange={set('kind')} disabled={!draft.custom}>{(Object.keys(KIND_LABEL) as ApiKind[]).map(k => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></label>
            </div>
            {draft.kind !== 'gemini' && draft.kind !== 'anthropic' && <label className="block text-sm">Endpoint / base URL<input required className={inputCls} value={draft.baseUrl} onChange={set('baseUrl')} placeholder="https://api.example.com/v1" /></label>}
            <label className="block text-sm">Model identifier<input className={inputCls} value={draft.model} onChange={set('model')} placeholder="e.g. gemini-2.5-flash" /></label>
            {draft.custom && draft.kind !== 'gemini' && draft.kind !== 'anthropic' && <label className="block text-sm">Auth header name <span className="text-slate-400">(optional; default is Authorization: Bearer)</span><input className={inputCls} value={draft.headerName} onChange={set('headerName')} placeholder="x-api-key" /></label>}
            {!draft.noKey && <label className="block text-sm">API key<input required type="password" autoComplete="off" className={inputCls} value={draft.apiKey} onChange={set('apiKey')} /></label>}
            {draft.note && <p className="rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800">{draft.note}</p>}
            <p className="text-xs text-slate-400">The key is sent once to a server function and stored encrypted. It is never saved in your browser or shown again.{draft.signup && <> Get one at <a className="text-brand underline" href={draft.signup} target="_blank" rel="noopener noreferrer">{new URL(draft.signup).host}</a>.</>}</p>
            {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setDraft(null)} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button></div>
          </form>
        </Modal>
      )}
    </Card>
  )
}
