import { useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

// Rendered through a portal into <body>, so no ancestor (sticky/blur header, overflow-hidden panel,
// transformed card) can clip it or re-anchor it. Always centered, 30% dim + blur, and the page behind never scrolls.
let openCount = 0
function lockScroll() {
  if (openCount++ === 0) document.body.style.overflow = 'hidden'
  return () => { if (--openCount === 0) document.body.style.overflow = '' }
}

export default function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => lockScroll(), [])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-slate-900/30 p-4 backdrop-blur-sm animate-fade" role="dialog" aria-modal="true" aria-label={title}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`card flex max-h-[calc(100dvh-2rem)] w-full flex-col ${wide ? 'max-w-xl' : 'max-w-md'} p-6`}>
        <div className="mb-4 flex shrink-0 items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">{children}</div>
      </div>
    </div>,
    document.body
  )
}
export const inputCls = 'mt-1 w-full rounded-lg border border-line bg-white px-3 py-2 text-sm'
