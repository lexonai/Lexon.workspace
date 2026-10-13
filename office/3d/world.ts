import { useOffice } from '@/store/officeStore'
import type { PState } from '@/store/officeStore'
export type W={x:number;z:number;ry:number;moving:boolean;pose?:'sit'|'stand';path?:{x:number;z:number}[];gx?:number;gz?:number}
export const world: Record<string,W> = {}
export const seat=(id:string)=>{const p=useOffice.getState().people[id];const s=p?.seat||[0,6,Math.PI];return {x:s[0] as number,z:s[1] as number,ry:s[2] as number,sit:p?.sit!==false}}
/** Idempotent: places an employee at their seat. */
export function ensureWorld(id:string){ if(!world[id]){const s=seat(id);world[id]={x:s.x,z:s.z,ry:s.ry,moving:false}} return world[id] }
export const STATUS:Record<string,string>={online:'#3ddc84',away:'#f5c542',busy:'#ef4444',offline:'#6b7280'}
export const SITTING:PState[]=['WORKING','TYPING','READING','CALLING','BREAK','MEETING','TALKING','IDLE','COMPLETED']
