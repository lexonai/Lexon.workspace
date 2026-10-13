import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { History, Pencil, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DEMO } from '../../lib/env'
import { useWorkspace } from '../../lib/useWorkspace'
import { listConversations, type Conversation } from '../../services/messages'
import { listMembers, type Member } from '../../services/team'
import { Avatar, ErrorState } from '../../components/ui'
import ChatPane, { type Names } from './ChatPane'
import NewChatModal from './NewChatModal'
import CallHistory from '../../lib/calls/CallHistory'

const short = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toDateString() === new Date().toDateString() ? d.toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en', { month: 'short', day: 'numeric' })
}
const dotCls = { online: 'bg-emerald-500', away: 'bg-amber-400', offline: 'bg-slate-300' }

export default function Messages() {
  const { ws, error: wsError } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [convs, setConvs] = useState<Conversation[] | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [history, setHistory] = useState(false)
  const activeId = params.get('c')

  const load = useCallback(async () => {
    if (!ws) return
    try { setConvs(await listConversations(ws.workspaceId)) } catch (e) { setError((e as Error).message) }
  }, [ws])
  useEffect(() => {
    if (!ws) return
    load()
    listMembers(ws.workspaceId).then(setMembers).catch(e => setError(e.message))
  }, [ws, load])

  // New messages anywhere refresh the list (RLS only delivers events for my conversations)
  useEffect(() => {
    if (!ws || DEMO) return
    const ch = supabase.channel('messages-list').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, () => load()).subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [ws, load])

  const names: Names = useMemo(() => Object.fromEntries(members.map(m => [m.id, { name: m.name, avatar: m.avatar }])), [members])
  const open = (id: string | null) => setParams(id ? { c: id } : {}, { replace: true })

  if (DEMO) return <div className="card p-8 text-center text-slate-500">Messages need a live Supabase connection. Turn off demo mode to use chat.</div>
  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={() => { setError(null); load() }} />
  if (!ws || !convs) return <p className="text-slate-500">Loading messages…</p>

  const term = q.trim().toLowerCase()
  const filtered = convs.filter(c => !term || c.title.toLowerCase().includes(term))
  const pinned = filtered.filter(c => c.pinned), rest = filtered.filter(c => !c.pinned)
  const active = convs.find(c => c.id === activeId) ?? null

  const Row = ({ c }: { c: Conversation }) => (
    <li>
      <button onClick={() => open(c.id)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left ${c.id === activeId ? 'bg-brand-soft' : 'hover:bg-slate-50'}`}>
        <span className="relative"><Avatar name={c.title} src={c.otherAvatar} size={44} />{c.presence && <i className={`absolute bottom-0 right-0 h-3 w-3 rounded-full ring-2 ring-white ${dotCls[c.presence]}`} />}</span>
        <span className="min-w-0 flex-1">
          <span className="flex justify-between gap-2"><span className="truncate text-sm font-medium">{c.title}</span><span className="shrink-0 text-xs text-slate-400">{short(c.lastAt)}</span></span>
          <span className="flex justify-between gap-2"><span className="truncate text-xs text-slate-500">{c.lastBody ? `${c.lastSender === ws.userId ? 'You: ' : ''}${c.lastBody}` : c.lastAt ? 'Attachment' : 'No messages yet'}</span>
            {c.unread > 0 && <span className="grid h-5 min-w-5 place-items-center rounded-full bg-red-500 px-1 text-[11px] font-medium text-white">{c.unread}</span>}</span>
        </span>
      </button>
    </li>
  )

  return (
    <div className="card flex h-[calc(100vh-8rem)] min-h-[480px] overflow-hidden">
      <aside className={`w-full shrink-0 flex-col border-r border-line md:flex md:w-80 ${active ? 'hidden' : 'flex'}`}>
        <div className="flex items-center justify-between p-4"><h1 className="text-lg font-semibold">Messages</h1>
          <span className="flex"><button onClick={() => setHistory(true)} aria-label="Call history" className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"><History size={18} /></button><button onClick={() => setCreating(true)} aria-label="New conversation" className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"><Pencil size={18} /></button></span></div>
        <div className="relative px-4 pb-3"><Search size={16} className="absolute left-7 top-1/2 -translate-y-[70%] text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="w-full rounded-xl border border-line py-2 pl-9 pr-3 text-sm" /></div>
        <div className="flex-1 overflow-y-auto px-2 pb-3">
          {convs.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-400">No conversations yet. Tap the pencil to start one.</p>}
          {pinned.length > 0 && <><p className="px-3 py-1 text-xs font-medium text-slate-400">Pinned</p><ul>{pinned.map(c => <Row key={c.id} c={c} />)}</ul></>}
          {rest.length > 0 && <><p className="px-3 py-1 text-xs font-medium text-slate-400">All Messages</p><ul>{rest.map(c => <Row key={c.id} c={c} />)}</ul></>}
        </div>
      </aside>
      {active
        ? <ChatPane key={active.id} ws={ws.workspaceId} myId={ws.userId} conv={active} names={names} onBack={() => open(null)} onChanged={load} />
        : <div className="hidden flex-1 place-items-center bg-slate-100/70 text-sm text-slate-400 md:grid">Select a conversation</div>}
      {history && <CallHistory onClose={() => setHistory(false)} />}
      {creating && <NewChatModal ws={ws.workspaceId} myId={ws.userId} members={members} onClose={() => setCreating(false)} onOpen={id => { setCreating(false); load(); open(id) }} />}
    </div>
  )
}
