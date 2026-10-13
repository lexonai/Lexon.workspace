// Central AI gateway for Lexon Office Workers.
// Keys and models are managed ONLY in Workspace (Integrations > Lexon Office > "AI models and APIs", scope "office").
// Office never stores a key: its backend calls this function server-to-server and the key is read from Vault here.
//
// Auth: shared secret in the `x-office-secret` header (set OFFICE_GATEWAY_SECRET here AND in the Office project).
// Call it from the Office project's Edge Function / server, never from a browser (the secret must not be public).
//
//   POST { "action": "models" }                                   -> { models: [{ id, label, kind, model }] }
//   POST { "action": "chat", "model": "<id>", "system"?: "...",
//          "messages": [{ "role": "user"|"assistant", "content": "..." }], "maxTokens"?: 1024 }  -> { text, model }
import { assertPublicHttps, adminClient, env, handle, HttpError, json, rateLimit } from '../_shared/common.ts'

const enc = new TextEncoder()
function safeEqual(a: string, b: string) {
  const x = enc.encode(a), y = enc.encode(b)
  let d = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return d === 0
}

Deno.serve((req) => handle(req, async () => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  if (!safeEqual(req.headers.get('x-office-secret') ?? '', env('OFFICE_GATEWAY_SECRET'))) throw new HttpError(401, 'Invalid gateway secret')
  const b = await req.json().catch(() => ({}))
  const admin = adminClient()

  // The Office environment belongs to the workspace whose Office backend is linked.
  let workspaceId = String(b.workspaceId ?? '')
  if (!workspaceId) {
    const { data } = await admin.from('integrations').select('workspace_id').eq('provider', 'office').eq('status', 'connected').limit(1).maybeSingle()
    workspaceId = data?.workspace_id ?? ''
    if (!workspaceId) throw new HttpError(400, 'No workspace has the Office backend linked')
  }

  const { data: rows, error } = await admin.from('integrations').select('id,provider,config,status').eq('workspace_id', workspaceId).like('provider', 'ai\\_office\\_%').eq('status', 'connected')
  if (error) throw new HttpError(500, error.message)
  const models = (rows ?? []).map((r: any) => ({ id: r.provider as string, label: r.config?.label ?? r.provider, kind: r.config?.kind ?? 'custom', model: r.config?.model ?? '' }))

  if (b.action === 'models') return json({ models })

  // The Office server pulls the keys it should use (server-to-server, secret header). Workspace stays the ONLY place keys are managed.
  if (b.action === 'keys') {
    await rateLimit(admin, `office-keys:${workspaceId}`, 60, 60)
    const out: unknown[] = []
    for (const r of rows ?? []) {
      const { data: sec } = await admin.rpc('get_integration_secret', { p_integration: (r as any).id })
      const c = (r as any).config ?? {}
      let apiKey = ''; try { apiKey = sec ? String(JSON.parse(sec as string).apiKey ?? '') : '' } catch { /* keyless provider */ }
      out.push({ id: (r as any).provider, label: c.label ?? (r as any).provider, kind: c.kind ?? 'custom', baseUrl: c.baseUrl ?? '', model: c.model ?? '', headerName: c.headerName ?? '', apiKey })
    }
    return json({ keys: out })
  }

  if (b.action === 'chat') {
    await rateLimit(admin, `office-ai:${workspaceId}`, 120, 60)
    const pick = (rows ?? []).find((r: any) => r.provider === String(b.model ?? '')) ?? (rows ?? [])[0]
    if (!pick) throw new HttpError(400, 'No AI model is connected for Office. Add one in Workspace > Integrations > Lexon Office.')
    const c = pick.config as any
    const msgs = Array.isArray(b.messages) ? b.messages.slice(-30) : []
    if (msgs.length === 0 || msgs[msgs.length - 1]?.role !== 'user') throw new HttpError(400, 'messages must end with a user message')
    const turns = msgs.map((m: any) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content ?? '').slice(0, 8000) }))
    const system = b.system ? String(b.system).slice(0, 8000) : ''
    const maxTokens = Math.min(Math.max(Number(b.maxTokens) || 1024, 16), 4096)

    const { data: sec } = await admin.rpc('get_integration_secret', { p_integration: pick.id })
    const key = sec ? (JSON.parse(sec as string).apiKey as string) : ''
    const model = String(c.model ?? '').replace(/[^a-zA-Z0-9.\-_:/@]/g, '')

    let url = '', headers: Record<string, string> = { 'Content-Type': 'application/json' }, body: unknown, read: (j: any) => string
    if (c.kind === 'gemini') {
      url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model || 'gemini-2.5-flash')}:generateContent`
      headers['x-goog-api-key'] = key
      body = { contents: turns.map(t => ({ role: t.role === 'assistant' ? 'model' : 'user', parts: [{ text: t.content }] })), ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}), generationConfig: { maxOutputTokens: maxTokens } }
      read = j => (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('')
    } else if (c.kind === 'anthropic') {
      url = 'https://api.anthropic.com/v1/messages'
      headers['x-api-key'] = key; headers['anthropic-version'] = '2023-06-01'
      body = { model, max_tokens: maxTokens, ...(system ? { system } : {}), messages: turns }
      read = j => (j.content ?? []).map((p: any) => p.text ?? '').join('')
    } else {
      url = `${String(c.baseUrl).replace(/\/$/, '')}/chat/completions`
      if (key) { if (c.headerName) headers[c.headerName] = key; else headers.Authorization = `Bearer ${key}` }
      body = { model, max_tokens: maxTokens, messages: [...(system ? [{ role: 'system', content: system }] : []), ...turns] }
      read = j => j.choices?.[0]?.message?.content ?? ''
    }
    assertPublicHttps(url)
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(45000) }).catch((e) => { throw new HttpError(502, `Could not reach the model API: ${e.message}`) })
    const out = await r.json().catch(() => ({}))
    if (!r.ok) {
      await admin.from('integrations').update({ last_error: `Chat failed (${r.status})` }).eq('id', pick.id)
      throw new HttpError(502, `The model API answered ${r.status}. Check the key and plan in Workspace > Integrations.`)
    }
    return json({ text: read(out), model: pick.provider })
  }
  throw new HttpError(400, 'Unknown action')
}))
