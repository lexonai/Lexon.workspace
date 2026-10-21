import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Card } from '../../components/ui'
import { GRANTABLE } from '../../lib/permissions'
import { addMemberLink, getUserPermissions, listMemberLinks, removeMemberLink, setUserPermission, type MemberLink } from '../../services/team'

// Admin-only: what this Team Member may do, and the personal links shown in their Team app. Enforced by the database.
export default function AccessCard({ ws, userId }: { ws: string; userId: string }) {
  const [perms, setPerms] = useState<string[] | null>(null)
  const [links, setLinks] = useState<MemberLink[]>([])
  const [label, setLabel] = useState(''); const [url, setUrl] = useState('')
  const [err, setErr] = useState<string | null>(null)
  const load = useCallback(async () => {
    try { setPerms(await getUserPermissions(ws, userId)); setLinks(await listMemberLinks(userId)); setErr(null) } catch (e) { setErr((e as Error).message) }
  }, [ws, userId])
  useEffect(() => { load() }, [load])
  const toggle = async (k: string, on: boolean) => { try { await setUserPermission(ws, userId, k, on); load() } catch (e) { setErr((e as Error).message) } }
  const add = async (e: React.FormEvent) => { e.preventDefault(); try { await addMemberLink(ws, userId, label, url); setLabel(''); setUrl(''); load() } catch (e2) { setErr((e2 as Error).message) } }
  return (
    <Card title="Access and links" className="lg:col-span-2">
      {err && <p role="alert" className="mb-3 text-sm text-red-600">{err}</p>}
      <div className="grid gap-6 md:grid-cols-2">
        <div><p className="mb-2 text-sm font-medium">Permissions</p>
          <ul className="space-y-2">{GRANTABLE.map(g => (
            <li key={g.key}><label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" disabled={perms === null} checked={perms?.includes(g.key) ?? false} onChange={e => toggle(g.key, e.target.checked)} /><span>{g.label}{g.hint && <span className="block text-xs text-slate-400">{g.hint}</span>}</span></label></li>
          ))}</ul></div>
        <div><p className="mb-2 text-sm font-medium">Personal links</p>
          <ul className="mb-3 space-y-1 text-sm">{links.length === 0 && <li className="text-slate-400">No links yet.</li>}{links.map(l => <li key={l.id} className="flex items-center justify-between gap-2"><a className="truncate text-brand" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a><button aria-label="Remove link" onClick={async () => { await removeMemberLink(l.id); load() }}><Trash2 size={14} className="text-slate-400" /></button></li>)}</ul>
          <form onSubmit={add} className="flex flex-wrap gap-2"><input required value={label} onChange={e => setLabel(e.target.value)} placeholder="Label" aria-label="Label" className="w-28 rounded-lg border border-line px-2 py-1.5 text-sm" /><input required value={url} onChange={e => setUrl(e.target.value)} placeholder="https://…" aria-label="URL" className="min-w-0 flex-1 rounded-lg border border-line px-2 py-1.5 text-sm" /><button className="btn-ghost px-3 py-1.5 text-xs">Add</button></form></div>
      </div>
    </Card>
  )
}
