import { useEffect, useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Phone, Video } from 'lucide-react'
import { supabase } from '../supabase'
import { useAuth } from '../../auth/AuthProvider'
import Modal from '../../components/Modal'
import { EmptyState } from '../../components/ui'

interface Row { id: string; out: boolean; peer: string; kind: string; status: string; at: string; secs: number | null }

export default function CallHistory({ onClose }: { onClose: () => void }) {
  const { userId } = useAuth()
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!userId) return
    ;(async () => {
      const { data, error } = await supabase.from('call_sessions').select('id,caller_id,callee_id,kind,status,created_at,answered_at,ended_at')
        .or(`caller_id.eq.${userId},callee_id.eq.${userId}`).order('created_at', { ascending: false }).limit(30)
      if (error) return setError(error.message)
      const ids = [...new Set((data ?? []).map(c => (c.caller_id === userId ? c.callee_id : c.caller_id)))]
      const { data: ps } = ids.length ? await supabase.from('profiles').select('id,full_name').in('id', ids) : { data: [] as any[] }
      const name = (id: string) => ps?.find((p: any) => p.id === id)?.full_name || 'Unknown'
      setRows((data ?? []).map(c => ({
        id: c.id, out: c.caller_id === userId, peer: name(c.caller_id === userId ? c.callee_id : c.caller_id), kind: c.kind, status: c.status, at: c.created_at,
        secs: c.answered_at && c.ended_at ? Math.round((new Date(c.ended_at).getTime() - new Date(c.answered_at).getTime()) / 1000) : null
      })))
    })()
  }, [userId])

  return (
    <Modal title="Call history" onClose={onClose}>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      {!rows && !error && <p className="text-sm text-slate-400">Loading…</p>}
      {rows && rows.length === 0 && <EmptyState text="No calls yet." />}
      <ul className="max-h-80 divide-y divide-line overflow-y-auto">
        {rows?.map(r => (
          <li key={r.id} className="flex items-center gap-3 py-2.5 text-sm">
            <span className={r.out ? 'text-slate-400' : r.status === 'missed' ? 'text-red-500' : 'text-emerald-500'}>{r.out ? <ArrowUpRight size={16} /> : <ArrowDownLeft size={16} />}</span>
            <span className="min-w-0 flex-1"><span className="block truncate font-medium">{r.peer}</span>
              <span className="text-xs text-slate-400">{r.kind === 'video' ? 'Video' : 'Voice'} · {r.status}{r.secs !== null ? ` · ${Math.floor(r.secs / 60)}m ${r.secs % 60}s` : ''}</span></span>
            <span className="text-slate-300">{r.kind === 'video' ? <Video size={14} /> : <Phone size={14} />}</span>
            <span className="shrink-0 text-xs text-slate-400">{new Date(r.at).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
          </li>
        ))}
      </ul>
    </Modal>
  )
}
