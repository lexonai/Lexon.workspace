'use client'
import { useState } from 'react'
import { useOffice } from '@/store/officeStore'
import { uid } from '@/shared/engine.mjs'
const KINDS=[['agent','Custom agent'],['integration','Integration'],['automation','Automation']]
/** Owner → Manager → all employees → Manager → Owner. Dashed nodes are extension points (custom agents / integrations / automations). */
export default function WorkflowGraph({compact}:{compact?:boolean}){
  const o=useOffice(),[menu,setMenu]=useState(false)
  const emps=Object.values(o.people).filter((p:any)=>!p.isManager) as any[], extra=o.extraNodes as any[]
  const active=o.tasks.find((t:any)=>t.status==='working'||t.status==='review'), inChain=new Set(active?active.chain:[])
  const rows=emps.length+extra.length, H=Math.max(190,rows*34+24), W=900, ex=450, my=H/2
  const y=(i:number)=>20+i*((H-40)/Math.max(1,rows-1))
  const nodes=[...emps.map((e,i)=>({id:e.id,label:e.name.split(' ')[0],sub:e.role.split('/')[0],i,dashed:false,hot:inChain.has(e.id)})),...extra.map((e,i)=>({id:e.id,label:e.name,sub:e.kind,i:emps.length+i,dashed:true,hot:false}))]
  const box=(x:number,yy:number,l:string,s:string,cls:string)=><g key={l+x+yy} className={'gn '+cls}><rect x={x-62} y={yy-16} width="124" height="32" rx="8"/><text x={x} y={yy-1} textAnchor="middle" className="t1">{l}</text><text x={x} y={yy+11} textAnchor="middle" className="t2">{s.slice(0,22)}</text></g>
  return <div className="wf">
    <div className="wfbar"><small className="mut">Owner → Manager → Employees → Manager → Owner</small><div className="menuw"><button className="ghost" onClick={()=>setMenu(!menu)}>+ Node</button>{menu&&<div className="drop sm">{KINDS.map(([k,l])=><button key={k} className="ghost" onClick={()=>{const n=prompt(`${l} name`);if(n)o.set({extraNodes:[...o.extraNodes,{id:uid('x'),kind:k,name:n}]});setMenu(false)}}>{l}</button>)}</div>}</div></div>
    <div className="wfs"><svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{minWidth:640,height:compact?Math.min(H,200):H}}>
      <g className="edges"><path d={`M132 ${my}H168`}/><path d={`M232 ${my}H268`}/>
       {nodes.map(n=><g key={n.id}><path className={n.hot?'hot':''} d={`M292 ${my}C370 ${my} 370 ${y(n.i)} ${ex-62} ${y(n.i)}`} strokeDasharray={n.dashed?'4 4':undefined}/><path className={n.hot?'hot':''} d={`M${ex+62} ${y(n.i)}C560 ${y(n.i)} 560 ${my} 608 ${my}`} strokeDasharray={n.dashed?'4 4':undefined}/></g>)}
       <path d={`M732 ${my}H768`}/></g>
      {box(70,my,'Owner','You','own')}{box(200,my,'Manager','Routes tasks','mgr')}
      {nodes.map(n=>box(ex,y(n.i),n.label,n.sub,(n.dashed?'dash ':'')+(n.hot?'hot':'')))}
      {box(670,my,'Manager','Reviews output','mgr')}{box(830,my,'Owner','Final result','own')}</svg></div></div>
}
