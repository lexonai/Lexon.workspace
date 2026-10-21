import { supabase } from '../lib/supabase'
import { DEMO } from '../lib/env'
import { effectivePresence } from '../lib/presence'
import type { Presence } from '../types'

export interface Conversation {
  id: string; kind: 'direct' | 'group' | 'project' | 'agent'; title: string; pinned: boolean
  lastBody: string | null; lastAt: string | null; lastSender: string | null; unread: number
  otherId: string | null; otherAvatar: string | null; presence: Presence | null
}
export interface Attachment { name: string; mime: string | null; size: number | null; path: string }
export interface Message {
  id: string; senderId: string; body: string | null; replyTo: string | null
  reactions: Record<string, string[]>; editedAt: string | null; deletedAt: string | null; createdAt: string
  file: Attachment | null
}

export async function listConversations(ws: string): Promise<Conversation[]> {
  if (DEMO) return []
  const { data, error } = await supabase.rpc('my_conversations', { ws })
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: any) => ({
    id: r.id, kind: r.kind, pinned: r.pinned,
    title: r.kind === 'direct' ? (r.other_name || 'Unnamed') : (r.title || 'Group'),
    lastBody: r.last_body, lastAt: r.last_at, lastSender: r.last_sender, unread: Number(r.unread),
    otherId: r.other_id, otherAvatar: r.other_avatar,
    presence: r.kind === 'direct' ? effectivePresence(r.other_presence, r.other_last_seen) : null
  }))
}
export async function startDirect(ws: string, other: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_direct', { ws, other })
  if (error) throw new Error(error.message)
  return data as string
}
export async function createGroup(ws: string, title: string, members: string[]): Promise<string> {
  const { data, error } = await supabase.rpc('create_group', { ws, group_title: title, members })
  if (error) throw new Error(error.message)
  return data as string
}

export async function listMessages(cid: string): Promise<Message[]> {
  const { data, error } = await supabase.from('messages')
    .select('id,sender_id,body,reply_to,reactions,edited_at,deleted_at,created_at,files(name,mime_type,size_bytes,storage_path)')
    .eq('conversation_id', cid).order('created_at', { ascending: false }).limit(150)
  if (error) throw new Error(error.message)
  return (data ?? []).reverse().map((m: any) => ({
    id: m.id, senderId: m.sender_id, body: m.body, replyTo: m.reply_to, reactions: m.reactions ?? {},
    editedAt: m.edited_at, deletedAt: m.deleted_at, createdAt: m.created_at,
    file: m.files ? { name: m.files.name, mime: m.files.mime_type, size: m.files.size_bytes, path: m.files.storage_path } : null
  }))
}

const MAX = 25 * 1024 * 1024
export async function sendMessage(ws: string, cid: string, userId: string, body: string, opts: { replyTo?: string; file?: File | null }) {
  let fileId: string | null = null
  if (opts.file) {
    const f = opts.file
    if (f.size > MAX) throw new Error('Attachments must be under 25 MB.')
    fileId = crypto.randomUUID()
    const path = `${ws}/chat/${cid}/${fileId}-${f.name.replace(/[^\w.\-]+/g, '_')}`
    const up = await supabase.storage.from('workspace-files').upload(path, f, { contentType: f.type || 'application/octet-stream' })
    if (up.error) throw new Error(up.error.message)
    const row = await supabase.from('files').insert({
      id: fileId, workspace_id: ws, name: f.name, storage_path: path, mime_type: f.type || null,
      size_bytes: f.size, uploaded_by: userId, source: 'chat'
    })
    if (row.error) { await supabase.storage.from('workspace-files').remove([path]); throw new Error(row.error.message) }
  }
  const { error } = await supabase.from('messages').insert({
    conversation_id: cid, sender_id: userId, body: body || null, file_id: fileId, reply_to: opts.replyTo ?? null
  })
  if (error) throw new Error(error.message)
}
export async function editMessage(id: string, body: string) {
  const { error } = await supabase.from('messages').update({ body, edited_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function deleteMessage(id: string) {
  const { error } = await supabase.from('messages').update({ body: null, deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) throw new Error(error.message)
}
export async function toggleReaction(id: string, emoji: string) {
  const { error } = await supabase.rpc('toggle_reaction', { msg: id, emoji })
  if (error) throw new Error(error.message)
}
export async function markRead(cid: string, userId: string) {
  await supabase.from('conversation_members').update({ last_read_at: new Date().toISOString() }).eq('conversation_id', cid).eq('user_id', userId)
  await supabase.from('notifications').update({ read_at: new Date().toISOString() })
    .eq('user_id', userId).eq('entity_type', 'conversation').eq('entity_id', cid).is('read_at', null)
}
export async function setPinned(cid: string, userId: string, pinned: boolean) {
  const { error } = await supabase.from('conversation_members').update({ pinned }).eq('conversation_id', cid).eq('user_id', userId)
  if (error) throw new Error(error.message)
}
export async function fileUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('workspace-files').createSignedUrl(path, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}
