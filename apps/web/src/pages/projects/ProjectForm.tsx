import { useState } from 'react'
import Modal, { inputCls } from '../../components/Modal'
import { MAX_WORDS, STATUS_LABEL, wordCount, type ProjectInput, type ProjectStatus } from '../../services/projects'

const TYPES = ['Web App', 'Mobile App', 'Desktop App', 'Website', 'Agent', 'Automation', 'Other']

export default function ProjectForm({ title, initial, submitLabel, onClose, onSubmit }: { title: string; initial?: Partial<ProjectInput>; submitLabel: string; onClose: () => void; onSubmit: (i: ProjectInput) => Promise<void> }) {
  const [f, setF] = useState<ProjectInput>({ name: '', type: '', url: '', repository: '', description: '', status: 'active', ...initial })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof ProjectInput) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value } as ProjectInput)
  const words = wordCount(f.description)
  return (
    <Modal title={title} onClose={onClose} wide>
      <form className="space-y-4" onSubmit={async e => { e.preventDefault(); setBusy(true); setError(null); try { await onSubmit(f) } catch (err) { setError((err as Error).message); setBusy(false) } }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">Name<input required className={inputCls} value={f.name} onChange={set('name')} /></label>
          <label className="block text-sm">Type<input list="project-types" className={inputCls} placeholder="Web App, Agent…" value={f.type} onChange={set('type')} /><datalist id="project-types">{TYPES.map(t => <option key={t} value={t} />)}</datalist></label>
          <label className="block text-sm">URL or domain<input className={inputCls} placeholder="example.com or https://…" value={f.url} onChange={set('url')} /></label>
          <label className="block text-sm">Repository <span className="text-slate-400">(optional)</span><input className={inputCls} placeholder="github.com/org/repo" value={f.repository} onChange={set('repository')} /></label>
        </div>
        <label className="block text-sm">Status
          <select className={inputCls} value={f.status} onChange={set('status')}>{(Object.keys(STATUS_LABEL) as ProjectStatus[]).map(s => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select></label>
        <label className="block text-sm">Description <span className="text-slate-400">(optional)</span>
          <textarea rows={6} className={inputCls} value={f.description} onChange={set('description')} placeholder="What is this project about?" />
          <span className={`mt-1 block text-right text-xs ${words > MAX_WORDS ? 'text-red-600' : 'text-slate-400'}`}>{words.toLocaleString()} / {MAX_WORDS.toLocaleString()} words</span></label>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2"><button type="button" onClick={onClose} className="btn-ghost">Cancel</button><button disabled={busy || words > MAX_WORDS} className="btn-primary disabled:opacity-50">{busy ? 'Saving…' : submitLabel}</button></div>
      </form>
    </Modal>
  )
}
