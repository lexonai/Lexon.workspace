import { useState } from 'react'
import { Check, Copy, KeyRound, Mail, ShieldCheck } from 'lucide-react'
import Modal, { inputCls } from '../../components/Modal'
import { inviteMember, type InviteInput, type InviteOptions, type InviteResult } from '../../services/team'

export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false)
  return <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1500) } catch { /* clipboard blocked */ } }} className="btn-ghost px-3 py-1.5 text-xs">{done ? <Check size={13} /> : <Copy size={13} />} {done ? 'Copied' : label}</button>
}

const TTL = [{ v: 60, l: '1 hour' }, { v: 1440, l: '24 hours' }, { v: 4320, l: '3 days' }, { v: 10080, l: '7 days' }]
const TRIES = [3, 5, 10]
const EMPTY: InviteInput = { email: '', fullName: '', phone: '', jobTitle: '', department: '' }

// Add Member  ->  1 Details  ->  Continue  ->  2 Access code (generate / custom, expiry, attempts)  ->  3 Invitation ready
export default function InviteModal({ workspaceId, prefill, onClose, onDone }: { workspaceId: string; prefill?: Partial<InviteInput>; onClose: () => void; onDone: () => void }) {
  const [step, setStep] = useState<1 | 2 | 3>(prefill?.email ? 2 : 1)
  const [f, setF] = useState<InviteInput>({ ...EMPTY, ...prefill })
  const [o, setO] = useState<InviteOptions>({ codeMode: 'random', code: '', ttlMinutes: 1440, maxAttempts: 5, sendEmail: true })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InviteResult | null>(null)
  const set = (k: keyof InviteInput) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const next = (e: React.FormEvent) => {
    e.preventDefault()
    if (!f.fullName.trim()) return setError('Enter the member’s name.')
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setError('Enter a valid email address.')
    setError(null); setStep(2)
  }
  const create = async (e: React.FormEvent) => {
    e.preventDefault()
    const code = (o.code ?? '').replace(/[^A-Za-z0-9]/g, '')
    if (o.codeMode === 'custom' && (code.length < 6 || code.length > 32)) return setError('Custom code must be 6 to 32 letters or digits.')
    setBusy(true); setError(null)
    try { setResult(await inviteMember(workspaceId, { ...f, email: f.email.trim().toLowerCase() }, { ...o, code: o.codeMode === 'custom' ? o.code : undefined })); setStep(3); onDone() }
    catch (err) { setError((err as Error).message) }
    setBusy(false)
  }
  const title = step === 3 ? 'Invitation ready' : step === 2 ? 'Access code' : 'Add team member'

  return (
    <Modal title={title} onClose={onClose}>
      <div className="mb-4 flex items-center gap-2 text-xs text-slate-400" aria-label={`Step ${step} of 3`}>
        {['Details', 'Code', 'Share'].map((l, i) => <span key={l} className="flex items-center gap-2"><i className={`grid h-5 w-5 place-items-center rounded-full text-[11px] not-italic ${step > i + 1 ? 'bg-emerald-500 text-white' : step === i + 1 ? 'bg-brand text-white' : 'bg-slate-100'}`}>{step > i + 1 ? '✓' : i + 1}</i><span className={step === i + 1 ? 'font-medium text-slate-700' : ''}>{l}</span>{i < 2 && <span className="h-px w-5 bg-line" />}</span>)}
      </div>

      {step === 1 && (
        <form onSubmit={next} className="space-y-3">
          <label className="block text-sm">Full name<input className={inputCls} value={f.fullName} onChange={set('fullName')} autoFocus /></label>
          <label className="block text-sm">Email <span className="text-slate-400">(the invitation works only for this address)</span><input className={inputCls} type="email" value={f.email} onChange={set('email')} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Role title <span className="text-slate-400">(optional)</span><input className={inputCls} value={f.jobTitle} onChange={set('jobTitle')} /></label>
            <label className="block text-sm">Department <span className="text-slate-400">(optional)</span><input className={inputCls} value={f.department} onChange={set('department')} /></label>
          </div>
          <label className="block text-sm">Phone <span className="text-slate-400">(optional)</span><input className={inputCls} value={f.phone} onChange={set('phone')} /></label>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button className="btn-primary">Continue</button></div>
        </form>
      )}

      {step === 2 && (
        <form onSubmit={create} className="space-y-4">
          <p className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><b>{f.fullName || f.email}</b> · {f.email}</p>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Invitation code</legend>
            {([['random', 'Generate a secure code', 'Recommended. 8 characters, hard to guess.'], ['custom', 'Set my own code', '6 to 32 letters or digits.']] as const).map(([v, l, h]) => (
              <label key={v} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 text-sm ${o.codeMode === v ? 'border-brand bg-brand-soft' : 'border-line'}`}>
                <input type="radio" name="mode" className="mt-1" checked={o.codeMode === v} onChange={() => setO({ ...o, codeMode: v })} />
                <span><span className="font-medium">{l}</span><br /><span className="text-xs text-slate-500">{h}</span></span>
              </label>
            ))}
            {o.codeMode === 'custom' && <input className={`${inputCls} font-mono tracking-widest`} placeholder="e.g. TEAM-2026-AX" value={o.code} onChange={e => setO({ ...o, code: e.target.value })} maxLength={40} autoFocus aria-label="Custom code" />}
          </fieldset>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-sm">Expires after<select className={inputCls} value={o.ttlMinutes} onChange={e => setO({ ...o, ttlMinutes: +e.target.value })}>{TTL.map(t => <option key={t.v} value={t.v}>{t.l}</option>)}</select></label>
            <label className="block text-sm">Wrong attempts allowed<select className={inputCls} value={o.maxAttempts} onChange={e => setO({ ...o, maxAttempts: +e.target.value })}>{TRIES.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={o.sendEmail} onChange={e => setO({ ...o, sendEmail: e.target.checked })} /> Email the Team link to {f.email}</label>
          <p className="text-xs text-slate-400">After the wrong-attempt limit the invitation locks and you issue a new code. The code is stored only as a hash.</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-between gap-2"><button type="button" onClick={() => { setError(null); setStep(1) }} className="btn-ghost">Back</button><button disabled={busy} className="btn-primary disabled:opacity-60"><KeyRound size={15} /> {busy ? 'Creating…' : 'Create invitation'}</button></div>
        </form>
      )}

      {step === 3 && result && (
        <div className="space-y-4">
          <div className={`flex items-start gap-2 rounded-xl p-3 text-sm ${result.emailSent ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}><Mail size={16} className="mt-0.5 shrink-0" /><span>{result.emailSent ? `Link emailed to ${f.email}.` : 'No email was sent.'} {result.note}</span></div>
          <div className="space-y-2 rounded-xl border border-line p-4">
            <p className="flex items-center gap-1.5 text-xs text-slate-500"><ShieldCheck size={13} /> Invitation code for {f.email}. Shown only now. Share it on a different channel than email if you can.</p>
            <div className="flex items-center justify-between gap-3"><span className="select-all font-mono text-2xl tracking-[0.25em]">{result.code}</span><CopyButton value={result.code} label="Copy code" /></div>
            <p className="text-xs text-slate-400">Valid until {new Date(result.expiresAt).toLocaleString()} · locks after {result.maxAttempts} wrong tries</p>
          </div>
          {result.teamUrl && <div className="flex items-center justify-between gap-3 rounded-xl border border-line p-3"><span className="min-w-0 truncate text-sm text-slate-600">{result.teamUrl}</span><CopyButton value={result.teamUrl} label="Copy Team link" /></div>}
          <div><p className="text-sm font-medium">How they join</p><ol className="mt-1 list-decimal space-y-0.5 pl-5 text-sm text-slate-600"><li>Open the Lexon Team app.</li><li>Enter <b>{f.email}</b>.</li><li>Enter the code above. They are in. No registration form.</li></ol></div>
          <div className="flex justify-end"><button onClick={onClose} className="btn-primary">Done</button></div>
        </div>
      )}
    </Modal>
  )
}
