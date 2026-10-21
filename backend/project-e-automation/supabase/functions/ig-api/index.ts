// PRIVATE: called only by Workspace's project-gateway with E's service_role key. One function, many actions.
import { db, delSecret, getSecret, HttpError, json, log, requireService, run, setSecret, signState } from '../_shared/e.ts'
import { normalize } from '../_shared/keywordMatch.ts'
import * as meta from '../_shared/meta.ts'

const str = (v: unknown, max: number, name: string, req = true) => {
  const s = typeof v === 'string' ? v.trim() : ''
  if (req && !s) throw new HttpError(400, `${name} is required`)
  if (s.length > max) throw new HttpError(400, `${name} is too long`)
  return s
}
const url = (v: unknown) => { const s = str(v, 2000, 'URL', false); if (s && !/^https?:\/\//i.test(s)) throw new HttpError(400, 'URL must start with http(s)://'); return s || null }
const one = (r: { data: any; error: { message: string } | null }): any => { if (r.error) throw new HttpError(500, r.error.message); return r.data }

Deno.serve((req) => run(async () => {
  requireService(req)
  const b = await req.json().catch(() => ({})) as Record<string, any>
  const c = db()

  switch (b.action) {
    case 'status': {
      const acc = one(await c.from('ig_accounts').select('id,username,profile_image_url,status,token_expires_at,connected_at,last_error').order('connected_at', { ascending: false }).limit(1).maybeSingle())
      return json({ account: acc })
    }
    case 'connect_url': return json({ url: meta.authorizeUrl(await signState({ k: 'ig' })) })
    case 'disconnect': {
      const accs = one(await c.from('ig_accounts').select('id').eq('status', 'connected')) ?? []
      for (const a of accs as { id: string }[]) { await delSecret(c, `ig_token_${a.id}`); await c.from('ig_accounts').update({ status: 'revoked', updated_at: new Date().toISOString() }).eq('id', a.id) }
      await c.from('ig_automations').update({ status: 'paused' }).eq('status', 'active')
      await log(c, 'info', 'disconnect', 'Instagram disconnected; active automations paused')
      return json({ ok: true })
    }
    case 'media': {
      const acc = one(await c.from('ig_accounts').select('id').eq('status', 'connected').limit(1).maybeSingle())
      if (!acc) throw new HttpError(409, 'Instagram is not connected')
      const token = await getSecret(c, `ig_token_${acc.id}`); if (!token) throw new HttpError(409, 'Token missing. Reconnect Instagram.')
      try { return json(await meta.recentMedia(token)) } catch (e) { throw new HttpError(502, `Could not fetch media from Instagram: ${(e as Error).message.slice(0, 200)}`) }
    }
    case 'refresh_tokens': { // run on a schedule (see docs) to keep 60-day tokens alive
      const soon = new Date(Date.now() + 10 * 86400000).toISOString()
      const accs = one(await c.from('ig_accounts').select('id,token_expires_at').eq('status', 'connected').lt('token_expires_at', soon)) ?? []
      let n = 0
      for (const a of accs as { id: string }[]) {
        try { const t = await getSecret(c, `ig_token_${a.id}`); if (!t) continue; const r = await meta.refresh(t); await setSecret(c, `ig_token_${a.id}`, r.access_token); await c.from('ig_accounts').update({ token_expires_at: new Date(Date.now() + r.expires_in * 1000).toISOString() }).eq('id', a.id); n++ }
        catch (e) { await c.from('ig_accounts').update({ status: 'expired', last_error: (e as Error).message.slice(0, 200) }).eq('id', a.id) }
      }
      return json({ refreshed: n })
    }
    case 'list': {
      const q = c.from('ig_automations').select('*, ig_stats(*)').order('created_at', { ascending: false })
      const r = b.status && b.status !== 'all' ? await q.eq('status', String(b.status)) : await q
      return json({ automations: one(r) ?? [] })
    }
    case 'get': {
      const a = one(await c.from('ig_automations').select('*, ig_stats(*)').eq('id', String(b.id)).maybeSingle()); if (!a) throw new HttpError(404, 'Not found')
      const [k, rep, ev] = await Promise.all([
        c.from('ig_keywords').select('keyword,excluded').eq('automation_id', a.id),
        c.from('ig_comment_replies').select('id,response_text,enabled').eq('automation_id', a.id),
        c.from('ig_events').select('*').eq('automation_id', a.id).order('created_at', { ascending: false }).limit(20)
      ])
      const kw = k.data ?? []
      return json({ automation: a, keywords: kw.filter(x => !x.excluded).map(x => x.keyword), excluded: kw.filter(x => x.excluded).map(x => x.keyword), replies: rep.data ?? [], events: ev.data ?? [] })
    }
    case 'create': {
      const acc = one(await c.from('ig_accounts').select('id').eq('status', 'connected').limit(1).maybeSingle()); if (!acc) throw new HttpError(409, 'Connect Instagram first')
      const scope = ['specific', 'any', 'next'].includes(b.postScope) ? b.postScope : null; if (!scope) throw new HttpError(400, 'Invalid post scope')
      if (scope === 'specific' && !b.postId) throw new HttpError(400, 'Choose a post')
      const trig = b.triggerType === 'any_comment' ? 'any_comment' : 'keywords'
      const kws = [...new Set((Array.isArray(b.keywords) ? b.keywords : []).map((x: unknown) => String(x).trim()).filter(Boolean))] as string[]
      if (trig === 'keywords' && !kws.length) throw new HttpError(400, 'Add at least one keyword')
      const delay = Math.round(Number(b.delaySeconds ?? 3)); if (!(delay >= 1 && delay <= 30)) throw new HttpError(400, 'Delay must be 1 to 30 seconds')
      const row = one(await c.from("ig_automations").insert({
        instagram_account_id: acc.id, post_scope: scope, post_id: scope === 'specific' ? String(b.postId) : null,
        post_type: b.postType ?? null, post_thumbnail_url: b.postThumbnailUrl ?? null, post_caption: b.postCaption ? String(b.postCaption).slice(0, 2200) : null,
        title: str(b.title, 120, 'Title'), description: str(b.description, 500, 'Description', false) || null,
        resource_type: ['pdf', 'website', 'youtube', 'tool', 'course', 'file', 'other'].includes(b.resourceType) ? b.resourceType : 'other',
        trigger_type: trig, match_mode: b.matchMode === 'exact' ? 'exact' : 'flexible',
        allow_emoji_only: !!b.allowEmojiOnly, allow_short_comments: !!b.allowShortComments, delay_seconds: delay,
        comment_reply_enabled: b.commentReplyEnabled !== false, dm_content: str(b.dmContent, 1000, 'DM message'),
        button_label: str(b.buttonLabel, 30, 'Button label', false) || null, resource_url: url(b.resourceUrl), status: 'draft'
      }).select().single())!
      const id = (row as any).id as string
      if (kws.length) await c.from('ig_keywords').insert(kws.map(k => ({ automation_id: id, keyword: k, normalized_keyword: normalize(k), excluded: false })))
      const ex = (Array.isArray(b.excludedKeywords) ? b.excludedKeywords : []).map((x: unknown) => String(x).trim()).filter(Boolean) as string[]
      if (ex.length) await c.from('ig_keywords').insert(ex.map(k => ({ automation_id: id, keyword: k, normalized_keyword: normalize(k), excluded: true })))
      const reps = (Array.isArray(b.commentReplies) ? b.commentReplies : []).map((x: unknown) => String(x).trim().slice(0, 300)).filter(Boolean) as string[]
      if (reps.length) await c.from('ig_comment_replies').insert(reps.map(r => ({ automation_id: id, response_text: r, enabled: true })))
      await c.from('ig_stats').insert({ automation_id: id })
      await log(c, 'info', 'automation', `Automation "${(row as any).title}" created (draft)`)
      return json({ automation: row })
    }
    case 'update': {
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
      if ('title' in b) patch.title = str(b.title, 120, 'Title')
      if ('description' in b) patch.description = str(b.description, 500, 'Description', false) || null
      if ('delaySeconds' in b) { const d = Math.round(Number(b.delaySeconds)); if (!(d >= 1 && d <= 30)) throw new HttpError(400, 'Delay must be 1 to 30 seconds'); patch.delay_seconds = d }
      if ('commentReplyEnabled' in b) patch.comment_reply_enabled = !!b.commentReplyEnabled
      if ('dmContent' in b) patch.dm_content = str(b.dmContent, 1000, 'DM message')
      if ('buttonLabel' in b) patch.button_label = str(b.buttonLabel, 30, 'Button label', false) || null
      if ('resourceUrl' in b) patch.resource_url = url(b.resourceUrl)
      return json({ automation: one(await c.from('ig_automations').update(patch).eq('id', String(b.id)).select().single()) })
    }
    case 'set_status': {
      if (!['active', 'paused'].includes(b.status)) throw new HttpError(400, 'Invalid status')
      if (b.status === 'active') { const acc = one(await c.from('ig_accounts').select('id').eq('status', 'connected').limit(1).maybeSingle()); if (!acc) throw new HttpError(409, 'Instagram is not connected') }
      const a = one(await c.from('ig_automations').update({ status: b.status, updated_at: new Date().toISOString() }).eq('id', String(b.id)).select().single())
      await log(c, 'info', 'automation', `Automation "${(a as any).title}" ${b.status === 'active' ? 'activated' : 'paused'}`)
      return json({ automation: a })
    }
    case 'delete': { const { error } = await c.from('ig_automations').delete().eq('id', String(b.id)); if (error) throw new HttpError(500, error.message); return json({ ok: true }) }
    case 'duplicate': {
      const o = one(await c.from('ig_automations').select('*').eq('id', String(b.id)).maybeSingle()); if (!o) throw new HttpError(404, 'Not found')
      const { id, created_at, updated_at, ...rest } = o as any
      const copy = one(await c.from("ig_automations").insert({ ...rest, title: `${rest.title} (copy)`.slice(0, 120), status: 'draft' }).select().single()) as any
      const k = (await c.from('ig_keywords').select('keyword,normalized_keyword,excluded').eq('automation_id', id)).data ?? []
      if (k.length) await c.from('ig_keywords').insert(k.map(x => ({ ...x, automation_id: copy.id })))
      const r = (await c.from('ig_comment_replies').select('response_text,enabled').eq('automation_id', id)).data ?? []
      if (r.length) await c.from('ig_comment_replies').insert(r.map(x => ({ ...x, automation_id: copy.id })))
      await c.from('ig_stats').insert({ automation_id: copy.id })
      return json({ automation: copy })
    }
    default: throw new HttpError(400, 'Unknown action')
  }
}))
