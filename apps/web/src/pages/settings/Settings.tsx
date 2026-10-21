import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { DEMO } from '../../lib/env'
import { useWorkspace } from '../../lib/useWorkspace'
import { Card, EmptyState } from '../../components/ui'
import { inputCls } from '../../components/Modal'
import Security from './Security'

type Tab = 'security' | 'access' | 'workspace'
interface AdminRow { email: string | null; full_name: string | null; role: string; status: string }

// Admin access list: only these Gmail accounts can sign in as Admin. Everyone else must be invited as a Team Member.
function AccessTab() {
  const { ws } = useWorkspace()
  const [rows, setRows] = useState<AdminRow[] | null>(null)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const owner = ws?.role === 'owner'
  const load = useCallback(async () => {
    if (!ws || DEMO) return setRows([])
    const { data, error } = await supabase.rpc('list_admins', { ws: ws.workspaceId })
    if (error) setError(error.message.includes('schema cache') ? 'Database function missing. Run the latest SQL migration (0008).' : error.message); else setRows((data ?? []) as AdminRow[])
  }, [ws])
  useEffect(() => { load() }, [load])
  if (!ws) return null
  return (
    <div className="space-y-6">
      <Card title="Approved Admins">
        <p className="mb-4 text-sm text-slate-500">Only approved Gmail accounts can sign in to Lexon Workspace. Any other Google account is rejected at login. Team Members are invited from the Team page and use the Lexon Team app.</p>
        {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}
        {!rows ? <p className="text-sm text-slate-400">Loading…</p> : rows.length === 0 ? <EmptyState text="No admins found." /> : (
          <ul className="divide-y divide-line">
            {rows.map(r => (
              <li key={(r.email ?? '') + r.role} className="flex items-center gap-3 py-3">
                <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{r.full_name || r.email}</p><p className="truncate text-xs text-slate-400">{r.email}</p></div>
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">{r.role === 'owner' ? 'Owner' : 'Admin'}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${r.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{r.status === 'active' ? 'Active' : 'Approved, not signed in yet'}</span>
                {owner && r.role !== 'owner' && r.email && <button className="btn-ghost px-3 py-1.5 text-xs text-red-600" onClick={async () => { if (!confirm(`Remove ${r.email} as Admin?`)) return; const { error } = await supabase.rpc('remove_admin', { ws: ws.workspaceId, p_email: r.email }); if (error) setError(error.message); else load() }}>Remove</button>}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {owner ? (
        <Card title="Approve another Admin">
          <form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end" onSubmit={async e => {
            e.preventDefault(); setMsg(null); setError(null)
            if (!/^[^\s@]+@gmail\.com$/i.test(email.trim())) return setError('Enter a Gmail address (name@gmail.com).')
            const { error } = await supabase.from('authorized_emails').upsert({ workspace_id: ws.workspaceId, email: email.trim().toLowerCase(), role: 'admin', full_name: name.trim() || null }, { onConflict: 'workspace_id,email' })
            if (error) setError(error.message); else { setMsg(`${email.trim()} can now sign in with Google as an Admin.`); setEmail(''); setName(''); load() }
          }}>
            <label className="block text-sm">Gmail address<input type="email" required className={inputCls} value={email} onChange={e => setEmail(e.target.value)} placeholder="name@gmail.com" /></label>
            <label className="block text-sm">Name <span className="text-slate-400">(optional)</span><input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></label>
            <button className="btn-primary">Approve</button>
          </form>
          {msg && <p role="status" className="mt-3 text-sm text-emerald-700">{msg}</p>}
          <p className="mt-3 text-xs text-slate-400">Admins have full access. They sign in on the Workspace login page with Google.</p>
        </Card>
      ) : <p className="text-sm text-slate-400">Only the owner can approve or remove Admins.</p>}
    </div>
  )
}

function WorkspaceTab() {
  const { ws } = useWorkspace()
  const [name, setName] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  useEffect(() => { if (ws && !DEMO) supabase.from('workspaces').select('name').eq('id', ws.workspaceId).single().then(({ data }) => setName(data?.name ?? '')) }, [ws])
  if (!ws) return null
  return (
    <div className="space-y-6">
      <Card title="Workspace">
        <label className="block text-sm">Workspace name<input value={name} onChange={e => setName(e.target.value)} className={inputCls + ' max-w-sm'} /></label>
        <button className="btn-primary mt-3" disabled={ws.role !== 'owner'} onClick={async () => { const { error } = await supabase.from('workspaces').update({ name: name.trim() }).eq('id', ws.workspaceId); setMsg(error ? error.message : 'Saved.') }}>Save</button>
        {ws.role !== 'owner' && <p className="mt-2 text-xs text-slate-400">Only the owner can rename the workspace.</p>}
        {msg && <p role="status" className="mt-2 text-sm text-slate-500">{msg}</p>}
      </Card>
      <Card title="Data retention">
        <ul className="space-y-1.5 text-sm text-slate-600"><li>Attendance records: deleted automatically after 7 days</li><li>Activity history and automation history: deleted automatically after 7 days</li><li>Login history: set in Security (7 to 30 days)</li></ul>
        <p className="mt-3 text-xs text-slate-400">Cleanup runs nightly (database schedule) and once a day when an Admin opens the app.</p>
      </Card>
    </div>
  )
}

export default function Settings() {
  const { isAdmin } = useWorkspace()
  const [tab, setTab] = useState<Tab>('security')
  const tabs: Tab[] = isAdmin ? ['security', 'access', 'workspace'] : ['security']
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {tabs.length > 1 && <div className="flex gap-1 border-b border-line" role="tablist">{tabs.map(t => <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={`-mb-px border-b-2 px-4 py-2.5 text-sm font-medium capitalize ${tab === t ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>{t === 'access' ? 'Admin access' : t}</button>)}</div>}
      {tab === 'security' && <Security />}
      {tab === 'access' && isAdmin && <AccessTab />}
      {tab === 'workspace' && isAdmin && <WorkspaceTab />}
    </div>
  )
}
