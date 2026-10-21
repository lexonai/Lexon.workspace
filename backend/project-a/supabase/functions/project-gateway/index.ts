// LEGACY name kept so older Workspace builds keep working. All logic lives in _shared/automation.ts and is exposed by central-api.
import { handle, HttpError } from '../_shared/common.ts'
import { automationAction } from '../_shared/automation.ts'
Deno.serve((req) => handle(req, async () => {
  if (req.method !== 'POST') throw new HttpError(405, 'Method not allowed')
  return automationAction(req, await req.json().catch(() => ({})))
}))
