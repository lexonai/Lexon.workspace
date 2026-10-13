import { callFn } from '../lib/functions'

// The YouTube Automation backend is a SEPARATE Supabase project. Workspace reaches it only through the
// project-gateway Edge Function (permission-checked, whitelisted, rate-limited).
export interface Video {
  id: string; title: string; publishedAt: string | null; durationS: number; isShort: boolean
  thumb: string | null; metrics: Record<string, number>
}
export interface Snapshot { channelTitle: string | null; subscribers: number; totalViews: number; videoCount: number; date: string }
export interface AiOutput { id: string; kind: string; prompt: string | null; output: string; at: string }

const gw = <T>(workspaceId: string, body: Record<string, unknown>) => callFn<T>('project-gateway', { workspaceId, project: 'youtube', ...body })
const select = async (ws: string, table: string, extra: Record<string, unknown> = {}) => (await gw<{ data: any[] }>(ws, { action: 'select', table, ...extra })).data

export async function loadYoutube(ws: string) {
  try {
    const [v, s, c] = await Promise.all([
      select(ws, 'youtube_videos', { order: 'published_at', limit: 300 }),
      select(ws, 'youtube_channel_snapshots', { order: 'snapshot_date', limit: 1 }),
      select(ws, 'youtube_connection', { limit: 1 })
    ])
    const snap = s[0], conn = c[0]
    return {
      linked: true,
      videos: v.map((r: any): Video => ({ id: r.video_id, title: r.title, publishedAt: r.published_at, durationS: r.duration_s ?? 0, isShort: r.is_short, thumb: r.thumbnail_url, metrics: r.metrics ?? {} })),
      snapshot: snap ? { channelTitle: snap.channel_title, subscribers: Number(snap.subscribers ?? 0), totalViews: Number(snap.total_views ?? 0), videoCount: snap.video_count ?? 0, date: snap.snapshot_date } as Snapshot : null,
      connection: conn ? { status: conn.status as string, account: conn.account_label as string | null, lastSync: conn.last_sync_at as string | null, lastError: conn.last_error as string | null } : null
    }
  } catch (e) {
    if (/not linked/i.test((e as Error).message)) return { linked: false, videos: [] as Video[], snapshot: null as Snapshot | null, connection: null as null | { status: string; account: string | null; lastSync: string | null; lastError: string | null } }
    throw e
  }
}
export const syncYoutube = (ws: string) => gw<{ videos: number; notes: string[] }>(ws, { action: 'invoke', fn: 'youtube-sync', payload: {} })
export const generate = (ws: string, kind: string, input: string) => gw<{ output: string }>(ws, { action: 'invoke', fn: 'youtube-ai', payload: { kind, input } })
export const startGoogle = async (ws: string) => (await gw<{ url: string }>(ws, { action: 'invoke', fn: 'youtube-oauth', payload: { action: 'start' } })).url
export const disconnectGoogle = (ws: string) => gw(ws, { action: 'invoke', fn: 'youtube-oauth', payload: { action: 'disconnect' } })
export async function listOutputs(ws: string): Promise<AiOutput[]> {
  return (await select(ws, 'youtube_ai_outputs', { order: 'created_at', limit: 20 })).map((r: any) => ({ id: r.id, kind: r.kind, prompt: r.prompt, output: r.output, at: r.created_at }))
}
