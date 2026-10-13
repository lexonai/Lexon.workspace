import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'

export interface Folder { id: string; name: string; parentId: string | null }
export interface FileRow { id: string; name: string; mime: string | null; size: number; path: string; at: string; folderId: string | null }

export async function listAll(ws: string): Promise<{ folders: Folder[]; files: FileRow[] }> {
  if (DEMO) return { folders: [], files: [] }
  const [f, x] = await Promise.all([
    supabase.from('folders').select('id,name,parent_id').eq('workspace_id', ws).order('name'),
    supabase.from('files').select('id,name,mime_type,size_bytes,storage_path,created_at,folder_id').eq('workspace_id', ws).eq('source', 'upload').order('created_at', { ascending: false })
  ])
  if (f.error) throw new Error(f.error.message)
  if (x.error) throw new Error(x.error.message)
  return {
    folders: (f.data ?? []).map((r: any) => ({ id: r.id, name: r.name, parentId: r.parent_id })),
    files: (x.data ?? []).map((r: any) => ({ id: r.id, name: r.name, mime: r.mime_type, size: Number(r.size_bytes ?? 0), path: r.storage_path, at: r.created_at, folderId: r.folder_id }))
  }
}
export async function createFolder(ws: string, userId: string, name: string, parentId: string | null) {
  const { error } = await supabase.from('folders').insert({ workspace_id: ws, name: name.trim(), parent_id: parentId, created_by: userId })
  if (error) throw new Error(error.message)
}
export async function renameFolder(id: string, name: string) {
  const { error } = await supabase.from('folders').update({ name: name.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteFolder(id: string) {
  const { error } = await supabase.from('folders').delete().eq('id', id)
  if (error) throw new Error(error.message)
}
const MAX = 100 * 1024 * 1024
export async function uploadFile(ws: string, userId: string, folderId: string | null, f: File) {
  if (f.size > MAX) throw new Error(`${f.name} is larger than 100 MB.`)
  const id = crypto.randomUUID()
  const path = `${ws}/${id}/${f.name.replace(/[^\w.\-]+/g, '_')}`
  const up = await supabase.storage.from('workspace-files').upload(path, f, { contentType: f.type || 'application/octet-stream' })
  if (up.error) throw new Error(up.error.message)
  const { error } = await supabase.from('files').insert({
    id, workspace_id: ws, folder_id: folderId, name: f.name, storage_path: path, mime_type: f.type || null,
    size_bytes: f.size, uploaded_by: userId, source: 'upload'
  })
  if (error) { await supabase.storage.from('workspace-files').remove([path]); throw new Error(error.message) }
}
export async function renameFile(id: string, name: string) {
  const { error } = await supabase.from('files').update({ name: name.trim() }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function moveFile(id: string, folderId: string | null) {
  const { error } = await supabase.from('files').update({ folder_id: folderId }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteFile(f: FileRow) {
  const r = await supabase.storage.from('workspace-files').remove([f.path])
  if (r.error) throw new Error(r.error.message)
  const { error } = await supabase.from('files').delete().eq('id', f.id)
  if (error) throw new Error(error.message)
}
export async function signedUrl(path: string, download?: string): Promise<string> {
  const { data, error } = await supabase.storage.from('workspace-files').createSignedUrl(path, 600, download ? { download } : undefined)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
