import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Mic, MicOff, Pencil, Send, Sparkles, Trash2, Volume2, VolumeX, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { callFn } from '../lib/functions'
import { useWorkspace } from '../lib/useWorkspace'

interface Msg { role: 'user' | 'assistant'; content: string }
const LANGS: [string, string][] = [['auto', 'Auto'], ['en-IN', 'English (India)'], ['hi-IN', 'Hindi'], ['en-US', 'English (US)'], ['bn-IN', 'Bengali'], ['ta-IN', 'Tamil'], ['te-IN', 'Telugu'], ['mr-IN', 'Marathi'], ['gu-IN', 'Gujarati'], ['es-ES', 'Spanish'], ['fr-FR', 'French'], ['de-DE', 'German'], ['pt-BR', 'Portuguese'], ['ar-SA', 'Arabic'], ['ja-JP', 'Japanese'], ['zh-CN', 'Chinese']]
const SUGGEST = ['Hello! What can you do?', 'Which tasks are pending?', 'Who is online right now?', 'Give me a quick summary of today']
const SR: any = typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : null

function Rich({ text }: { text: string }) {
  return <>{text.split(/(\*\*[^*]+\*\*)/g).map((t, i) => t.startsWith('**') && t.endsWith('**') ? <strong key={i}>{t.slice(2, -2)}</strong> : <span key={i}>{t}</span>)}</>
}

export default function AssistantPanel({ name, onRename, onClose }: { name: string; onRename: (n: string) => void; onClose: () => void }) {
  const { ws, isAdmin } = useWorkspace()
  const key = ws ? `lw_assistant_${ws.userId}` : ''
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [speak, setSpeak] = useState(false)
  const [listening, setListening] = useState(false)
  const [lang, setLang] = useState('auto')
  const end = useRef<HTMLDivElement>(null)
  const rec = useRef<any>(null)
  const voiceLang = useMemo(() => (lang === 'auto' ? navigator.language || 'en-US' : lang), [lang])

  useEffect(() => { if (key) try { setMsgs(JSON.parse(localStorage.getItem(key) || '[]')) } catch { /* ignore */ } }, [key])
  useEffect(() => { if (key) localStorage.setItem(key, JSON.stringify(msgs.slice(-40))); end.current?.scrollIntoView({ block: 'end', behavior: 'smooth' }) }, [msgs, key])
  useEffect(() => () => { window.speechSynthesis?.cancel(); rec.current?.stop?.() }, [])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])

  const say = (t: string) => {
    if (!speak || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(t.replace(/\*\*/g, '').replace(/[#*_`>]/g, ''))
    u.lang = voiceLang; window.speechSynthesis.speak(u)
  }
  const send = async (raw: string) => {
    const q = raw.trim()
    if (!q || busy || !ws) return
    const next = [...msgs, { role: 'user' as const, content: q }]
    setMsgs(next); setText(''); setBusy(true); setError(null)
    try {
      const r = await callFn<{ reply: string }>('assistant', { workspaceId: ws.workspaceId, messages: next.slice(-20), voice: speak })
      setMsgs(m => [...m, { role: 'assistant', content: r.reply }]); say(r.reply)
    } catch (e) { setError((e as Error).message) }
    setBusy(false)
  }
  const mic = () => {
    if (!SR) return
    if (listening) { rec.current?.stop(); return }
    const r = new SR(); r.lang = voiceLang; r.interimResults = true; r.continuous = false
    r.onresult = (e: any) => setText(Array.from(e.results).map((x: any) => x[0].transcript).join(' '))
    r.onend = () => { setListening(false) }
    r.onerror = () => { setListening(false); setError('Voice input is not available here. Use Chrome or Edge, and allow the microphone.') }
    rec.current = r; setListening(true); r.start()
  }
  const saveName = async () => {
    const n = draftName.trim().slice(0, 40)
    if (!n || !ws) return setEditing(false)
    const { error } = await supabase.from('profiles').update({ assistant_name: n }).eq('id', ws.userId)
    if (error) setError(error.message); else onRename(n)
    setEditing(false)
  }

  return (
    <div className="fixed inset-0 z-[55]" role="dialog" aria-modal="true" aria-label={`${name} chat`}>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-fade" onClick={onClose} />
      <section className="absolute inset-y-0 right-0 flex w-full flex-col bg-white shadow-pop animate-slide sm:w-[440px]">
        <header className="flex items-center gap-3 border-b border-line px-4 py-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-violet-500 text-white"><Sparkles size={19} /></span>
          <div className="min-w-0 flex-1">
            {editing
              ? <div className="flex items-center gap-1"><input autoFocus maxLength={40} value={draftName} onChange={e => setDraftName(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveName()} className="w-full rounded-lg border border-line px-2 py-1 text-sm" aria-label="Assistant name" /><button onClick={saveName} aria-label="Save name" className="rounded-lg p-1.5 text-emerald-600 hover:bg-slate-100"><Check size={16} /></button></div>
              : <div className="flex items-center gap-1.5"><h2 className="truncate font-semibold">{name}</h2><button onClick={() => { setDraftName(name); setEditing(true) }} aria-label="Rename assistant" className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"><Pencil size={13} /></button></div>}
            <p className="text-xs text-slate-400">Powered by Google Gemini · knows your workspace</p>
          </div>
          <button onClick={() => { if (confirm('Clear this conversation?')) { setMsgs([]); window.speechSynthesis?.cancel() } }} aria-label="Clear chat" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><Trash2 size={16} /></button>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"><X size={18} /></button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-4">
          {msgs.length === 0 && (
            <div className="py-8 text-center">
              <p className="text-lg font-semibold">Hi, I'm {name}</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-slate-500">Ask anything: your tasks, team and projects, or just chat. I understand many languages.</p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">{SUGGEST.map(s => <button key={s} onClick={() => send(s)} className="rounded-full border border-line bg-white px-3 py-1.5 text-xs hover:border-brand hover:text-brand">{s}</button>)}</div>
            </div>
          )}
          {msgs.map((m, i) => <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : ''}`}><p className={`max-w-[88%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-white shadow-card'}`}><Rich text={m.content} /></p></div>)}
          {busy && <div className="flex gap-1 px-2" aria-label="Thinking"><i className="h-2 w-2 animate-bounce rounded-full bg-slate-300" /><i className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:.15s]" /><i className="h-2 w-2 animate-bounce rounded-full bg-slate-300 [animation-delay:.3s]" /></div>}
          {error && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}{isAdmin && /not set up|Gemini/i.test(error) && <> <Link to="/integrations" onClick={onClose} className="font-medium underline">Open Integrations</Link></>}</div>}
          <div ref={end} />
        </div>

        <footer className="border-t border-line bg-white p-3">
          <div className="mb-2 flex items-center gap-2 text-xs text-slate-500">
            <button onClick={() => { setSpeak(!speak); window.speechSynthesis?.cancel() }} aria-pressed={speak} className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 ${speak ? 'bg-brand-soft text-brand' : 'hover:bg-slate-100'}`}>{speak ? <Volume2 size={14} /> : <VolumeX size={14} />} Read aloud</button>
            <select value={lang} onChange={e => setLang(e.target.value)} className="rounded-lg border border-line bg-white px-1.5 py-1 text-xs" aria-label="Voice language">{LANGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            {!SR && <span className="text-slate-400">Voice input needs Chrome/Edge</span>}
          </div>
          <form onSubmit={e => { e.preventDefault(); send(text) }} className="flex items-end gap-2">
            {SR && <button type="button" onClick={mic} aria-label={listening ? 'Stop listening' : 'Voice input'} className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${listening ? 'animate-pulse bg-red-500 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{listening ? <MicOff size={18} /> : <Mic size={18} />}</button>}
            <textarea rows={1} value={text} onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }} placeholder={`Message ${name}…`} className="max-h-28 flex-1 resize-none rounded-xl border border-line px-3 py-2.5 text-sm" />
            <button disabled={busy || !text.trim()} aria-label="Send" className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand text-white disabled:opacity-50"><Send size={17} /></button>
          </form>
        </footer>
      </section>
    </div>
  )
}
