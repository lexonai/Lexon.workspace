'use client'
import { backendCfg } from './backend'
const hdr=()=>({'content-type':'application/json',authorization:'Bearer '+backendCfg().token})
/** Streams an AI reply from the backend (keys never touch the browser). */
export async function streamChat(body:{conv:string;text:string;attach?:string;voice?:boolean},cb:{onDelta:(t:string)=>void;onNotice?:(n:string)=>void}){
  const {url}=backendCfg(); const r=await fetch(url+'/api/ai/chat',{method:'POST',headers:hdr(),body:JSON.stringify(body)})
  if(!r.ok||!r.body)throw new Error((await r.json().catch(()=>({}))).error||r.statusText)
  const rd=r.body.getReader(),dc=new TextDecoder();let buf='',full=''
  for(;;){const {done,value}=await rd.read();if(done)break;buf+=dc.decode(value,{stream:true});let i;while((i=buf.indexOf('\n\n'))>=0){const line=buf.slice(0,i).trim();buf=buf.slice(i+2);if(!line.startsWith('data:'))continue;try{const j=JSON.parse(line.slice(5));if(j.delta){full+=j.delta;cb.onDelta(j.delta)}if(j.notice)cb.onNotice?.(j.notice);if(j.error)throw new Error(j.error)}catch(e:any){if(e.message&&!/JSON/.test(e.message))throw e}}}
  return full
}
export async function postAI(path:string,body:any){ const {url}=backendCfg(); const r=await fetch(url+path,{method:'POST',headers:hdr(),body:JSON.stringify(body)}); return r.json() }
