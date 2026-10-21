import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Menu, X } from 'lucide-react'
import { NAV } from '../lib/nav'
import { BRAND } from '../lib/brand'
import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { usePresence } from '../lib/usePresence'
import { useWorkspace } from '../lib/useWorkspace'
import { CallProvider } from '../lib/calls/CallProvider'
import Logo from '../components/Logo'
import NotificationCenter from '../components/NotificationCenter'
import ProfileMenu from '../components/ProfileMenu'

function Shell() {
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const { isAdmin, can } = useWorkspace()
  usePresence()
  useEffect(() => setOpen(false), [pathname])
  // Retention: attendance/activity older than 7 days (and old login history) are removed; once a day is enough.
  useEffect(() => {
    if (DEMO || !isAdmin) return
    const day = new Date().toDateString()
    if (localStorage.getItem('lw_cleanup') === day) return
    supabase.rpc('run_retention_cleanup').then(({ error }) => { if (!error) localStorage.setItem('lw_cleanup', day) })
  }, [isAdmin])
  const items = NAV.filter(n => isAdmin || (n.member && (n.to !== '/office' || can('office.access'))))

  return (
    <div className="flex min-h-screen">
      {open && <div className="fixed inset-0 z-30 bg-slate-900/40 backdrop-blur-[2px] animate-fade lg:hidden" onClick={() => setOpen(false)} />}
      <aside className={`fixed z-40 flex h-full w-64 flex-col border-r border-line bg-white px-3 py-4 transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:shrink-0 lg:translate-x-0 ${open ? 'translate-x-0 shadow-pop' : '-translate-x-full'}`}>
        <div className="mb-6 flex items-center gap-3 px-2">
          <Logo size={38} />
          <div className="leading-tight"><p className="text-[13px] font-extrabold tracking-[0.08em]">LEXON</p><p className="text-[11px] font-medium tracking-[0.18em] text-slate-400">WORKSPACE</p></div>
          <button className="ml-auto lg:hidden" onClick={() => setOpen(false)} aria-label="Close menu"><X size={18} /></button>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto" aria-label="Main">
          {items.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) => `group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium ${isActive ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'}`}>
              <Icon size={18} strokeWidth={2} /> {label}
            </NavLink>
          ))}
        </nav>
        <p className="px-3 pt-3 text-[11px] text-slate-300">{BRAND.name}</p>
      </aside>

      <div className="min-w-0 flex-1">
        <header className="sticky top-0 z-20 flex items-center gap-2 border-b border-line bg-white/85 px-4 py-2.5 backdrop-blur lg:px-8">
          <button className="grid h-10 w-10 place-items-center rounded-xl hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu"><Menu size={20} /></button>
          <div className="ml-auto flex items-center gap-1.5"><NotificationCenter /><span className="mx-1 h-6 w-px bg-line" /><ProfileMenu /></div>
        </header>
        <main className="p-4 lg:p-8"><div key={pathname} className="animate-page"><Outlet /></div></main>
      </div>
    </div>
  )
}

export default function WorkspaceLayout() { return <CallProvider><Shell /></CallProvider> }
