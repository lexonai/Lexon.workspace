// PRIVATE. Pulls channel + videos from the YouTube Data API and per-video metrics from the YouTube Analytics API.
import { db, HttpError, json, requireService, run } from '../_shared/e.ts'
import { accessToken } from '../_shared/google.ts'

const iso = (d: string) => { const m = /^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/.exec(d); return m ? (+(m[1] ?? 0)) * 3600 + (+(m[2] ?? 0)) * 60 + (+(m[3] ?? 0)) : 0 }
async function g(url: string, tok: string) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${tok}` } }); const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(j?.error?.message ?? `HTTP ${r.status}`); return j
}

Deno.serve((req) => run(async () => {
  requireService(req)
  const c = db(); const notes: string[] = []
  const tok = await accessToken()
  const ch = (await g('https://www.googleapis.com/youtube/v3/channels?part=snippet,statistics,contentDetails&mine=true', tok)).items?.[0]
  if (!ch) throw new HttpError(400, 'No YouTube channel found for this Google account')
  const day = new Date().toISOString().slice(0, 10)
  await c.from('youtube_channel_snapshots').upsert({ snapshot_date: day, channel_title: ch.snippet.title, subscribers: +ch.statistics.subscriberCount || 0, total_views: +ch.statistics.viewCount || 0, video_count: +ch.statistics.videoCount || 0 }, { onConflict: 'snapshot_date' })

  const ids: string[] = []; let page = ''
  do {
    const p = await g(`https://www.googleapis.com/youtube/v3/playlistItems?part=contentDetails&maxResults=50&playlistId=${ch.contentDetails.relatedPlaylists.uploads}${page ? `&pageToken=${page}` : ''}`, tok)
    ids.push(...p.items.map((i: any) => i.contentDetails.videoId)); page = p.nextPageToken ?? ''
  } while (page && ids.length < 300)

  const rows: any[] = []
  for (let i = 0; i < ids.length; i += 50) {
    const v = await g(`https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails,statistics&id=${ids.slice(i, i + 50).join(',')}`, tok)
    for (const x of v.items) {
      const dur = iso(x.contentDetails.duration)
      rows.push({ video_id: x.id, title: x.snippet.title, published_at: x.snippet.publishedAt, duration_s: dur, is_short: dur > 0 && dur <= 180, thumbnail_url: x.snippet.thumbnails?.medium?.url ?? x.snippet.thumbnails?.default?.url ?? null,
        metrics: { views: +x.statistics.viewCount || 0, likes: +x.statistics.likeCount || 0, comments: +x.statistics.commentCount || 0 } })
    }
  }
  // Analytics (best effort): watch time, retention, shares, CTR. Failures become notes, never fake numbers.
  const start = ch.snippet.publishedAt.slice(0, 10)
  const byId = new Map(rows.map(r => [r.video_id, r]))
  const analytics = async (metrics: string) => {
    for (let i = 0; i < ids.length; i += 200) {
      const q = new URLSearchParams({ ids: 'channel==MINE', startDate: start, endDate: day, dimensions: 'video', metrics, filters: `video==${ids.slice(i, i + 200).join(',')}`, maxResults: '200' })
      const j = await g(`https://youtubeanalytics.googleapis.com/v2/reports?${q}`, tok)
      const names = (j.columnHeaders as { name: string }[]).map(h => h.name)
      for (const row of j.rows ?? []) { const r = byId.get(row[0]); if (!r) continue; names.forEach((n, k) => { if (k > 0 && typeof row[k] === 'number') r.metrics[n] = row[k] }) }
    }
  }
  try { await analytics('views,likes,comments,shares,estimatedMinutesWatched,averageViewPercentage') } catch (e) { notes.push(`Analytics: ${(e as Error).message}`) }
  try { await analytics('videoThumbnailImpressionsClickRate') } catch (e) { notes.push(`CTR unavailable: ${(e as Error).message}`) }

  for (let i = 0; i < rows.length; i += 100) { const { error } = await c.from('youtube_videos').upsert(rows.slice(i, i + 100)); if (error) throw new HttpError(500, error.message) }
  await c.from('youtube_connection').upsert({ id: 1, status: 'connected', last_sync_at: new Date().toISOString(), last_error: notes.length ? notes.join(' | ').slice(0, 500) : null })
  return json({ videos: rows.length, notes })
}))
