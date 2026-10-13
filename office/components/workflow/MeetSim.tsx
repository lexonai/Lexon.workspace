'use client'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useOffice, PState } from '@/store/officeStore'
import { world, ensureWorld } from '@/3d/world'
import { moveTo } from '@/3d/move'
import { gatherSlots } from '@/3d/layout'
import { banter } from '@/lib/banter'
type M={a:string;b:string;phase:'walk'|'talk'|'back';t:number;home:Record<string,{x:number;z:number;ry:number}>;prev:Record<string,{state:PState;task:string}>}
const A={x:-19.2,z:7.0,ry:Math.PI/2}, B={x:-17.0,z:7.0,ry:-Math.PI/2}
/** In-person conversation: both people stand up, walk to the Meeting Room, talk, then return to what they were doing. */
export function MeetSim(){
  const m=useRef<M|null>(null)
  useFrame((_,dt0)=>{
    const dt=Math.min(dt0,0.1),o=useOffice.getState(),nm=(i:string)=>o.people[i].name.split(' ')[0]
    if(!m.current&&o.meetReq&&o.busyIds.length===0){
      const a=o.meetReq; o.set({meetReq:null})
      const b=o.people[a].reportsTo||Object.values(o.people).find((p:any)=>p.isManager&&p.id!==a)?.id||a
      if(o.people[b].presence==='offline'){o.log(`${nm(b)} is offline`);return}
      ensureWorld(a);ensureWorld(b)
      m.current={a,b,phase:'walk',t:0,home:{[a]:{...world[a]},[b]:{...world[b]}},prev:{[a]:{state:o.people[a].state,task:o.people[a].task},[b]:{state:o.people[b].state,task:o.people[b].task}}}
      o.set({busyIds:[a,b]}); o.setState(a,'WALKING',`Going to meet ${nm(b)}`); o.setState(b,'WALKING',`Going to meet ${nm(a)}`)
      ensureWorld(a);ensureWorld(b);o.log(`${nm(a)} and ${nm(b)} are heading to the Meeting Room`,'people'); return
    }
    const k=m.current; if(!k)return
    if(k.phase==='walk'){ const x=moveTo(k.a,A.x,A.z,dt,A.ry),y=moveTo(k.b,B.x,B.z,dt,B.ry)
      if(x&&y){k.phase='talk';k.t=0;o.setState(k.a,'MEETING','In meeting');o.setState(k.b,'MEETING','In meeting');o.log(`${nm(k.a)} and ${nm(k.b)} started a meeting`)} }
    else if(k.phase==='talk'){ k.t+=dt; if(k.t>8){k.phase='back';o.setState(k.a,'WALKING','Returning to desk');o.setState(k.b,'WALKING','Returning to desk')} }
    else { const h=k.home,x=moveTo(k.a,h[k.a].x,h[k.a].z,dt,h[k.a].ry),y=moveTo(k.b,h[k.b].x,h[k.b].z,dt,h[k.b].ry)
      if(x&&y){ for(const i of [k.a,k.b]) o.setState(i,k.prev[i].state==='WALKING'?'IDLE':k.prev[i].state,k.prev[i].task); o.set({busyIds:[]}); o.log('Meeting ended','people'); m.current=null } }
  })
  return null
}

/** Room call: chosen people walk (via doors/corridor) to the room, sit at free seats (conference/meeting) or stand around, talk, then return. */
export function RoomCallSim(){
  const g=useRef<{ids:string[];slots:any[];phase:'walk'|'talk'|'back';t:number;home:Record<string,{x:number;z:number;ry:number}>;prev:Record<string,{state:PState;task:string}>;hold:boolean;room:string}|null>(null)
  useFrame((_,dt0)=>{
    const dt=Math.min(dt0,0.1),o=useOffice.getState()
    if(!g.current&&o.roomCallReq&&o.busyIds.length===0){
      const req=o.roomCallReq; o.set({roomCallReq:null}); const ids=req.ids.slice(0,36)
      const occupied=new Set<string>(Object.values(o.people).filter((p:any)=>!ids.includes(p.id)).map((p:any)=>p.slot))
      const slots=gatherSlots(req.room,ids.length,occupied); const mgrIdx=ids.findIndex(i=>o.people[i]?.isManager)
      if(mgrIdx>0){[ids[0],ids[mgrIdx]]=[ids[mgrIdx],ids[0]]}
      const home:any={},prev:any={}; ids.forEach(i=>{ensureWorld(i);home[i]={...world[i]};prev[i]={state:o.people[i].state,task:o.people[i].task};o.setState(i,'WALKING','Going to the '+req.room+' room')})
      o.set({busyIds:ids}); g.current={ids,slots,phase:'walk',t:0,home,prev,hold:req.hold,room:req.room}
      setTimeout(()=>{const w=ids.filter(i=>o.people[i]&&!o.people[i].isManager);if(w.length>1)banter(w[0],w[1],'walking to the '+req.room+' room')},1500); return }
    const k=g.current; if(!k)return; k.t+=dt
    if(k.phase==='walk'){ let all=true; k.ids.forEach((id,i)=>{const sl=k.slots[i]||{x:0,z:-1,ry:0,sit:false};if(!moveTo(id,sl.x,sl.z,dt,sl.ry,1.7+((i*7)%5)*0.12))all=false})
      if(all||k.t>45){k.phase='talk';k.t=0;k.ids.forEach((id,i)=>{const sl=k.slots[i];if(sl){world[id].x=sl.x;world[id].z=sl.z;world[id].ry=sl.ry;world[id].moving=false;world[id].path=undefined;world[id].pose=sl.sit?'sit':'stand'}o.setState(id,'MEETING','In the '+k.room+' meeting')});o.log(`Team gathered in the ${k.room} room`,'people')} }
    else if(k.phase==='talk'){ if(k.hold?useOffice.getState().meetingRoom!==k.room:k.t>16){k.phase='back';k.t=0;k.ids.forEach(i=>{world[i].pose=undefined;o.setState(i,'WALKING','Returning to desk')})} }
    else { let all=true; k.ids.forEach(id=>{const h=k.home[id];if(!moveTo(id,h.x,h.z,dt,h.ry))all=false})
      if(all||k.t>45){ k.ids.forEach(id=>{const h=k.home[id];world[id].x=h.x;world[id].z=h.z;world[id].ry=h.ry;world[id].moving=false;world[id].path=undefined;world[id].pose=undefined;o.setState(id,k.prev[id].state==='WALKING'?'IDLE':k.prev[id].state,k.prev[id].task)}); o.set({busyIds:[]}); o.log('Meeting ended','people'); g.current=null } }
  })
  return null
}
