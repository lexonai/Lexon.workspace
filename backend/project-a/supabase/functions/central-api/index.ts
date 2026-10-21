// CENTRAL API: the single door the Workspace/Team browser uses to reach the OTHER backends.
//   POST { service: 'office',     workspaceId, action: 'status' | 'token' | 'link' | 'unlink', ... }
//   POST { service: 'automation', workspaceId, project: 'youtube' | 'instagram', action: 'select' | 'invoke' | 'ping' | 'pull_events' | 'link' | 'unlink', ... }
//   POST { service: 'health',     workspaceId }   -> link status of Office + Automation (never breaks if they are down)
// Every call: verifies the caller's Supabase JWT, checks active membership + the permission for that service, rate-limits,
// then talks to the other backend with credentials that live only in Vault. The browser never sees those credentials.
import { handle, HttpError, json, requireMember } from '../_shared/common.ts'
import { officeAction } from '../_shared/office.ts'
import { automationAction } from '../_shared/automation.ts'

Deno.serve((req) => handle(req, async () => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  const b = await req.json().catch(() => ({})) as Record<string, any>
  switch (b.service) {
    case 'office': return officeAction(req, b)
    case 'automation': return automationAction(req, b)
    case 'health': {
      const workspaceId = String(b.workspaceId ?? ''); if (!workspaceId) throw new HttpError(400, 'workspaceId required')
      const { userClient, admin } = await requireMember(req, workspaceId)
      const { data: rows } = await admin.from('integrations').select('provider,status,last_sync_at,last_error').eq('workspace_id', workspaceId).in('provider', ['office', 'youtube', 'instagram'])
      const seeDetail = !!(await userClient.rpc('has_permission', { ws: workspaceId, perm: 'integrations.manage' })).data
      const out: Record<string, unknown> = { workspace: { ok: true } }
      for (const p of ['office', 'youtube', 'instagram']) {
        const r = (rows ?? []).find((x) => x.provider === p)
        out[p] = { linked: r?.status === 'connected', ...(seeDetail ? { last_sync_at: r?.last_sync_at ?? null, error: r?.last_error ?? null } : {}) }
      }
      return json(out)
    }
    default: throw new HttpError(400, 'Unknown service')
  }
}))
