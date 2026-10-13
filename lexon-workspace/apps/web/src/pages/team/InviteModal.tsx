import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import Modal, { inputCls } from '../../components/Modal'
import { inviteMember, type InviteInput, type InviteResult } from '../../services/team'

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ } }} className="btn-ghost px-3 py-1.5 text-xs">{done ? <Check size={13} /> : <Copy size={13} />} {done ? 'Copied' : label}</button>
}

export function InviteResultView({ email, r }: { email: string; r: InviteResult }) {
  return (
    <div className="space-y-4">
      <div className={`rounded-xl p-3 text-sm ${r.emailSent ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>{r.emailSent ? `Invitation emailed to ${email}.` : 'Email was not sent.'} {r.note}</div>
      <div>
        <p className="text-sm font-medium">How they join</p>
        <ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-600"><li>Open the Lexon Team app and enter their email.</li><li>Enter the 6-digit code (emailed, or share the one below).</li><li>They land in Team and appear in your Team list.</li></ol>
      </div>
      {(r.code || r.link) && (
        <div className="space-y-2 rounded-xl border border-line p-3">
          <p className="text-xs text-slate-500">One-time sign-in material (expires in about an hour). Share only with {email}.</p>
          {r.code && <div className="flex items-center justify-between gap-3"><span className="font-mono text-2xl tracking-[0.3em]">{r.code}</span><CopyButton value={r.code} label="Copy code" /></div>}
          {r.link && <div className="flex items-center justify-between gap-3"><span className="truncate text-xs text-slate-400">Magic link</span><CopyButton value={r.link} label="Copy link" /></div>}
        </div>
      )}
    </div>
  )
}

export default function InviteModal({ workspaceId, onClose, onDone }: { workspaceId: string; onClose: () => void; onDone: () => void }) {
  const [f, setF] = useState<InviteInput>({ email: '', fullName: '', phone: '' })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InviteResult | null>(null)
  const set = (k: keyof InviteInput) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.fullName.trim()) return setError('Enter the member’s name.')
    if (!/^\S+@\S+\.\S+$/.test(f.email)) return setError('Enter a valid email address.')
    setBusy(true); setError(null)
    try { setResult(await inviteMember(workspaceId, f)); onDone() } catch (err) { setError((err as Error).message) }
    setBusy(false)
  }
  return (
    <Modal title={result ? 'Invitation ready' : 'Invite a team member'} onClose={onClose}>
      {result ? <><InviteResultView email={f.email} r={result} /><div className="mt-4 flex justify-end"><button onClick={onClose} className="btn-primary">Done</button></div></> : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">Full name<input className={inputCls} value={f.fullName} onChange={set('fullName')} autoFocus /></label>
          <label className="block text-sm">Email<input className={inputCls} type="email" value={f.email} onChange={set('email')} /></label>
          <label className="block text-sm">Phone <span className="text-slate-400">(optional)</span><input className={inputCls} value={f.phone} onChange={set('phone')} /></label>
          <p className="text-xs text-slate-400">They join as a Team Member and sign in to the Lexon Team app with an email code. Nobody else can create an account.</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy} className="btn-primary disabled:opacity-60">{busy ? 'Inviting…' : 'Send invitation'}</button></div>
        </form>
      )}
    </Modal>
  )
}
