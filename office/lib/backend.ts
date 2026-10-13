'use client'
import { useOffice } from '@/store/officeStore'
const KEYS=['people','tasks','messages','unread','activity','notifications','settings','schedule','extraNodes'] as const
const seen=new Set<string>()
export const backendCfg=()=>typeof window==='undefined'?{url:'',token:''}:(window as any).lexonDesktop?{url:(window as any).lexonDesktop.url as string,token:(window as any).lexonDesktop.token as string}:{url:(localStorage.getItem('office.api')||process.env.NEXT_PUBLIC_OFFICE_API_URL||'').replace(/\/$/,''),token:localStorage.getItem('office.token')||''}
export const backendLogout=()=>{ if((window as any).lexonDesktop)return;localStorage.removeItem('office.token');location.reload()}
const strip=(p:any)=>Object.fromEntries(Object.entries(p).map(([k,v]:any)=>[k,{...v,state:undefined,task:undefined,progress:undefined}]))
const slice=(s:any)=>{const o:any={};KEYS.forEach(k=>o[k]=s[k]);o.people=strip(s.people);return o}
export function startBackend(){
  const {url,token}=backendCfg(); if(!url||!token)return()=>{}
  let rev=0,last='',timer:any,es:EventSource|null=null,dead=false
  const apply=(remote:any)=>{ const s=useOffice.getState(); const people=Object.fromEntries(Object.entries(remote.people||{}).map(([k,v]:any)=>[k,{...v,state:s.people[k]?.state||'IDLE',task:s.people[k]?.task||'Ready',progress:s.people[k]?.progress||0}]))
    const patch:any={backend:{connected:true,url,error:''}}; KEYS.forEach(k=>{if(remote[k]!==undefined)patch[k]=remote[k]}); patch.people=Object.keys(people).length?people:s.people; if(remote.ai)patch.ai=remote.ai; useOffice.setState(patch); for(const c of remote.commands||[]){ if(!seen.has(c.id)){seen.add(c.id); if(Date.now()-c.t<20000)useOffice.getState().execCommand(c)} } last=JSON.stringify(slice(useOffice.getState())) }
  const push=async()=>{ const s=useOffice.getState(); const body=JSON.stringify({baseRev:rev,state:slice(s)}); const j=JSON.stringify(slice(s)); if(j===last)return
    try{ const r=await fetch(`${url}/api/state?token=${token}`,{method:'PUT',headers:{'content-type':'application/json'},body}); const d=await r.json(); if(r.status===409){rev=d.rev;apply(d.state)} else if(r.ok){rev=d.rev;last=j} }catch(e:any){useOffice.setState({backend:{connected:false,url,error:e.message}})} }
  ;(async()=>{ try{ const r=await fetch(`${url}/api/state?token=${token}`); if(r.status===401){localStorage.removeItem('office.token');useOffice.setState({backend:{connected:false,url,error:'Session expired. Open Office again from Lexon Workspace'}});return}
    const d=await r.json(); rev=d.rev; if(d.state&&d.state.people&&Object.keys(d.state.people).length)apply(d.state); else{useOffice.setState({backend:{connected:true,url,error:''}});await push()}
    if(dead)return; es=new EventSource(`${url}/api/events?token=${token}`); es.onmessage=e=>{const m=JSON.parse(e.data); if(m.rev>rev){rev=m.rev;apply(m.state)}}; es.onerror=()=>useOffice.setState({backend:{connected:false,url,error:'Reconnecting…'}}) }
    catch(e:any){useOffice.setState({backend:{connected:false,url,error:e.message}})} })()
  const unsub=useOffice.subscribe(()=>{clearTimeout(timer);timer=setTimeout(push,1200)})
  return()=>{dead=true;unsub();es?.close();clearTimeout(timer)}
}

export async function api(path:string,body?:any,method?:string){ const {url,token}=backendCfg(); const r=await fetch(url+path,{method:method||(body?'POST':'GET'),headers:{'content-type':'application/json',authorization:'Bearer '+token},body:body?JSON.stringify(body):undefined}); const j=await r.json().catch(()=>({})); if(!r.ok)throw new Error(j.error||r.statusText); return j }
