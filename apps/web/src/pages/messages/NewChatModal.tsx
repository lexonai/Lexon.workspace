import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import Modal, { inputCls } from '../../components/Modal'
import { Avatar } from '../../components/ui'
import { createGroup, startDirect } from '../../services/messages'
import { listMembers, type Member } from '../../services/team'

interface Props { ws: string; myId: string; members: Member[]; onClose: () => void; onOpen: (id: string) => void }

// Searchable picker for direct messages and groups. Reloads the member list on open so new joiners appear.
export default function NewChatModal({ ws, myId, members: initial, onClose, onOpen }: Props) {
  const [mode, setMode] = useState<'direct' | 'group'>('direct')
  const [members, setMembers] = useState<Member[]>(initial)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')
  const [title, setTitle] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => { listMembers(ws).then(setMembers).catch(e => setError(e.message)).finally(() => setLoading(false)) }, [ws])
  const people = useMemo(() => {
    const t = q.trim().toLowerCase()
    return members.filter(m => m.active && m.id !== myId && (!t || `${m.name} ${m.title ?? ''}`.toLowerCase().includes(t)))
  }, [members, myId, q])

  const run = async (fn: () => Promise<string>) => {
    setBusy(true); setError(null)
    try { onOpen(await fn()) } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  const toggle = (id: string) => setPicked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id])

  return (
    <Modal title="New conversation" onClose={onClose}>
      <div className="mb-3 flex gap-2">
        {(['direct', 'group'] as const).map(m => <button key={m} onClick={() => setMode(m)} className={`rounded-xl px-3.5 py-1.5 text-sm font-medium ${mode === m ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{m === 'direct' ? 'Direct message' : 'Group'}</button>)}
      </div>
      {mode === 'group' && <label className="mb-3 block text-sm">Group name<input className={inputCls} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Design team" /></label>}
      <div className="relative mb-2"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input autoFocus value={q} onChange={e => setQ(e.target.value)} placeholder="Search people…" aria-label="Search people" className="w-full rounded-xl border border-line py-2 pl-9 pr-3 text-sm" /></div>
      {mode === 'group' && <div className="mb-2 flex items-center justify-between text-xs text-slate-500"><span>{picked.length} selected</span><span className="flex gap-3"><button type="button" className="hover:text-brand" onClick={() => setPicked(p => [...new Set([...p, ...people.map(x => x.id)])])}>Select all shown</button><button type="button" className="hover:text-brand" onClick={() => setPicked([])}>Clear</button></span></div>}
      <ul className="max-h-64 space-y-0.5 overflow-y-auto">
        {loading && <li className="py-6 text-center text-sm text-slate-400">Loading people…</li>}
        {!loading && people.length === 0 && <li className="py-6 text-center text-sm text-slate-400">{q ? 'No one matches your search.' : 'No other members yet. Invite people from the Team page.'}</li>}
        {people.map(m => (
          <li key={m.id}>
            {mode === 'direct'
              ? <button disabled={busy} onClick={() => run(() => startDirect(ws, m.id))} className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-slate-50"><Avatar name={m.name} src={m.avatar} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{m.name}</span><span className="block truncate text-xs text-slate-400">{m.role === 'member' ? m.title ?? 'Team Member' : 'Admin'}</span></span></button>
              : <label className="flex cursor-pointer items-center gap-3 rounded-xl p-2 hover:bg-slate-50"><input type="checkbox" checked={picked.includes(m.id)} onChange={() => toggle(m.id)} /><Avatar name={m.name} src={m.avatar} /><span className="min-w-0"><span className="block truncate text-sm font-medium">{m.name}</span><span className="block truncate text-xs text-slate-400">{m.role === 'member' ? m.title ?? 'Team Member' : 'Admin'}</span></span></label>}
          </li>
        ))}
      </ul>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
      {mode === 'group' && <div className="mt-4 flex justify-end"><button disabled={busy || !title.trim() || picked.length === 0} onClick={() => run(() => createGroup(ws, title, picked))} className="btn-primary disabled:opacity-50">Create group{picked.length ? ` (${picked.length + 1})` : ''}</button></div>}
    </Modal>
  )
}
