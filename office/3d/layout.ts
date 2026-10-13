import { ROOMS, SLOTS } from '@/config/office.config'
/** Single source of truth for the building: walls (with doorways/pass-throughs), colliders, doors and walking-path planning. */
export type Seg={x1:number;z1:number;x2:number;z2:number;h:number;glass:boolean}
const X0=-23.4,X1=23.4,Z0=-10.5,Z1=8.5,ZT=-2.5,ZB=0.5,ZC=-1
const line=(axis:'x'|'z',v:number,a:number,b:number,gaps:[number,number][],h:number,glass=false):Seg[]=>{
  const out:Seg[]=[];let cur=a;for(const [g0,g1] of [...gaps].sort((p,q)=>p[0]-q[0])){if(g0>cur)out.push(axis==='z'?{x1:cur,z1:v,x2:g0,z2:v,h,glass}:{x1:v,z1:cur,x2:v,z2:g0,h,glass});cur=g1}
  if(b>cur)out.push(axis==='z'?{x1:cur,z1:v,x2:b,z2:v,h,glass}:{x1:v,z1:cur,x2:v,z2:b,h,glass});return out }
const dg=(x:number):[number,number]=>[x-1.5,x+1.5]
export const DOORS=[ // {room, x (door centre), in:[x,z] just inside, out:[x,ZC] corridor}
 ...[['dev',-17.6],['youtube',-5.8],['content',5.8],['conference',17.6]].map(([r,x])=>({room:r as string,x:x as number,inn:[x as number,-3.5] as [number,number],out:[x as number,ZC] as [number,number]})),
 {room:'meeting',x:-17.6,inn:[-17.6,1.6],out:[-17.6,ZC]},{room:'main',x:-6,inn:[-6,1.6],out:[-6,ZC]},{room:'main',x:6,inn:[6,1.6],out:[6,ZC]},{room:'break',x:17.6,inn:[17.6,1.6],out:[17.6,ZC]}]
export const WALLS:Seg[]=[
 ...line('z',Z0,X0,X1,[],2.6),
 ...line('x',X0,Z0,ZB,[],2.2,true),...line('x',X0,ZB,Z1,[],2.6),...line('x',X1,Z0,ZB,[],2.2,true),...line('x',X1,ZB,Z1,[],2.6),
 ...line('z',Z1,X0,X1,[],0.9,true),
 ...line('z',ZT,X0,X1,[-17.6,-5.8,5.8,17.6].map(dg),0.9,true),
 ...line('z',ZB,X0,X1,[-17.6,-6,6,17.6].map(dg),0.9,true),
 ...[-11.8,0,11.8].flatMap(x=>line('x',x,Z0,ZT,[[-8.2,-5.2]],2.0)),
 ...[-11.8,11.8].flatMap(x=>line('x',x,ZB,Z1,[[3.0,6.0]],2.0)),
]
export type Box={x:number;z:number;w:number;d:number}
export const BOXES:Box[]=[...SLOTS.filter((s:any)=>s.type==='desk').map((s:any)=>({x:s.x,z:s.z,w:1.5,d:0.8})),{x:17.6,z:-6.5,w:5.4,d:1.8},{x:-17.6,z:4.5,w:4.4,d:1.6},{x:17.0,z:4.4,w:1.6,d:1.6},{x:21.0,z:7.6,w:3.2,d:1.0},{x:18.2,z:1.2,w:10,d:0.9},{x:22.7,z:2.2,w:1.2,d:1.0}]
export const roomAt=(x:number,z:number)=>ROOMS.find(r=>Math.abs(x-r.x)<=r.w/2&&Math.abs(z-r.z)<=r.d/2)?.id||null
/** true if a circle of radius r at (x,z) hits a wall or furniture */
export function blocked(x:number,z:number,r=0.3){
  if(x<X0+r||x>X1-r||z<Z0+r||z>Z1-r)return true
  for(const s of WALLS){const dx=s.x2-s.x1,dz=s.z2-s.z1,l2=dx*dx+dz*dz;let t=l2?((x-s.x1)*dx+(z-s.z1)*dz)/l2:0;t=Math.max(0,Math.min(1,t));const px=s.x1+t*dx,pz=s.z1+t*dz;if((x-px)**2+(z-pz)**2<(r+0.05)**2)return true}
  for(const b of BOXES){if(Math.abs(x-b.x)<b.w/2+r&&Math.abs(z-b.z)<b.d/2+r)return true}
  return false
}
const doorsOf=(room:string)=>DOORS.filter(d=>d.room===room)
/** Waypoints from (fx,fz) to (tx,tz): out of the room through its door, along the corridor, through the target room's door. */
export function planPath(fx:number,fz:number,tx:number,tz:number){
  const a=roomAt(fx,fz),b=roomAt(tx,tz),pts:{x:number;z:number}[]=[]
  if(a&&a===b)return [{x:tx,z:tz}]
  if(a){const d=doorsOf(a).sort((p,q)=>Math.abs(p.x-tx)-Math.abs(q.x-tx))[0];if(d){pts.push({x:d.inn[0],z:d.inn[1]},{x:d.out[0],z:d.out[1]})}}
  if(b){const d=doorsOf(b).sort((p,q)=>Math.abs(p.x-(pts.length?pts[pts.length-1].x:fx))-Math.abs(q.x-(pts.length?pts[pts.length-1].x:fx)))[0];if(d){pts.push({x:d.out[0],z:d.out[1]},{x:d.inn[0],z:d.inn[1]})}}
  else pts.push({x:tx,z:ZC})
  pts.push({x:tx,z:tz}); return pts.filter((p,i)=>i===0||Math.hypot(p.x-pts[i-1].x,p.z-pts[i-1].z)>0.05)
}
/** Slots for a gathering: seats first (conference/meeting), then a standing ring facing the focus point. */
export function gatherSlots(roomId:string,n:number,occupiedHome:Set<string>){
  const R=ROOMS.find(r=>r.id===roomId)!,focus=roomId==='conference'?{x:17.6,z:-6.5}:roomId==='meeting'?{x:-17.6,z:4.5}:{x:R.x,z:R.z}
  const out:{x:number;z:number;ry:number;sit:boolean;id?:string}[]=[]
  if(roomId==='conference'||roomId==='meeting')for(const s of SLOTS as any[])if(s.room===roomId&&s.type==='seat'&&!occupiedHome.has(s.id))out.push({x:s.sx,z:s.sz,ry:s.ry,sit:true,id:s.id})
  const cand:{x:number;z:number}[]=[];for(let x=R.x-R.w/2+1;x<=R.x+R.w/2-1;x+=1.1)for(let z=R.z-R.d/2+1;z<=R.z+R.d/2-1;z+=1.1){if(!blocked(x,z,0.35)&&!out.some(o=>Math.hypot(o.x-x,o.z-z)<0.9))cand.push({x,z})}
  cand.sort((p,q)=>Math.hypot(p.x-focus.x,p.z-focus.z)-Math.hypot(q.x-focus.x,q.z-focus.z))
  for(const c of cand){if(out.length>=n)break;out.push({...c,ry:Math.atan2(focus.x-c.x,focus.z-c.z),sit:false})}
  return out.slice(0,Math.max(n,0))
}
