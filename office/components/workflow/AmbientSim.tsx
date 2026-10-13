'use client'
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useOffice, PState } from '@/store/officeStore'
import { world, seat, ensureWorld } from '@/3d/world'
import { moveTo } from '@/3d/move'
import { COFFEE_SPOT } from '@/config/office.config'
import { banter } from '@/lib/banter'
type A={kind:'coffee'|'chat'|'stroll'|'round'|'host';phase:'go'|'do'|'back';t:number;dur:number;tx:number;tz:number;tr:number;buddy?:string;prev:{state:PState;task:string}}
const DESKY=['TYPING','WORKING','READING']
/** Background life: people fetch coffee, chat at desks, stroll, switch tasks; the manager does rounds. All movement follows doors/corridors. */
export function AmbientSim(){
  const act=useRef<Record<string,A>>({}),tick=useRef(0),lastRound=useRef(Date.now())
  useFrame((_,dt0)=>{
    const dt=Math.min(dt0,0.1),o=useOffice.getState(); if(!o.ready||document.hidden)return
    const excl=new Set<string>(o.busyIds); if(o.callState)excl.add(o.callState.id)
    const task=o.tasks.find((t:any)=>t.id===o.vis.id&&(t.status==='working'||t.status==='review')); if(task){excl.add(task.chain[o.vis.step]);if(task.chain[o.vis.step+1])excl.add(task.chain[o.vis.step+1])}
    const A=act.current,ids=Object.keys(A)
    for(const id of ids){ const a=A[id],P=o.people[id]; if(!P){delete A[id];continue}
      if(excl.has(id)&&a.kind!=='host'){ o.setState(id,a.prev.state==='WALKING'?'IDLE':a.prev.state,a.prev.task); delete A[id]; continue }
      if(a.kind==='host'){ a.t+=dt; if(a.t>a.dur){o.setState(id,a.prev.state,a.prev.task);delete A[id]} continue }
      ensureWorld(id); const s=seat(id)
      if(a.phase==='go'){ if(moveTo(id,a.tx,a.tz,dt,a.tr)){a.phase='do';a.t=0;o.setState(id,a.kind==='coffee'?'BREAK':a.kind==='stroll'?'IDLE':'TALKING',a.kind==='coffee'?'Getting coffee':a.kind==='chat'||a.kind==='round'?'Chatting':'Stretching legs');if(a.buddy&&(a.kind==='chat'||a.kind==='round'))banter(id,a.buddy,a.kind==='round'?'manager checking on progress':'chatting at the desk');if(a.kind==='coffee')banter(id,Object.keys(A).find(k=>k!==id&&A[k].kind==='coffee')||id,'at the coffee machine')} }
      else if(a.phase==='do'){ a.t+=dt; if(a.t>a.dur){a.phase='back';o.setState(id,'WALKING','Heading back')} }
      else if(moveTo(id,s.x,s.z,dt,s.ry)){ o.setState(id,a.prev.state==='WALKING'?'IDLE':a.prev.state,a.prev.task); delete A[id] }
    }
    tick.current+=dt; if(tick.current<2)return; tick.current=0
    const free=(Object.values(o.people) as any[]).filter(p=>!excl.has(p.id)&&!A[p.id]&&p.presence!=='offline'&&p.state!=='WALKING'&&p.state!=='CALLING')
    const walking=Object.values(A).filter(a=>a.kind!=='host').length
    // desk variety: seated workers switch between typing / reading
    const seated=free.filter(p=>DESKY.includes(p.state)&&!p.isManager); if(seated.length){const p=seated[Math.floor(Math.random()*seated.length)];if(Math.random()<0.5)o.setState(p.id,DESKY[Math.floor(Math.random()*3)] as PState)}
    if(o.roomCallReq||walking>=5)return
    const mgr=free.find(p=>p.isManager)
    if(mgr&&task&&Date.now()-lastRound.current>60000){ const emp=o.people[task.assignee]; if(emp){lastRound.current=Date.now();const s=seat(emp.id);A[mgr.id]={kind:'round',phase:'go',t:0,dur:7,tx:s.x+1.1,tz:s.z,tr:-Math.PI/2,buddy:emp.id,prev:{state:mgr.state,task:mgr.task}};o.setState(mgr.id,'WALKING','Checking on '+emp.name.split(' ')[0]);if(!excl.has(emp.id)&&!A[emp.id]){A[emp.id]={kind:'host',phase:'do',t:0,dur:10,tx:0,tz:0,tr:0,prev:{state:emp.state,task:emp.task}};o.setState(emp.id,'TALKING','Updating the manager')};return} }
    const cand=free.filter(p=>!p.isManager&&['TYPING','WORKING','READING','BREAK'].includes(p.state)); if(!cand.length||Math.random()>0.75)return
    const p=cand[Math.floor(Math.random()*cand.length)],r=Math.random(),prev={state:p.state as PState,task:p.task}
    if(r<0.34){ const j=()=>(Math.random()-0.5)*0.9; A[p.id]={kind:'coffee',phase:'go',t:0,dur:9+Math.random()*7,tx:COFFEE_SPOT.x+j(),tz:COFFEE_SPOT.z+j()*0.5,tr:COFFEE_SPOT.ry,prev}; o.setState(p.id,'WALKING','Getting coffee') }
    else if(r<0.78){ const buds=free.filter(q=>q.id!==p.id&&!q.isManager&&q.room===p.room&&DESKY.includes(q.state)); const b=buds[Math.floor(Math.random()*buds.length)]; if(!b)return
      const bs=seat(b.id); A[p.id]={kind:'chat',phase:'go',t:0,dur:8+Math.random()*5,tx:bs.x+1.1,tz:bs.z,tr:-Math.PI/2,buddy:b.id,prev}; A[b.id]={kind:'host',phase:'do',t:0,dur:30,tx:0,tz:0,tr:0,prev:{state:b.state,task:b.task}}; A[p.id].dur+=7; A[b.id].dur=A[p.id].dur+6; o.setState(p.id,'WALKING','Going to a colleague'); o.setState(b.id,'TALKING','Chatting') }
    else { A[p.id]={kind:'stroll',phase:'go',t:0,dur:2.5,tx:-9+Math.random()*18,tz:1.8+Math.random()*5.5,tr:Math.random()*6.28,prev}; o.setState(p.id,'WALKING','Stretching legs') }
  })
  return null
}
