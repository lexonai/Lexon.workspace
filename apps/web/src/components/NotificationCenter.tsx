import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Bell, Bot, CheckCheck, FileText, MessageCircle, Phone, Plus, Megaphone, CheckSquare, Users, Zap, Sparkles } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../lib/useWorkspace'
import { listMembers, type Member } from '../services/team'
import { loadFeed, markAllNotificationsRead, markNotificationRead, markSeen, pullLinkedEvents, sendAnnouncement, type FeedItem, type FeedKind } from '../services/feed'
import Modal, { inputCls } from './Modal'

const FILTERS: { key: 'all' | FeedKind; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'message', label: 'Messages' }, { key: 'file', label: 'Files' }, { key: 'automation', label: 'Automations' },
  { key: 'team', label: 'Team' }, { key: 'task', label: 'Tasks' }, { key: 'agent', label: 'Agents' }, { key: 'assistant', label: 'Assistant' }
]
const ICON: Record<FeedKind, any> = { message: MessageCircle, file: FileText, automation: Zap, team: Users, agent: Bot, assistant: Sparkles, task: CheckSquare, call: Phone, announcement: Megaphone, other: Bell }
const TONE: Record<FeedKind, string> = { message: 'bg-blue-50 text-blue-600', file: 'bg-emerald-50 text-emerald-600', automation: 'bg-amber-50 text-amber-600', team: 'bg-violet-50 text-violet-600', agent: 'bg-cyan-50 text-cyan-600', assistant: 'bg-pink-50 text-pink-600', task: 'bg-indigo-50 text-indigo-600', call: 'bg-green-50 text-green-600', announcement: 'bg-rose-50 text-rose-600', other: 'bg-slate-100 text-slate-500' }
const ago = (iso: string) => { const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000)); return m < 1 ? 'now' : m < 60 ? `${m}m` : m < 1440 ? `${Math.round(m / 60)}h` : `${Math.round(m / 1440)}d` }

export default function NotificationCenter() {
  const { userId } = useAuth()
  const { ws, isAdmin } = useWorkspace()
  const nav = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<FeedItem[] | null>(null)
  const [filter, setFilter] = useState<'all' | FeedKind>('all')
  const [error, setError] = useState<string | null>(null)
  const [composing, setComposing] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!userId || !ws || DEMO) return
    try { setItems(await loadFeed(userId, ws.workspaceId, isAdmin)); setError(null) } catch (e) { setError((e as Error).message) }
  }, [userId, ws, isAdmin])
  useEffect(() => { load() }, [load])
  useEffect(() => {
    if (!userId || !ws || DEMO) return
    const ch = supabase.channel('feed')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` }, () => load())
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'activity_logs', filter: `workspace_id=eq.${ws.workspaceId}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [userId, ws, load])
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown); document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open])

  const unread = (items ?? []).filter(i => i.unread).length
  const toggle = async () => {
    const next = !open; setOpen(next)
    if (next && ws && isAdmin) { await pullLinkedEvents(ws.workspaceId); load() }
    if (!next && userId) { markSeen(userId); load() }
  }
  const act = async (i: FeedItem) => {
    if (i.notificationId && i.unread) { await markNotificationRead(i.notificationId); load() }
    if (i.href) { setOpen(false); if (userId) markSeen(userId); nav(i.href) }
  }
  const shown = (items ?? []).filter(i => filter === 'all' || i.kind === filter)

  return (
    <div className="relative" ref={box}>
      <button onClick={toggle} aria-label="Notifications" aria-expanded={open} className="relative grid h-10 w-10 place-items-center rounded-xl text-slate-600 hover:bg-slate-100">
        <Bell size={19} />
        {unread > 0 && <span className="absolute right-1 top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white ring-2 ring-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="fixed inset-x-3 top-16 z-50 flex max-h-[78vh] flex-col overflow-hidden rounded-2xl border border-line bg-white shadow-pop animate-pop sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-[420px]" role="dialog" aria-label="Notification center">
          <div className="flex items-center gap-2 border-b border-line px-4 py-3">
            <h2 className="flex-1 text-base font-semibold">Notifications</h2>
            {unread > 0 && userId && <button onClick={async () => { await markAllNotificationsRead(userId); markSeen(userId); load() }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"><CheckCheck size={14} /> Mark all read</button>}
            {isAdmin && <button onClick={() => setComposing(true)} className="inline-flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white" aria-label="Create notification"><Plus size={14} /> New</button>}
          </div>
          <div className="flex gap-1.5 overflow-x-auto border-b border-line px-3 py-2">
            {FILTERS.map(f => <button key={f.key} onClick={() => setFilter(f.key)} className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${filter === f.key ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{f.label}</button>)}
          </div>
          <div className="flex-1 overflow-y-auto">
            {error && <p role="alert" className="p-4 text-sm text-red-600">{error}</p>}
            {!items && !error && <p className="p-6 text-center text-sm text-slate-400">Loading…</p>}
            {items && shown.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Nothing here yet.</p>}
            {shown.map(i => { const Icon = ICON[i.kind]; return (
              <button key={i.id} onClick={() => act(i)} className={`flex w-full items-start gap-3 border-b border-line/60 px-4 py-3 text-left hover:bg-slate-50 ${i.unread ? 'bg-brand-soft/50' : ''}`}>
                <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${TONE[i.kind]}`}><Icon size={15} /></span>
                <span className="min-w-0 flex-1"><span className={`block truncate text-sm ${i.unread ? 'font-semibold' : 'font-medium'}`}>{i.title}</span>{i.body && <span className="block truncate text-xs text-slate-500">{i.body}</span>}</span>
                <span className="shrink-0 text-[11px] text-slate-400">{ago(i.at)}</span>
              </button>) })}
          </div>
        </div>
      )}
      {composing && ws && <Compose ws={ws.workspaceId} onClose={() => setComposing(false)} onSent={() => { setComposing(false); load() }} />}
    </div>
  )
}

function Compose({ ws, onClose, onSent }: { ws: string; onClose: () => void; onSent: () => void }) {
  const [f, setF] = useState({ title: '', body: '', audience: 'all' })
  const [members, setMembers] = useState<Member[]>([])
  const [picked, setPicked] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { listMembers(ws).then(m => setMembers(m.filter(x => x.active))).catch(() => {}) }, [ws])
  return (
    <Modal title="New announcement" onClose={onClose}>
      <form className="space-y-4" onSubmit={async e => {
        e.preventDefault(); setBusy(true); setMsg(null)
        try { await sendAnnouncement(ws, f.title, f.body, f.audience, picked); onSent() } catch (err) { setMsg((err as Error).message); setBusy(false) }
      }}>
        <label className="block text-sm">Title<input required maxLength={120} className={inputCls} value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></label>
        <label className="block text-sm">Message<textarea rows={3} maxLength={1000} className={inputCls} value={f.body} onChange={e => setF({ ...f, body: e.target.value })} /></label>
        <label className="block text-sm">Audience
          <select className={inputCls} value={f.audience} onChange={e => setF({ ...f, audience: e.target.value })}>
            <option value="all">Everyone</option><option value="members">Team Members only</option><option value="admins">Admins only</option><option value="selected">Selected people</option>
          </select></label>
        {f.audience === 'selected' && (
          <div className="grid max-h-40 gap-1 overflow-y-auto">{members.map(m => <label key={m.id} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-sm"><input type="checkbox" checked={picked.includes(m.id)} onChange={() => setPicked(p => p.includes(m.id) ? p.filter(x => x !== m.id) : [...p, m.id])} />{m.name}</label>)}</div>
        )}
        {msg && <p role="alert" className="text-sm text-red-600">{msg}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy || (f.audience === 'selected' && picked.length === 0)} className="btn-primary disabled:opacity-50">{busy ? 'Sending…' : 'Send'}</button></div>
      </form>
    </Modal>
  )
}
