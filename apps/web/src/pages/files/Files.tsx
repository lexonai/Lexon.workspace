import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronRight, Download, Eye, File as FileIcon, FileImage, FileText as FileTextIcon, FileVideo, Folder as FolderIcon, FolderOpen, FolderPlus, Home, LayoutGrid, List, Pencil, Search, Trash2, Upload, ArrowUp, Music } from 'lucide-react'
import { useWorkspace } from '../../lib/useWorkspace'
import { createFolder, deleteFile, deleteFolder, listAll, moveFile, renameFile, renameFolder, signedUrl, uploadFile, type FileRow, type Folder } from '../../services/files'
import { ErrorState } from '../../components/ui'
import Modal, { inputCls } from '../../components/Modal'
import FilePreview, { bytes } from './FilePreview'

type Sort = 'name' | 'date' | 'size' | 'type'
const iconFor = (f: FileRow, size = 18) => {
  const m = f.mime ?? ''
  if (m.startsWith('image/')) return <FileImage size={size} className="text-emerald-500" />
  if (m.startsWith('video/')) return <FileVideo size={size} className="text-violet-500" />
  if (m.startsWith('audio/')) return <Music size={size} className="text-pink-500" />
  if (m === 'application/pdf') return <FileTextIcon size={size} className="text-red-500" />
  return <FileIcon size={size} className="text-slate-400" />
}
const ext = (n: string) => (n.includes('.') ? n.split('.').pop()!.toUpperCase() : 'File')

export default function Files() {
  const { ws, error: wsError, can } = useWorkspace()
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState<{ folders: Folder[]; files: FileRow[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [sort, setSort] = useState<Sort>('name')
  const [view, setView] = useState<'details' | 'icons'>('details')
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<string | null>(null) // 'f:<id>' or 'd:<id>'
  const [preview, setPreview] = useState<FileRow | null>(null)
  const [newFolder, setNewFolder] = useState(false)
  const [folderName, setFolderName] = useState('')
  const [moving, setMoving] = useState<FileRow | null>(null)
  const [busy, setBusy] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const current = params.get('f')

  const load = useCallback(async () => {
    if (!ws) return
    setError(null)
    try { setData(await listAll(ws.workspaceId)) } catch (e) { setError((e as Error).message) }
  }, [ws])
  useEffect(() => { load() }, [load])

  const crumbs = useMemo(() => {
    const out: Folder[] = []; let id = current
    while (id && data) { const f = data.folders.find(x => x.id === id); if (!f) break; out.unshift(f); id = f.parentId }
    return out
  }, [current, data])
  useEffect(() => { setExpanded(prev => new Set([...prev, ...crumbs.map(c => c.id)])) }, [crumbs])
  useEffect(() => setSelected(null), [current])

  if (wsError || error) return <ErrorState message={(wsError || error)!} onRetry={load} />
  if (!data || !ws) return <p className="text-slate-500">Loading files…</p>

  const term = q.trim().toLowerCase()
  const folders = data.folders.filter(f => f.parentId === current && (!term || f.name.toLowerCase().includes(term))).sort((a, b) => a.name.localeCompare(b.name))
  const files = data.files.filter(f => f.folderId === current && (!term || f.name.toLowerCase().includes(term)))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'size' ? b.size - a.size : sort === 'type' ? ext(a.name).localeCompare(ext(b.name)) : b.at.localeCompare(a.at))
  const used = data.files.reduce((s, f) => s + f.size, 0)
  const canDelete = can('files.delete')
  const pathOf = (id: string | null) => '/' + (() => { const o: string[] = []; let c = id; while (c) { const f = data.folders.find(x => x.id === c); if (!f) break; o.unshift(f.name); c = f.parentId } return o.join('/') })()
  const act = async (fn: () => Promise<void>) => { setBusy(true); setError(null); try { await fn(); await load() } catch (e) { setError((e as Error).message) } setBusy(false) }
  const open = (id: string | null) => setParams(id ? { f: id } : {})
  const download = (f: FileRow) => act(async () => { window.open(await signedUrl(f.path, f.name), '_blank', 'noopener') })
  const removeFolder = (f: Folder) => {
    if (data.folders.some(x => x.parentId === f.id) || data.files.some(x => x.folderId === f.id)) return setError('This folder is not empty. Move or delete its contents first.')
    if (confirm(`Delete folder "${f.name}"?`)) act(() => deleteFolder(f.id))
  }
  const up = () => open(crumbs.length > 1 ? crumbs[crumbs.length - 2].id : null)
  const toggle = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const Tree = ({ parent, depth }: { parent: string | null; depth: number }) => (
    <ul>
      {data.folders.filter(f => f.parentId === parent).sort((a, b) => a.name.localeCompare(b.name)).map(f => {
        const kids = data.folders.some(x => x.parentId === f.id), isOpen = expanded.has(f.id)
        return (
          <li key={f.id}>
            <div className={`flex items-center gap-1 rounded-lg py-1.5 pr-2 text-sm ${current === f.id ? 'bg-brand-soft font-medium text-brand' : 'hover:bg-slate-100'}`} style={{ paddingLeft: 6 + depth * 14 }}>
              <button onClick={() => kids && toggle(f.id)} aria-label={isOpen ? 'Collapse' : 'Expand'} className={`grid h-5 w-5 place-items-center text-slate-400 ${kids ? '' : 'invisible'}`}>{isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</button>
              <button onClick={() => open(f.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">{current === f.id || isOpen ? <FolderOpen size={16} className="shrink-0 text-amber-500" /> : <FolderIcon size={16} className="shrink-0 text-amber-500" />}<span className="truncate">{f.name}</span></button>
            </div>
            {kids && isOpen && <Tree parent={f.id} depth={depth + 1} />}
          </li>
        )
      })}
    </ul>
  )

  const folderRow = (f: Folder) => (
    <tr key={f.id} onClick={() => setSelected('d:' + f.id)} onDoubleClick={() => open(f.id)} className={`cursor-default ${selected === 'd:' + f.id ? 'bg-brand-soft/70' : ''}`}>
      <td className="p-2.5"><span className="flex items-center gap-2.5"><FolderIcon size={18} className="shrink-0 text-amber-500" /><button onClick={() => open(f.id)} className="truncate font-medium hover:text-brand">{f.name}</button></span></td>
      <td className="hidden p-2.5 text-slate-500 sm:table-cell">File folder</td><td className="p-2.5 text-slate-400">—</td><td className="hidden p-2.5 text-slate-400 md:table-cell">—</td>
      <td className="p-2.5"><span className="flex justify-end gap-3 text-slate-400">
        <button aria-label="Open folder" onClick={() => open(f.id)} className="hover:text-brand"><Eye size={16} /></button>
        <button aria-label="Rename folder" onClick={() => { const n = prompt('Folder name', f.name); if (n?.trim()) act(() => renameFolder(f.id, n)) }} className="hover:text-brand"><Pencil size={16} /></button>
        {canDelete && <button aria-label="Delete folder" onClick={() => removeFolder(f)} className="hover:text-red-500"><Trash2 size={16} /></button>}
      </span></td>
    </tr>
  )
  const fileRow = (f: FileRow) => (
    <tr key={f.id} onClick={() => setSelected('f:' + f.id)} onDoubleClick={() => setPreview(f)} className={`cursor-default ${selected === 'f:' + f.id ? 'bg-brand-soft/70' : ''}`}>
      <td className="p-2.5"><span className="flex items-center gap-2.5">{iconFor(f)}<span className="truncate">{f.name}</span></span></td>
      <td className="hidden p-2.5 text-slate-500 sm:table-cell">{ext(f.name)} file</td><td className="p-2.5 text-slate-500">{bytes(f.size)}</td>
      <td className="hidden p-2.5 text-slate-500 md:table-cell">{new Date(f.at).toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
      <td className="p-2.5"><span className="flex justify-end gap-3 text-slate-400">
        <button aria-label="View details" title="View details" onClick={() => setPreview(f)} className="hover:text-brand"><Eye size={16} /></button>
        <button aria-label="Download" title="Download" onClick={() => download(f)} className="hover:text-brand"><Download size={16} /></button>
        <button aria-label="Rename" title="Rename" onClick={() => { const n = prompt('File name', f.name); if (n?.trim()) act(() => renameFile(f.id, n)) }} className="hover:text-brand"><Pencil size={16} /></button>
        <button aria-label="Move" title="Move" onClick={() => setMoving(f)} className="text-xs font-medium hover:text-brand">Move</button>
        {canDelete && <button aria-label="Delete" title="Delete" onClick={() => confirm(`Delete "${f.name}"?`) && act(() => deleteFile(f))} className="hover:text-red-500"><Trash2 size={16} /></button>}
      </span></td>
    </tr>
  )
  const empty = folders.length === 0 && files.length === 0

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">Files</h1><p className="text-sm text-slate-500">{bytes(used)} used · {data.files.length} files</p></div>
        <div className="flex gap-2">
          <button onClick={() => { setFolderName(''); setNewFolder(true) }} className="btn-ghost"><FolderPlus size={16} /> New folder</button>
          <button disabled={busy} onClick={() => input.current?.click()} className="btn-primary disabled:opacity-60"><Upload size={16} /> {busy ? 'Working…' : 'Upload'}</button>
          <input ref={input} type="file" multiple className="hidden" onChange={e => { const l = [...(e.target.files ?? [])]; e.target.value = ''; if (l.length) act(async () => { for (const f of l) await uploadFile(ws.workspaceId, ws.userId, current, f) }) }} />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-slate-50/70 px-3 py-2">
          <button onClick={up} disabled={!current} aria-label="Up one level" className="grid h-8 w-8 place-items-center rounded-lg text-slate-500 hover:bg-white disabled:opacity-30"><ArrowUp size={16} /></button>
          <nav className="flex min-w-0 flex-1 flex-wrap items-center gap-0.5 rounded-lg border border-line bg-white px-2 py-1 text-sm" aria-label="Address">
            <button onClick={() => open(null)} className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-slate-100"><Home size={14} /> Files</button>
            {crumbs.map(c => <span key={c.id} className="flex items-center"><ChevronRight size={14} className="text-slate-300" /><button onClick={() => open(c.id)} className="rounded px-1.5 py-0.5 hover:bg-slate-100">{c.name}</button></span>)}
          </nav>
          <div className="relative w-44"><Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search here" aria-label="Search files" className="w-full rounded-lg border border-line bg-white py-1.5 pl-8 pr-2 text-sm" /></div>
          <select value={sort} onChange={e => setSort(e.target.value as Sort)} className="rounded-lg border border-line bg-white px-2 py-1.5 text-sm" aria-label="Sort by"><option value="name">Name</option><option value="date">Date</option><option value="size">Size</option><option value="type">Type</option></select>
          <div className="flex rounded-lg border border-line bg-white p-0.5"><button aria-label="Details view" aria-pressed={view === 'details'} onClick={() => setView('details')} className={`rounded-md p-1.5 ${view === 'details' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><List size={15} /></button><button aria-label="Icon view" aria-pressed={view === 'icons'} onClick={() => setView('icons')} className={`rounded-md p-1.5 ${view === 'icons' ? 'bg-slate-900 text-white' : 'text-slate-500'}`}><LayoutGrid size={15} /></button></div>
        </div>

        <div className="flex min-h-[420px]">
          <aside className="hidden w-56 shrink-0 overflow-y-auto border-r border-line p-2 md:block" aria-label="Folders">
            <button onClick={() => open(null)} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm ${!current ? 'bg-brand-soft font-medium text-brand' : 'hover:bg-slate-100'}`}><Home size={16} /> All files</button>
            <Tree parent={null} depth={0} />
          </aside>
          <section className="min-w-0 flex-1 overflow-x-auto">
            {empty ? <div className="grid h-full min-h-[360px] place-items-center p-8 text-center text-sm text-slate-400"><div><FolderOpen size={40} className="mx-auto text-slate-300" /><p className="mt-3">{term ? 'Nothing matches your search.' : 'This folder is empty. Upload files or create a folder.'}</p></div></div>
              : view === 'details' ? (
                <table className="w-full min-w-[520px] text-sm">
                  <thead><tr className="border-b border-line text-left text-xs text-slate-400"><th className="p-2.5 font-medium">Name</th><th className="hidden p-2.5 font-medium sm:table-cell">Type</th><th className="p-2.5 font-medium">Size</th><th className="hidden p-2.5 font-medium md:table-cell">Modified</th><th className="p-2.5 text-right font-medium">Actions</th></tr></thead>
                  <tbody className="divide-y divide-line">{folders.map(folderRow)}{files.map(fileRow)}</tbody>
                </table>
              ) : (
                <div className="grid grid-cols-2 gap-2 p-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                  {folders.map(f => <button key={f.id} onClick={() => setSelected('d:' + f.id)} onDoubleClick={() => open(f.id)} className={`flex flex-col items-center gap-2 rounded-xl p-4 text-center hover:bg-slate-50 ${selected === 'd:' + f.id ? 'bg-brand-soft/70' : ''}`}><FolderIcon size={44} className="text-amber-400" /><span className="w-full truncate text-sm">{f.name}</span></button>)}
                  {files.map(f => <button key={f.id} onClick={() => setSelected('f:' + f.id)} onDoubleClick={() => setPreview(f)} className={`flex flex-col items-center gap-2 rounded-xl p-4 text-center hover:bg-slate-50 ${selected === 'f:' + f.id ? 'bg-brand-soft/70' : ''}`}>{iconFor(f, 44)}<span className="w-full truncate text-sm">{f.name}</span><span className="text-xs text-slate-400">{bytes(f.size)}</span></button>)}
                </div>
              )}
          </section>
        </div>
        <div className="border-t border-line bg-slate-50/70 px-3 py-1.5 text-xs text-slate-500">{folders.length} folder{folders.length === 1 ? '' : 's'} · {files.length} file{files.length === 1 ? '' : 's'}{selected ? ' · 1 selected' : ''} · Double-click to open</div>
      </div>

      {preview && <FilePreview file={preview} folderPath={pathOf(preview.folderId)} onClose={() => setPreview(null)} onDownload={() => download(preview)} />}
      {newFolder && (
        <Modal title="New folder" onClose={() => setNewFolder(false)}>
          <form onSubmit={e => { e.preventDefault(); if (!folderName.trim()) return; setNewFolder(false); act(() => createFolder(ws.workspaceId, ws.userId, folderName, current)) }} className="space-y-4">
            <input autoFocus className={inputCls} value={folderName} onChange={e => setFolderName(e.target.value)} placeholder="Folder name" />
            <div className="flex justify-end"><button className="btn-primary">Create</button></div>
          </form>
        </Modal>
      )}
      {moving && (
        <Modal title={`Move "${moving.name}"`} onClose={() => setMoving(null)}>
          <ul className="max-h-64 space-y-1 overflow-y-auto">
            <li><button onClick={() => { const f = moving; setMoving(null); act(() => moveFile(f.id, null)) }} className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm hover:bg-slate-50"><Home size={16} /> All files (root)</button></li>
            {data.folders.map(f => <li key={f.id}><button onClick={() => { const m = moving; setMoving(null); act(() => moveFile(m.id, f.id)) }} className="flex w-full items-center gap-2 rounded-lg p-2 text-left text-sm hover:bg-slate-50"><FolderIcon size={16} className="text-amber-500" /> {pathOf(f.id)}</button></li>)}
          </ul>
        </Modal>
      )}
    </div>
  )
}
