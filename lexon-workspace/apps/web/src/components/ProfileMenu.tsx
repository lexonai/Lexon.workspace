import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown, LogOut, Settings, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { useAuth } from '../auth/AuthProvider'
import { useWorkspace } from '../lib/useWorkspace'
import { Avatar } from './ui'

export default function ProfileMenu() {
  const { userId, session, signOut } = useAuth()
  const { ws, isAdmin } = useWorkspace()
  const [open, setOpen] = useState(false)
  const [p, setP] = useState<{ name: string; avatar: string | null }>({ name: DEMO ? 'Demo user' : '', avatar: null })
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!userId || DEMO) return
    supabase.from('profiles').select('full_name,avatar_url').eq('id', userId).maybeSingle().then(({ data }) => setP({ name: data?.full_name || session?.user.email || 'Account', avatar: data?.avatar_url ?? null }))
  }, [userId, session])
  useEffect(() => {
    if (!open) return
    const d = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false) }
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', d); document.addEventListener('keydown', k)
    return () => { document.removeEventListener('mousedown', d); document.removeEventListener('keydown', k) }
  }, [open])
  const email = session?.user.email ?? ''
  return (
    <div className="relative" ref={box}>
      <button onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Account menu" className="flex items-center gap-2 rounded-xl py-1 pl-1 pr-2 hover:bg-slate-100">
        <Avatar name={p.name || '?'} src={p.avatar} size={32} />
        <span className="hidden text-left leading-tight sm:block"><span className="block max-w-[140px] truncate text-sm font-medium">{p.name}</span><span className="block text-[11px] text-slate-400">{isAdmin ? 'Admin' : 'Team Member'}</span></span>
        <ChevronDown size={14} className={`text-slate-400 transition ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-50 w-64 overflow-hidden rounded-2xl border border-line bg-white shadow-pop animate-pop" role="menu">
          <div className="border-b border-line px-4 py-3"><p className="truncate text-sm font-semibold">{p.name}</p><p className="truncate text-xs text-slate-500">{email}</p>{ws && <p className="mt-1 inline-block rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-500">{isAdmin ? 'Admin' : 'Team Member'}</p>}</div>
          <div className="p-1.5 text-sm">
            <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-50"><Settings size={16} className="text-slate-400" /> Account settings</Link>
            <Link role="menuitem" to="/settings" onClick={() => setOpen(false)} className="flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-slate-50"><ShieldCheck size={16} className="text-slate-400" /> Security and 2FA</Link>
            {!DEMO && <>
              <button role="menuitem" onClick={() => signOut('others')} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left hover:bg-slate-50"><LogOut size={16} className="text-slate-400" /> Sign out other devices</button>
              <button role="menuitem" onClick={() => signOut()} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-red-600 hover:bg-red-50"><LogOut size={16} /> Sign out</button>
            </>}
          </div>
        </div>
      )}
    </div>
  )
}
