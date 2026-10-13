'use client'
import { useMemo } from 'react'
import { useOffice } from '@/store/officeStore'
const DAY=86400000
const dur=(ms:number)=>!ms?'—':ms<60000?Math.round(ms/1000)+'s':ms<3600000?Math.round(ms/60000)+' min':(ms/3600000).toFixed(1)+' h'
export function useStats(){
  const tasks=useOffice(s=>s.tasks) as any[], activity=useOffice(s=>s.activity) as any[], calls=useOffice(s=>s.calls), people=useOffice(s=>s.people) as any
  return useMemo(()=>{
    const now=Date.now(),done=tasks.filter(t=>t.status==='done'&&t.doneAt),open=tasks.filter(t=>t.status!=='done')
    const turn=done.map(t=>t.doneAt-t.createdAt),avg=turn.length?turn.reduce((a,b)=>a+b,0)/turn.length:0
    const withDl=done.filter(t=>t.deadline),onTime=withDl.length?Math.round(withDl.filter(t=>t.doneAt<=new Date(t.deadline).getTime()).length/withDl.length*100):null
    const days=[...Array(7)].map((_,i)=>{const d=new Date(now-(6-i)*DAY);const k=d.toDateString();return {label:d.toLocaleDateString([], {weekday:'short'}),value:done.filter(t=>new Date(t.doneAt).toDateString()===k).length}})
    const hours=[...Array(24)].map((_,h)=>({label:String(h),value:activity.filter(a=>now-a.t<DAY&&new Date(a.t).getHours()===h).length}))
    const count=(arr:any[],f:(x:any)=>string)=>Object.entries(arr.reduce((m:any,x)=>{const k=f(x);m[k]=(m[k]||0)+1;return m},{})).map(([label,value])=>({label,value:value as number}))
    const status=count(tasks,t=>t.status),cats=count(tasks,t=>t.label||t.category),mod=count(done.filter(t=>t.model),t=>String(t.model))
    const emp=Object.values(people).filter((p:any)=>!p.isManager).map((p:any)=>{const mine=tasks.filter(t=>t.assignee===p.id),d=mine.filter(t=>t.status==='done'&&t.doneAt);return {id:p.id,name:p.name,done:d.length,open:mine.filter(t=>t.status!=='done').length,avg:d.length?d.reduce((a,t)=>a+(t.doneAt-t.createdAt),0)/d.length:0}})
    const presence=count(Object.values(people),(p:any)=>p.presence)
    return {total:tasks.length,done:done.length,open:open.length,avg,onTime,days,hours,status,cats,mod,emp,presence,calls:calls.length,callTime:calls.reduce((a,c)=>a+(c.dur||0),0),today:done.filter(t=>now-t.doneAt<DAY).length}
  },[tasks,activity,calls,people])
}
export function Kpis(){ const s=useStats(); const K=[['Completed today',s.today],['Completed total',s.done],['Open tasks',s.open],['Avg turnaround',dur(s.avg)],['On-time rate',s.onTime==null?'—':s.onTime+'%'],['Calls',s.calls]]
  return <div className="kpis">{K.map(([l,v])=><div key={l as string} className="kpi"><small>{l}</small><b>{v}</b></div>)}</div> }
function Bars({data,color='#3b82f6',h=110}:{data:{label:string;value:number}[];color?:string;h?:number}){
  const max=Math.max(1,...data.map(d=>d.value)),w=100/Math.max(1,data.length)
  return <svg viewBox={`0 0 100 ${h}`} width="100%" height={h} preserveAspectRatio="none">{data.map((d,i)=>{const bh=d.value/max*(h-22);return <g key={i}><rect className="barr" x={i*w+w*0.15} y={h-16-bh} width={w*0.7} height={bh} rx="1" fill={color}><title>{d.label}: {d.value}</title></rect>{data.length<=12&&<text x={i*w+w/2} y={h-4} fontSize="5" textAnchor="middle" fill="#8b919b">{d.label.slice(0,6)}</text>}</g>})}</svg>
}
function Donut({data}:{data:{label:string;value:number}[]}){
  const tot=data.reduce((a,d)=>a+d.value,0)||1,C=['#3b82f6','#3ddc84','#f5c542','#ef4444','#8b5cf6','#06b6d4']; let acc=0
  return <div className="donut"><svg viewBox="0 0 42 42" width="110" height="110"><circle cx="21" cy="21" r="15.9" fill="none" stroke="#1c1f24" strokeWidth="6"/>{data.map((d,i)=>{const p=d.value/tot*100,o=<circle key={i} cx="21" cy="21" r="15.9" fill="none" stroke={C[i%6]} strokeWidth="6" strokeDasharray={`${p} ${100-p}`} strokeDashoffset={25-acc}/>;acc+=p;return o})}<text x="21" y="23" textAnchor="middle" fontSize="7" fill="#e8eaed">{tot}</text></svg>
    <div>{data.map((d,i)=><small key={i}><i className="dot" style={{background:C[i%6]}}/>{d.label} · {d.value}</small>)}{data.length===0&&<small>No data yet</small>}</div></div>
}
export default function Analytics(){
  const s=useStats(); const o=useOffice()
  const csv=()=>{const rows=[['title','status','category','assignee','priority','created','done','deadline'],...o.tasks.map((t:any)=>[t.title,t.status,t.label,o.people[t.assignee]?.name||'',t.priority,new Date(t.createdAt).toISOString(),t.doneAt?new Date(t.doneAt).toISOString():'',t.deadline||''])];const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([rows.map(r=>r.map(c=>`"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')],{type:'text/csv'}));a.download='tasks.csv';a.click()}
  return <div><Kpis/><div className="agrid">
    <section className="card2"><h3>Tasks completed — last 7 days</h3><Bars data={s.days}/></section>
    <section className="card2"><h3>Task status</h3><Donut data={s.status}/></section>
    <section className="card2"><h3>Activity by hour (last 24h)</h3><Bars data={s.hours} color="#8b5cf6"/></section>
    <section className="card2"><h3>By category</h3><Donut data={s.cats}/></section>
    <section className="card2"><h3>AI-generated outputs</h3><Donut data={s.mod}/><small className="mut">Counts completed tasks per model; draft-mode tasks have none.</small></section>
    <section className="card2"><h3>Team presence</h3><Donut data={s.presence}/><small className="mut">Calls: {s.calls} · total {dur(s.callTime*1000)}</small></section></div>
    <section className="card2" style={{marginTop:14}}><div className="ph" style={{margin:0}}><h3>Per employee</h3><button onClick={csv}>Export tasks CSV</button></div>
     <table className="tbl"><thead><tr><th>Employee</th><th>Completed</th><th>In progress / queued</th><th>Avg turnaround</th></tr></thead><tbody>{s.emp.map((e:any)=><tr key={e.id}><td>{e.name}</td><td>{e.done}</td><td>{e.open}</td><td>{dur(e.avg)}</td></tr>)}</tbody></table></section></div>
}
