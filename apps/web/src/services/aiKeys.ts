import { supabase } from '../lib/supabase'
import { callFn } from '../lib/functions'
import type { ApiKind } from '../lib/aiCatalog'

export type AiScope = 'workspace' | 'office'
export interface AiConn { provider: string; label: string; kind: ApiKind; baseUrl: string; model: string; catalogId: string; lastError: string | null; connectedAt: string | null }

// Keys are stored in Vault by the ai-keys Edge Function. The browser only ever sees metadata, never a key.
export async function listAi(ws: string, scope: AiScope): Promise<AiConn[]> {
  const { data, error } = await supabase.from('integrations').select('provider,config,last_error,connected_at,status').eq('workspace_id', ws).like('provider', `ai\\_${scope}\\_%`)
  if (error) throw new Error(error.message)
  return (data ?? []).filter((r: any) => r.status === 'connected').map((r: any) => ({ provider: r.provider, label: r.config?.label ?? r.provider, kind: r.config?.kind ?? 'custom', baseUrl: r.config?.baseUrl ?? '', model: r.config?.model ?? '', catalogId: r.config?.catalogId ?? '', lastError: r.last_error, connectedAt: r.connected_at }))
}
export interface SaveAi { scope: AiScope; catalogId: string; label: string; kind: ApiKind; baseUrl: string; model: string; headerName: string; apiKey: string; noKey?: boolean }
export const saveAi = (ws: string, i: SaveAi) => callFn('ai-keys', { workspaceId: ws, action: 'save', ...i })
export const removeAi = (ws: string, scope: AiScope, provider: string) => callFn('ai-keys', { workspaceId: ws, action: 'remove', scope, provider })
export const testAi = (ws: string, scope: AiScope, provider: string) => callFn<{ ok: boolean; detail: string }>('ai-keys', { workspaceId: ws, action: 'test', scope, provider })
