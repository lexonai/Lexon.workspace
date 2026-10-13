import { ROOM_DEFS, SLOTS, SLOT_BY_ID, SEED_EMPLOYEES, BASE_SCHEDULE, DEFAULT_SETTINGS, PROVIDERS, COFFEE_SPOT } from '@/shared/office-data.mjs'
export { SLOTS, SLOT_BY_ID, SEED_EMPLOYEES, BASE_SCHEDULE, DEFAULT_SETTINGS, PROVIDERS, COFFEE_SPOT }
export const ROOMS: {id:string;name:string;x:number;z:number;w:number;d:number}[] = ROOM_DEFS
// 7 cameras: overview + one per room (CAM 01 spans two grid cells)
export const CAMS = [
 { id:'cam1', label:'CAM 01', name:'Main Floor', pos:[0,34,22], target:[0,0,-1] },
 { id:'cam2', label:'CAM 02', name:'Development Room', pos:[-17.6,9,0.5], target:[-17.6,0,-6.5] },
 { id:'cam3', label:'CAM 03', name:'YouTube Room', pos:[-5.8,9,0.5], target:[-5.8,0,-6.5] },
 { id:'cam4', label:'CAM 04', name:'Content Room', pos:[5.8,9,0.5], target:[5.8,0,-6.5] },
 { id:'cam5', label:'CAM 05', name:'Conference Room', pos:[17.6,9,0.5], target:[17.6,0,-6.5] },
 { id:'cam6', label:'CAM 06', name:'Meeting Room', pos:[-17.6,9,11.5], target:[-17.6,0,4.5] },
 { id:'cam7', label:'CAM 07', name:'Break Area', pos:[17.6,9,11.5], target:[17.6,0,4.5] },
]
export const ROOM_CAM: Record<string,string> = { dev:'cam2', youtube:'cam3', content:'cam4', conference:'cam5', meeting:'cam6', main:'cam1', break:'cam7' }
export const hash=(s:string)=>[...s].reduce((a,c)=>(a*31+c.charCodeAt(0))>>>0,7)
