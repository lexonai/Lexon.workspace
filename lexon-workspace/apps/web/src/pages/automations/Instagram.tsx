import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Copy, Instagram as IgIcon, Pause, Play, Plus, Trash2 } from 'lucide-react'
import { useWorkspace } from '../../lib/useWorkspace'
import { igConnectUrl, igCreate, igDelete, igDisconnect, igDuplicate, igGet, igList, igMedia, igSetStatus, igStatus, igUpdate, statsOf, type IgAccount, type IgAutomation, type IgInput, type IgMedia } from '../../services/instagram'
import { Card, EmptyState, ErrorState } from '../../components/ui'
import Modal, { inputCls } from '../../components/Modal'

const pill: Record<string, string> = { active: 'bg-emerald-50 text-emerald-700', paused: 'bg-amber-50 text-amber-700', draft: 'bg-slate-100 text-slate-500' }
const RESOURCES = ['pdf', 'website', 'youtube', 'tool', 'course', 'file', 'other']
const blank = (): IgInput => ({ postScope: 'specific', title: '', description: '', resourceType: 'other', triggerType: 'keywords', matchMode: 'flexible', keywords: [], excludedKeywords: [], allowEmojiOnly: false, allowShortComments: false, delaySeconds: 3, commentReplyEnabled: true, commentReplies: ['Thanks! Check your DMs 👋'], dmContent: '', buttonLabel: '', resourceUrl: '' })
const lines = (s: string) => s.split(/[\n,]/).map(x => x.trim()).filter(Boolean)

export default function Instagram() {
  const { ws, error: wsError, can } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [acc, setAcc] = useState<IgAccount | null | undefined>(undefined)
  const [list, setList] = useState<IgAutomation[]>([])
  const [error, setError] = useState<string | null>(null)
  const [fatal, setFatal] = useState<string | null>(null)
  const [create, setCreate] = useState(false)
  const [detail, setDetail] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!ws || !can('automations.manage')) return
    try {
      const a = await igStatus(ws.workspaceId); setAcc(a)
      setList(a ? await igList(ws.workspaceId) : [])
    } catch (e) { const m = (e as Error).message; if (/not linked/i.test(m)) { setAcc(null); setFatal('link') } else setFatal(m) }
  }, [ws, can])
  useEffect(() => { load() }, [load])

  if (wsError) return <ErrorState message={wsError} onRetry={load} />
  if (ws && !can('automations.manage')) return <div className="card p-8 text-center text-slate-500">You do not have access to Automations.</div>
  if (!ws || acc === undefined) return fatal && fatal !== 'link' ? <ErrorState message={fatal} onRetry={() => { setFatal(null); load() }} /> : <p className="text-slate-500">Loading Instagram…</p>
  const w = ws.workspaceId
  const act = async (key: string, fn: () => Promise<unknown>) => { setBusy(key); setError(null); try { await fn(); await load() } catch (e) { setError((e as Error).message) } setBusy(null) }
  const connected = acc?.status === 'connected'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Link to="/automations" className="text-sm text-slate-500 hover:text-brand">← Automations</Link><h1 className="text-2xl font-semibold">Instagram Automation</h1>
          {acc && <p className="text-sm text-slate-500">@{acc.username ?? 'account'} · {acc.status}</p>}</div>
        {fatal === 'link' ? <Link to="/integrations" className="btn-primary">Link Automation backend</Link>
          : connected
            ? <div className="flex gap-2"><button onClick={() => setCreate(true)} className="btn-primary inline-flex items-center gap-1"><Plus size={16} /> New automation</button>
                <button disabled={busy === 'dc'} onClick={() => confirm('Disconnect Instagram? Active automations will be paused.') && act('dc', () => igDisconnect(w))} className="btn-ghost">Disconnect</button></div>
            : <button disabled={busy === 'cn'} onClick={() => act('cn', async () => { window.location.href = await igConnectUrl(w) })} className="btn-primary">Connect Instagram</button>}
      </div>
      {params.get('connected') && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">Instagram connected. <button className="underline" onClick={() => setParams({})}>Dismiss</button></p>}
      {params.get('error') && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">Connection failed: {params.get('error')}. <button className="underline" onClick={() => setParams({})}>Dismiss</button></p>}
      {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {fatal && fatal !== 'link' && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{fatal}</p>}
      {fatal === 'link' && <div className="card p-6 text-sm text-slate-500">Link the shared Automation backend (YouTube + Instagram) in Integrations first, then connect your Instagram account here.</div>}
      {!fatal && !connected && <div className="card p-6 text-sm text-slate-500">Connect your Instagram professional account. Then create automations: when someone comments a keyword on a post, Lexon replies to the comment and sends a DM. Messaging needs Meta App Review; see the guide.</div>}

      {connected && (
        <Card title="Automations">
          {list.length === 0 ? <EmptyState text="No automations yet. Press “New automation”." /> : (
            <ul className="divide-y divide-line">
              {list.map(a => { const s = statsOf(a); return (
                <li key={a.id} className="flex flex-wrap items-center gap-3 py-3">
                  {a.post_thumbnail_url ? <img src={a.post_thumbnail_url} alt="" className="h-12 w-12 rounded-lg object-cover" /> : <span className="grid h-12 w-12 place-items-center rounded-lg bg-pink-50 text-pink-600"><IgIcon size={20} /></span>}
                  <button onClick={() => setDetail(a.id)} className="min-w-0 flex-1 text-left"><span className="block truncate font-medium">{a.title}</span>
                    <span className="text-xs text-slate-400">{a.post_scope === 'any' ? 'Any post' : a.post_scope === 'next' ? 'Next post' : 'Specific post'} · {s.comments_triggered} triggered · {s.dms_sent} DMs · {s.replies_sent} replies</span></button>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${pill[a.status]}`}>{a.status}</span>
                  <button disabled={busy === a.id} onClick={() => act(a.id, () => igSetStatus(w, a.id, a.status === 'active' ? 'paused' : 'active'))} className="btn-ghost px-3 py-1.5 text-xs" aria-label={a.status === 'active' ? 'Pause' : 'Activate'}>{a.status === 'active' ? <Pause size={14} /> : <Play size={14} />}</button>
                  <button disabled={busy === a.id} onClick={() => act(a.id, () => igDuplicate(w, a.id))} className="btn-ghost px-3 py-1.5 text-xs" aria-label="Duplicate"><Copy size={14} /></button>
                  <button disabled={busy === a.id} onClick={() => confirm(`Delete "${a.title}"?`) && act(a.id, () => igDelete(w, a.id))} className="btn-ghost px-3 py-1.5 text-xs text-red-600" aria-label="Delete"><Trash2 size={14} /></button>
                </li>) })}
            </ul>)}
        </Card>
      )}
      {create && <CreateModal ws={w} onClose={() => setCreate(false)} onDone={() => { setCreate(false); load() }} />}
      {detail && <Detail ws={w} id={detail} onClose={() => setDetail(null)} onChanged={load} />}
    </div>
  )
}

function CreateModal({ ws, onClose, onDone }: { ws: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<IgInput>(blank())
  const [media, setMedia] = useState<IgMedia[] | null>(null)
  const [kw, setKw] = useState(''), [ex, setEx] = useState(''), [rep, setRep] = useState(f.commentReplies.join('\n'))
  const [err, setErr] = useState<string | null>(null), [busy, setBusy] = useState(false)
  useEffect(() => { igMedia(ws).then(setMedia).catch(e => { setMedia([]); setErr((e as Error).message) }) }, [ws])
  const set = <K extends keyof IgInput>(k: K, v: IgInput[K]) => setF(p => ({ ...p, [k]: v }))
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null)
    try { await igCreate(ws, { ...f, keywords: lines(kw), excludedKeywords: lines(ex), commentReplies: lines(rep), buttonLabel: f.buttonLabel || undefined, resourceUrl: f.resourceUrl || undefined, description: f.description || undefined }); onDone() }
    catch (e2) { setErr((e2 as Error).message) }
    setBusy(false)
  }
  return (
    <Modal title="New automation" onClose={onClose} wide>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">Name<input required maxLength={120} className={inputCls} value={f.title} onChange={e => set('title', e.target.value)} placeholder="Free guide giveaway" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Applies to<select className={inputCls} value={f.postScope} onChange={e => set('postScope', e.target.value as IgInput['postScope'])}><option value="specific">One specific post</option><option value="any">Any post</option></select></label>
          <label className="block text-sm">Resource type<select className={inputCls} value={f.resourceType} onChange={e => set('resourceType', e.target.value)}>{RESOURCES.map(r => <option key={r}>{r}</option>)}</select></label>
        </div>
        {f.postScope === 'specific' && (
          <div><p className="text-sm">Choose the post</p>
            {media === null ? <p className="text-xs text-slate-400">Loading your posts…</p> : media.length === 0 ? <p className="text-xs text-slate-400">No posts found.</p> : (
              <div className="mt-2 grid max-h-52 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-5">
                {media.map(m => <button type="button" key={m.id} onClick={() => setF(p => ({ ...p, postId: m.id, postType: m.media_type, postThumbnailUrl: m.thumbnail_url ?? m.media_url, postCaption: m.caption }))} className={`aspect-square overflow-hidden rounded-lg border-2 ${f.postId === m.id ? 'border-brand' : 'border-transparent'}`} aria-label={m.caption?.slice(0, 40) ?? 'post'}>{(m.thumbnail_url ?? m.media_url) ? <img src={m.thumbnail_url ?? m.media_url} alt="" className="h-full w-full object-cover" /> : <span className="text-xs">{m.media_type}</span>}</button>)}
              </div>)}
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Trigger<select className={inputCls} value={f.triggerType} onChange={e => set('triggerType', e.target.value as IgInput['triggerType'])}><option value="keywords">Comment contains keyword</option><option value="any_comment">Any comment</option></select></label>
          {f.triggerType === 'keywords' && <label className="block text-sm">Match<select className={inputCls} value={f.matchMode} onChange={e => set('matchMode', e.target.value as IgInput['matchMode'])}><option value="flexible">Flexible (contains)</option><option value="exact">Exact (whole comment)</option></select></label>}
        </div>
        {f.triggerType === 'keywords' && <label className="block text-sm">Keywords <span className="text-slate-400">(comma or new line)</span><textarea required rows={2} className={inputCls} value={kw} onChange={e => setKw(e.target.value)} placeholder="guide, link, pdf" /></label>}
        <label className="block text-sm">Never trigger on <span className="text-slate-400">(optional)</span><input className={inputCls} value={ex} onChange={e => setEx(e.target.value)} placeholder="spam, scam" /></label>
        {f.triggerType === 'any_comment' && <div className="flex gap-4 text-sm"><label className="flex items-center gap-2"><input type="checkbox" checked={f.allowEmojiOnly} onChange={e => set('allowEmojiOnly', e.target.checked)} /> Emoji-only comments</label><label className="flex items-center gap-2"><input type="checkbox" checked={f.allowShortComments} onChange={e => set('allowShortComments', e.target.checked)} /> Very short comments</label></div>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.commentReplyEnabled} onChange={e => set('commentReplyEnabled', e.target.checked)} /> Reply to the comment publicly</label>
        {f.commentReplyEnabled && <label className="block text-sm">Reply options <span className="text-slate-400">(one per line, one is picked at random)</span><textarea rows={2} className={inputCls} value={rep} onChange={e => setRep(e.target.value)} /></label>}
        <label className="block text-sm">DM message<textarea required rows={3} maxLength={1000} className={inputCls} value={f.dmContent} onChange={e => set('dmContent', e.target.value)} placeholder="Hey! Here is your free guide 👇" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Button label<input maxLength={30} className={inputCls} value={f.buttonLabel} onChange={e => set('buttonLabel', e.target.value)} placeholder="Get the guide" /></label>
          <label className="block text-sm">Button link<input className={inputCls} value={f.resourceUrl} onChange={e => set('resourceUrl', e.target.value)} placeholder="https://…" /></label>
        </div>
        <label className="block text-sm">Delay before replying: {f.delaySeconds}s<input type="range" min={1} max={30} className="mt-1 w-full" value={f.delaySeconds} onChange={e => set('delaySeconds', +e.target.value)} /></label>
        <p className="text-xs text-slate-400">Saved as a draft. Press Play in the list to activate it.</p>
        {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy || (f.postScope === 'specific' && !f.postId)} className="btn-primary disabled:opacity-60">{busy ? 'Saving…' : 'Create draft'}</button></div>
      </form>
    </Modal>
  )
}

function Detail({ ws, id, onClose, onChanged }: { ws: string; id: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<Awaited<ReturnType<typeof igGet>> | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [dm, setDm] = useState('')
  const load = useCallback(() => { igGet(ws, id).then(r => { setD(r); setDm(r.automation.dm_content) }).catch(e => setErr((e as Error).message)) }, [ws, id])
  useEffect(load, [load])
  const s = d ? statsOf(d.automation) : null
  return (
    <Modal title={d?.automation.title ?? 'Automation'} onClose={onClose} wide>
      {err && <p role="alert" className="text-sm text-red-600">{err}</p>}
      {!d ? <p className="text-sm text-slate-400">Loading…</p> : (
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-4 gap-2 text-center">{[['Triggered', s!.comments_triggered], ['Replies', s!.replies_sent], ['DMs', s!.dms_sent], ['Clicks', s!.button_clicks]].map(([l, v]) => <div key={l as string} className="rounded-xl bg-slate-50 p-3"><p className="text-lg font-semibold">{v}</p><p className="text-xs text-slate-400">{l}</p></div>)}</div>
          <p><span className="text-slate-400">Keywords:</span> {d.automation.trigger_type === 'any_comment' ? 'any comment' : d.keywords.join(', ') || '—'}{d.excluded.length > 0 && <> · <span className="text-slate-400">excluded:</span> {d.excluded.join(', ')}</>}</p>
          <label className="block">DM message<textarea rows={3} className={inputCls} value={dm} onChange={e => setDm(e.target.value)} /></label>
          <div className="flex justify-end"><button disabled={!dm.trim() || dm === d.automation.dm_content} onClick={async () => { try { await igUpdate(ws, id, { dmContent: dm }); load(); onChanged() } catch (e) { setErr((e as Error).message) } }} className="btn-primary disabled:opacity-50">Save message</button></div>
          <div><p className="mb-1 font-medium">Recent events</p>
            {d.events.length === 0 ? <EmptyState text="No events yet." /> : <ul className="divide-y divide-line">{d.events.map(e => <li key={e.id} className="flex justify-between gap-3 py-1.5 text-xs"><span>{e.event_type.replace('_', ' ')} · <span className={e.status === 'failed' ? 'text-red-600' : 'text-slate-500'}>{e.status}</span>{e.error_message && <span className="text-red-500"> {e.error_message.slice(0, 80)}</span>}</span><span className="shrink-0 text-slate-400">{new Date(e.created_at).toLocaleString()}</span></li>)}</ul>}</div>
        </div>)}
    </Modal>
  )
}
