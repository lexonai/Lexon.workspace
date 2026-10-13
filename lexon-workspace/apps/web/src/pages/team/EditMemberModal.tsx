import { useState } from 'react'
import Modal, { inputCls } from '../../components/Modal'
import { Avatar } from '../../components/ui'
import { updateMember, uploadAvatar, type MemberDetail } from '../../services/team'

interface Props { member: MemberDetail; canEdit: boolean; canRate: boolean; canPrivate: boolean; onClose: () => void; onSaved: () => void }

export default function EditMemberModal({ member: m, canEdit, canRate, canPrivate, onClose, onSaved }: Props) {
  const [f, setF] = useState({
    fullName: m.name, jobTitle: m.title ?? '', department: m.department ?? '', skills: m.skills.join(', '), about: m.about ?? '',
    rating: m.rating === null ? '' : String(m.rating),
    phone: m.private?.phone ?? '', email: m.private?.email ?? '', address: m.private?.address ?? '',
    emergency: m.private?.emergency_contact ?? '', notes: m.private?.notes ?? ''
  })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value })

  const photo = async (file?: File) => {
    if (!file) return
    setBusy(true); setError(null)
    try { await uploadAvatar(m.id, file); onSaved() } catch (e) { setError((e as Error).message); setBusy(false) }
  }
  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    if (canEdit && !f.fullName.trim()) return setError('Name is required.')
    setBusy(true); setError(null)
    try {
      await updateMember(m.id, {
        fullName: f.fullName, jobTitle: f.jobTitle, department: f.department, skills: f.skills, about: f.about,
        rating: f.rating === '' ? null : Number(f.rating),
        private: { phone: f.phone || null, email: f.email || null, address: f.address || null, emergency_contact: f.emergency || null, notes: f.notes || null }
      }, { edit: canEdit, rate: canRate, private: canPrivate })
      onSaved()
    } catch (err) { setError((err as Error).message); setBusy(false) }
  }

  return (
    <Modal title="Edit profile" onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        {canEdit && (
          <div className="flex items-center gap-4">
            <Avatar name={m.name} src={m.avatar} size={56} />
            <label className="cursor-pointer rounded-lg border border-line px-3 py-2 text-sm">
              Change photo<input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" disabled={busy} onChange={e => photo(e.target.files?.[0])} />
            </label>
            <span className="text-xs text-slate-400">PNG, JPG, GIF or WebP, under 2 MB</span>
          </div>
        )}
        {canEdit && (
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm">Full name<input className={inputCls} value={f.fullName} onChange={set('fullName')} /></label>
            <label className="text-sm">Role title<input className={inputCls} value={f.jobTitle} onChange={set('jobTitle')} /></label>
            <label className="text-sm">Skills (comma separated)<input className={inputCls} value={f.skills} onChange={set('skills')} /></label>
            <label className="text-sm sm:col-span-2">About<textarea rows={3} className={inputCls} value={f.about} onChange={set('about')} /></label>
          </div>
        )}
        {canRate && (
          <label className="block text-sm">Rating
            <select className={inputCls} value={f.rating} onChange={set('rating')}>
              <option value="">Not rated</option>
              {[1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5].map(v => <option key={v} value={v}>{v} / 5</option>)}
            </select>
          </label>
        )}
        {canPrivate && (
          <fieldset className="rounded-xl border border-line p-4">
            <legend className="px-1 text-xs font-medium text-slate-500">Personal information (restricted)</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm">Phone<input className={inputCls} disabled={!canEdit} value={f.phone} onChange={set('phone')} /></label>
              <label className="text-sm">Email<input className={inputCls} disabled={!canEdit} value={f.email} onChange={set('email')} /></label>
              <label className="text-sm sm:col-span-2">Address<input className={inputCls} value={f.address} onChange={set('address')} /></label>
              <label className="text-sm">Emergency contact<input className={inputCls} value={f.emergency} onChange={set('emergency')} /></label>
              <label className="text-sm">Notes<input className={inputCls} value={f.notes} onChange={set('notes')} /></label>
            </div>
          </fieldset>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm">Cancel</button>
          <button disabled={busy} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-60">{busy ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
