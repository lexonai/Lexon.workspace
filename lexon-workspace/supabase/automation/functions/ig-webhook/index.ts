// PUBLIC endpoint called by Meta (verify_jwt = false). Trust comes from the X-Hub-Signature-256 HMAC, not a login.
//   GET  : Meta's one-time subscription check (hub.verify_token)
//   POST : comment events -> match -> reply + DM
import { db, env, getSecret, hmacHex, json, log, opt, run, HttpError } from '../_shared/e.ts'
import { commentMatchesTrigger } from '../_shared/keywordMatch.ts'
import * as meta from '../_shared/meta.ts'

const eq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0 }

async function processComment(c: ReturnType<typeof db>, evt: { commentId: string; mediaId: string; text: string; fromId: string; igUserId: string }) {
  // Never react to our own replies (would loop forever) or to events without a sender.
  if (!evt.fromId || evt.fromId === evt.igUserId) return
  const { data: account } = await c.from('ig_accounts').select('id,status').eq('instagram_user_id', evt.igUserId).maybeSingle()
  if (!account || account.status !== 'connected') return
  const { data: cands } = await c.from('ig_automations').select('*').eq('instagram_account_id', account.id).eq('status', 'active')
  const list = (cands ?? []).filter(a => a.post_scope === 'any' || (a.post_scope === 'specific' && a.post_id === evt.mediaId))
  if (!list.length) return
  const token = await getSecret(c, `ig_token_${account.id}`)
  if (!token) { await log(c, 'error', 'webhook', 'Instagram token missing. Reconnect the account.'); return }

  for (const a of list) {
    const { data: kws } = await c.from('ig_keywords').select('normalized_keyword,excluded').eq('automation_id', a.id)
    const matched = commentMatchesTrigger(evt.text, {
      triggerType: a.trigger_type, matchMode: a.match_mode,
      keywords: (kws ?? []).filter(k => !k.excluded).map(k => k.normalized_keyword),
      excludedKeywords: (kws ?? []).filter(k => k.excluded).map(k => k.normalized_keyword),
      allowEmojiOnly: a.allow_emoji_only, allowShortComments: a.allow_short_comments
    })
    if (!matched) continue
    // Idempotency: Meta retries webhooks. The unique key (automation, comment id, type) makes the first insert the "claim".
    const ev = (event_type: string, status: string, error_message?: string) => c.from('ig_events').insert({ automation_id: a.id, external_event_id: evt.commentId, comment_id: evt.commentId, commenter_reference: evt.fromId, event_type, status, error_message: error_message?.slice(0, 500) })
    const claim = await ev('comment_received', 'success')
    if (claim.error) { if (claim.error.code === '23505') continue; throw new Error(claim.error.message) }
    await c.rpc('ig_increment_stat', { p_automation_id: a.id, p_column: 'comments_triggered' })
    await new Promise(r => setTimeout(r, a.delay_seconds * 1000))

    if (a.comment_reply_enabled) {
      try {
        const { data: reps } = await c.from('ig_comment_replies').select('response_text').eq('automation_id', a.id).eq('enabled', true)
        const opts = reps?.length ? reps.map(r => r.response_text) : ['Thanks! Check your DMs 👋']
        await meta.replyToComment(token, evt.commentId, opts[Math.floor(Math.random() * opts.length)])
        await ev('reply_sent', 'success'); await c.rpc('ig_increment_stat', { p_automation_id: a.id, p_column: 'replies_sent' })
      } catch (e) { await ev('reply_sent', 'failed', (e as Error).message); await log(c, 'warn', 'reply', `Reply failed for "${a.title}": ${(e as Error).message.slice(0, 200)}`) }
    }
    try {
      await meta.sendDm(token, evt.fromId, a.dm_content, a.button_label && a.resource_url ? { label: a.button_label, url: a.resource_url } : undefined)
      await ev('dm_sent', 'success'); await c.rpc('ig_increment_stat', { p_automation_id: a.id, p_column: 'dms_sent' })
      await log(c, 'info', 'dm', `DM sent for "${a.title}"`)
    } catch (e) { await ev('dm_sent', 'failed', (e as Error).message); await log(c, 'error', 'dm', `DM failed for "${a.title}": ${(e as Error).message.slice(0, 200)}`) }
  }
}

Deno.serve((req) => run(async () => {
  const url = new URL(req.url)
  if (req.method === 'GET') {
    const ok = url.searchParams.get('hub.mode') === 'subscribe' && eq(url.searchParams.get('hub.verify_token') ?? '', env('META_VERIFY_TOKEN'))
    return ok ? new Response(url.searchParams.get('hub.challenge') ?? '', { status: 200 }) : new Response('Forbidden', { status: 403 })
  }
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const raw = await req.text()
  const sig = req.headers.get('x-hub-signature-256') ?? ''
  if (!sig || !eq(sig, 'sha256=' + await hmacHex(env('META_APP_SECRET'), raw))) return new Response('Unauthorized', { status: 401 })

  const body = JSON.parse(raw)
  const work = (async () => {
    const c = db()
    try {
      for (const entry of body.entry ?? []) for (const ch of entry.changes ?? []) {
        if (ch.field !== 'comments') continue
        const v = ch.value ?? {}
        await processComment(c, { commentId: v.id, mediaId: v.media?.id, text: v.text ?? '', fromId: v.from?.id, igUserId: entry.id })
      }
    } catch (e) { console.error('webhook', e); await log(c, 'error', 'webhook', `Processing error: ${(e as Error).message.slice(0, 200)}`) }
  })()
  // Answer Meta at once (it retries on slow replies); keep working in the background.
  // @ts-ignore EdgeRuntime is provided by Supabase
  if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(work); else await work
  return json({ ok: true })
}))
void opt
