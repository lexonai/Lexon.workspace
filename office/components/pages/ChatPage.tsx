'use client'
import { useEffect, useRef, useState } from 'react'
import { useOffice, convOf } from '@/store/officeStore'
import { ago, SC } from '@/lib/ui'
import { listen } from '@/lib/voice'
import { startVAD, transcribe } from '@/lib/recorder'
import { speakAI, stopAI } from '@/lib/voiceAI'
import Avatar from '../ui/Avatar'
export default function ChatPage(){
  const o=useOffice(); const conv=o.openConv||'manager'
  const mgr:any=Object.values(o.people).find((p:any)=>p.isManager), emp:any=conv==='manager'?mgr:o.people[conv]
  const msgs=o.messages[conv]||[]; const [v,setV]=useState(''),[att,setAtt]=useState(''),[mic,setMic]=useState(false); const end=useRef<HTMLDivElement>(null),file=useRef<HTMLInputElement>(null),rec=useRef<any>(null),spoken=useRef(0)
  useEffect(()=>{o.markRead(conv)},[conv,msgs.length]); useEffect(()=>{end.current?.scrollIntoView({block:'end'})},[msgs.length,o.streaming?.text])
  useEffect(()=>{ const n=msgs.length; if(spoken.current>n)spoken.current=n; if(!o.settings.voiceEnabled||!o.settings.assistantMode){spoken.current=n;return}
    for(let i=spoken.current;i<n;i++){const m=msgs[i]; if(m.from!=='owner'&&!m.system)speakAI(o.people[m.from]||emp,m.text)} spoken.current=n },[msgs.length,o.settings.assistantMode])
  useEffect(()=>()=>{rec.current?.stop();stopAI()},[])
  const send=(text=v)=>{ if(!text.trim())return; o.sendOwner(conv,text.trim(),att||undefined); setV('');setAtt('') }
  const toggleMic=async()=>{ if(mic){rec.current?.stop();rec.current=null;setMic(false);return}
    const onText=(t:string)=>{ if(o.settings.assistantMode)send(t); else setV(x=>(x+' '+t).trim()) }
    if(o.backend.connected&&o.ai.stt){ try{ const v=await startVAD(async b=>{try{const t=await transcribe(b);if(t)onText(t)}catch(e:any){alert(e.message)}}); rec.current=v; setMic(true) }catch{alert('Microphone unavailable')} return }
    const r=listen(onText); if(!r){alert('No speech-to-text available: an Admin must add a Gemini or OpenAI key in Lexon Workspace → Integrations → Lexon Office (works in every browser and the desktop app).');return} rec.current=r;setMic(true) }
  const convs=[mgr,...Object.values(o.people).filter((p:any)=>!p.isManager)] as any[]
  const last=(c:string)=>{const m=(o.messages[c]||[]).slice(-1)[0]; return m?m.text.slice(0,38):'No messages yet'}
  return <div className="chatpage fade"><aside className="clist"><div className="ph" style={{padding:'14px 14px 6px'}}><h3>Chats</h3></div>
    {convs.map(p=>{const c=convOf(p),u=o.unread[c]||0;return <button key={c} className={'ci '+(c===conv?'on':'')} onClick={()=>o.markRead(c)}><Avatar p={p} size={40}/><div><b>{p.name.split(' ')[0]}{p.isManager&&<small className="tag2">Manager · default</small>}</b><small className="mut">{last(c)}</small></div>{u>0&&<em>{u}</em>}</button>})}</aside>
   <section className="cthread"><header className="chd"><Avatar p={emp} size={38}/><select className="convsel" value={conv} onChange={e=>o.markRead(e.target.value)}>{convs.map(p=><option key={convOf(p)} value={convOf(p)}>{p.name}{o.unread[convOf(p)]?` (${o.unread[convOf(p)]})`:''}</option>)}</select><div className="hd-name"><b>{emp.name}</b><small className="mut">{emp.role} · <span style={{color:SC[emp.presence]}}>{emp.presence}</span>{o.typing[conv]?' · typing…':''}</small></div>
     <div className="acts"><button className={o.settings.assistantMode?'on':''} title="Speak replies and auto-send what you say" onClick={()=>{o.setSettings({assistantMode:!o.settings.assistantMode});stopAI()}}>🎧 Voice assistant</button><button disabled={emp.presence==='offline'} onClick={()=>o.startCall(emp.id)}>📞 Call</button></div></header>
    <div className="msgs big">{conv!=='manager'&&!o.settings.directMessaging&&<small className="note">Direct messaging is OFF — {emp.name.split(' ')[0]} reports to you through the Manager. Turn it ON in Settings.</small>}
     {msgs.length===0&&<small className="mut" style={{textAlign:'center'}}>Say hi or give a task — e.g. “Create a high-CTR YouTube thumbnail for ‘Top 5 AI Tools 2026’”.</small>}
     {msgs.map((m:any,i:number)=>m.system?<small key={m.id||i} className="note">{m.text}</small>:<div key={m.id||i} className={'bub '+(m.from==='owner'?'me':'')}>{m.from!=='owner'&&conv==='manager'&&m.from!==mgr.id&&<b>{o.people[m.from]?.name}</b>}
       <div className="bt">{m.text}</div>{m.output?.imageUrl&&<img className="thumbimg" src={m.output.imageUrl} alt="output"/>}{m.output?.sources?.length>0&&<div className="srcs">{m.output.sources.slice(0,4).map((s:any,j:number)=><a key={j} href={s.url} target="_blank" rel="noreferrer">{s.title}</a>)}</div>}{m.attach&&<span className="chip">📎 {m.attach}</span>}
       <small>{ago(m.t)}{m.from==='owner'&&(m.read?' ✓✓':' ✓')}</small></div>)}
     {o.streaming?.conv===conv&&<div className="bub"><div className="bt">{o.streaming.text||<span className="typing">● ● ●</span>}</div></div>}<div ref={end}/></div>
    {att&&<div className="attbar"><span className="chip">📎 {att}</span><button className="ghost" onClick={()=>setAtt('')}>✕</button></div>}
    <div className="composer"><button className="ghost" title="Attach file" onClick={()=>file.current?.click()}>📎</button><input ref={file} type="file" hidden onChange={e=>setAtt(e.target.files?.[0]?.name||'')}/>
     <input value={v} placeholder={mic?'Listening…':'Message…'} onChange={e=>setV(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()}/><button className={'ghost '+(mic?'rec':'')} title="Voice input" onClick={toggleMic}>🎙</button><button className="pri" onClick={()=>send()}>Send</button></div></section></div>
}
