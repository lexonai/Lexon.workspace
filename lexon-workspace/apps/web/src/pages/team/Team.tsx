import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Plus, RefreshCw, Search, Trash2 } from 'lucide-react'
import { useWorkspace } from '../../lib/useWorkspace'
import { inviteMember, listInvites, listMembers, revokeInvite, type InviteResult, type InviteRow, type Member } from '../../services/team'
import { Avatar, EmptyState, ErrorState, PresenceDot } from '../../components/ui'
import Modal from '../../components/Modal'
import Stars from '../../components/Stars'
import InviteModal, { InviteResultView } from './InviteModal'

type Tab = 'members' | 'invites'
const STATUS: Record<InviteRow['status'], { label: string; cls: string }> = {
  joined: { label: 'Joined', cls: 'bg-emerald-50 text-emerald-700 ring-emerald-200' },
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-700 ring-amber-200' },
  not_registered: { label: 'Not registered', cls: 'bg-slate-100 text-slate-600 ring-slate-200' }
}

export default function Team() {
  const { ws, error: wsError, can } = useWorkspace()
  const [tab, setTab] = useState<Tab>('members')
  const [members, setMembers] = useState<Member[] | null>(null)
  const [invites, setInvites] = useState<InviteRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [invErr, setInvErr] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [status, setStatus] = useState('all')
  const [inviting, setInviting] = useState(false)
  const [shown, setShown] = useState<{ email: string; r: InviteResult } | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const manage = can('team.invite')

  const load = useCallback(async () => {
    if (!ws) return
    setError(null)
    try { setMembers(await listMembers(ws.workspaceId)) } catch (e) { setError((e as Error).message) }
    if (manage) { try { setInvites(await listInvites(ws.workspaceId)); setInvErr(null) } catch (e) { setInvErr((e as Error).message) } }
  }, [ws, manage])
  useEffect(() => { load() }, [load])

  // Team = real Team Members only (Admins are not listed as team members)
  const team = useMemo(() => (members ?? []).filter(m => m.role === 'member' && m.active), [members])
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase()
    return team.filter(m => (status === 'all' || m.presence === status) && (!t || `${m.name} ${m.title ?? ''}`.toLowerCase().includes(t)))
  }, [team, q, status])
  const stats = useMemo(() => {
    const r = invites ?? []
    return { invited: r.length, joined: r.filter(i => i.status === 'joined').length, pending: r.filter(i => i.status === 'pending').length, notReg: r.filter(i => i.status === 'not_registered').length }
  }, [invites])

  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={load} />
  if (!members || !ws) return <p className="text-slate-500">Loading team…</p>

  const act = async (key: string, fn: () => Promise<void>) => { setBusy(key); setInvErr(null); try { await fn(); await load() } catch (e) { setInvErr((e as Error).message) } setBusy(null) }
  const tabBtn = (t: Tab, label: string) => <button role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium ${tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{label}</button>

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Team</h1><p className="text-sm text-slate-500">{team.length} team member{team.length === 1 ? '' : 's'}</p></div>
        {manage && <button onClick={() => setInviting(true)} className="btn-primary"><Plus size={16} /> Invite</button>}
      </div>

      <div className="flex gap-1 border-b border-line" role="tablist">{tabBtn('members', 'Members')}{manage && tabBtn('invites', `Invites${invites ? ` (${stats.invited})` : ''}`)}</div>

      {tab === 'members' && (
        <>
          <div className="flex flex-wrap gap-3">
            <div className="relative min-w-[220px] flex-1 sm:max-w-sm"><Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search members…" aria-label="Search members" className="w-full rounded-xl border border-line bg-white py-2 pl-9 pr-3 text-sm" /></div>
            <select value={status} onChange={e => setStatus(e.target.value)} className="rounded-xl border border-line bg-white px-3 py-2 text-sm" aria-label="Filter by status"><option value="all">All status</option><option value="online">Online</option><option value="away">Away</option><option value="offline">Offline</option></select>
          </div>
          {filtered.length === 0 ? <div className="card"><EmptyState text={team.length ? 'No members match your filters.' : 'No team members yet. Use Invite to add your first member.'} /></div> : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtered.map(m => (
                <Link key={m.id} to={`/team/${m.id}`} className="card card-hover group p-4">
                  <div className="flex items-center gap-3"><Avatar name={m.name} src={m.avatar} size={46} /><div className="min-w-0 flex-1"><p className="truncate font-semibold">{m.name}</p><p className="truncate text-xs text-slate-500">{m.title ?? 'Team Member'}</p></div><ArrowRight size={18} className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-brand" /></div>
                  <div className="mt-4 flex items-center justify-between"><Stars value={m.rating} /><PresenceDot status={m.presence} /></div>
                </Link>
              ))}
            </div>
          )}
        </>
      )}

      {tab === 'invites' && manage && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {([['Invited', stats.invited, 'text-slate-900'], ['Joined', stats.joined, 'text-emerald-600'], ['Pending', stats.pending, 'text-amber-600'], ['Not registered', stats.notReg, 'text-slate-500']] as const).map(([l, v, c]) => <div key={l} className="card p-5"><p className="text-sm text-slate-500">{l}</p><p className={`text-3xl font-semibold ${c}`}>{v}</p></div>)}
          </div>
          <p className="text-xs text-slate-400">Pending: invitation sent but the person has not signed in yet. Not registered: no account exists yet (email not delivered or invitation not opened).</p>
          {invErr && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{invErr}</p>}
          <div className="card overflow-x-auto">
            {!invites || invites.length === 0 ? <EmptyState text={invites ? 'No invitations yet.' : 'Loading…'} /> : (
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs text-slate-400"><th className="p-3">Person</th><th className="p-3">Status</th><th className="p-3">Invited</th><th className="p-3 text-right">Actions</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {invites.map(i => (
                    <tr key={i.email}>
                      <td className="p-3"><p className="font-medium">{i.fullName || i.email}</p><p className="text-xs text-slate-400">{i.email}</p></td>
                      <td className="p-3"><span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${STATUS[i.status].cls}`}>{STATUS[i.status].label}</span>{i.lastSignIn && <p className="mt-0.5 text-[11px] text-slate-400">Last sign-in {new Date(i.lastSignIn).toLocaleDateString()}</p>}</td>
                      <td className="p-3 text-slate-500">{new Date(i.invitedAt).toLocaleDateString('en', { month: 'short', day: 'numeric' })}</td>
                      <td className="p-3"><span className="flex justify-end gap-2">
                        {i.status !== 'joined' && <button disabled={busy === i.email} onClick={() => act(i.email, async () => setShown({ email: i.email, r: await inviteMember(ws.workspaceId, { email: i.email, fullName: i.fullName ?? '', phone: i.phone ?? '' }, 'resend') }))} className="btn-ghost px-3 py-1.5 text-xs"><RefreshCw size={13} /> Resend / new code</button>}
                        {i.status !== 'joined' && <button disabled={busy === i.email} onClick={() => confirm(`Revoke the invitation for ${i.email}?`) && act(i.email, () => revokeInvite(ws.workspaceId, i.email))} className="btn-ghost px-3 py-1.5 text-xs text-red-600" aria-label="Revoke invitation"><Trash2 size={13} /></button>}
                      </span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {inviting && <InviteModal workspaceId={ws.workspaceId} onClose={() => setInviting(false)} onDone={() => { load(); setTab('invites') }} />}
      {shown && <Modal title="Invitation ready" onClose={() => setShown(null)}><InviteResultView email={shown.email} r={shown.r} /><div className="mt-4 flex justify-end"><button onClick={() => setShown(null)} className="btn-primary">Done</button></div></Modal>}
    </div>
  )
}
