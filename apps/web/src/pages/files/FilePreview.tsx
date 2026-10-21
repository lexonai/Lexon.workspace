import { useEffect, useState } from 'react'
import { Download, FileText, X } from 'lucide-react'
import { signedUrl, type FileRow } from '../../services/files'

const kindOf = (f: FileRow) => {
  const m = f.mime ?? '', n = f.name.toLowerCase()
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  if (m === 'application/pdf' || n.endsWith('.pdf')) return 'pdf'
  if (m.startsWith('text/') || /\.(txt|md|json|csv|js|ts|tsx|jsx|css|html|xml|yml|yaml|log|py|sql|sh)$/.test(n)) return 'text'
  return 'other'
}
export const bytes = (n: number) => n >= 1073741824 ? `${(n / 1073741824).toFixed(2)} GB` : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : n >= 1024 ? `${Math.round(n / 1024)} KB` : `${n} B`

// Detailed view: large preview + properties + actions.
export default function FilePreview({ file, folderPath, onClose, onDownload }: { file: FileRow; folderPath: string; onClose: () => void; onDownload: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [text, setText] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const kind = kindOf(file)
  useEffect(() => {
    let off = false
    setUrl(null); setText(null); setError(null)
    signedUrl(file.path).then(async u => {
      if (off) return
      setUrl(u)
      if (kind === 'text') { const r = await fetch(u); const t = await r.text(); if (!off) setText(t.slice(0, 200000)) }
    }).catch(e => !off && setError(e.message))
    return () => { off = true }
  }, [file.path, kind])
  useEffect(() => { const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }; document.addEventListener('keydown', k); return () => document.removeEventListener('keydown', k) }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/90 animate-fade" role="dialog" aria-modal="true" aria-label={`Details of ${file.name}`}>
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <FileText size={18} className="text-slate-400" /><p className="min-w-0 flex-1 truncate font-medium">{file.name}</p>
        <button onClick={onDownload} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-1.5 text-sm hover:bg-white/20"><Download size={15} /> Download</button>
        <button onClick={onClose} aria-label="Close" className="rounded-lg p-2 hover:bg-white/10"><X size={18} /></button>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-3 p-3 pt-0 lg:flex-row">
        <div className="grid min-h-0 flex-1 place-items-center overflow-auto rounded-2xl bg-slate-900">
          {error && <p className="p-6 text-sm text-red-300">{error}</p>}
          {!url && !error && <p className="text-sm text-slate-400">Loading preview…</p>}
          {url && kind === 'image' && <img src={url} alt={file.name} className="max-h-full max-w-full object-contain" />}
          {url && kind === 'video' && <video src={url} controls className="max-h-full max-w-full" />}
          {url && kind === 'audio' && <audio src={url} controls />}
          {url && kind === 'pdf' && <div className="flex h-full w-full flex-col"><iframe src={url} title={file.name} className="min-h-0 flex-1 bg-white" /><a href={url} target="_blank" rel="noopener noreferrer" className="bg-slate-800 py-2 text-center text-xs text-slate-300 hover:text-white">PDF not showing? Open in a new tab</a></div>}
          {kind === 'text' && text !== null && <pre className="h-full w-full overflow-auto whitespace-pre-wrap break-words p-5 text-left font-mono text-xs text-slate-200">{text}</pre>}
          {url && kind === 'other' && <div className="p-8 text-center text-slate-300"><FileText size={48} className="mx-auto text-slate-500" /><p className="mt-3 text-sm">No preview for this file type.</p><button onClick={onDownload} className="mt-3 rounded-lg bg-white/10 px-4 py-2 text-sm hover:bg-white/20">Download to open</button></div>}
        </div>
        <aside className="w-full shrink-0 rounded-2xl bg-white p-5 lg:w-72">
          <h3 className="text-sm font-semibold">Details</h3>
          <dl className="mt-3 space-y-3 text-sm">
            {([['Name', file.name], ['Type', file.mime || 'Unknown'], ['Size', bytes(file.size)], ['Location', folderPath], ['Uploaded', new Date(file.at).toLocaleString()]] as const).map(([k, v]) => <div key={k}><dt className="text-xs text-slate-400">{k}</dt><dd className="break-words">{v}</dd></div>)}
          </dl>
        </aside>
      </div>
    </div>
  )
}
