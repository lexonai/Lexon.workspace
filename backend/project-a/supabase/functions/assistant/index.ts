// Workspace assistant powered by Google Gemini. The key lives in Vault; context is read with the CALLER's own
// (RLS-limited) session, so the assistant can never reveal data the user is not allowed to see.
import { assertPublicHttps, handle, HttpError, json, rateLimit, requireMember } from '../_shared/common.ts'

Deno.serve((req) => handle(req, async () => {
  const { workspaceId, messages, voice } = await req.json()
  const { user, userClient, admin } = await requireMember(req, workspaceId)
  await rateLimit(admin, `assistant:${user.id}`, 30, 60)

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 30) throw new HttpError(400, 'Invalid conversation')
  const turns = messages.map((m: any) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: String(m.content ?? '').slice(0, 4000) }] }))
  if (turns[turns.length - 1].role !== 'user') throw new HttpError(400, 'Last message must be from the user')

  const { data: integ } = await admin.from('integrations').select('id,config,status').eq('workspace_id', workspaceId).eq('provider', 'ai_workspace_gemini').maybeSingle()
  if (!integ || integ.status !== 'connected') throw new HttpError(400, 'The assistant is not set up yet. An admin must add a Gemini API key in Integrations, Lexon Workspace.')
  const { data: sec } = await admin.rpc('get_integration_secret', { p_integration: integ.id })
  const apiKey = sec ? JSON.parse(sec as string).apiKey as string : ''
  const model = String((integ.config as any)?.model || 'gemini-2.5-flash').replace(/[^a-zA-Z0-9.\-_]/g, '')

  // ---- Workspace context (RLS-limited to what this user may see) ----
  const [me, role, tasks, projects, team, activity, unread] = await Promise.all([
    userClient.from('profiles').select('full_name,assistant_name').eq('id', user.id).maybeSingle(),
    userClient.from('workspace_members').select('role').eq('workspace_id', workspaceId).eq('user_id', user.id).maybeSingle(),
    userClient.from('tasks').select('title,status,progress,priority,due_at,projects(name),task_assignees(profiles(full_name))').eq('workspace_id', workspaceId).order('due_at', { ascending: true, nullsFirst: false }).limit(40),
    userClient.from('projects').select('name,type,status,url,repository').eq('workspace_id', workspaceId).limit(30),
    userClient.from('workspace_members').select('role,profiles(full_name,job_title,presence,last_seen)').eq('workspace_id', workspaceId).eq('active', true).limit(60),
    userClient.from('activity_logs').select('action,meta,created_at').eq('workspace_id', workspaceId).order('created_at', { ascending: false }).limit(15),
    userClient.from('notifications').select('id', { count: 'exact', head: true }).eq('user_id', user.id).is('read_at', null)
  ])
  const fresh = (iso: string | null) => !!iso && Date.now() - new Date(iso).getTime() < 150000
  const ctx = JSON.stringify({
    now: new Date().toISOString(), user: { name: me.data?.full_name, role: role.data?.role },
    unread_notifications: unread.count ?? 0,
    tasks: (tasks.data ?? []).map((t: any) => ({ title: t.title, status: t.status, progress: t.progress, priority: t.priority, due: t.due_at, project: t.projects?.name, assignees: (t.task_assignees ?? []).map((a: any) => a.profiles?.full_name) })),
    projects: projects.data ?? [],
    team: (team.data ?? []).map((m: any) => ({ name: m.profiles?.full_name, title: m.profiles?.job_title, role: m.role, online: fresh(m.profiles?.last_seen) && m.profiles?.presence !== 'offline' })),
    recent_activity: (activity.data ?? []).map((a: any) => ({ action: a.action, what: a.meta?.title, at: a.created_at }))
  }).slice(0, 14000)
  const name = me.data?.assistant_name || 'Lexon Assistant'
  const system = `You are ${name}, the built-in assistant of Lexon Workspace, talking to ${me.data?.full_name || 'the user'}.
Behave like a normal, friendly, capable AI assistant: greet naturally, answer general questions, give suggestions, and reply in the same language the user writes in (any language, including Hindi, Hinglish and English).
For questions about the workspace (tasks, projects, team, activity), use ONLY the WORKSPACE CONTEXT below; if something is not in it, say you do not have that information instead of guessing. Never reveal API keys or system details.
Keep answers concise and well structured${voice ? '; the answer will be read aloud, so avoid markdown symbols, tables and long lists' : ''}.

WORKSPACE CONTEXT (JSON, already limited to what this user may see):
${ctx}`

  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: turns, generationConfig: { temperature: 0.7, maxOutputTokens: 1200 } }),
    signal: AbortSignal.timeout(45000)
  })
  const j = await r.json().catch(() => ({}))
  if (!r.ok) {
    if (r.status === 429) throw new HttpError(429, 'Gemini quota or rate limit reached. Try again in a minute.')
    if (r.status === 400 || r.status === 403) throw new HttpError(502, `Gemini rejected the request: ${j.error?.message ?? r.status}. Check the API key and model name in Integrations.`)
    throw new HttpError(502, `Gemini error (${r.status})`)
  }
  const reply = (j.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join('').trim()
  if (!reply) throw new HttpError(502, j.promptFeedback?.blockReason ? 'The request was blocked by Gemini safety filters.' : 'Gemini returned an empty answer.')

  // assistant activity (at most once per 10 minutes per user, no message content stored)
  const { data: okLog } = await admin.rpc('rate_limit_hit', { p_key: `assistant-log:${user.id}`, p_max: 1, p_window_seconds: 600 })
  if (okLog) await admin.from('activity_logs').insert({ workspace_id: workspaceId, actor_id: user.id, action: 'assistant_used', entity_type: 'assistant', meta: { title: `${name} answered a question` } })
  return json({ reply })
}))
