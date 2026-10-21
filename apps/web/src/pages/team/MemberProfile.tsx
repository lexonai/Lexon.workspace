import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Pencil } from 'lucide-react'
import { useWorkspace } from '../../lib/useWorkspace'
import { addMemberLink, clockIn, clockOut, getMember, getUserPermissions, listMemberLinks, removeMemberLink, setUserPermission, type MemberLink, listAttendance, listMemberActivity, setMemberActive, type ActivityItem, type AttendanceRow, type MemberDetail } from '../../services/team'
import { Avatar, Card, EmptyState, ErrorState, PresenceDot } from '../../components/ui'
import Stars from '../../components/Stars'
import EditMemberModal from './EditMemberModal'
import AccessCard from './AccessCard'
import { GRANTABLE } from '../../lib/permissions'

const roleLabel: Record<string, string> = { owner: 'Admin', admin: 'Admin', member: 'Team Member' }
const label = (s: string) => s.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
const fmt = (iso: string) => new Date(iso).toLocaleString('en', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
const dur = (a: string, b: string | null) => {
  const m = Math.round(((b ? new Date(b).getTime() : Date.now()) - new Date(a).getTime()) / 60000)
  return `${Math.floor(m / 60)}h ${m % 60}m`
}
type Tab = 'overview' | 'attendance' | 'activity'

export default function MemberProfile() {
  const { id } = useParams()
  const { ws, error: wsError, can } = useWorkspace()
  const [m, setM] = useState<MemberDetail | null>(null)
  const [att, setAtt] = useState<AttendanceRow[] | null>(null)
  const [act, setAct] = useState<ActivityItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<Tab>('overview')
  const [editing, setEditing] = useState(false)
  const [granted, setGranted] = useState<string[] | null>(null)
  const [links, setLinks] = useState<MemberLink[]>([])
  const [lnk, setLnk] = useState({ label: '', url: '' })

  const load = useCallback(async () => {
    if (!ws || !id) return
    setError(null)
    try {
      setM(await getMember(ws.workspaceId, id))
      setAtt(null); setAct(null)
    } catch (e) { setError((e as Error).message) }
  }, [ws, id])
  useEffect(() => { load() }, [load])

  const self = !!ws && ws.userId === id
  const admin = !!ws && (ws.role === 'owner' || ws.role === 'admin')
  useEffect(() => {
    if (!ws || !id || !admin || m?.role !== 'member') return
    getUserPermissions(ws.workspaceId, id).then(setGranted).catch(e => setError(e.message))
    listMemberLinks(id).then(setLinks).catch(() => {})
  }, [ws, id, admin, m?.role])
  const flip = async (perm: string, on: boolean) => {
    if (!ws || !id) return
    try { await setUserPermission(ws.workspaceId, id, perm, on); setGranted(g => on ? [...(g ?? []), perm] : (g ?? []).filter(x => x !== perm)) } catch (e) { setError((e as Error).message) }
  }
  const addLink = async () => {
    if (!ws || !id) return
    try { await addMemberLink(ws.workspaceId, id, lnk.label, lnk.url); setLnk({ label: '', url: '' }); setLinks(await listMemberLinks(id)) } catch (e) { setError((e as Error).message) }
  }
  const canAttendance = self || can('team.view_attendance')

  useEffect(() => {
    if (!ws || !id) return
    if (tab === 'attendance' && att === null && canAttendance) listAttendance(id).then(setAtt).catch(e => setError(e.message))
    if (tab === 'activity' && act === null) listMemberActivity(ws.workspaceId, id).then(setAct).catch(e => setError(e.message))
  }, [tab, ws, id, att, act, canAttendance])

  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={load} />
  if (!m || !ws) return <p className="text-slate-500">Loading profile…</p>

  const canEdit = can('team.edit'), canRate = can('team.rate'), canPrivate = self || can('team.view_private')
  const toggle = async () => {
    if (!confirm(m.active ? `Deactivate ${m.name}? They will lose access.` : `Reactivate ${m.name}?`)) return
    try { await setMemberActive(ws.workspaceId, m.id, !m.active); load() } catch (e) { setError((e as Error).message) }
  }
  const open = att?.find(a => !a.clockOut)
  const clock = async () => {
    try { open ? await clockOut(m.id, open.id) : await clockIn(m.id); setAtt(null) } catch (e) { setError((e as Error).message) }
  }
  const tabs: Tab[] = canAttendance ? ['overview', 'attendance', 'activity'] : ['overview', 'activity']

  return (
    <div className="space-y-6">
      <Link to="/team" className="inline-flex items-center gap-1 text-sm text-slate-500 hover:text-brand"><ArrowLeft size={16} /> Team</Link>

      <div className="card flex flex-wrap items-center gap-5 p-6">
        <Avatar name={m.name} src={m.avatar} size={72} />
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-semibold">{m.name}</h1>
          <p className="text-slate-500">{m.title ?? 'Team Member'}</p>
          <div className="mt-2 flex items-center gap-4"><Stars value={m.rating} /><PresenceDot status={m.presence} /><span className="text-xs text-slate-400">{roleLabel[m.role]}</span></div>
        </div>
        <div className="flex gap-2">
          {(canEdit || canRate || canPrivate) && <button onClick={() => setEditing(true)} className="inline-flex items-center gap-2 rounded-lg border border-line px-4 py-2 text-sm"><Pencil size={14} /> Edit</button>}
          {can('team.edit') && m.role !== 'owner' && <button onClick={toggle} className="rounded-lg border border-line px-4 py-2 text-sm">{m.active ? 'Deactivate' : 'Reactivate'}</button>}
        </div>
      </div>

      <div className="flex gap-1 border-b border-line" role="tablist">
        {tabs.map(t => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${tab === t ? 'border-brand text-brand' : 'border-transparent text-slate-500'}`}>{t}</button>
        ))}
      </div>

      {tab === 'overview' && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="About">
            <p className="text-sm text-slate-600">{m.about || 'No bio added yet.'}</p>
            {m.skills.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{m.skills.map(s => <span key={s} className="rounded-md bg-brand-soft px-2 py-1 text-xs text-brand">{s}</span>)}</div>}
          </Card>
          <Card title="Projects">
            {m.projects.length === 0 ? <EmptyState text="Not assigned to any project." /> : <ul className="space-y-2 text-sm">{m.projects.map(p => <li key={p.id}><Link className="hover:text-brand" to={`/projects/${p.id}`}>{p.name}</Link></li>)}</ul>}
          </Card>
          <Card title="Assigned tasks" className="lg:col-span-2">
            {m.tasks.length === 0 ? <EmptyState text="No tasks assigned." /> : (
              <ul className="divide-y divide-line">
                {m.tasks.map(t => (
                  <li key={t.id} className="flex items-center gap-4 py-3">
                    <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{t.title}</p><p className="text-xs text-slate-400">{label(t.status)}{t.due ? ` · due ${new Date(t.due).toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : ''}</p></div>
                    <div className="h-1.5 w-24 rounded-full bg-slate-100"><div className="h-full rounded-full bg-brand" style={{ width: `${t.progress}%` }} /></div>
                    <span className="w-9 text-right text-xs text-slate-500">{t.progress}%</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {admin && m.role === 'member' && granted && (
            <Card title="Access (set by Admin)" className="lg:col-span-2">
              <p className="mb-3 text-xs text-slate-400">Team Members can only do what is ticked here. The database enforces it; hiding a button is never the only protection.</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {GRANTABLE.map(p => (
                  <label key={p.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-line p-3 text-sm">
                    <input type="checkbox" className="mt-1" checked={granted.includes(p.key)} onChange={e => flip(p.key, e.target.checked)} />
                    <span><span className="font-medium">{p.label}</span>{p.hint && <><br /><span className="text-xs text-slate-500">{p.hint}</span></>}</span>
                  </label>
                ))}
              </div>
            </Card>
          )}
          {admin && m.role === 'member' && (
            <Card title="Personal links (shown in the Team app)" className="lg:col-span-2">
              <ul className="space-y-1 text-sm">{links.map(l => <li key={l.id} className="flex items-center justify-between gap-3"><a className="truncate text-brand" href={l.url} target="_blank" rel="noopener noreferrer">{l.label}</a><button className="text-xs text-red-600" onClick={async () => { await removeMemberLink(l.id); setLinks(await listMemberLinks(m.id)) }}>Remove</button></li>)}{links.length === 0 && <li className="text-slate-400">No links yet.</li>}</ul>
              <div className="mt-3 flex flex-wrap gap-2"><input className="rounded-lg border border-line px-3 py-2 text-sm" placeholder="Label" value={lnk.label} onChange={e => setLnk({ ...lnk, label: e.target.value })} /><input className="min-w-[220px] flex-1 rounded-lg border border-line px-3 py-2 text-sm" placeholder="https://…" value={lnk.url} onChange={e => setLnk({ ...lnk, url: e.target.value })} /><button className="btn-ghost" disabled={!lnk.label || !lnk.url} onClick={addLink}>Add</button></div>
            </Card>
          )}
          {ws.role !== 'member' && m.role === 'member' && <AccessCard ws={ws.workspaceId} userId={m.id} />}
          {m.private && (
            <Card title="Personal information" className="lg:col-span-2">
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                {([['Phone', m.private.phone], ['Email', m.private.email], ['Address', m.private.address], ['Emergency contact', m.private.emergency_contact], ['Notes', m.private.notes]] as const).map(([k, v]) => (
                  <div key={k}><dt className="text-xs text-slate-400">{k}</dt><dd>{v || '—'}</dd></div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      )}

      {tab === 'attendance' && (
        <Card title="Attendance" action={self ? <button onClick={clock} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white">{open ? 'Clock out' : 'Clock in'}</button> : undefined}>
          {att === null ? <p className="text-sm text-slate-400">Loading…</p> : att.length === 0 ? <EmptyState text="No attendance records yet." /> : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-xs text-slate-400"><th className="pb-2">Clock in</th><th className="pb-2">Clock out</th><th className="pb-2 text-right">Duration</th></tr></thead>
              <tbody className="divide-y divide-line">
                {att.map(a => <tr key={a.id}><td className="py-2">{fmt(a.clockIn)}</td><td>{a.clockOut ? fmt(a.clockOut) : <span className="text-emerald-600">Active</span>}</td><td className="text-right">{dur(a.clockIn, a.clockOut)}</td></tr>)}
              </tbody>
            </table>
          )}
        </Card>
      )}

      {tab === 'activity' && (
        <Card title="Recent activity">
          {act === null ? <p className="text-sm text-slate-400">Loading…</p> : act.length === 0 ? <EmptyState text="No activity yet." /> : (
            <ul className="divide-y divide-line">
              {act.map(a => <li key={a.id} className="flex justify-between gap-4 py-2.5 text-sm"><span>{label(a.action)}{a.title ? `: ${a.title}` : ''}</span><span className="shrink-0 text-xs text-slate-400">{fmt(a.at)}</span></li>)}
            </ul>
          )}
        </Card>
      )}

      {editing && <EditMemberModal member={m} canEdit={canEdit} canRate={canRate} canPrivate={canPrivate} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); load() }} />}
    </div>
  )
}
