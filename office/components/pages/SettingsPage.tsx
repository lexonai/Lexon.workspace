'use client'
import { useState } from 'react'
import { useOffice } from '@/store/officeStore'
const SECTIONS:[string,[string,string,string?][]][]=[
 ['Permissions & messaging',[['directMessaging','Direct messaging: employees may message the Owner directly (OFF = via Manager only)'],['employeeCanCreateTasks','Employees may create tasks for others']]],
 ['Voice',[['voiceEnabled','Voice enabled (text-to-speech with gender-matched voices)'],['assistantMode','Voice assistant mode: speak replies, auto-send what you say']]],
 ['Notifications',[['browserNotify','Browser / desktop notifications']]],
 ['AI routing',[['autoRoute','Manager auto-routes tasks to the right employee']]],
 ['Workflow rules & automation',[['requireReview','Manager reviews every output before delivery'],['autoStart','Start queued tasks automatically (local mode)']]],
 ['Internet access',[['internetAccess','Allow employees to research on the web / YouTube']]],
 ['System preferences',[['showNames','Show employee names in the 3D office'],['reduceMotion','Reduce interface motion'],['shadows','High-quality shadows']]],
]
export default function SettingsPage(){
  const o=useOffice(),s=o.settings
  const toggle=(k:string,v:boolean)=>{ o.setSettings({[k]:v}); if(k==='browserNotify'&&v&&typeof Notification!=='undefined')Notification.requestPermission() }
  return <div className="page fade"><div className="ph"><div><h2>Settings</h2></div></div><div className="sgrid">
   {SECTIONS.map(([t,items])=><section key={t} className="card2"><h3>{t}</h3>{items.map(([k,l])=><label key={k} className="srow tg"><span>{l}</span><span className="sw"><input type="checkbox" checked={!!s[k]} onChange={e=>toggle(k,e.target.checked)}/><i/></span></label>)}</section>)}
   <section className="card2"><h3>Employee behavior / instructions</h3><textarea rows={4} value={s.globalInstructions} onChange={e=>o.setSettings({globalInstructions:e.target.value})}/><small className="mut">Applied to every employee on top of their own role instructions.</small></section>
   <section className="card2"><h3>AI & API keys</h3><small className="mut">Managed only in Lexon Workspace → Integrations → Lexon Office. Office uses those keys automatically; nothing is stored or entered here.</small><div className="kv"><span>Models available</span><b>{o.ai?.keys??0}</b><span>Voice</span><b>{o.ai?.tts?'on':'off'}</b></div></section>
   <section className="card2"><h3>Access</h3><div className="kv"><span>Status</span><b>{o.backend.connected?'Connected':o.backend.error||'Open Office from Lexon Workspace'}</b></div><small className="mut">Office has no password or users of its own. You are signed in through your Lexon Workspace account; your Workspace role decides what you can do.</small></section>
   <section className="card2"><h3>Data & privacy</h3><div className="acts"><button onClick={()=>{const d=JSON.stringify({people:o.people,tasks:o.tasks,messages:o.messages,schedule:o.schedule,settings:{...s,tavilyKey:'',braveKey:'',youtubeKey:''}},null,1);const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([d],{type:'application/json'}));a.download='lexon-office-export.json';a.click()}}>Export data</button>
    <button onClick={()=>{if(confirm('Erase all local data (tasks, chats, models, settings)?')){localStorage.removeItem('lexon-office-v3');location.reload()}}}>Erase local data</button></div><small className="mut">API keys are stored locally (or on your backend). Exports exclude keys.</small></section></div></div>
}
