import type { OfficeSnapshot } from './workspace-types'
import type { OfficeEvent, OfficeCommand } from './workspace-events'
export const OFFICE_CONTRACT_VERSION='1.0.0'
/** What a host app gets when it mounts Office (see OfficeFrame.tsx). */
export interface OfficeHost{
  getSnapshot():Promise<OfficeSnapshot>
  on(handler:(e:OfficeEvent)=>void):()=>void
  send(cmd:OfficeCommand):void
}
