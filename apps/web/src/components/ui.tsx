import type { ReactNode } from 'react'
import type { Presence } from '../types'

export function Card({ title, action, children, className = '' }: { title?: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card p-5 ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">{title}</h2>
          {action}
        </div>
      )}
      {children}
    </section>
  )
}

export function Avatar({ name, src, size = 36 }: { name: string; src?: string | null; size?: number }) {
  const initials = name.split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase()
  return src
    ? <img src={src} alt={name} style={{ width: size, height: size }} className="rounded-full object-cover" />
    : <span style={{ width: size, height: size }} className="grid place-items-center rounded-full bg-brand-soft text-xs font-semibold text-brand">{initials}</span>
}

const dot: Record<Presence, string> = { online: 'bg-emerald-500', away: 'bg-amber-400', offline: 'bg-slate-300' }
export function PresenceDot({ status }: { status: Presence }) {
  return <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><i className={`h-2 w-2 rounded-full ${dot[status]}`} />{status[0].toUpperCase() + status.slice(1)}</span>
}

export function EmptyState({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-slate-400">{text}</p>
}

export function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="card m-6 p-6">
      <p className="font-medium text-red-600">Could not load data</p>
      <p className="mt-1 text-sm text-slate-500">{message}</p>
      <button onClick={onRetry} className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white">Retry</button>
    </div>
  )
}
