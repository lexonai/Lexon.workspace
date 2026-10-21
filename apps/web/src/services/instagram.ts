import { callFn } from '../lib/functions'

// Instagram automation runs in the shared Automation project (one Supabase for YouTube + Instagram).
// Workspace reaches it ONLY through the permission-checked central-api.
export interface IgAccount { id: string; username: string | null; profile_image_url: string | null; status: string; token_expires_at: string | null; connected_at: string; last_error: string | null }
export interface IgStats { comments_triggered: number; dms_sent: number; replies_sent: number; button_clicks: number }
export interface IgAutomation {
  id: string; title: string; description: string | null; status: 'draft' | 'active' | 'paused'; post_scope: 'specific' | 'any' | 'next'; post_id: string | null
  post_thumbnail_url: string | null; post_caption: string | null; trigger_type: 'keywords' | 'any_comment'; match_mode: 'exact' | 'flexible'
  delay_seconds: number; comment_reply_enabled: boolean; dm_content: string; button_label: string | null; resource_url: string | null; resource_type: string
  allow_emoji_only: boolean; allow_short_comments: boolean; created_at: string; ig_stats: IgStats | IgStats[] | null
}
export interface IgEvent { id: string; event_type: string; status: string; error_message: string | null; commenter_reference: string | null; created_at: string }
export interface IgMedia { id: string; caption?: string; media_type: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string }
export interface IgInput {
  postScope: 'specific' | 'any' | 'next'; postId?: string; postType?: string; postThumbnailUrl?: string; postCaption?: string
  title: string; description?: string; resourceType: string; triggerType: 'keywords' | 'any_comment'; matchMode: 'exact' | 'flexible'
  keywords: string[]; excludedKeywords: string[]; allowEmojiOnly: boolean; allowShortComments: boolean; delaySeconds: number
  commentReplyEnabled: boolean; commentReplies: string[]; dmContent: string; buttonLabel?: string; resourceUrl?: string
}

const ig = <T>(ws: string, payload: Record<string, unknown>) => callFn<T>('central-api', { service: 'automation', workspaceId: ws, project: 'instagram', action: 'invoke', fn: 'ig-api', payload })

export const statsOf = (a: IgAutomation): IgStats => (Array.isArray(a.ig_stats) ? a.ig_stats[0] : a.ig_stats) ?? { comments_triggered: 0, dms_sent: 0, replies_sent: 0, button_clicks: 0 }
export const igStatus = async (ws: string) => (await ig<{ account: IgAccount | null }>(ws, { action: 'status' })).account
export const igConnectUrl = async (ws: string) => (await ig<{ url: string }>(ws, { action: 'connect_url' })).url
export const igDisconnect = (ws: string) => ig(ws, { action: 'disconnect' })
export const igMedia = async (ws: string) => (await ig<{ data: IgMedia[] }>(ws, { action: 'media' })).data
export const igList = async (ws: string) => (await ig<{ automations: IgAutomation[] }>(ws, { action: 'list' })).automations
export const igGet = (ws: string, id: string) => ig<{ automation: IgAutomation; keywords: string[]; excluded: string[]; replies: { id: string; response_text: string; enabled: boolean }[]; events: IgEvent[] }>(ws, { action: 'get', id })
export const igCreate = (ws: string, input: IgInput) => ig<{ automation: IgAutomation }>(ws, { action: 'create', ...input })
export const igUpdate = (ws: string, id: string, patch: Record<string, unknown>) => ig(ws, { action: 'update', id, ...patch })
export const igSetStatus = (ws: string, id: string, status: 'active' | 'paused') => ig(ws, { action: 'set_status', id, status })
export const igDelete = (ws: string, id: string) => ig(ws, { action: 'delete', id })
export const igDuplicate = (ws: string, id: string) => ig(ws, { action: 'duplicate', id })
