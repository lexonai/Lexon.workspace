import { useCallback, useEffect, useRef, useState } from 'react'
import { ArrowLeft, Paperclip, Phone, Pin, Search, Send, Video, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { Avatar, PresenceDot } from '../../components/ui'
import { useCall } from '../../lib/calls/CallProvider'
import {
  deleteMessage, editMessage, fileUrl, listMessages, markRead, sendMessage, setPinned, toggleReaction,
  type Attachment, type Conversation, type Message
} from '../../services/messages'

export type Names = Record<string, { name: string; avatar: string | null }>
const EMOJIS = ['👍', '❤️', '😂', '🎉']
const COLORS = ['text-amber-600', 'text-pink-600', 'text-emerald-600', 'text-violet-600', 'text-sky-600', 'text-orange-600']
const colorFor = (id: string) => COLORS[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % COLORS.length]
const time = (iso: string) => new Date(iso).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' })
const dayKey = (iso: string) => new Date(iso).toDateString()
const dayLabel = (iso: string) => dayKey(iso) === new Date().toDateString() ? `Today, ${new Date(iso).toLocaleDateString('en', { month: 'long', day: 'numeric' })}` : new Date(iso).toLocaleDateString('en', { month: 'long', day: 'numeric', year: 'numeric' })
const size = (n: number | null) => n === null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`

function AttachmentView({ file }: { file: Attachment }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => { fileUrl(file.path).then(setUrl).catch(() => setUrl(null)) }, [file.path])
  if (file.mime?.startsWith('image/') && url) return <a href={url} target="_blank" rel="noreferrer noopener"><img src={url} alt={file.name} className="mt-1 max-h-60 rounded-lg" /></a>
  return (
    <a href={url ?? undefined} target="_blank" rel="noreferrer noopener" className="mt-1 inline-flex items-center gap-2 rounded-lg bg-black/5 px-3 py-2 text-sm underline">
      <Paperclip size={14} /> {file.name} <span className="text-xs opacity-60">{size(file.size)}</span>
    </a>
  )
}

interface Props { ws: string; myId: string; conv: Conversation; names: Names; onBack: () => void; onChanged: () => void }

export default function ChatPane({ ws, myId, conv, names, onBack, onChanged }: Props) {
  const [msgs, setMsgs] = useState<Message[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [editing, setEditing] = useState<Message | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [typing, setTyping] = useState<string | null>(null)
  const [search, setSearch] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { startCall } = useCall()
  const canCall = conv.kind === 'direct' && !!conv.otherId
  const bottom = useRef<HTMLDivElement>(null)
  const channel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const lastTyped = useRef(0)
  const typingTimer = useRef<ReturnType<typeof setTimeout>>()

  const load = useCallback(async () => {
    try { setMsgs(await listMessages(conv.id)) } catch (e) { setError((e as Error).message) }
  }, [conv.id])

  useEffect(() => {
    setMsgs(null); setReplyTo(null); setEditing(null); setText(''); setFile(null); setSearch(null); setTyping(null); setSelected(null)
    load(); markRead(conv.id, myId).then(onChanged)
    const ch = supabase.channel(`chat:${conv.id}`, { config: { broadcast: { self: false } } })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conv.id}` },
        () => { load(); markRead(conv.id, myId).then(onChanged) })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (payload?.uid === myId) return
        setTyping(payload?.name ?? 'Someone')
        clearTimeout(typingTimer.current)
        typingTimer.current = setTimeout(() => setTyping(null), 3000)
      })
      .subscribe()
    channel.current = ch
    return () => { supabase.removeChannel(ch); channel.current = null; clearTimeout(typingTimer.current) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv.id])

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }) }, [msgs?.length, conv.id])

  const onType = (v: string) => {
    setText(v)
    if (Date.now() - lastTyped.current > 2000) {
      lastTyped.current = Date.now()
      channel.current?.send({ type: 'broadcast', event: 'typing', payload: { uid: myId, name: names[myId]?.name ?? 'Someone' } })
    }
  }
  const act = async (fn: () => Promise<void>) => { try { await fn(); await load(); onChanged() } catch (e) { setError((e as Error).message) } }

  const send = async () => {
    const body = text.trim()
    if (!body && !file) return
    setBusy(true); setError(null)
    try {
      if (editing) { await editMessage(editing.id, body); setEditing(null) }
      else await sendMessage(ws, conv.id, myId, body, { replyTo: replyTo?.id, file })
      setText(''); setReplyTo(null); setFile(null)
      await load(); onChanged()
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }

  const list = (msgs ?? []).filter(m => !search || (m.body ?? '').toLowerCase().includes(search.toLowerCase()))
  const sub = typing ? <span className="italic text-emerald-600">{typing} is typing…</span>
    : conv.presence ? <PresenceDot status={conv.presence} /> : <span className="text-xs text-slate-400">{conv.kind === 'group' ? 'Group' : conv.kind}</span>

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
        <button className="md:hidden" onClick={onBack} aria-label="Back"><ArrowLeft size={18} /></button>
        <Avatar name={conv.title} src={conv.otherAvatar} size={40} />
        <div className="min-w-0 flex-1"><p className="truncate font-semibold">{conv.title}</p><div className="text-xs">{sub}</div></div>
        <button aria-label="Search messages" onClick={() => setSearch(search === null ? '' : null)} className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"><Search size={18} /></button>
        <button aria-label={conv.pinned ? 'Unpin' : 'Pin'} onClick={() => act(() => setPinned(conv.id, myId, !conv.pinned))} className={`rounded-lg p-2 hover:bg-slate-50 ${conv.pinned ? 'text-brand' : 'text-slate-500'}`}><Pin size={18} /></button>
        <button disabled={!canCall} onClick={() => conv.otherId && startCall(ws, conv.otherId, 'video')} title="Video call" aria-label="Video call" className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 disabled:text-slate-300"><Video size={18} /></button>
        <button disabled={!canCall} onClick={() => conv.otherId && startCall(ws, conv.otherId, 'audio')} title="Voice call" aria-label="Voice call" className="rounded-lg p-2 text-slate-500 hover:bg-slate-50 disabled:text-slate-300"><Phone size={18} /></button>
      </div>
      {search !== null && (
        <div className="border-b border-line bg-white px-4 py-2"><input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder="Search in this conversation…" className="w-full rounded-lg border border-line px-3 py-1.5 text-sm" /></div>
      )}

      <div className="flex-1 space-y-3 overflow-y-auto bg-slate-100/70 p-4">
        {msgs === null && <p className="text-center text-sm text-slate-400">Loading messages…</p>}
        {msgs && list.length === 0 && <p className="py-10 text-center text-sm text-slate-400">{search ? 'No matching messages.' : 'No messages yet. Say hello 👋'}</p>}
        {list.map((m, i) => {
          const mine = m.senderId === myId
          const who = names[m.senderId]
          const parent = m.replyTo ? msgs?.find(x => x.id === m.replyTo) : null
          const deleted = !!m.deletedAt
          return (
            <div key={m.id}>
              {(i === 0 || dayKey(list[i - 1].createdAt) !== dayKey(m.createdAt)) && (
                <div className="my-3 text-center"><span className="rounded-full bg-white px-3 py-1 text-xs text-slate-500">{dayLabel(m.createdAt)}</span></div>
              )}
              <div className={`flex items-end gap-2 ${mine ? 'justify-end' : ''}`}>
                {!mine && <Avatar name={who?.name ?? '?'} src={who?.avatar} size={30} />}
                <div className={`max-w-[78%] ${mine ? 'items-end' : ''} flex flex-col`}>
                  <button type="button" onClick={() => setSelected(selected === m.id ? null : m.id)}
                    className={`rounded-2xl px-4 py-2.5 text-left text-sm ${mine ? 'bg-blue-600 text-white' : 'bg-white text-slate-800'}`}>
                    {!mine && conv.kind !== 'direct' && <p className={`mb-0.5 text-xs font-semibold ${colorFor(m.senderId)}`}>{who?.name ?? 'Unknown'}</p>}
                    {parent && <div className={`mb-1.5 rounded-lg border-l-2 px-2 py-1 text-xs ${mine ? 'border-white/60 bg-white/10' : 'border-blue-400 bg-slate-50'}`}>{parent.deletedAt ? 'Deleted message' : (parent.body ?? 'Attachment')}</div>}
                    {deleted ? <span className="italic opacity-60">Message deleted</span> : (
                      <>{m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}{m.file && <AttachmentView file={m.file} />}</>
                    )}
                  </button>
                  {Object.keys(m.reactions).length > 0 && !deleted && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {Object.entries(m.reactions).map(([e, users]) => (
                        <button key={e} onClick={() => act(() => toggleReaction(m.id, e))} className={`rounded-full border px-2 py-0.5 text-xs ${users.includes(myId) ? 'border-blue-300 bg-blue-50' : 'border-line bg-white'}`}>{e} {users.length}</button>
                      ))}
                    </div>
                  )}
                  <span className="mt-1 text-[11px] text-slate-400">{time(m.createdAt)}{m.editedAt && !deleted ? ' · edited' : ''}</span>
                  {selected === m.id && !deleted && (
                    <div className="mt-1 flex flex-wrap items-center gap-1 rounded-lg bg-white p-1 text-xs shadow-sm ring-1 ring-line">
                      {EMOJIS.map(e => <button key={e} onClick={() => { setSelected(null); act(() => toggleReaction(m.id, e)) }} className="rounded px-1.5 py-0.5 hover:bg-slate-100">{e}</button>)}
                      <button onClick={() => { setReplyTo(m); setSelected(null) }} className="rounded px-2 py-0.5 hover:bg-slate-100">Reply</button>
                      {mine && m.body && <button onClick={() => { setEditing(m); setText(m.body ?? ''); setSelected(null) }} className="rounded px-2 py-0.5 hover:bg-slate-100">Edit</button>}
                      {mine && <button onClick={() => { setSelected(null); if (confirm('Delete this message?')) act(() => deleteMessage(m.id)) }} className="rounded px-2 py-0.5 text-red-600 hover:bg-slate-100">Delete</button>}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottom} />
      </div>

      <div className="border-t border-line bg-white p-3">
        {(replyTo || editing || file) && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
            <span className="min-w-0 flex-1 truncate">
              {editing ? 'Editing message' : replyTo ? `Replying to ${names[replyTo.senderId]?.name ?? 'message'}: ${replyTo.body ?? 'Attachment'}` : `Attachment: ${file?.name}`}
            </span>
            <button aria-label="Cancel" onClick={() => { setReplyTo(null); setEditing(null); setFile(null); if (editing) setText('') }}><X size={14} /></button>
          </div>
        )}
        {error && <p role="alert" className="mb-2 text-xs text-red-600">{error}</p>}
        <div className="flex items-end gap-2">
          <label className="cursor-pointer rounded-lg p-2 text-slate-500 hover:bg-slate-50" aria-label="Attach file">
            <Paperclip size={18} /><input type="file" className="hidden" onChange={e => { setFile(e.target.files?.[0] ?? null); e.target.value = '' }} disabled={!!editing} />
          </label>
          <textarea rows={1} value={text} onChange={e => onType(e.target.value)} placeholder="Type a message…"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
            className="max-h-32 flex-1 resize-none rounded-xl border border-line px-3 py-2 text-sm" />
          <button onClick={send} disabled={busy} aria-label="Send" className="rounded-xl bg-brand p-2.5 text-white disabled:opacity-60"><Send size={18} /></button>
        </div>
      </div>
    </div>
  )
}
