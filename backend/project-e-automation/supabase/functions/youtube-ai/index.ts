// PRIVATE. Writes ideas/hooks/titles/etc. grounded in the channel's own synced data, using Gemini (secret GEMINI_API_KEY in project E).
// "research" and "competitors" use Gemini Google-Search grounding. Results are stored in youtube_ai_outputs.
import { db, env, HttpError, json, opt, requireService, run, track } from '../_shared/e.ts'

const PROMPTS: Record<string, string> = {
  ideas: '10 new video ideas', hooks: '10 strong opening hooks (first 10 seconds)', titles: '15 click-worthy but honest titles', scripts: 'a full script with intro, body and call to action',
  thumbnail_concepts: '6 written thumbnail concepts (describe layout, text, emotion)', seo: 'an SEO title, description and 15 tags', upload_timing: 'best upload days/times, reasoning from the publish dates and views below',
  shorts_ideas: '10 Shorts ideas', content_plan: 'a 4-week content plan (what to publish and when)', growth: 'specific growth recommendations based on the numbers below',
  research: 'research current topics in this niche (use web search) and suggest what to cover', competitors: 'research similar channels (use web search) and what they do well'
}
Deno.serve((req) => run(async () => {
  requireService(req)
  const b = await req.json().catch(() => ({})) as { kind?: string; input?: string }
  const kind = String(b.kind ?? ''); if (!PROMPTS[kind]) throw new HttpError(400, 'Unknown kind')
  const input = String(b.input ?? '').slice(0, 2000)
  const c = db()
  return await track(c, 'youtube-ai', 'gateway', null, async () => {
  const [snap, vids] = await Promise.all([
    c.from('youtube_channel_snapshots').select('*').order('snapshot_date', { ascending: false }).limit(1),
    c.from('youtube_videos').select('title,published_at,duration_s,is_short,metrics').order('published_at', { ascending: false }).limit(40)
  ])
  if (!vids.data?.length && !['research', 'competitors'].includes(kind)) throw new HttpError(400, 'Sync your channel first so the AI can use your real data')
  const ctx = `Channel: ${snap.data?.[0]?.channel_title ?? 'unknown'}; subscribers ${snap.data?.[0]?.subscribers ?? '?'}.\nRecent videos (title | date | seconds | views):\n` +
    (vids.data ?? []).map(v => `${v.title} | ${String(v.published_at).slice(0, 10)} | ${v.duration_s} | ${(v.metrics as any)?.views ?? '?'}`).join('\n')
  const prompt = `You are a YouTube strategist. Produce ${PROMPTS[kind]} for this channel. Use only the data given; if something is not in the data, say so.\n\n${ctx}\n\nUser notes: ${input || '(none)'}`
  const model = opt('GEMINI_MODEL') || 'gemini-2.5-flash'
  const web = kind === 'research' || kind === 'competitors'
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env('GEMINI_API_KEY') },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], ...(web ? { tools: [{ google_search: {} }] } : {}) }) })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) throw new HttpError(502, `AI request failed: ${j?.error?.message ?? r.status}`)
  const output = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim()
  if (!output) throw new HttpError(502, 'The AI returned no text')
  await c.from('youtube_ai_outputs').insert({ kind, prompt: input || null, output })
  return json({ output })
  })
}))
