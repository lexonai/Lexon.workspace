'use client'
import { useState } from 'react'
import { useOffice } from '@/store/officeStore'
import { ago, SC } from '@/lib/ui'
import Avatar from '../ui/Avatar'
import Analytics from '../analytics/Analytics'
const F:[string,string][]=[['all','All'],['people','People'],['task','Tasks'],['ai','AI / System']]
const KC:Record<string,string>={people:'#3b82f6',task:'#3ddc84',ai:'#8b5cf6',system:'#8b9099'}
export default function ActivityPage(){
  const o=useOffice(); const [f,setF]=useState('all'),[view,setView]=useState('feed'); const list=o.activity.filter((a:any)=>f==='all'||a.kind===f||(f==='ai'&&a.kind==='system'))
  return <div className="page fade"><div className="ph"><div><h2>Activity</h2><small className="mut">Live feed — updates continuously</small></div><div className="tabs"><button className={view==='feed'?'on':''} onClick={()=>setView('feed')}>Live feed</button><button className={view==='analytics'?'on':''} onClick={()=>setView('analytics')}>Analytics</button>{view==='feed'&&<span style={{width:14}}/>}{view==='feed'&&F.map(([k,l])=><button key={k} className={f===k?'on':''} onClick={()=>setF(k)}>{l}</button>)}</div></div>
   {view==='analytics'?<Analytics/>:<>
   <div className="presrow">{(Object.values(o.people) as any[]).map(p=><span key={p.id} className="pr"><Avatar p={p} size={26}/>{p.name.split(' ')[0]}<small className="mut">{p.presence}</small></span>)}</div>
   <div className="feed">{list.map((a:any)=><div key={a.id} className="fi"><i style={{background:KC[a.kind]||KC.system}}/><div><div>{a.text}</div><small className="mut">{ago(a.t)} · {a.kind}</small></div></div>)}</div></>}</div>
}
