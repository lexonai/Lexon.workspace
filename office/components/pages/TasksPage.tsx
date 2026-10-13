'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ROOM_CAM } from '@/config/office.config'
import { useOffice } from '@/store/officeStore'
import { CATS } from '@/shared/engine.mjs'
import { STATUS_LABEL, PRI_COLOR } from '@/lib/ui'
import WorkflowGraph from '../workflow/WorkflowGraph'
import Avatar from '../ui/Avatar'
import Modal from '../ui/Modal'
const COLS:[string,string[]][]=[['Queued',['queued','blocked']],['Working',['working']],['In review',['review']],['Done',['done']]]
const CALLS:[string,string][]=[['meeting','Call to Meeting Room'],['conference','Call to Conference Room'],['dev','Call to Development Room'],['youtube','Call to YouTube Room'],['content','Call to Content Room']]
function TaskActions({t}:{t:any}){
  const o=useOffice(),router=useRouter(),[open,setOpen]=useState(false)
  const ids=[...new Set(t.chain)] as string[]
  const call=(room:string)=>{o.roomCall(room,ids);o.set({focusCam:ROOM_CAM[room]||'cam1',camId:ROOM_CAM[room]||'cam1',mode:'live'});setOpen(false);router.push('/office')}
  return <span className="menuw" onClick={e=>e.stopPropagation()}><button onClick={()=>setOpen(!open)}>Actions ▾</button>{open&&<div className="drop sm" style={{right:'auto',left:0,width:210}}>{CALLS.map(([r,l])=><button key={r} className="ghost" onClick={()=>call(r)}>{l}</button>)}<button className="ghost" onClick={()=>{const c=prompt('Custom command for the manager (about this task):');if(c){o.sendOwner('manager',`[Task: ${t.title}] ${c}`);setOpen(false);router.push('/chat')}}}>Custom command…</button></div>}</span>
}
function NewTask({onClose}:{onClose:()=>void}){
  const o=useOffice(); const [f,setF]=useState<any>({title:'',priority:'normal',deadline:'',category:'',assignee:''}); const s=(k:string,v:any)=>setF({...f,[k]:v})
  return <Modal title="New task" onClose={onClose}><div className="form"><label>Task<textarea rows={3} value={f.title} onChange={e=>s('title',e.target.value)} autoFocus placeholder="e.g. Create a high-CTR YouTube thumbnail for this title"/></label>
   <div className="two"><label>Priority<select value={f.priority} onChange={e=>s('priority',e.target.value)}>{['low','normal','high','urgent'].map(x=><option key={x}>{x}</option>)}</select></label><label>Deadline<input type="datetime-local" value={f.deadline} onChange={e=>s('deadline',e.target.value)}/></label></div>
   <div className="two"><label>Category<select value={f.category} onChange={e=>s('category',e.target.value)}><option value="">Auto (Manager decides)</option>{CATS.map((c:any)=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
   <label>Employee<select value={f.assignee} onChange={e=>s('assignee',e.target.value)}><option value="">Auto-select</option>{Object.values(o.people).filter((p:any)=>!p.isManager).map((p:any)=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label></div>
   <button className="pri" disabled={!f.title.trim()} onClick={()=>{o.createTask({title:f.title.trim(),priority:f.priority,deadline:f.deadline||undefined,category:f.category||undefined,assignee:f.assignee||undefined});onClose()}}>Create task</button></div></Modal>
}
function Detail({id,onClose}:{id:string;onClose:()=>void}){
  const o=useOffice(),t:any=o.tasks.find((x:any)=>x.id===id); if(!t)return null
  return <Modal title={t.title} wide onClose={onClose}><div className="pd"><div className="route">{[t.label,...t.chain.slice(1,-1).map((c:string)=>o.people[c]?.name.split(' ')[0]),t.capability,'Review','Manager','Owner'].map((x:string,i:number)=><span key={i}>{x}</span>)}</div>
   <div className="kv"><span>Status</span><b>{STATUS_LABEL[t.status]}</b><span>Priority</span><b style={{color:PRI_COLOR[t.priority]}}>{t.priority}</b><span>Deadline</span><b>{t.deadline||'—'}</b><span>Handoffs</span><b>{t.handoffs.join(' · ')||'—'}</b></div>
   {t.output?<><h4>Output</h4>{t.output.imageUrl&&<img className="thumbimg big" src={t.output.imageUrl} alt=""/>}<pre>{t.output.text}</pre>{t.output.sources?.map((s:any,i:number)=><div key={i}><a href={s.url} target="_blank" rel="noreferrer">{s.title}</a></div>)}</>:<small className="mut">No output yet.</small>}
   <div className="acts"><TaskActions t={t}/>{t.status==='done'||t.status==='review'?null:<button onClick={()=>{o.set({tasks:o.tasks.filter((x:any)=>x.id!==id)});onClose()}}>Cancel task</button>}{t.output&&<button onClick={()=>{o.patchTask(id,{status:'queued',output:undefined});onClose()}}>Redo</button>}</div></div></Modal>
}
export default function TasksPage(){
  const o=useOffice(); const [q,setQ]=useState(''),[add,setAdd]=useState(false),[open,setOpen]=useState<string|null>(null)
  return <div className="page fade"><div className="ph"><div><h2>Tasks</h2><small className="mut">The Manager picks the right employee and AI model automatically</small></div><button className="pri" onClick={()=>setAdd(true)}>+ New task</button></div>
   <input className="quick" value={q} placeholder="Quick task — type and press Enter (e.g. “Find 5 high-CTR AI tool topics”)" onChange={e=>setQ(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&q.trim()){o.createTask({title:q.trim()});setQ('')}}}/>
   <div className="board">{COLS.map(([name,st])=><div key={name} className="col"><h4>{name} <em>{o.tasks.filter((t:any)=>st.includes(t.status)).length}</em></h4>
     {o.tasks.filter((t:any)=>st.includes(t.status)).map((t:any)=><div key={t.id} className="tcard" role="button" onClick={()=>setOpen(t.id)}><div className="trh"><b>{t.title.slice(0,70)}</b><span className="pdot" style={{background:PRI_COLOR[t.priority]}} title={t.priority}/></div>
       <div className="trm"><span className="chip">{t.label}</span>{t.status==='blocked'&&<span className="chip warn">Needs your input</span>}{o.people[t.assignee]&&<Avatar p={o.people[t.assignee]} size={20} dot={false}/>}</div><div className="bar"><div style={{width:t.progress+'%'}}/></div>{t.deadline&&<small className="mut">Due {t.deadline.replace('T',' ')}</small>}<TaskActions t={t}/></div>)}</div>)}</div>
   <h3 style={{marginTop:22}}>Workflow</h3><WorkflowGraph/>{add&&<NewTask onClose={()=>setAdd(false)}/>}{open&&<Detail id={open} onClose={()=>setOpen(null)}/>}</div>
}
